'use client';
// Suivi du paiement après retour du guichet CinetPay : interroge l'API toutes les 3 s pendant 2 min.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatFcfa } from '@/lib/money';

type Status = 'initie' | 'en_attente' | 'reussi' | 'echoue' | 'expire' | 'rembourse' | 'partiellement_rembourse';
interface PaymentView { status: Status; amountXof: number; orderNumber: string }

const POLL_MS = 3000;
const MAX_WAIT_MS = 2 * 60 * 1000;

export function PaymentStatus({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    async function poll() {
      try {
        const res = await fetch(`/api/paiements/${paymentId}`, { cache: 'no-store' });
        if (res.ok) {
          const data: PaymentView = await res.json();
          if (stopped) return;
          setPayment(data);
          if (data.status !== 'en_attente' && data.status !== 'initie') {
            router.refresh(); // met à jour le statut de la commande affiché par la page serveur
            return;
          }
        }
      } catch {
        // réseau 3G instable : on retente au prochain tour
      }
      if (Date.now() - started > MAX_WAIT_MS) return setTimedOut(true);
      if (!stopped) setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      stopped = true;
    };
  }, [paymentId, router]);

  if (payment?.status === 'reussi') {
    return <p role="status" className="rounded-2xl bg-green-50 p-3 text-green-800">Paiement de {formatFcfa(payment.amountXof)} reçu.</p>;
  }
  if (payment?.status === 'echoue' || payment?.status === 'expire') {
    return <p role="alert" className="rounded-2xl bg-red-50 p-3 text-red-800">Le paiement n&apos;a pas abouti. Aucun montant n&apos;a été débité. Vous pouvez réessayer ci-dessous.</p>;
  }
  if (timedOut) {
    return <p role="status" className="rounded-2xl bg-orange-50 p-3">Nous attendons encore la confirmation de l&apos;opérateur. Vous recevrez un message WhatsApp dès qu&apos;elle arrive, inutile de payer une deuxième fois.</p>;
  }
  return (
    <p role="status" className="flex items-center gap-3 rounded-2xl bg-orange-50 p-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
      Validez le paiement sur votre téléphone (code secret ou application Wave)…
    </p>
  );
}
