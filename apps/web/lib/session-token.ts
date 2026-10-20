// Jeton de session (JWT HS256). Sans dépendance serveur : utilisable dans le middleware Edge.
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'bm_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours

export interface SessionPayload {
  /** Identifiant utilisateur */
  sub: string;
  name: string;
  phone: string;
  /** Renseigné pour les membres d'équipe d'un marchand */
  tid?: string;
  roles: string[];
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  return new SignJWT({ name: payload.name, phone: payload.phone, tid: payload.tid, roles: payload.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      name: String(payload.name ?? ''),
      phone: String(payload.phone ?? ''),
      tid: typeof payload.tid === 'string' ? payload.tid : undefined,
      roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
    };
  } catch {
    return null;
  }
}
