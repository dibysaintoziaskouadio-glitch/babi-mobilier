'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountError, resolveAccount } from '@/lib/auth';
import { identitySchema, type Identity } from '@/lib/identity';
import { OtpError, requestOtp, verifyOtp } from '@/lib/otp';
import { normalizeIvorianPhone } from '@/lib/phone';
import { closeSession, forgetVerifiedPhone, openSession, readVerifiedPhone, rememberVerifiedPhone } from '@/lib/session';
import { getCurrentTenant } from '@/lib/tenant';

export type LoginState =
  | { step: 'phone'; error?: string }
  | { step: 'code'; phone: string; askName: boolean; error?: string };

/** Les redirections après connexion restent sur le site (pas d'URL externe). */
function safeReturn(value: FormDataEntryValue | null): string {
  const v = typeof value === 'string' ? value : '';
  return v.startsWith('/') && !v.startsWith('//') ? v : '/compte';
}

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const tenant = await getCurrentTenant();

  if (prev.step === 'phone' || form.get('intent') === 'renvoyer') {
    const phone = normalizeIvorianPhone(String(form.get('phone') ?? (prev.step === 'code' ? prev.phone : '')));
    if (!phone) return { step: 'phone', error: 'Numéro invalide. Exemple : 07 00 00 00 01' };
    try {
      const ip = headers().get('x-forwarded-for')?.split(',')[0].trim() || null;
      await requestOtp(phone, ip);
    } catch (err) {
      return { step: 'phone', error: err instanceof OtpError ? err.message : 'Envoi du code impossible pour le moment. Réessayez.' };
    }
    return { step: 'code', phone, askName: false };
  }

  const code = String(form.get('code') ?? '');
  let identity: Identity | null = null;
  if (prev.askName) {
    const parsed = identitySchema.safeParse({ firstName: form.get('firstName'), lastName: form.get('lastName'), email: form.get('email') });
    if (!parsed.success) return { ...prev, error: parsed.error.issues[0].message };
    identity = parsed.data;
  }
  try {
    let phone: string;
    if (!prev.askName) {
      await verifyOtp(prev.phone, code);
      phone = prev.phone;
      await rememberVerifiedPhone(phone);
    } else {
      // Étape « nom » : le numéro vérifié vient du cookie signé, jamais de l'état du formulaire.
      const verified = await readVerifiedPhone();
      if (!verified || verified !== prev.phone) return { step: 'phone', error: 'Vérification expirée. Recommencez la connexion.' };
      phone = verified;
    }
    const account = await resolveAccount(tenant, phone, identity);
    if ('needsName' in account) return { ...prev, askName: true };
    forgetVerifiedPhone();
    await openSession(account);
  } catch (err) {
    const known = err instanceof OtpError || err instanceof AccountError;
    if (!known) console.error('[connexion]', err);
    return { ...prev, error: known ? (err as Error).message : 'Connexion impossible pour le moment. Réessayez.' };
  }
  redirect(safeReturn(form.get('retour')));
}

export async function logoutAction(): Promise<void> {
  closeSession();
  redirect('/');
}
