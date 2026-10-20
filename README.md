# Babi Mobilier

Boutique de meubles en ligne multi-marchands pour la Côte d'Ivoire : Next.js 14, Prisma, PostgreSQL et CinetPay (Orange Money, MTN MoMo, Moov Money, Wave), avec paiement à la livraison.

## Structure

```
apps/web/        Next.js 14 (App Router) : boutique, checkout, espace marchand, webhooks
apps/api/        Service de paiement CinetPay partagé (@babi/api/payments) + routes Express + tests
database/        schema.sql (source de vérité), migrations/, schema.prisma
docs/            Intégration CinetPay, contenu de la landing page
```

## Démarrage

Prérequis : Node 18.18+, PostgreSQL 15+.

```bash
npm install
cp apps/web/.env.example apps/web/.env.local     # puis remplir les valeurs

# Base de données (connexion propriétaire)
createdb babi
DATABASE_OWNER_URL=postgresql://postgres:postgres@localhost:5432/babi npm run db:setup
psql babi -c "ALTER ROLE babi_app PASSWORD 'votre-mot-de-passe'"   # rôle utilisé par DATABASE_URL

npm run db:generate
set -a; . apps/web/.env.local; set +a; npm run db:seed
npm run dev                                       # http://localhost:3000
```

Connexion de démonstration : en mode `OTP_DEV_MODE=true`, le code à 6 chiffres s'affiche dans la console du serveur.
- Client : n'importe quel numéro ivoirien (ex. `05 00 00 00 77`), le nom est demandé à la première connexion.
- Administrateur du marchand : `07 00 00 00 01` (modifiable avec `SEED_ADMIN_PHONE`), puis **Mon compte → Espace marchand**.

## Ce que fait le starter

| Fonction | Où |
|---|---|
| **Multi-tenant** : un marchand par sous-domaine (`atelier-kone.babimobilier.ci`), repli sur `DEFAULT_TENANT_SLUG`. Isolation par Row Level Security PostgreSQL : chaque requête passe par `withTenant()`. | `middleware.ts`, `lib/tenant.ts`, `lib/db.ts` |
| **Connexion par OTP WhatsApp**, sans mot de passe. Code haché, usage unique, 5 essais, 3 envois par 10 min. Session JWT en cookie httpOnly. Les clients sont des comptes plateforme ; les membres d'équipe sont rattachés à un marchand avec des rôles. | `app/connexion`, `lib/otp.ts`, `lib/auth.ts`, `lib/session.ts` |
| **Catalogue mobile-first** : catégories, recherche, tri, pagination, fiche produit avec variantes, TVA affichée. | `app/catalogue`, `app/produits/[slug]` |
| **Panier** conservé dans le navigateur, un par marchand. Il survit aux coupures réseau. | `components/cart.tsx`, `app/panier` |
| **Checkout** : livraison par commune (frais et délais de la zone) ou retrait showroom ; Orange Money, MTN, Moov, Wave ou espèces à la livraison. Au-delà de 300 000 F, un acompte de 10 % est payé en mobile money. Prix relus en base, stock réservé sous verrou. | `app/commande`, `lib/orders.ts` |
| **Paiement CinetPay** : redirection vers le guichet, page de confirmation qui interroge le statut, nouvelle tentative possible, webhook signé, rapprochement automatique. | `lib/payments.ts`, `app/v1/webhooks`, `app/api/cron` |
| **Espace marchand** : liste et création de produits, publication, avec contrôle du rôle. | `app/admin/produits` |

Le détail du flux de paiement (initiation, webhook, échec, remboursement) est dans [docs/integration-cinetpay.md](docs/integration-cinetpay.md).

## Mise en production

- **Webhooks :** `APP_URL` doit être l'URL HTTPS publique. CinetPay notifie `APP_URL/v1/webhooks/cinetpay`.
- **Rapprochement :** `vercel.json` déclare un cron toutes les 2 minutes sur `/api/cron/rapprochement`. Un cron aussi fréquent demande un plan Vercel payant ; sinon, appelez la route depuis un cron externe avec l'en-tête `Authorization: Bearer $CRON_SECRET`.
- **Sous-domaines :** configurer un DNS wildcard `*.babimobilier.ci` et `ROOT_DOMAIN`.
- **WhatsApp :** faire valider les modèles `code_connexion` et `paiement_recu` dans le Business Manager de Meta.
- **Base de données :** l'application se connecte avec `babi_app`, jamais avec le propriétaire des tables. Sinon, la Row Level Security ne s'applique pas.

## Vérifications

```bash
npm run typecheck                 # web + api
npm run test                      # tests unitaires CinetPay
npm run build                     # build de production
```

## À construire ensuite

Images Cloudinary (upload depuis l'espace marchand), gestion des commandes et des livraisons côté marchand, app livreur (code de remise, encaissement cash), remboursements depuis l'interface, service worker pour le mode hors-ligne, notifications de suivi de livraison.
