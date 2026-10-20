'use client';
import { useState, useTransition } from 'react';
import { formatIvorianPhone } from '@/lib/phone';
import type { MobileMoney } from '@/lib/orders';
import { retryPaymentAction } from '../../actions';

const OPERATORS: { value: MobileMoney; label: string }[] = [
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'moov', label: 'Moov Money' },
  { value: 'wave', label: 'Wave' },
];

export function RetryPayment({ orderId, defaultPhone }: { orderId: string; defaultPhone: string }) {
  const [operator, setOperator] = useState<MobileMoney>('orange_money');
  const [phone, setPhone] = useState(formatIvorianPhone(defaultPhone));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await retryPaymentAction(orderId, operator, phone);
          if (res.ok) window.location.assign(res.redirectTo);
          else setError(res.error);
        });
      }}
    >
      <p className="font-semibold">Payer avec un autre moyen</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="sr-only" htmlFor="retry-op">Opérateur</label>
        <select id="retry-op" value={operator} onChange={(e) => setOperator(e.target.value as MobileMoney)} className="field">
          {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="retry-phone">Numéro mobile money</label>
        <input id="retry-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="field" />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? 'Patientez…' : 'Réessayer le paiement'}</button>
    </form>
  );
}
