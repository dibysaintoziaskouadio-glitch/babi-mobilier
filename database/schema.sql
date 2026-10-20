-- =============================================================================
--  Babi Mobilier — Schéma PostgreSQL (v1.0)
--  Cible : PostgreSQL 15+  ·  Devise : XOF (FCFA, entiers sans centimes)  ·  TVA 18 %
--
--  Ce fichier est la source de vérité du schéma. Le schema.prisma voisin en est
--  le reflet pour le client Prisma (voir l'en-tête de ce fichier pour la procédure).
--
--  Conventions
--    - Clés primaires UUID (gen_random_uuid), sauf audit_logs (bigserial).
--    - Montants : integer suffixé _xof, prix catalogue TTC.
--    - Toute table métier porte tenant_id et est protégée par Row Level Security.
--      L'API exécute `SELECT set_config('app.tenant_id', '<uuid>', true)` dans
--      chaque transaction (rôle applicatif babi_app, non propriétaire des tables).
--    - Téléphones au format E.164 ivoirien : +225 suivi de 10 chiffres.
-- =============================================================================
--
--  DIAGRAMME DES RELATIONS
--
--                            ┌──────────┐
--                            │  plans   │
--                            └────┬─────┘
--                                 │1
--                                 │*
--  ┌──────────────┐  1     * ┌────┴──────────┐
--  │   tenants    ├──────────┤ subscriptions │
--  └──┬───────────┘          └───────────────┘
--     │1
--     ├──────────────* users ───────────* user_roles (rôle par tenant)
--     │                 │ 1
--     │                 ├───────* addresses
--     │                 └─ referred_by ↺ users (parrainage)
--     │
--     ├──* categories ↺ parent_id
--     │       │1
--     │       │*
--     ├──* products ───1:*── product_variants ───1:*── product_images
--     │       │1                    │1
--     │       │*                    │*
--     │    reviews *──1 users    order_items
--     │       *                     *
--     │       │1                    │1
--     ├──* orders ─────────────────┘
--     │       ├──*:1 users (client)
--     │       ├──*:1 addresses
--     │       ├──*:0..1 promotions ──1:*── promotion_redemptions
--     │       ├──1:* payments  (moyen_paiement : orange_money | mtn_momo | moov
--     │       │                                  | wave | carte | cash)
--     │       └──1:1 shipments ──*:1 delivery_zones (abidjan | interieur | retrait_showroom)
--     │                   └──*:0..1 users (livreur)
--     │
--     ├──* delivery_zones
--     ├──* promotions
--     └──* audit_logs *──0..1 users (acteur)
--
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- e-mails, slugs, codes promo insensibles à la casse
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- recherche floue sur les noms de produits

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
CREATE TYPE tenant_status   AS ENUM ('trial', 'active', 'past_due', 'suspended', 'closed');
CREATE TYPE user_role       AS ENUM ('super_admin', 'admin', 'vendeur', 'livreur', 'artisan', 'client');
CREATE TYPE order_status    AS ENUM (
  'en_attente_paiement', 'payee', 'confirmee', 'en_preparation', 'en_fabrication',
  'prete', 'expediee', 'en_livraison', 'livree', 'annulee', 'remboursee', 'retournee'
);
CREATE TYPE order_channel   AS ENUM ('web', 'pwa', 'whatsapp', 'showroom', 'api');
CREATE TYPE moyen_paiement  AS ENUM ('orange_money', 'mtn_momo', 'moov', 'wave', 'carte', 'cash');
CREATE TYPE payment_provider AS ENUM ('cinetpay', 'paydunya', 'stripe', 'cash');
CREATE TYPE payment_kind    AS ENUM ('total', 'acompte', 'solde', 'remboursement');
CREATE TYPE payment_status  AS ENUM (
  'initie', 'en_attente', 'reussi', 'echoue', 'expire', 'rembourse', 'partiellement_rembourse'
);
CREATE TYPE zone_type       AS ENUM ('abidjan', 'interieur', 'retrait_showroom');
CREATE TYPE shipment_status AS ENUM (
  'a_planifier', 'planifiee', 'enlevee', 'en_transit', 'en_livraison', 'livree', 'echec', 'retour'
);
CREATE TYPE delivery_slot   AS ENUM ('matin', 'apres_midi', 'soir');
CREATE TYPE review_status   AS ENUM ('en_moderation', 'publie', 'rejete');
CREATE TYPE promo_type      AS ENUM ('pourcentage', 'montant_fixe', 'livraison_offerte');
CREATE TYPE billing_cycle   AS ENUM ('mensuel', 'annuel');
CREATE TYPE sub_status      AS ENUM ('trialing', 'active', 'past_due', 'canceled');

-- -----------------------------------------------------------------------------
-- Fonction utilitaire : mise à jour automatique de updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- =============================================================================
-- TENANTS (marchands et artisans partenaires)
-- =============================================================================
CREATE TABLE tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            citext      NOT NULL,
  name            text        NOT NULL,
  legal_name      text,
  rccm            text,                                   -- Registre du commerce
  ncc             text,                                   -- Numéro de compte contribuable (DGI)
  phone           text        NOT NULL,
  email           citext,
  city            text        NOT NULL DEFAULT 'Abidjan',
  status          tenant_status NOT NULL DEFAULT 'trial',
  vat_registered  boolean     NOT NULL DEFAULT true,
  settings        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_key     UNIQUE (slug),
  CONSTRAINT tenants_slug_format  CHECK (slug ~ '^[a-z0-9-]{3,40}$'),
  CONSTRAINT tenants_phone_format CHECK (phone ~ '^\+225[0-9]{10}$')
);
CREATE INDEX idx_tenants_status ON tenants (status);

