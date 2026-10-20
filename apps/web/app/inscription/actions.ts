'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountError, assertCanRegister, createCustomer } from '@/lib/auth';
import { identitySchema, type Identity } from '@/lib/identity';
import { OtpError, requestOtp, verifyOtp } from '@/lib/otp';
import { normalizeIvorianPhone } from '@/lib/phone';
import { openSession } from '@/lib/session';

export type SignupState =
  | { step: 'form'; error?: string; values?: Partial<Identity> & { phone?: string }; existingAccount?: boolean }
  | { step: 'code'; identity: Identity; phone: string; error?: string };

/** Les redirections après inscription restent sur le site. */
function safeReturn(value: FormDataEntryValue | null): string {
  const v = typeof value === 'string' ? value : '';
  return v.startsWith('/') && !v.startsWith('//') ? v : '/compte';
}

export async function signupAction(prev: SignupState, form: FormData): Promise<SignupState> {
  // Étape 1 : coordonnées, puis envoi du code WhatsApp
  if (prev.step === 'form' || form.get('intent') === 'modifier') {
    if (form.get('intent') === 'modifier' && prev.step === 'code') {
      return { step: 'form', values: { ...prev.identity, phone: prev.phone } };
    }
    const values = {
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
    };
    const parsed = identitySchema.safeParse(values);
    if (!parsed.success) return { step: 'form', values, error: parsed.error.issues[0].message };
    const phone = normalizeIvorianPhone(values.phone);
    if (!phone) return { step: 'form', values, error: 'Numéro invalide. Exemple : 07 00 00 00 01' };
    if (form.get('cgu') !== 'on') return { step: 'form', values, error: 'Acceptez les conditions pour créer votre compte' };

    try {
      await assertCanRegister(phone, parsed.data.email);
      await requestOtp(phone, headers().get('x-forwarded-for')?.split(',')[0].trim() || null);
    } catch (err) {
      if (err instanceof AccountError || err instanceof OtpError) {
        return { step: 'form', values, error: err.message, existingAccount: err instanceof AccountError };
      }
      console.error('[inscription]', err);
      return { step: 'form', values, error: 'Envoi du code impossible pour le moment. Réessayez.' };
    }
    return { step: 'code', identity: parsed.data, phone };
  }

  // Étape 2 : vérification du code, création du compte
  if (form.get('intent') === 'renvoyer') {
    try {
      await requestOtp(prev.phone, null);
      return { ...prev, error: undefined };
    } catch (err) {
      return { ...prev, error: err instanceof OtpError ? err.message : 'Envoi du code impossible pour le moment.' };
    }
  }
  // Les données de l'étape 1 reviennent du navigateur : on les revalide. Le numéro est
  // celui sur lequel le code est vérifié, donc il ne peut pas être celui de quelqu'un d'autre.
  const identity = identitySchema.safeParse(prev.identity);
  if (!identity.success) return { step: 'form', error: 'Formulaire incomplet, recommencez.' };
  try {
    await verifyOtp(prev.phone, String(form.get('code') ?? ''));
    await assertCanRegister(prev.phone, identity.data.email);
    const user = await createCustomer(prev.phone, identity.data);
    await openSession({ sub: user.id, name: user.fullName, phone: user.phone, roles: ['client'] });
  } catch (err) {
    if (err instanceof AccountError) return { step: 'form', values: { ...identity.data, phone: prev.phone }, error: err.message, existingAccount: true };
    if (err instanceof OtpError) return { ...prev, error: err.message };
    console.error('[inscription]', err);
    return { ...prev, error: 'Création du compte impossible pour le moment. Réessayez.' };
  }
  redirect(safeReturn(form.get('retour')));
}
