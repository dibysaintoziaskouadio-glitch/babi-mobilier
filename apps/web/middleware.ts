import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session-token';

// Pages réservées aux personnes connectées. /commande/retour reste publique :
// CinetPay y renvoie le client en POST inter-site, sans cookie de session.
const PROTECTED = [/^\/commande(?!\/retour)/, /^\/compte/, /^\/admin/, /^\/api\/paiements/];

export async function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);

  // 1. Tenant : sous-domaine du domaine racine, sinon tenant par défaut.
  //    L'en-tête entrant est toujours écrasé pour qu'un client ne puisse pas choisir son tenant.
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const root = (process.env.ROOT_DOMAIN ?? '').toLowerCase();
  const sub = root && host.endsWith(`.${root}`) ? host.slice(0, -root.length - 1) : '';
  const slug = sub && sub !== 'www' ? sub : process.env.DEFAULT_TENANT_SLUG ?? 'babi-mobilier';
  headers.set('x-tenant-slug', slug);

  // 2. Authentification
  if (PROTECTED.some((re) => re.test(req.nextUrl.pathname))) {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET ?? '');
    if (!session) {
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ code: 'NON_CONNECTE', detail: 'Connectez-vous pour continuer' }, { status: 401 });
      }
      const login = new URL('/connexion', req.url);
      login.searchParams.set('retour', req.nextUrl.pathname + req.nextUrl.search);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Ni fichiers statiques, ni webhooks (CinetPay n'a pas de cookie et le tenant y est inutile).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|v1/webhooks|api/cron).*)'],
};