-- =============================================================================
-- USERS
--   tenant_id NULL  = compte client de la plateforme (peut acheter chez tous les tenants)
--   tenant_id fixé  = membre d'équipe d'un marchand (admin, vendeur, livreur, artisan)
-- =============================================================================
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid REFERENCES tenants (id) ON DELETE CASCADE,
  phone             text        NOT NULL,
  email             citext,
  full_name         text        NOT NULL,
  password_hash     text,                                 -- NULL si connexion par OTP uniquement
  phone_verified_at timestamptz,
  whatsapp_opt_in   boolean     NOT NULL DEFAULT false,   -- consentement tracé (ARTCI)
  loyalty_points    integer     NOT NULL DEFAULT 0,
  referral_code     text,
  referred_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  last_login_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_phone_format     CHECK (phone ~ '^\+225[0-9]{10}$'),
  CONSTRAINT users_loyalty_positive CHECK (loyalty_points >= 0),
  CONSTRAINT users_no_self_referral CHECK (referred_by IS NULL OR referred_by <> id),
  CONSTRAINT users_referral_code_key UNIQUE (referral_code)
);
-- Unicité du téléphone : une fois par tenant, et une fois pour les clients plateforme
CREATE UNIQUE INDEX uq_users_tenant_phone   ON users (tenant_id, phone) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_users_platform_phone ON users (phone)            WHERE tenant_id IS NULL;
CREATE INDEX idx_users_tenant ON users (tenant_id);
CREATE INDEX idx_users_email  ON users (email) WHERE email IS NOT NULL;

CREATE TABLE user_roles (
  user_id    uuid      NOT NULL REFERENCES users (id)   ON DELETE CASCADE,
  tenant_id  uuid      NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  role       user_role NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id, role)
);
CREATE INDEX idx_user_roles_tenant ON user_roles (tenant_id, role);

CREATE TABLE addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label       text        NOT NULL DEFAULT 'Maison',      -- Maison, Bureau…
  city        text        NOT NULL,                       -- Abidjan, Bouaké, Yamoussoukro, San-Pédro
  commune     text,                                       -- Cocody, Yopougon, Marcory…
  quartier    text,                                       -- Riviera 3, Angré 8e tranche…
  landmark    text,                                       -- Repère : « face pharmacie Les Oscars »
  phone       text        NOT NULL,
  lat         numeric(9,6),
  lng         numeric(9,6),
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addresses_phone_format CHECK (phone ~ '^\+225[0-9]{10}$'),
  CONSTRAINT addresses_lat_range    CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  CONSTRAINT addresses_lng_range    CHECK (lng IS NULL OR lng BETWEEN -180 AND 180)
);
CREATE INDEX idx_addresses_user ON addresses (user_id);
CREATE UNIQUE INDEX uq_addresses_one_default ON addresses (user_id) WHERE is_default;

-- =============================================================================
-- CATALOGUE
-- =============================================================================
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid     NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  parent_id  uuid     REFERENCES categories (id) ON DELETE SET NULL,
  slug       text     NOT NULL,
  name       text     NOT NULL,                           -- Salon, Chambre, Bureau, Extérieur, Cuisine
  position   smallint NOT NULL DEFAULT 0,
  image_url  text,
  is_active  boolean  NOT NULL DEFAULT true,
  CONSTRAINT categories_tenant_slug_key UNIQUE (tenant_id, slug),
  CONSTRAINT categories_not_own_parent  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX idx_categories_parent ON categories (tenant_id, parent_id, position);

CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  category_id     uuid         NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  slug            text         NOT NULL,
  name            text         NOT NULL,
  description     text,
  style           text,                                   -- moderne, scandinave, africain contemporain…
  materials       text[]       NOT NULL DEFAULT '{}',     -- {iroko, teck, tissu wax, rotin}
  base_price_xof  integer      NOT NULL,                  -- prix TTC de référence
  vat_rate        numeric(4,2) NOT NULL DEFAULT 18.00,
  is_custom_made  boolean      NOT NULL DEFAULT false,    -- sur-mesure : acompte requis
  deposit_percent smallint,
  lead_time_days  smallint,                               -- délai de fabrication
  weight_kg       numeric(7,2),
  volume_m3       numeric(6,3),                           -- calcul du fret vers l'intérieur
  ar_model_url    text,                                   -- modèle .glb pour la vue AR
  is_published    boolean      NOT NULL DEFAULT false,
  rating_avg      numeric(2,1) NOT NULL DEFAULT 0,
  rating_count    integer      NOT NULL DEFAULT 0,
  search_vector   tsvector GENERATED ALWAYS AS (
                    setweight(to_tsvector('french', coalesce(name, '')), 'A') ||
                    setweight(to_tsvector('french', coalesce(description, '')), 'B')
                  ) STORED,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT products_tenant_slug_key UNIQUE (tenant_id, slug),
  CONSTRAINT products_price_positive  CHECK (base_price_xof > 0),
  CONSTRAINT products_vat_range       CHECK (vat_rate BETWEEN 0 AND 100),
  CONSTRAINT products_deposit_range   CHECK (deposit_percent IS NULL OR deposit_percent BETWEEN 0 AND 100),
  CONSTRAINT products_custom_deposit  CHECK (NOT is_custom_made OR deposit_percent IS NOT NULL),
  CONSTRAINT products_rating_range    CHECK (rating_avg BETWEEN 0 AND 5 AND rating_count >= 0)
);
CREATE INDEX idx_products_tenant_cat ON products (tenant_id, category_id) WHERE is_published;
CREATE INDEX idx_products_price      ON products (tenant_id, base_price_xof);
CREATE INDEX idx_products_search     ON products USING gin (search_vector);
CREATE INDEX idx_products_name_trgm  ON products USING gin (name gin_trgm_ops);
CREATE INDEX idx_products_materials  ON products USING gin (materials);

CREATE TABLE product_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid     NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  product_id      uuid     NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  sku             text     NOT NULL,
  -- {"dimensions":"220x90x85","bois":"iroko","tissu":"velours","couleur":"orange brûlé"}
  attributes      jsonb    NOT NULL DEFAULT '{}'::jsonb,
  width_cm        smallint,
  depth_cm        smallint,
  height_cm       smallint,
  price_xof       integer  NOT NULL,
  compare_at_xof  integer,                                -- prix barré
  stock           integer  NOT NULL DEFAULT 0,
  stock_reserved  integer  NOT NULL DEFAULT 0,            -- réservé par des commandes non payées
  is_active       boolean  NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_tenant_sku_key UNIQUE (tenant_id, sku),
  CONSTRAINT variants_price_positive  CHECK (price_xof > 0),
  CONSTRAINT variants_compare_at      CHECK (compare_at_xof IS NULL OR compare_at_xof > price_xof),
  CONSTRAINT variants_stock           CHECK (stock >= 0 AND stock_reserved >= 0 AND stock_reserved <= stock),
  CONSTRAINT variants_dimensions      CHECK (coalesce(width_cm, 1) > 0 AND coalesce(depth_cm, 1) > 0 AND coalesce(height_cm, 1) > 0)
);
CREATE INDEX idx_variants_product ON product_variants (product_id);
CREATE INDEX idx_variants_attrs   ON product_variants USING gin (attributes jsonb_path_ops);
CREATE INDEX idx_variants_low_stock ON product_variants (tenant_id) WHERE is_active AND stock - stock_reserved <= 2;

CREATE TABLE product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid     NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  product_id  uuid     NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  variant_id  uuid     REFERENCES product_variants (id) ON DELETE CASCADE,
  public_id   text     NOT NULL,                          -- identifiant Cloudinary
  alt         text     NOT NULL,
  is_in_situ  boolean  NOT NULL DEFAULT false,            -- photo « vue en situation »
  position    smallint NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_images_product ON product_images (product_id, position);

