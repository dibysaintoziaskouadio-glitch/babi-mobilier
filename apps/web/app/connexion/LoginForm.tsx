'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { formatIvorianPhone } from '@/lib/phone';
import Link from 'next/link';
import { IdentityFields } from '@/components/IdentityFields';
import { loginAction, type LoginState } from './actions';

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Patientez…' : children}</button>;
}

export function LoginForm({ retour }: { retour: string }) {
  const [state, action] = useFormState<LoginState, FormData>(loginAction, { step: 'phone' });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="retour" value={retour} />
      {state.step === 'phone' ? (
        <div>
          <label htmlFor="phone" className="label">Votre numéro de téléphone</label>
          <div className="flex items-center gap-2">
            <span className="rounded-2xl border border-orange-200 bg-orange-100 px-3 py-3 font-semibold">+225</span>
            <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="07 00 00 00 01" className="field" />
          </div>
          <p className="mt-1 text-xs text-sable">Vous recevrez un code à 6 chiffres sur WhatsApp.</p>
        </div>
      ) : (
        <>
          <p className="text-sm">Code envoyé sur WhatsApp au <b>{formatIvorianPhone(state.phone)}</b>.</p>
          {!state.askName ? (
            <div>
              <label htmlFor="code" className="label">Code à 6 chiffres</label>
              <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="field text-center font-display text-2xl tracking-[0.5em]" />
            </div>
          ) : (
            <IdentityFields intro="Bienvenue. Il nous manque quelques informations pour créer votre compte." />
          )}
        </>
      )}
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <Submit>{state.step === 'phone' ? 'Recevoir mon code' : state.askName ? 'Créer mon compte' : 'Me connecter'}</Submit>
      {state.step === 'phone' && (
        <p className="text-center text-sm">Pas encore de compte ? <Link href="/inscription" className="font-semibold text-orange-700">Créer un compte</Link></p>
      )}
      {state.step === 'code' && !state.askName && (
        <button name="intent" value="renvoyer" formNoValidate className="w-full text-sm font-semibold text-orange-700">Renvoyer le code</button>
      )}
    </form>
  );
}
