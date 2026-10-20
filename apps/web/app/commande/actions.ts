'use server';
import { PaymentError } from '@babi/api/payments';
import { ZodError } from 'zod';
import { CheckoutError, placeOrder, type CheckoutInput, type MobileMoney, MOBILE_MONEY } from '@/lib/orders';
import { payments } from '@/lib/payments';
import { normalizeIvorianPhone } from '@/lib/phone';
import { getSession } from '@/lib/session';
import { getCurrentTenant } from '@/lib/tenant';

export type CheckoutResult =
  | { ok: true; redirectTo: string; external: boolean }
  | { ok: false; error: string; orderId?: string };

export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Votre session a expiré. Reconnectez-vous.' };
  const tenant = await getCurrentTenant();

  let order;
  try {
    order = await placeOrder(tenant.id, session.sub, input);
  } catch (err) {
    if (err instanceof CheckoutError) return { ok: false, error: err.message };
    if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? 'Formulaire incomplet' };
    console.error('[checkout]', err);
    return { ok: false, error: 'La commande n\'a pas pu être enregistrée. Réessayez dans un instant.' };
  }

  // Paiement à la livraison sans acompte : la commande est confirmée.
  if (order.payNowXof === 0) {
    return { ok: true, redirectTo: `/commande/confirmation/${order.orderId}`, external: false };
  }

  // Mobile money (total, ou acompte du paiement à la livraison) : redirection vers le guichet CinetPay.
  try {
    const p = await payments().initiate({
      orderId: order.orderId,
      customerId: session.sub,
      moyen: order.operator!,
      payerPhone: order.payerPhone!,
    });
    return { ok: true, redirectTo: p.paymentUrl, external: true };
  } catch (err) {
    const message = err instanceof PaymentError ? err.message : 'Le paiement n\'a pas pu démarrer.';
    // La commande existe et le stock est réservé 30 min : le client peut réessayer depuis la confirmation.
    return { ok: false, error: message, orderId: order.orderId };
  }
}

/** Nouvelle tentative de paiement depuis la page de confirmation (échec, abandon, autre opérateur). */
export async function retryPaymentAction(orderId: string, operator: MobileMoney, phone: string): Promise<CheckoutResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Votre session a expiré. Reconnectez-vous.' };
  const payerPhone = normalizeIvorianPhone(phone);
  if (!payerPhone || !MOBILE_MONEY.includes(operator)) return { ok: false, error: 'Numéro ou opérateur invalide' };
  try {
    const p = await payments().initiate({ orderId, customerId: session.sub, moyen: operator, payerPhone });
    return { ok: true, redirectTo: p.paymentUrl, external: true };
  } catch (err) {
    return { ok: false, error: err instanceof PaymentError ? err.message : 'Le paiement n\'a pas pu démarrer.' };
  }
}
