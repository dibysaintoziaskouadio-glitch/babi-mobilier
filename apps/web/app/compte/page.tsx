import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, withTenant } from '@/lib/db';
import { formatFcfa } from '@/lib/money';
import { formatIvorianPhone } from '@/lib/phone';
import { requireSession } from '@/lib/session';
import { getCurrentTenant } from '@/lib/tenant';
import { logoutAction } from '../connexion/actions';

export const metadata: Metadata = { title: 'Mon compte' };

const STATUS_LABEL: Record<string, string> = {
  en_attente_paiement: 'En attente de paiement',
  payee: 'Payée',
  confirmee: 'Confirmée',
  en_preparation: 'En préparation',
  en_fabrication: 'En fabrication',
  prete: 'Prête',
  expediee: 'Expédiée',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
  remboursee: 'Remboursée',
  retournee: 'Retournée',
};

export default async function AccountPage() {
  const session = await requireSession('/compte');
  const tenant = await getCurrentTenant();
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { fullName: true, firstName: true, email: true } });
  const orders = await withTenant(tenant.id, (tx) =>
    tx.order.findMany({ where: { customerId: session.sub }, orderBy: { placedAt: 'desc' }, take: 20, include: { items: { select: { productName: true } } } }),
  );

  return (
    <div className="space-y-5 py-5">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-2xl font-bold">Bonjour {user?.firstName ?? session.name.split(' ')[0]}</h1>
          <p className="text-sm text-sable">{user?.fullName} · {formatIvorianPhone(session.phone)}{user?.email ? ` · ${user.email}` : ''}</p>
        </div>
        <div className="flex gap-2">
          {session.tid === tenant.id && <Link href="/admin/produits" className="btn-ghost">Espace marchand</Link>}
          <form action={logoutAction}><button className="btn-ghost">Se déconnecter</button></form>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Mes commandes</h2>
        {orders.length === 0 ? (
          <div className="card p-6 text-center text-sable">
            Vous n&apos;avez pas encore commandé. <Link href="/catalogue" className="font-semibold text-orange-700">Voir le catalogue</Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/commande/confirmation/${o.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-orange-300">
                  <div className="min-w-0">
                    <p className="font-display font-bold">{o.number}</p>
                    <p className="truncate text-sm text-sable">{o.items.map((i) => i.productName).join(', ')}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display font-bold tabular-nums">{formatFcfa(o.totalTtcXof)}</p>
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">{STATUS_LABEL[o.status] ?? o.status}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