-- =============================================================================
-- LIVRAISON : zones et tarifs
-- =============================================================================
CREATE TABLE delivery_zones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid      NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  type            zone_type NOT NULL,
  name            text      NOT NULL,                     -- « Abidjan A », « Bouaké », « Showroom Cocody »
  communes        text[]    NOT NULL DEFAULT '{}',        -- {Plateau, Cocody, Marcory, Treichville}
  cities          text[]    NOT NULL DEFAULT '{}',        -- {Bouaké} pour l'intérieur
  base_fee_xof    integer   NOT NULL,
  fee_per_m3_xof  integer   NOT NULL DEFAULT 0,
  min_days        smallint  NOT NULL,
  max_days        smallint  NOT NULL,
  cod_allowed     boolean   NOT NULL DEFAULT true,        -- paiement à la livraison autorisé
  cod_max_xof     integer,                                -- au-delà : acompte obligatoire
  is_active       boolean   NOT NULL DEFAULT true,
  CONSTRAINT delivery_zones_tenant_name_key UNIQUE (tenant_id, name),
  CONSTRAINT zones_fees_positive CHECK (base_fee_xof >= 0 AND fee_per_m3_xof >= 0),
  CONSTRAINT zones_days          CHECK (min_days >= 0 AND max_days >= min_days),
  CONSTRAINT zones_cod_interieur CHECK (type <> 'interieur' OR cod_allowed = false),
  CONSTRAINT zones_showroom_free CHECK (type <> 'retrait_showroom' OR base_fee_xof = 0)
);
CREATE INDEX idx_delivery_zones_communes ON delivery_zones USING gin (communes);
CREATE INDEX idx_delivery_zones_type     ON delivery_zones (tenant_id, type) WHERE is_active;

-- =============================================================================
-- PROMOTIONS
-- =============================================================================
CREATE TABLE promotions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  code              citext,                               -- NULL = promotion automatique
  label             text        NOT NULL,                 -- « Tabaski -10 % »
  type              promo_type  NOT NULL,
  value             integer     NOT NULL,                 -- % ou montant en FCFA
  min_order_xof     integer     NOT NULL DEFAULT 0,
  max_discount_xof  integer,
  max_uses          integer,
  used_count        integer     NOT NULL DEFAULT 0,
  max_uses_per_user smallint    NOT NULL DEFAULT 1,
  category_ids      uuid[],                               -- NULL = tout le catalogue
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_tenant_code_key UNIQUE (tenant_id, code),
  CONSTRAINT promotions_dates      CHECK (ends_at > starts_at),
  CONSTRAINT promotions_value      CHECK (value > 0 AND (type <> 'pourcentage' OR value <= 90)),
  CONSTRAINT promotions_free_ship  CHECK (type <> 'livraison_offerte' OR value = 1),
  CONSTRAINT promotions_uses       CHECK (used_count >= 0 AND (max_uses IS NULL OR used_count <= max_uses)),
  CONSTRAINT promotions_min_order  CHECK (min_order_xof >= 0)
);
CREATE INDEX idx_promotions_active ON promotions (tenant_id, starts_at, ends_at) WHERE is_active;

-- =============================================================================
-- COMMANDES
-- =============================================================================
CREATE SEQUENCE order_number_seq;

CREATE TABLE orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid          NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  number            text          NOT NULL DEFAULT
                    'BM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0'),
  customer_id       uuid          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  address_id        uuid          REFERENCES addresses (id) ON DELETE SET NULL,
  delivery_zone_id  uuid          REFERENCES delivery_zones (id) ON DELETE SET NULL,
  promotion_id      uuid          REFERENCES promotions (id) ON DELETE SET NULL,
  status            order_status  NOT NULL DEFAULT 'en_attente_paiement',
  channel           order_channel NOT NULL DEFAULT 'web',
  is_b2b            boolean       NOT NULL DEFAULT false,
  is_custom_made    boolean       NOT NULL DEFAULT false,
  delivery_snapshot jsonb,                                -- copie figée de l'adresse et du repère
  subtotal_ht_xof   integer       NOT NULL,
  vat_xof           integer       NOT NULL,
  discount_xof      integer       NOT NULL DEFAULT 0,
  shipping_xof      integer       NOT NULL DEFAULT 0,
  total_ttc_xof     integer       NOT NULL,
  deposit_xof       integer       NOT NULL DEFAULT 0,     -- acompte exigé (sur-mesure, COD élevé, intérieur)
  paid_xof          integer       NOT NULL DEFAULT 0,     -- maintenu par les paiements réussis
  customer_note     text,
  cancelled_reason  text,
  stock_reserved_until timestamptz,
  placed_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT orders_number_key      UNIQUE (number),
  CONSTRAINT orders_amounts_positive CHECK (
    subtotal_ht_xof >= 0 AND vat_xof >= 0 AND discount_xof >= 0 AND shipping_xof >= 0
    AND total_ttc_xof >= 0 AND paid_xof >= 0 AND deposit_xof >= 0),
  CONSTRAINT orders_total_coherent  CHECK (total_ttc_xof = subtotal_ht_xof + vat_xof - discount_xof + shipping_xof),
  CONSTRAINT orders_deposit_le_total CHECK (deposit_xof <= total_ttc_xof),
  CONSTRAINT orders_cancel_reason   CHECK (status <> 'annulee' OR cancelled_reason IS NOT NULL)
);
CREATE INDEX idx_orders_tenant_status ON orders (tenant_id, status, placed_at DESC);
CREATE INDEX idx_orders_customer      ON orders (customer_id, placed_at DESC);
CREATE INDEX idx_orders_pending_expiry ON orders (stock_reserved_until) WHERE status = 'en_attente_paiement';

