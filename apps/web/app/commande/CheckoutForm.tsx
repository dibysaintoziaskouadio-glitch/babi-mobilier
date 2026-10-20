'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useCart } from '@/components/cart';
import { formatFcfa, roundUpTo5, splitTtc } from '@/lib/money';
import { formatIvorianPhone } from '@/lib/phone';
import { checkoutAction } from './actions';

interface CommuneOption { commune: string; feeXof: number; minDays: number; maxDays: number; codAllowed: boolean; codMaxXof: number | null }
type Payment = 'orange_money' | 'mtn_momo' | 'moov' | 'wave' | 'cash';
type Operator = Exclude<Payment, 'cash'>;

const OPERATORS: { value: Operator; label: string; hint: string; color: string }[] = [
  { value: 'orange_money', label: 'Orange Money', hint: 'Validation par code secret', color: '#FF7900' },
  { value: 'mtn_momo', label: 'MTN MoMo', hint: 'Notification sur votre téléphone', color: '#FFCB05' },
  { value: 'moov', label: 'Moov Money', hint: 'Validation par code secret', color: '#0066B3' },
  { value: 'wave', label: 'Wave', hint: 'Validation dans l\'application Wave', color: '#1DC8F2' },
];

const STEPS = ['Livraison', 'Paiement'] as const;

