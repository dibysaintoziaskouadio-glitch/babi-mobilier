'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withTenant } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { getCurrentTenant } from '@/lib/tenant';

const productSchema = z.object({
  name: z.string().trim().min(3, 'Nom trop court').max(120),
  categoryId: z.string().uuid('Choisissez une catégorie'),
  priceXof: z.coerce.number().int().min(1000, 'Prix minimum 1 000 FCFA').refine((v) => v % 5 === 0, 'Le prix doit être un multiple de 5 (exigence mobile money)'),
  stock: z.coerce.number().int().min(0).max(10_000),
  materials: z.string().trim().max(200).optional(),
  description: z.string().trim().max(3000).optional(),
  publish: z.coerce.boolean().optional(),
});

export type ProductFormState = { ok?: boolean; error?: string };

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export async function createProductAction(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const tenant = await getCurrentTenant();
  const staff = await requireStaff(tenant);
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;

  try {
    await withTenant(tenant.id, async (tx) => {
      const base = slugify(p.name) || 'meuble';
      const taken = await tx.product.count({ where: { tenantId: tenant.id, slug: { startsWith: base } } });
      const slug = taken ? `${base}-${taken + 1}` : base;
      const product = await tx.product.create({
        data: {
          tenantId: tenant.id,
          categoryId: p.categoryId,
          slug,
          name: p.name,
          description: p.description || null,
          materials: p.materials ? p.materials.split(',').map((m) => m.trim().toLowerCase()).filter(Boolean) : [],
          basePriceXof: p.priceXof,
          isPublished: Boolean(p.publish),
        },
      });
      await tx.productVariant.create({
        data: { tenantId: tenant.id, productId: product.id, sku: `${slug.slice(0, 40).toUpperCase()}-STD`, priceXof: p.priceXof, stock: p.stock },
      });
      await tx.auditLog.create({
        data: { tenantId: tenant.id, actorId: staff.sub, action: 'product.created', entity: 'products', entityId: product.id, after: { name: p.name, priceXof: p.priceXof } },
      });
    });
  } catch (err) {
    console.error('[admin produits]', err);
    return { error: 'Enregistrement impossible. Vérifiez les champs et réessayez.' };
  }
  revalidatePath('/admin/produits');
  revalidatePath('/catalogue');
  return { ok: true };
}

export async function togglePublishAction(productId: string, publish: boolean): Promise<void> {
  const tenant = await getCurrentTenant();
  const staff = await requireStaff(tenant);
  await withTenant(tenant.id, async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { isPublished: publish } });
    await tx.auditLog.create({
      data: { tenantId: tenant.id, actorId: staff.sub, action: publish ? 'product.published' : 'product.unpublished', entity: 'products', entityId: productId },
    });
  });
  revalidatePath('/admin/produits');
  revalidatePath('/catalogue');
}