CREATE TABLE order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid         NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  order_id       uuid         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  variant_id     uuid         NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
  product_name   text         NOT NULL,                   -- copie figée au moment de l'achat
  variant_label  text         NOT NULL,                   -- « Velours orange · Iroko · 220 cm »
  unit_price_xof integer      NOT NULL,                   -- TTC
  quantity       smallint     NOT NULL,
  vat_rate       numeric(4,2) NOT NULL DEFAULT 18.00,
  line_total_xof integer GENERATED ALWAYS AS (unit_price_xof * quantity) STORED,
  CONSTRAINT order_items_price    CHECK (unit_price_xof > 0),
  CONSTRAINT order_items_quantity CHECK (quantity BETWEEN 1 AND 500)
);
CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_variant ON order_items (variant_id);

CREATE TABLE promotion_redemptions (
  promotion_id uuid NOT NULL REFERENCES promotions (id) ON DELETE CASCADE,
  order_id     uuid NOT NULL REFERENCES orders (id)     ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id)      ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants (id)    ON DELETE CASCADE,
  discount_xof integer NOT NULL CHECK (discount_xof >= 0),
  redeemed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (promotion_id, order_id)
);
CREATE INDEX idx_redemptions_user ON promotion_redemptions (promotion_id, user_id);

-- =============================================================================
-- PAIEMENTS
-- =============================================================================
CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid             NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  order_id        uuid             NOT NULL REFERENCES orders (id)  ON DELETE RESTRICT,
  refund_of_id    uuid             REFERENCES payments (id) ON DELETE RESTRICT,
  kind            payment_kind     NOT NULL DEFAULT 'total',
  moyen_paiement  moyen_paiement   NOT NULL,
  provider        payment_provider NOT NULL,
  provider_tx_id  text,                                   -- transaction_id envoyé à l'agrégateur
  provider_ref    text,                                   -- référence opérateur (ex. ID Orange Money)
  amount_xof      integer          NOT NULL,
  fee_xof         integer          NOT NULL DEFAULT 0,    -- frais agrégateur
  status          payment_status   NOT NULL DEFAULT 'initie',
  payer_phone     text,
  failure_reason  text,
  raw_payload     jsonb,                                  -- dernière réponse / notification brute
  collected_by    uuid             REFERENCES users (id) ON DELETE SET NULL,  -- livreur (cash)
  remitted_at     timestamptz,                            -- cash reversé en caisse
  expires_at      timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  updated_at      timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT payments_provider_tx_key  UNIQUE (provider, provider_tx_id),   -- idempotence webhooks
  CONSTRAINT payments_amount_positive  CHECK (amount_xof > 0 AND fee_xof >= 0),
  CONSTRAINT payments_cash_provider    CHECK ((moyen_paiement = 'cash') = (provider = 'cash')),
  CONSTRAINT payments_card_provider    CHECK (moyen_paiement <> 'carte' OR provider IN ('stripe', 'cinetpay', 'paydunya')),
  CONSTRAINT payments_mm_phone         CHECK (moyen_paiement NOT IN ('orange_money', 'mtn_momo', 'moov', 'wave')
                                              OR payer_phone ~ '^\+225[0-9]{10}$'),
  CONSTRAINT payments_online_tx        CHECK (provider = 'cash' OR provider_tx_id IS NOT NULL),
  CONSTRAINT payments_refund_link      CHECK ((kind = 'remboursement') = (refund_of_id IS NOT NULL)),
  CONSTRAINT payments_paid_at          CHECK (status <> 'reussi' OR paid_at IS NOT NULL),
  CONSTRAINT payments_cash_collector   CHECK (provider <> 'cash' OR status <> 'reussi' OR collected_by IS NOT NULL)
);
CREATE INDEX idx_payments_order        ON payments (order_id);
CREATE INDEX idx_payments_tenant_status ON payments (tenant_id, status, created_at DESC);
CREATE INDEX idx_payments_pending      ON payments (expires_at) WHERE status IN ('initie', 'en_attente');
CREATE INDEX idx_payments_cash_unremitted ON payments (collected_by)
  WHERE provider = 'cash' AND status = 'reussi' AND remitted_at IS NULL;

