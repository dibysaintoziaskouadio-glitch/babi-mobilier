// return_url CinetPay : le guichet revient ici (souvent en POST) une fois le client sorti.
// Cette route ne confirme rien : elle redirige vers la page de confirmation qui interroge l'API.
import { NextResponse, type NextRequest } from 'next/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handle(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order') ?? '';
  const payment = req.nextUrl.searchParams.get('payment') ?? '';
  if (!UUID.test(order) || !UUID.test(payment)) {
    return NextResponse.redirect(new URL('/compte/commandes', req.url), 303);
  }
  // 303 transforme le POST de CinetPay en GET vers la page.
  return NextResponse.redirect(new URL(`/commande/confirmation/${order}?paiement=${payment}`, req.url), 303);
}

export const GET = handle;
export const POST = handle;
