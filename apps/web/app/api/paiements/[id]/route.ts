import { NextResponse } from 'next/server';
import { PaymentError } from '@babi/api/payments';
import { payments } from '@/lib/payments';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Statut d'un paiement pour la page de confirmation (le middleware exige déjà une session). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ code: 'NON_CONNECTE' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ code: 'ID_INVALIDE' }, { status: 400 });
  try {
    return NextResponse.json(await payments().getForCustomer(params.id, session.sub), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ code: err.code, detail: err.message }, { status: err.httpStatus });
    console.error('[paiements]', err);
    return NextResponse.json({ code: 'ERREUR_INTERNE' }, { status: 500 });
  }
}
