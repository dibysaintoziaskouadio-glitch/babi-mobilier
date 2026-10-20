'use client';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { IdentityFields } from '@/components/IdentityFields';
import { formatIvorianPhone } from '@/lib/phone';
import { signupAction, type SignupState } from './actions';

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Patientez…' : children}</button>;
}

export function SignupForm({ retour }: { retour: string }) {
  const [state, action] = useFormState<SignupState, FormData>(signupAction, { step: 'form' });

  if (state.step === 'code') {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="retour" value={retour} />
        <p className="text-sm">
          {state.identity.firstName}, on vient d&apos;envoyer un code sur WhatsApp au <b>{formatIvorianPhone(state.phone)}</b>.
        </p>
        <div>
          <label htmlFor="code" className="label">Code à 6 chiffres</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className="field text-center font-display text-2xl tracking-[0.5em]" />
        </div>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <Submit>Créer mon compte</Submit>
        <div className="flex justify-between text-sm font-semibold text-orange-700">
          <button name="intent" value="modifier" formNoValidate>Modifier mes informations</button>
          <button name="intent" value="renvoyer" formNoValidate>Renvoyer le code</button>
        </div>
      </form>
    );
  }

  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="retour" value={retour} />
      <IdentityFields defaults={v} />
      <div>
        <label htmlFor="phone" className="label">Téléphone (WhatsApp)</label>
        <div className="flex items-center gap-2">
          <span className="rounded-2xl border border-orange-200 bg-orange-100 px-3 py-3 font-semibold">+225</span>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required defaultValue={v.phone} placeholder="07 00 00 00 01" className="field" />
        </div>
        <p className="mt-1 text-xs text-sable">On y envoie votre code de connexion et le suivi de vos commandes.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="cgu" required className="mt-1 h-4 w-4 accent-orange-500" />
        <span>J&apos;accepte les conditions générales de vente et la politique de confidentialité, et je veux recevoir le suivi de mes commandes sur WhatsApp.</span>
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
          {state.existingAccount && <> <Link href={`/connexion?retour=${encodeURIComponent(retour)}`} className="font-semibold underline">Se connecter</Link></>}
        </p>
      )}
      <Submit>Recevoir mon code</Submit>
      <p className="text-center text-sm">Déjà un compte ? <Link href={`/connexion?retour=${encodeURIComponent(retour)}`} className="font-semibold text-orange-700">Se connecter</Link></p>
    </form>
  );
}
