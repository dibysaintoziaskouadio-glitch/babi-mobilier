// Notification de l'API de transfert (remboursements) : simple signal, statut relu via checkTransfer().
import { payments } from '@/lib/payments';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 20_000) return new Response(null, { status: 413 });
  const fields = Object.fromEntries(new URLSearchParams(raw));
  const id = fields.client_transaction_id ?? fields.cpm_trans_id;
  if (!id || !/^BMR[0-9A-Z]{10,30}$/.test(id)) return new Response(null, { status: 200 });
  try {
    await payments().reconcileRefund(id);
    return new Response(null, { status: 200 });
  } catch (err) {
    console.error('[webhook transfert] erreur', { id, err });
    return new Response(null, { status: 500 });
  }
}