-- =============================================================================
-- EXPÉDITIONS
-- =============================================================================
CREATE TABLE shipments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  order_id        uuid            NOT NULL REFERENCES orders (id)  ON DELETE CASCADE,
  zone_id         uuid            NOT NULL REFERENCES delivery_zones (id) ON DELETE RESTRICT,
  zone_type       zone_type       NOT NULL,               -- dénormalisé pour les tableaux de bord
  courier_id      uuid            REFERENCES users (id) ON DELETE SET NULL,   -- Abidjan
  carrier_name    text,                                   -- transporteur vers l'intérieur
  tracking_code   text,
  status          shipment_status NOT NULL DEFAULT 'a_planifier',
  scheduled_for   date,
  slot            delivery_slot,
  attempts        smallint        NOT NULL DEFAULT 0,
  recipient_otp_hash text,                                -- code de remise (haché)
  proof_photo_url text,
  failure_reason  text,
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT shipments_order_key     UNIQUE (order_id),
  CONSTRAINT shipments_attempts      CHECK (attempts BETWEEN 0 AND 5),
  CONSTRAINT shipments_interieur     CHECK (zone_type <> 'interieur' OR status IN ('a_planifier', 'planifiee')
                                            OR carrier_name IS NOT NULL),
  CONSTRAINT shipments_abidjan_courier CHECK (zone_type <> 'abidjan' OR status NOT IN ('en_livraison', 'livree')
                                              OR courier_id IS NOT NULL),
  CONSTRAINT shipments_delivered     CHECK (status <> 'livree' OR delivered_at IS NOT NULL),
  CONSTRAINT shipments_failure       CHECK (status <> 'echec' OR failure_reason IS NOT NULL)
);
CREATE INDEX idx_shipments_courier_day ON shipments (courier_id, scheduled_for)
  WHERE status IN ('planifiee', 'en_livraison');
CREATE INDEX idx_shipments_tenant_status ON shipments (tenant_id, status, scheduled_for);
CREATE INDEX idx_shipments_tracking ON shipments (tracking_code) WHERE tracking_code IS NOT NULL;

-- =============================================================================
-- AVIS (réservés aux acheteurs vérifiés)
-- =============================================================================
CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid          NOT NULL REFERENCES tenants (id)  ON DELETE CASCADE,
  product_id  uuid          NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  user_id     uuid          NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
  order_id    uuid          NOT NULL REFERENCES orders (id)   ON DELETE CASCADE,
  rating      smallint      NOT NULL,
  comment     text,
  photos      text[]        NOT NULL DEFAULT '{}',
  status      review_status NOT NULL DEFAULT 'en_moderation',
  moderated_by uuid         REFERENCES users (id) ON DELETE SET NULL,
  merchant_reply text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT reviews_unique_per_order UNIQUE (product_id, user_id, order_id),
  CONSTRAINT reviews_rating_range     CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_photos_max       CHECK (cardinality(photos) <= 5)
);
CREATE INDEX idx_reviews_product_published ON reviews (product_id, created_at DESC) WHERE status = 'publie';
CREATE INDEX idx_reviews_moderation        ON reviews (tenant_id, created_at) WHERE status = 'en_moderation';

-- =============================================================================
-- ABONNEMENTS SaaS
-- =============================================================================
CREATE TABLE plans (
  id              text PRIMARY KEY,                       -- starter, pro, business, enterprise
  name            text     NOT NULL,
  monthly_xof     integer  NOT NULL,
  yearly_xof      integer  NOT NULL,
  commission_bps  smallint NOT NULL,                      -- 300 = 3 %
  limits          jsonb    NOT NULL DEFAULT '{}'::jsonb,  -- {"products":500,"users":5,"whatsapp_msgs":2000}
  is_public       boolean  NOT NULL DEFAULT true,
  CONSTRAINT plans_prices     CHECK (monthly_xof >= 0 AND yearly_xof >= 0),
  CONSTRAINT plans_commission CHECK (commission_bps BETWEEN 0 AND 2000)
);

