// notify_url CinetPay. Le corps n'est jamais cru : HMAC x-token, site_id, puis relecture du statut par l'API.
import { cinetpay, payments } from '@/lib/payments';

export const dynamic = 'force-dynamic';

// CinetPay vérifie la disponibilité de l'URL en GET.
export function GET() {
  return new Response(null, { status: 200 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 20_000) return new Response(null, { status: 413 });
  const fields = Object.fromEntries(new URLSearchParams(raw));
  const txId = fields.cpm_trans_id;

  if (!cinetpay().verifyNotification(fields, req.headers.get('x-token') ?? undefined)) {
    console.warn('[webhook cinetpay] x-token invalide', { txId });
    return new Response(null, { status: 401 });
  }
  if (fields.cpm_site_id !== cinetpay().siteId || !txId) return new Response(null, { status: 400 });

  try {
    const outcome = await payments().reconcile(txId, 'webhook');
    console.info('[webhook cinetpay]', { txId, outcome });
    return new Response(null, { status: 200 });
  } catch (err) {
    // 500 : CinetPay pourra renotifier, et le job de rapprochement prend le relais.
    console.error('[webhook cinetpay] erreur', { txId, err });
    return new Response(null, { status: 500 });
  }
}