export function CheckoutForm(props: { communes: CommuneOption[]; showroom: { name: string } | null; defaultPhone: string; codThresholdXof: number }) {
  const { lines, ready, totalXof, clear } = useCart();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; orderId?: string } | null>(null);

  const [mode, setMode] = useState<'livraison' | 'retrait'>('livraison');
  const [commune, setCommune] = useState('');
  const [quartier, setQuartier] = useState('');
  const [landmark, setLandmark] = useState('');
  const [contactPhone, setContactPhone] = useState(formatIvorianPhone(props.defaultPhone));
  const [payment, setPayment] = useState<Payment>('orange_money');
  const [depositOperator, setDepositOperator] = useState<Operator>('orange_money');
  const [payerPhone, setPayerPhone] = useState(formatIvorianPhone(props.defaultPhone));
  const [note, setNote] = useState('');

  const zone = props.communes.find((c) => c.commune === commune);
  const shipping = mode === 'retrait' ? 0 : zone?.feeXof ?? null;
  const total = totalXof + (shipping ?? 0);
  const codThreshold = zone?.codMaxXof ?? props.codThresholdXof;
  const deposit = payment === 'cash' && total > codThreshold ? roundUpTo5(total * 0.1) : 0;
  const codAvailable = mode === 'retrait' || !zone || zone.codAllowed;
  const { ht, tva } = useMemo(() => splitTtc(totalXof), [totalXof]);
  const payNow = payment === 'cash' ? deposit : total;

  if (!ready) return <p className="py-10 text-center text-sable">Chargement…</p>;
  if (lines.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-lg font-bold">Votre panier est vide</p>
        <Link href="/catalogue" className="btn-primary mt-4">Voir le catalogue</Link>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await checkoutAction({
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        mode,
        commune: mode === 'livraison' ? commune : undefined,
        quartier: quartier || undefined,
        landmark: mode === 'livraison' ? landmark : undefined,
        contactPhone,
        payment,
        depositOperator: payment === 'cash' && deposit > 0 ? depositOperator : undefined,
        payerPhone,
        note: note || undefined,
      });
      if (!res.ok) {
        setError({ message: res.error, orderId: res.orderId });
        if (res.orderId) clear();
        return;
      }
      clear();
      if (res.external) window.location.assign(res.redirectTo);
      else router.push(res.redirectTo);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5 md:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <ol className="flex items-center gap-2 text-sm font-semibold" aria-label="Étapes">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-orange-500 text-xs text-white">{i + 1}</span>{s}
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-orange-200" aria-hidden="true" />}
            </li>
          ))}
        </ol>

        {/* 1. Livraison */}
        <fieldset className="card space-y-4 p-5">
          <legend className="sr-only">Livraison</legend>
          <h2 className="text-lg font-bold">Où livrer ?</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['livraison', 'retrait'] as const).map((m) => (
              <label key={m} className={`cursor-pointer rounded-2xl border p-3 text-center font-semibold ${mode === m ? 'border-orange-500 bg-orange-50' : 'border-orange-200'} ${m === 'retrait' && !props.showroom ? 'pointer-events-none opacity-40' : ''}`}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" disabled={m === 'retrait' && !props.showroom} />
                {m === 'livraison' ? 'Livraison à domicile' : 'Retrait au showroom'}
              </label>
            ))}
          </div>

          {mode === 'livraison' ? (
            <>
              <div>
                <label htmlFor="commune" className="label">Commune</label>
                <select id="commune" required value={commune} onChange={(e) => setCommune(e.target.value)} className="field">
                  <option value="">Choisissez votre commune</option>
                  {props.communes.map((c) => (
                    <option key={c.commune} value={c.commune}>{c.commune} · {formatFcfa(c.feeXof)}</option>
                  ))}
                </select>
                {zone && <p className="mt-1 text-sm text-sable">Livraison sous {zone.minDays} à {zone.maxDays} jour{zone.maxDays > 1 ? 's' : ''}, montage compris.</p>}
              </div>
              <div>
                <label htmlFor="quartier" className="label">Quartier <span className="font-normal text-sable">(facultatif)</span></label>
                <input id="quartier" value={quartier} onChange={(e) => setQuartier(e.target.value)} placeholder="Riviera 3, Angré 8e tranche…" className="field" />
              </div>
              <div>
                <label htmlFor="landmark" className="label">Repère pour le livreur</label>
                <textarea id="landmark" required minLength={5} rows={2} value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Face à la pharmacie, portail bleu, 2e étage…" className="field" />
              </div>
            </>
          ) : (
            <p className="rounded-2xl bg-orange-50 p-3 text-sm">Retrait gratuit à <b>{props.showroom?.name}</b>. On vous prévient sur WhatsApp quand la commande est prête.</p>
          )}
          <div>
            <label htmlFor="contactPhone" className="label">Téléphone du destinataire</label>
            <input id="contactPhone" type="tel" inputMode="tel" required value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="field" />
          </div>
        </fieldset>

        {/* 2. Paiement */}
        <fieldset className="card space-y-3 p-5">
          <legend className="sr-only">Paiement</legend>
          <h2 className="text-lg font-bold">Comment payer ?</h2>
          {OPERATORS.map((o) => (
            <PaymentOption key={o.value} checked={payment === o.value} onSelect={() => setPayment(o.value)} label={o.label} hint={o.hint} color={o.color} />
          ))}
          <PaymentOption
            checked={payment === 'cash'}
            onSelect={() => codAvailable && setPayment('cash')}
            label="Espèces à la livraison"
            hint={codAvailable ? `Vous payez le livreur. Acompte de 10 % en mobile money au-delà de ${formatFcfa(codThreshold)}.` : 'Indisponible pour cette zone'}
            color="#2A1A0F"
            disabled={!codAvailable}
          />

          {payment === 'cash' && deposit > 0 && (
            <div className="space-y-2 rounded-2xl bg-orange-50 p-3">
              <p className="text-sm">Acompte à régler maintenant : <b className="tabular-nums">{formatFcfa(deposit)}</b>. Le reste ({formatFcfa(total - deposit)}) se paie au livreur.</p>
              <label htmlFor="depositOperator" className="label">Payer l&apos;acompte avec</label>
              <select id="depositOperator" value={depositOperator} onChange={(e) => setDepositOperator(e.target.value as Operator)} className="field">
                {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {payNow > 0 && (
            <div>
              <label htmlFor="payerPhone" className="label">Numéro mobile money qui paie</label>
              <input id="payerPhone" type="tel" inputMode="tel" required value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} className="field" />
            </div>
          )}
          <div>
            <label htmlFor="note" className="label">Note pour la commande <span className="font-normal text-sable">(facultatif)</span></label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Appelez avant 10 h, accès par la ruelle…" className="field" />
          </div>
        </fieldset>
      </div>

      <aside className="card h-fit space-y-3 p-5 md:sticky md:top-24">
        <h2 className="text-lg font-bold">Ma commande</h2>
        <ul className="space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-2"><span className="truncate">{l.quantity} × {l.name}</span><span className="shrink-0 tabular-nums">{formatFcfa(l.priceXof * l.quantity)}</span></li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-orange-100 pt-2 text-sm tabular-nums">
          <div className="flex justify-between"><dt>Sous-total HT</dt><dd>{formatFcfa(ht)}</dd></div>
          <div className="flex justify-between"><dt>TVA 18 %</dt><dd>{formatFcfa(tva)}</dd></div>
          <div className="flex justify-between"><dt>Livraison</dt><dd>{shipping === null ? 'choisissez une commune' : shipping === 0 ? 'Gratuit' : formatFcfa(shipping)}</dd></div>
          <div className="flex justify-between border-t border-orange-100 pt-2 font-display text-lg font-bold"><dt>Total TTC</dt><dd>{formatFcfa(total)}</dd></div>
        </dl>
        {error && (
          <div className="error rounded-2xl bg-red-50 p-3" role="alert">
            {error.message}
            {error.orderId && <> <Link href={`/commande/confirmation/${error.orderId}`} className="font-semibold underline">Réessayer le paiement</Link></>}
          </div>
        )}
        <button className="btn-primary w-full" disabled={pending || (mode === 'livraison' && !zone)}>
          {pending ? 'Patientez…' : payNow > 0 ? `Payer ${formatFcfa(payNow)}` : 'Confirmer la commande'}
        </button>
        <p className="text-center text-xs text-sable">
          {payNow > 0 ? 'Paiement sécurisé via CinetPay. Reçu envoyé sur WhatsApp.' : 'Vous payez à la réception, après avoir vérifié le meuble.'}
        </p>
      </aside>
    </form>
  );
}

function PaymentOption({ checked, onSelect, label, hint, color, disabled = false }: { checked: boolean; onSelect: () => void; label: string; hint: string; color: string; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${checked ? 'border-orange-500 bg-orange-50' : 'border-orange-200'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
      <input type="radio" name="payment" checked={checked} onChange={onSelect} disabled={disabled} className="h-4 w-4 accent-orange-500" />
      <span className="h-8 w-8 shrink-0 rounded-xl" style={{ background: color }} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs text-sable">{hint}</span>
      </span>
    </label>
  );
}