CREATE TABLE subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid          NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  plan_id               text          NOT NULL REFERENCES plans (id)   ON DELETE RESTRICT,
  status                sub_status    NOT NULL DEFAULT 'trialing',
  billing_cycle         billing_cycle NOT NULL DEFAULT 'mensuel',
  price_xof             integer       NOT NULL,           -- prix figé (remises négociées)
  current_period_start  date          NOT NULL,
  current_period_end    date          NOT NULL,
  trial_ends_at         date,
  payment_method        moyen_paiement,
  cancel_at_period_end  boolean       NOT NULL DEFAULT false,
  canceled_at           timestamptz,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_period CHECK (current_period_end > current_period_start),
  CONSTRAINT subscriptions_price  CHECK (price_xof >= 0),
  CONSTRAINT subscriptions_no_cash CHECK (payment_method IS DISTINCT FROM 'cash'),
  CONSTRAINT subscriptions_canceled CHECK (status <> 'canceled' OR canceled_at IS NOT NULL)
);
-- Un seul abonnement vivant par tenant
CREATE UNIQUE INDEX uq_subscriptions_live ON subscriptions (tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due');
CREATE INDEX idx_subscriptions_renewal ON subscriptions (current_period_end) WHERE status IN ('active', 'past_due');

-- =============================================================================
-- JOURNAL D'AUDIT (append-only)
-- =============================================================================
CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid        REFERENCES tenants (id) ON DELETE SET NULL,
  actor_id    uuid        REFERENCES users (id)   ON DELETE SET NULL,
  actor_type  text        NOT NULL DEFAULT 'user',        -- user, system, webhook, api_key
  action      text        NOT NULL,                       -- order.status_changed, payment.refunded…
  entity      text        NOT NULL,                       -- orders, products…
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  request_id  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_actor_type CHECK (actor_type IN ('user', 'system', 'webhook', 'api_key')),
  CONSTRAINT audit_action_fmt CHECK (action ~ '^[a-z_]+\.[a-z_]+$')
);
CREATE INDEX idx_audit_tenant_time ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_entity      ON audit_logs (entity, entity_id);
CREATE INDEX idx_audit_actor       ON audit_logs (actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs est en ajout seul : % interdit', TG_OP;
END $$;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- =============================================================================
-- TRIGGERS MÉTIER
-- =============================================================================

-- updated_at
CREATE TRIGGER trg_tenants_updated       BEFORE UPDATE ON tenants          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated         BEFORE UPDATE ON users            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated      BEFORE UPDATE ON products         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_variants_updated      BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated        BEFORE UPDATE ON orders           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated      BEFORE UPDATE ON payments         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_shipments_updated     BEFORE UPDATE ON shipments        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reviews_updated       BEFORE UPDATE ON reviews          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cohérence tenant : une ligne enfant appartient au même tenant que son parent
CREATE OR REPLACE FUNCTION check_same_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_tenant uuid;
BEGIN
  EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', TG_ARGV[0])
    INTO parent_tenant
    USING (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
  IF parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION '%.% référence une ligne d''un autre tenant', TG_TABLE_NAME, TG_ARGV[1];
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_products_cat_tenant  BEFORE INSERT OR UPDATE OF category_id, tenant_id ON products
  FOR EACH ROW EXECUTE FUNCTION check_same_tenant('categories', 'category_id');
CREATE TRIGGER trg_variants_tenant      BEFORE INSERT OR UPDATE OF product_id, tenant_id ON product_variants
  FOR EACH ROW EXECUTE FUNCTION check_same_tenant('products', 'product_id');
CREATE TRIGGER trg_order_items_tenant   BEFORE INSERT OR UPDATE OF order_id, tenant_id ON order_items
  FOR EACH ROW EXECUTE FUNCTION check_same_tenant('orders', 'order_id');
CREATE TRIGGER trg_order_items_variant_tenant BEFORE INSERT OR UPDATE OF variant_id, tenant_id ON order_items
  FOR EACH ROW EXECUTE FUNCTION check_same_tenant('product_variants', 'variant_id');
CREATE TRIGGER trg_payments_tenant      BEFORE INSERT OR UPDATE OF order_id, tenant_id ON payments
  FOR EACH ROW EXECUTE FUNCTION check_same_tenant('orders', 'order_id');
CREATE TRIGGER trg_shipments_tenant     BEFORE INSERT OR UPDATE OF order_id, tenant_id ON shipments
  FOR EACH ROW EXECUTE FUNCTION check_same_tenant('orders', 'order_id');
CREATE TRIGGER trg_shipments_zone_tenant BEFORE INSERT OR UPDATE OF zone_id, tenant_id ON shipments
  FOR EACH ROW EXECUTE FUNCTION check_same_tenant('delivery_zones', 'zone_id');
CREATE TRIGGER trg_reviews_tenant       BEFORE INSERT OR UPDATE OF product_id, tenant_id ON reviews
  FOR EACH ROW EXECUTE FUNCTION check_same_tenant('products', 'product_id');

-- Avis : l'acheteur doit avoir reçu ce produit dans cette commande
CREATE OR REPLACE FUNCTION check_review_purchase() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM orders o
    JOIN order_items oi    ON oi.order_id = o.id
    JOIN product_variants v ON v.id = oi.variant_id
    WHERE o.id = NEW.order_id
      AND o.customer_id = NEW.user_id
      AND o.status = 'livree'
      AND v.product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Avis refusé : produit non acheté ou commande non livrée';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_reviews_purchase BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION check_review_purchase();

-- Note moyenne du produit (avis publiés uniquement)
CREATE OR REPLACE FUNCTION refresh_product_rating() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  pid uuid := coalesce(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE products p
     SET rating_avg   = coalesce((SELECT round(avg(rating)::numeric, 1) FROM reviews WHERE product_id = pid AND status = 'publie'), 0),
         rating_count = (SELECT count(*) FROM reviews WHERE product_id = pid AND status = 'publie')
   WHERE p.id = pid;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_reviews_rating AFTER INSERT OR UPDATE OF status, rating OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_product_rating();

-- Montant encaissé de la commande (paiements réussis moins remboursements)
CREATE OR REPLACE FUNCTION refresh_order_paid() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  oid uuid := coalesce(NEW.order_id, OLD.order_id);
BEGIN
  UPDATE orders o
     SET paid_xof = greatest(0, coalesce((
           SELECT sum(CASE WHEN kind = 'remboursement' THEN -amount_xof ELSE amount_xof END)
           FROM payments
           WHERE order_id = oid
             AND (   (kind <> 'remboursement' AND status IN ('reussi', 'partiellement_rembourse', 'rembourse'))
                  OR (kind =  'remboursement' AND status = 'reussi'))
         ), 0))
   WHERE o.id = oid;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_payments_paid AFTER INSERT OR UPDATE OF status, amount_xof ON payments
  FOR EACH ROW EXECUTE FUNCTION refresh_order_paid();

-- =============================================================================
-- ROW LEVEL SECURITY (isolation multi-tenant)
--   app.tenant_id   : tenant courant, positionné par l'API à chaque transaction
--   app.bypass_rls  : 'on' uniquement pour les jobs plateforme (facturation, super_admin)
-- =============================================================================
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION rls_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on'
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories', 'products', 'product_variants', 'product_images', 'delivery_zones',
    'promotions', 'promotion_redemptions', 'orders', 'order_items', 'payments',
    'shipments', 'reviews', 'subscriptions', 'user_roles'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (rls_bypass() OR tenant_id = current_tenant_id()) '
      'WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id())', t);
  END LOOP;
END $$;

-- Lecture publique du catalogue publié (boutique multi-marchands, sans tenant positionné)
CREATE POLICY public_catalog_read ON products         FOR SELECT USING (is_published);
CREATE POLICY public_variants_read ON product_variants FOR SELECT USING (is_active);
CREATE POLICY public_images_read  ON product_images   FOR SELECT USING (true);
CREATE POLICY public_categories_read ON categories    FOR SELECT USING (is_active);
CREATE POLICY public_zones_read   ON delivery_zones   FOR SELECT USING (is_active);
CREATE POLICY public_reviews_read ON reviews          FOR SELECT USING (status = 'publie');

-- Audit : écriture libre, lecture limitée au tenant
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY audit_read   ON audit_logs FOR SELECT USING (rls_bypass() OR tenant_id = current_tenant_id());

-- -----------------------------------------------------------------------------
-- Rôle applicatif (l'API se connecte avec ce rôle, jamais avec le propriétaire)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'babi_app') THEN
    CREATE ROLE babi_app LOGIN PASSWORD 'a-remplacer-via-secret-manager';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO babi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO babi_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO babi_app;
REVOKE UPDATE, DELETE ON audit_logs FROM babi_app;

-- =============================================================================
-- DONNÉES DE RÉFÉRENCE
-- =============================================================================
INSERT INTO plans (id, name, monthly_xof, yearly_xof, commission_bps, limits) VALUES
  ('starter',    'Starter',     15000,  150000, 300, '{"products":50,  "users":1,  "whatsapp_msgs":300}'),
  ('pro',        'Pro',         45000,  450000, 200, '{"products":500, "users":5,  "whatsapp_msgs":2000}'),
  ('business',   'Business',   120000, 1200000, 150, '{"products":null,"users":20, "whatsapp_msgs":10000, "api":true, "b2b":true}'),
  ('enterprise', 'Enterprise', 350000, 3500000, 100, '{"products":null,"users":null,"whatsapp_msgs":null, "api":true, "b2b":true, "sla":"99.9"}');

COMMIT;
