import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { redirect } from 'next/navigation';
import { env } from './env';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type SessionPayload } from './session-token';
import type { CurrentTenant } from './tenant';

export async function getSession(): Promise<SessionPayload | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value, env.sessionSecret());
}

export async function requireSession(returnTo: string): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect(`/connexion?retour=${encodeURIComponent(returnTo)}`);
  return session;
}

/** Accès back-office : la session doit appartenir au tenant courant et porter l'un des rôles. */
export async function requireStaff(tenant: CurrentTenant, roles: string[] = ['admin', 'vendeur']): Promise<SessionPayload> {
  const session = await requireSession('/admin/produits');
  if (session.tid !== tenant.id || !session.roles.some((r) => roles.includes(r))) {
    redirect('/connexion?erreur=acces');
  }
  return session;
}

export async function openSession(payload: SessionPayload): Promise<void> {
  cookies().set(SESSION_COOKIE, await signSession(payload, env.sessionSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function closeSession(): void {
  cookies().delete(SESSION_COOKIE);
}

// Preuve courte (10 min) qu'un numéro vient d'être vérifié par OTP, pour l'étape « nom »
// d'une première connexion. Signée côté serveur : l'état du formulaire ne suffit jamais.
const VERIFIED_COOKIE = 'bm_tel_verifie';

export async function rememberVerifiedPhone(phone: string): Promise<void> {
  const token = await new SignJWT({ purpose: 'phone_verified' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(phone)
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(env.sessionSecret()));
  cookies().set(VERIFIED_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/connexion', maxAge: 600 });
}

export async function readVerifiedPhone(): Promise<string | null> {
  const token = cookies().get(VERIFIED_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.sessionSecret()), { algorithms: ['HS256'] });
    return payload.purpose === 'phone_verified' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function forgetVerifiedPhone(): void {
  cookies().delete({ name: VERIFIED_COOKIE, path: '/connexion' });
}
