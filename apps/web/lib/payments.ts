import 'server-only';
import { CinetPayClient, CinetPayTransferClient, PaymentsService, type PaymentEventType } from '@babi/api/payments';
import { prisma } from './db';
import { env } from './env';
import { formatFcfa } from './money';
import { sendWhatsAppTemplate } from './notify';

let service: PaymentsService | null = null;
let client: CinetPayClient | null = null;

export function cinetpay(): CinetPayClient {
  client ??= new CinetPayClient(env.cinetpay());
  return client;
}

/** Service de paiement partagé avec l'API (apps/api) : même code, mêmes règles. */
export function payments(): PaymentsService {
  if (service) return service;
  const cfg = env.cinetpay();
  service = new PaymentsService(
    prisma,
    cinetpay(),
    new CinetPayTransferClient({ apiKey: cfg.apiKey, password: cfg.transferPassword }),
    { emit: onPaymentEvent },
    { api: env.appUrl(), web: env.appUrl() },
  );
  return service;
}

/** Notifications client après un événement de paiement. Les alertes internes restent dans les logs à ce stade. */
async function onPaymentEvent(type: PaymentEventType, payload: Record<string, unknown>): Promise<void> {
  if (type === 'payment.succeeded' && typeof payload.orderId === 'string') {
    const order = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return tx.order.findUnique({ where: { id: payload.orderId as string }, include: { customer: true } });
    });
    if (order) {
      await sendWhatsAppTemplate(order.customer.phone, 'paiement_recu', [
        order.customer.fullName.split(' ')[0],
        formatFcfa(Number(payload.amountXof)),
        order.number,
      ]);
    }
    return;
  }
  console.warn(`[paiement] ${type}`, payload);
}
