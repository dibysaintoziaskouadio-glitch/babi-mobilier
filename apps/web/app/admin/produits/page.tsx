import type { Metadata } from 'next';
import { withTenant } from '@/lib/db';
import { formatFcfa } from '@/lib/money';
import { requireStaff } from '@/lib/session';
import { getCurrentTenant } from '@/lib/tenant';
import { togglePublishAction } from './actions';
import { ProductForm } from './ProductForm';

export const metadata: Metadata = { title: 'Produits · Espace marchand' };
export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const tenant = await getCurrentTenant();
  await requireStaff(tenant);
  const [categories, products] = await withTenant(tenant.id, (tx) =>
    Promise.all([
      tx.category.findMany({ where: { tenantId: tenant.id }, orderBy: { position: 'asc' }, select: { id: true, name: true } }),
      tx.product.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        include: { category: { select: { name: true } }, variants: { select: { stock: true, stockReserved: true } } },
      }),
    ]),
  );

  return (
    <div className="space-y-5 py-5">
      <h1 className="text-2xl font-bold">Produits · {tenant.name}</h1>
      <ProductForm categories={categories} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-orange-100 font-display">
            <tr><th className="p-3">Produit</th><th className="p-3">Catégorie</th><th className="p-3 text-right">Prix TTC</th><th className="p-3 text-right">Disponible</th><th className="p-3">Statut</th></tr>
          </thead>
          <tbody className="divide-y divide-orange-100">
            {products.map((p) => {
              const available = p.variants.reduce((s, v) => s + v.stock - v.stockReserved, 0);
              return (
                <tr key={p.id}>
                  <td className="p-3 font-semibold">{p.name}</td>
                  <td className="p-3">{p.category.name}</td>
                  <td className="p-3 text-right tabular-nums">{formatFcfa(p.basePriceXof)}</td>
                  <td className={`p-3 text-right tabular-nums ${available <= 2 ? 'font-bold text-orange-700' : ''}`}>{available}</td>
                  <td className="p-3">
                    <form action={togglePublishAction.bind(null, p.id, !p.isPublished)}>
                      <button className={`rounded-full px-3 py-1 text-xs font-semibold ${p.isPublished ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                        {p.isPublished ? 'En ligne · retirer' : 'Brouillon · publier'}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
