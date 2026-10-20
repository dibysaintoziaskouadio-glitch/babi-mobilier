import 'server-only';
import type { Prisma } from '@prisma/client';
import { withTenant } from './db';

export const PAGE_SIZE = 12;
export type CatalogSort = 'populaires' | 'prix_croissant' | 'prix_decroissant' | 'nouveautes';

export interface CatalogFilters {
  categorie?: string;
  q?: string;
  tri?: CatalogSort;
  page?: number;
  prixMin?: number;
  prixMax?: number;
  materiaux?: string[];
  promo?: boolean;
  enStock?: boolean;
}

export interface ProductCard {
  id: string;
  categoryName: string;
  description: string | null;
  stockLeft: number;
  slug: string;
  name: string;
  priceXof: number;
  compareAtXof: number | null;
  defaultVariantId: string | null;
  defaultVariantLabel: string;
  available: boolean;
  materials: string[];
  imagePublicId: string | null;
  color: string | null;
  ratingAvg: number;
  ratingCount: number;
}

export async function listCategories(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx.category.findMany({
      where: { tenantId, isActive: true, parentId: null },
      orderBy: { position: 'asc' },
      select: { id: true, slug: true, name: true },
    }),
  );
}

export async function listProducts(tenantId: string, f: CatalogFilters) {
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.ProductWhereInput = {
    tenantId,
    isPublished: true,
    ...(f.categorie ? { category: { slug: f.categorie } } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { description: { contains: f.q, mode: 'insensitive' } }] } : {}),
    ...(f.prixMin || f.prixMax ? { basePriceXof: { ...(f.prixMin ? { gte: f.prixMin } : {}), ...(f.prixMax ? { lte: f.prixMax } : {}) } } : {}),
    ...(f.materiaux?.length ? { materials: { hasSome: f.materiaux } } : {}),
    ...(f.promo ? { variants: { some: { isActive: true, compareAtXof: { not: null } } } } : {}),
    // Approximation : stock physique > 0 (les réservations en cours ne sont pas déduites ici)
    ...(f.enStock ? { AND: [{ variants: { some: { isActive: true, stock: { gt: 0 } } } }] } : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    f.tri === 'prix_croissant' ? { basePriceXof: 'asc' }
    : f.tri === 'prix_decroissant' ? { basePriceXof: 'desc' }
    : f.tri === 'nouveautes' ? { createdAt: 'desc' }
    : { ratingCount: 'desc' };

  return withTenant(tenantId, async (tx) => {
    const [total, rows] = await Promise.all([
      tx.product.count({ where }),
      tx.product.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          category: { select: { name: true } },
          variants: { where: { isActive: true }, orderBy: { priceXof: 'asc' } },
          images: { orderBy: { position: 'asc' }, take: 1 },
        },
      }),
    ]);
    const items: ProductCard[] = rows.map((p) => {
      const v = p.variants[0];
      return {
        id: p.id,
        categoryName: p.category.name,
        description: p.description,
        stockLeft: p.variants.reduce((n, x) => n + Math.max(0, x.stock - x.stockReserved), 0),
        slug: p.slug,
        name: p.name,
        priceXof: v?.priceXof ?? p.basePriceXof,
        compareAtXof: v?.compareAtXof ?? null,
        defaultVariantId: v?.id ?? null,
        defaultVariantLabel: v ? variantLabel(v.attributes) : '',
        available: p.variants.some((x) => x.stock - x.stockReserved > 0) || p.isCustomMade,
        materials: p.materials,
        imagePublicId: p.images[0]?.publicId ?? null,
        color: colorOf(v?.attributes),
        ratingAvg: Number(p.ratingAvg),
        ratingCount: p.ratingCount,
      };
    });
    return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

export async function getProduct(tenantId: string, slug: string) {
  return withTenant(tenantId, (tx) =>
    tx.product.findFirst({
      where: { tenantId, slug, isPublished: true },
      include: {
        category: { select: { name: true, slug: true } },
        variants: { where: { isActive: true }, orderBy: { priceXof: 'asc' } },
        images: { orderBy: { position: 'asc' } },
      },
    }),
  );
}

/** {"couleur":"Orange brûlé","bois":"Iroko"} → « Orange brûlé · Iroko » */
export function variantLabel(attributes: Prisma.JsonValue): string {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return 'Modèle standard';
  const parts = Object.entries(attributes)
    .filter(([k, v]) => k !== 'couleur_hex' && typeof v === 'string')
    .map(([, v]) => String(v));
  return parts.length ? parts.join(' · ') : 'Modèle standard';
}

export function colorOf(attributes: Prisma.JsonValue | undefined): string | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return null;
  const hex = (attributes as Record<string, unknown>).couleur_hex;
  return typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null;
}

/** Matériaux du catalogue publié, les plus fréquents d'abord (filtres). */
export async function listMaterials(tenantId: string): Promise<{ name: string; count: number }[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.$queryRaw<{ name: string; count: bigint }[]>`
      SELECT m AS name, count(*) AS count
        FROM products, unnest(materials) AS m
       WHERE tenant_id = ${tenantId}::uuid AND is_published
       GROUP BY m ORDER BY count(*) DESC, m LIMIT 10`,
  );
  return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
}

/** Nombre de produits publiés par catégorie (filtres et tuiles d'accueil). */
export async function categoryCounts(tenantId: string): Promise<Record<string, number>> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.product.groupBy({ by: ['categoryId'], where: { tenantId, isPublished: true }, _count: { _all: true } }),
  );
  return Object.fromEntries(rows.map((r) => [r.categoryId, r._count._all]));
}

/** Meilleures réductions en cours. */
export async function listDeals(tenantId: string, take = 8): Promise<ProductCard[]> {
  const { items } = await listProducts(tenantId, { promo: true, tri: 'populaires' });
  return items
    .filter((p) => p.compareAtXof)
    .sort((a, b) => b.compareAtXof! / b.priceXof - a.compareAtXof! / a.priceXof)
    .slice(0, take);
}

export interface DeliveryInfo { commune: string; feeXof: number; minDays: number; maxDays: number; codAllowed: boolean }

/** Communes desservies à Abidjan, avec frais et délais. */
export async function listCommunes(tenantId: string): Promise<DeliveryInfo[]> {
  const zones = await withTenant(tenantId, (tx) =>
    tx.deliveryZone.findMany({ where: { tenantId, isActive: true, type: 'abidjan' } }),
  );
  return zones
    .flatMap((z) => z.communes.map((commune) => ({ commune, feeXof: z.baseFeeXof, minDays: z.minDays, maxDays: z.maxDays, codAllowed: z.codAllowed })))
    .sort((a, b) => a.commune.localeCompare(b.commune, 'fr'));
}

/** « 4,8 » + appréciation, façon note d'établissement. */
export function ratingLabel(avg: number): string {
  if (avg >= 4.5) return 'Exceptionnel';
  if (avg >= 4) return 'Très bien';
  if (avg >= 3.5) return 'Bien';
  return 'Correct';
}
