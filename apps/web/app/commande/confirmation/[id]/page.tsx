import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatFcfa } from '@/lib/money';
import { getOrderForCustomer } from '@/lib/orders';
import { requireSession } from '@/lib/session';
import { getCurrentTenant } from '@/lib/tenant';
import { PaymentStatus } from './PaymentStatus';
import { RetryPayment } from './RetryPayment';

export const metadata: Metadata = { title: 'Ma commande' };
export const dynamic = 'force-dynamic';

export default async function ConfirmationPage({ params, searchParams }: { params: { id: string }; searchParams: { paiement?: string } }) {
  const session = await requireSession(`/commande/confirmation/${params.id}`);
  const tenant = await getCurrentTenant();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const order = await getOrderForCustomer(tenant.id, params.id, session.sub);
  if (!order) notFound();

  const pending = order.payments.find((p) => p.kind !== 'remboursement' && ['initie', 'en_attente'].includes(p.status));
  const watched = order.payments.find((p) => p.id === searchParams.paiement) ?? pending;
  const awaitingPayment = order.status === 'en_attente_paiement';
  const isCod = (order.deliverySnapshot as { paiement?: string } | null)?.paiement === 'cash';
  const reservationOpen = !order.stockReservedUntil || order.stockReservedUntil > new Date();

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <section className="card p-6">
        <p className="text-sm font-semibold text-orange-700">Commande {order.number}</p>
        <h1 className="mt-1 text-2xl font-bold">
          {awaitingPayment ? 'Paiement en cours' : order.status === 'annulee' ? 'Commande annulée' : `Merci ${session.name.split(' ')[0]}, votre commande est confirmée`}
        </h1>
        {!awaitingPayment && order.status !== 'annulee' && (
          <p className="mt-2 text-sable">
            {isCod
              ? `Vous paierez ${formatFcfa(order.totalTtcXof - order.paidXof)} au livreur. On vous confirme le créneau de livraison sur WhatsApp.`
              : 'Le reçu et le suivi de livraison arrivent sur WhatsApp.'}
          </p>
        )}
        {order.status === 'annulee' && <p className="mt-2 text-sable">{order.cancelledReason}</p>}
        {watched && awaitingPayment && <div className="mt-4"><PaymentStatus paymentId={watched.id} /></div>}
        {awaitingPayment && !pending && reservationOpen && (
          <div className="mt-4"><RetryPayment orderId={order.id} defaultPhone={session.phone} /></div>
        )}
      </section>

      <section className="card p-6">
        <h2 className="mb-2 text-lg font-bold">Détail</h2>
        <ul className="space-y-1 text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2"><span>{i.quantity} × {i.productName} <span className="text-sable">({i.variantLabel})</span></span><span className="shrink-0 tabular-nums">{formatFcfa(i.unitPriceXof * i.quantity)}</span></li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-orange-100 pt-2 text-sm tabular-nums">
          <div className="flex justify-between"><dt>Livraison</dt><dd>{order.shippingXof ? formatFcfa(order.shippingXof) : 'Gratuit'}</dd></div>
          <div className="flex justify-between"><dt>dont TVA 18 %</dt><dd>{formatFcfa(order.vatXof)}</dd></div>
          <div className="flex justify-between font-display text-lg font-bold"><dt>Total TTC</dt><dd>{formatFcfa(order.totalTtcXof)}</dd></div>
          <div className="flex justify-between text-sable"><dt>Déjà payé</dt><dd>{formatFcfa(order.paidXof)}</dd></div>
        </dl>
      </section>
      <Link href="/compte" className="btn-ghost w-full">Voir mes commandes</Link>
    </div>
  );
}
