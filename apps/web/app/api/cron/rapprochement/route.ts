// Rapprochement des paiements (toutes les 2 min) : rattrape les webhooks perdus,
// expire les paiements abandonnés et annule les commandes non payées.
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { payments } from '@/lib/payments';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const expected = Buffer.from(`Bearer ${env.cronSecret()}`);
  const received = Buffer.from(req.headers.get('authorization') ?? '');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return new Response(null, { status: 401 });
  }
  await payments().runReconciliation((msg, err) => console.error(`[rapprochement] ${msg}`, err));
  return Response.json({ ok: true, at: new Date().toISOString() });
}
