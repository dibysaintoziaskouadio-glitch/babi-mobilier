// Orchestration des paiements mobile money via CinetPay.
// Règle d'or : seul le résultat de checkPayment() (ou checkTransfer()) change un statut.
// Le webhook, la page de retour et le job de rapprochement ne sont que des déclencheurs.
import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient, type Payment, type MoyenPaiement, type PaymentStatus } from '@prisma/client';
import { CinetPayClient, CinetPayError, type MoyenMobileMoney } from './cinetpay/cinetpay.client';
import { CinetPayTransferClient } from './cinetpay/cinetpay.transfer';

const MOBILE_MONEY: readonly MoyenMobileMoney[] = ['orange_money', 'mtn_momo', 'moov', 'wave'];
const FINAL_STATUSES: readonly PaymentStatus[] = ['reussi', 'echoue', 'expire', 'rembourse', 'partiellement_rembourse'];
const PAYMENT_TTL_MS = 30 * 60 * 1000;
const CLOSED_ORDER_STATUSES = ['annulee', 'remboursee', 'retournee'] as const;

export type PaymentEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.amount_mismatch'
  | 'payment.overpaid'
  | 'payment.after_cancel'
  | 'payment.refunded'
  | 'refund.failed'
  | 'stock.oversold';

export interface PaymentEvents {
  emit(type: PaymentEventType, payload: Record<string, unknown>): Promise<void>;
}

export class PaymentError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 400) {
    super(message);
    this.name = 'PaymentError';
  }
}

export type ReconcileSource = 'webhook' | 'return' | 'cron';
export type ReconcileOutcome = 'unknown' | 'already_final' | 'succeeded' | 'failed' | 'expired' | 'pending' | 'mismatch';

type Tx = Prisma.TransactionClient;
type PendingEvent = [PaymentEventType, Record<string, unknown>];

/** Identifiant de transaction unique : préfixe + horodatage + aléa, sans « _ » (refusé par CinetPay). */
export function newTransactionId(prefix: 'BMP' | 'BMR'): string {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${randomBytes(5).toString('hex').toUpperCase()}`;
}

export class PaymentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cinetpay: CinetPayClient,
    private readonly transfer: CinetPayTransferClient,
    private readonly events: PaymentEvents,
    private readonly urls: { api: string; web: string },
  ) {}

  // ---------------------------------------------------------------------------
  // 1. INITIATION
  // ---------------------------------------------------------------------------
  async initiate(input: {
    orderId: string;
    customerId: string;
    moyen: MoyenPaiement;
    payerPhone: string;
  }): Promise<{ paymentId: string; paymentUrl: string; amountXof: number; expiresAt: Date }> {
    if (!MOBILE_MONEY.includes(input.moyen as MoyenMobileMoney)) {
      throw new PaymentError('MOYEN_NON_SUPPORTE', 'Ce moyen de paiement ne passe pas par CinetPay mobile money');
    }
    if (!/^\+225\d{10}$/.test(input.payerPhone)) {
      throw new PaymentError('TELEPHONE_INVALIDE', 'Numéro attendu au format +225 suivi de 10 chiffres');
    }

    const prepared = await this.systemTx(async (tx) => {
      await this.lockRow(tx, 'orders', input.orderId);
      const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { customer: true } });
      if (!order || order.customerId !== input.customerId) {
        throw new PaymentError('COMMANDE_INTROUVABLE', 'Commande introuvable', 404);
      }
      if ((CLOSED_ORDER_STATUSES as readonly string[]).includes(order.status)) {
        throw new PaymentError('COMMANDE_FERMEE', 'Cette commande ne peut plus être payée', 409);
      }
      if (order.status === 'en_attente_paiement' && order.stockReservedUntil && order.stockReservedUntil < new Date()) {
        throw new PaymentError('RESERVATION_EXPIREE', 'Le délai de paiement est dépassé, merci de refaire la commande', 410);
      }

      // Acompte d'abord (sur-mesure, COD élevé, intérieur), sinon solde ou total.
      const depositPending = order.depositXof > 0 && order.paidXof < order.depositXof;
      const target = depositPending ? order.depositXof : order.totalTtcXof;
      const due = target - order.paidXof;
      const kind = order.depositXof > 0 ? (depositPending ? 'acompte' : 'solde') : 'total';
      if (due <= 0) throw new PaymentError('DEJA_PAYEE', 'Cette commande est déjà réglée', 409);
      if (due % 5 !== 0) {
        // Les totaux sont arrondis au multiple de 5 à la création de la commande.
        throw new PaymentError('MONTANT_INVALIDE', `Montant ${due} FCFA non multiple de 5`, 500);
      }

      // Double clic, retour arrière, réseau coupé : on renvoie la tentative en cours si elle est identique.
      const pending = await tx.payment.findFirst({
        where: { orderId: order.id, provider: 'cinetpay', kind, status: 'en_attente', expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      const pendingUrl = (pending?.rawPayload as { payment_url?: string } | null)?.payment_url;
      if (pending && pendingUrl && pending.moyenPaiement === input.moyen && pending.payerPhone === input.payerPhone && pending.amountXof === due) {
        return { type: 'reuse', payment: pending, url: pendingUrl } as const;
      }

      const payment = await tx.payment.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          kind,
          moyenPaiement: input.moyen,
          provider: 'cinetpay',
          providerTxId: newTransactionId('BMP'),
          amountXof: due,
          status: 'initie',
          payerPhone: input.payerPhone,
          expiresAt: new Date(Date.now() + PAYMENT_TTL_MS),
        },
      });
      await this.audit(tx, payment.tenantId, 'payment.initiated', payment.id, null, { amountXof: due, moyen: input.moyen, kind });
      return { type: 'new', payment, order } as const;
    });

    if (prepared.type === 'reuse') {
      const p = prepared.payment;
      return { paymentId: p.id, paymentUrl: prepared.url, amountXof: p.amountXof, expiresAt: p.expiresAt! };
    }

    const { payment, order } = prepared;
    const [name, ...rest] = order.customer.fullName.trim().split(/\s+/);
    try {
      const res = await this.cinetpay.initPayment({
        transactionId: payment.providerTxId!,
        amountXof: payment.amountXof,
        description: `Babi Mobilier commande ${order.number}`,
        notifyUrl: `${this.urls.api}/v1/webhooks/cinetpay`,
        // CinetPay revient en POST sur cette URL ; la route Next.js redirige vers la page de confirmation.
        returnUrl: `${this.urls.web}/commande/retour?order=${order.id}&payment=${payment.id}`,
        customer: { name: name || 'Client', surname: rest.join(' ') || name || 'Client', phone: input.payerPhone, email: order.customer.email },
        channels: 'MOBILE_MONEY',
        metadata: { order_id: order.id, payment_id: payment.id, tenant_id: order.tenantId },
      });
      await this.systemTx((tx) =>
        tx.payment.update({
          where: { id: payment.id },
          data: { status: 'en_attente', rawPayload: { init: res.raw, payment_url: res.paymentUrl } as Prisma.InputJsonValue },
        }),
      );
      return { paymentId: payment.id, paymentUrl: res.paymentUrl, amountXof: payment.amountXof, expiresAt: payment.expiresAt! };
    } catch (err) {
      const reason = err instanceof CinetPayError ? `${err.code ?? ''} ${err.message}`.trim() : String(err);
      await this.systemTx((tx) =>
        tx.payment.update({ where: { id: payment.id }, data: { status: 'echoue', failureReason: reason.slice(0, 500) } }),
      );
      throw new PaymentError('AGREGATEUR_INDISPONIBLE', 'Le paiement mobile money est momentanément indisponible. Réessayez ou choisissez le paiement à la livraison.', 502);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. RAPPROCHEMENT (webhook, retour client, job)
  // ---------------------------------------------------------------------------
  async reconcile(transactionId: string, source: ReconcileSource): Promise<ReconcileOutcome> {
    const existing = await this.systemTx((tx) =>
      tx.payment.findUnique({ where: { provider_providerTxId: { provider: 'cinetpay', providerTxId: transactionId } } }),
    );
    if (!existing || existing.kind === 'remboursement') return 'unknown';
    if (FINAL_STATUSES.includes(existing.status)) return 'already_final';

    // Appel réseau hors transaction pour ne pas garder de verrou pendant l'attente.
    const check = await this.cinetpay.checkPayment(transactionId);
    const events: PendingEvent[] = [];

    const outcome = await this.systemTx(async (tx): Promise<ReconcileOutcome> => {
      await this.lockRow(tx, 'payments', existing.id);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: existing.id } });
      if (FINAL_STATUSES.includes(payment.status)) return 'already_final';
      const raw = { ...(payment.rawPayload as object | null), last_check: check.raw, last_check_source: source } as Prisma.InputJsonValue;

      if (check.status === 'accepted') {
        if (check.amountXof !== payment.amountXof || check.currency !== 'XOF') {
          await tx.payment.update({ where: { id: payment.id }, data: { rawPayload: raw } });
          await this.audit(tx, payment.tenantId, 'payment.amount_mismatch', payment.id, null, {
            expected: payment.amountXof, received: check.amountXof, currency: check.currency,
          });
          events.push(['payment.amount_mismatch', { paymentId: payment.id, expected: payment.amountXof, received: check.amountXof }]);
          return 'mismatch';
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'reussi',
            paidAt: check.paymentDate ?? new Date(),
            providerRef: check.operatorId,
            moyenPaiement: check.moyen ?? payment.moyenPaiement,
            rawPayload: raw,
          },
        });
        // Le trigger refresh_order_paid a recalculé orders.paid_xof dans cette transaction.
        await this.applyPaymentToOrder(tx, payment, events);
        await this.audit(tx, payment.tenantId, 'payment.succeeded', payment.id, { status: payment.status }, {
          status: 'reussi', operatorId: check.operatorId, moyen: check.moyen, source,
        });
        events.push(['payment.succeeded', { paymentId: payment.id, orderId: payment.orderId, amountXof: payment.amountXof, moyen: check.moyen }]);
        return 'succeeded';
      }

      if (check.status === 'refused') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'echoue', failureReason: `${check.providerCode} ${check.providerStatus} ${check.message}`.trim(), rawPayload: raw },
        });
        await this.audit(tx, payment.tenantId, 'payment.failed', payment.id, null, { code: check.providerCode, source });
        events.push(['payment.failed', { paymentId: payment.id, orderId: payment.orderId }]);
        return 'failed';
      }

      // Toujours en attente côté opérateur.
      if (source === 'cron' && payment.expiresAt && payment.expiresAt < new Date()) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'expire', rawPayload: raw } });
        await this.audit(tx, payment.tenantId, 'payment.expired', payment.id, null, { providerStatus: check.providerStatus });
        events.push(['payment.expired', { paymentId: payment.id, orderId: payment.orderId }]);
        return 'expired';
      }
      if (payment.status === 'initie') {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'en_attente', rawPayload: raw } });
      }
      return 'pending';
    });

    await this.flush(events);
    return outcome;
  }

  /** Met la commande à jour après un encaissement réussi. */
  private async applyPaymentToOrder(tx: Tx, payment: Payment, events: PendingEvent[]): Promise<void> {
    await this.lockRow(tx, 'orders', payment.orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: { items: true } });

    if ((CLOSED_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      // Paiement validé sur le téléphone après l'annulation automatique : remboursement à décider par un admin.
      events.push(['payment.after_cancel', { paymentId: payment.id, orderId: order.id, amountXof: payment.amountXof }]);
      return;
    }
    if (order.paidXof > order.totalTtcXof) {
      events.push(['payment.overpaid', { orderId: order.id, paidXof: order.paidXof, totalXof: order.totalTtcXof }]);
    }

    if (order.status === 'en_attente_paiement') {
      // Premier encaissement : la réservation devient une sortie de stock.
      for (const item of order.items) {
        const updated = await tx.$executeRaw`
          UPDATE product_variants
             SET stock = stock - ${item.quantity},
                 stock_reserved = greatest(stock_reserved - ${item.quantity}, 0)
           WHERE id = ${item.variantId}::uuid AND stock >= ${item.quantity}`;
        if (updated === 0) events.push(['stock.oversold', { orderId: order.id, variantId: item.variantId }]);
      }
      const fullyPaid = order.paidXof >= order.totalTtcXof;
      await tx.order.update({
        where: { id: order.id },
        data: { status: fullyPaid ? 'payee' : 'confirmee', stockReservedUntil: null },
      });
      await this.audit(tx, order.tenantId, 'order.status_changed', order.id, { status: order.status }, { status: fullyPaid ? 'payee' : 'confirmee' }, 'orders');
    }
  }

  // ---------------------------------------------------------------------------
  // 3. REMBOURSEMENT (virement mobile money via l'API de transfert)
  // ---------------------------------------------------------------------------
  async refund(input: { paymentId: string; amountXof: number; reason: string; actorId: string }): Promise<{ refundId: string }> {
    if (!Number.isInteger(input.amountXof) || input.amountXof <= 0 || input.amountXof % 5 !== 0) {
      throw new PaymentError('MONTANT_INVALIDE', 'Le montant remboursé doit être un entier positif multiple de 5');
    }
    if (input.reason.trim().length < 5) throw new PaymentError('MOTIF_REQUIS', 'Indiquez le motif du remboursement');

    const { refund, original, customer } = await this.systemTx(async (tx) => {
      await this.lockRow(tx, 'payments', input.paymentId);
      const original = await tx.payment.findUnique({
        where: { id: input.paymentId },
        include: { refunds: true, order: { include: { customer: true } } },
      });
      if (!original || original.kind === 'remboursement') throw new PaymentError('PAIEMENT_INTROUVABLE', 'Paiement introuvable', 404);
      if (original.provider !== 'cinetpay' || !MOBILE_MONEY.includes(original.moyenPaiement as MoyenMobileMoney)) {
        throw new PaymentError('NON_REMBOURSABLE', 'Seuls les paiements mobile money CinetPay sont remboursables ici', 409);
      }
      if (!['reussi', 'partiellement_rembourse'].includes(original.status)) {
        throw new PaymentError('NON_REMBOURSABLE', 'Ce paiement n\'a pas été encaissé', 409);
      }
      const alreadyRefunded = original.refunds
        .filter((r) => ['initie', 'en_attente', 'reussi'].includes(r.status))
        .reduce((sum, r) => sum + r.amountXof, 0);
      if (input.amountXof > original.amountXof - alreadyRefunded) {
        throw new PaymentError('MONTANT_TROP_ELEVE', `Reste remboursable : ${original.amountXof - alreadyRefunded} FCFA`, 409);
      }

      const refund = await tx.payment.create({
        data: {
          tenantId: original.tenantId,
          orderId: original.orderId,
          refundOfId: original.id,
          kind: 'remboursement',
          moyenPaiement: original.moyenPaiement,
          provider: 'cinetpay',
          providerTxId: newTransactionId('BMR'),
          amountXof: input.amountXof,
          status: 'initie',
          payerPhone: original.payerPhone,
          failureReason: null,
          rawPayload: { reason: input.reason, requested_by: input.actorId } as Prisma.InputJsonValue,
        },
      });
      await this.audit(tx, original.tenantId, 'payment.refund_requested', refund.id, null,
        { originalId: original.id, amountXof: input.amountXof, reason: input.reason }, 'payments', input.actorId);
      return { refund, original, customer: original.order.customer };
    });

    const [name, ...rest] = customer.fullName.trim().split(/\s+/);
    try {
      const res = await this.transfer.refundToMobileMoney({
        clientTransactionId: refund.providerTxId!,
        phoneE164: original.payerPhone!,
        amountXof: refund.amountXof,
        moyen: original.moyenPaiement as MoyenMobileMoney,
        name: name || 'Client',
        surname: rest.join(' ') || name || 'Client',
        email: customer.email,
        notifyUrl: `${this.urls.api}/v1/webhooks/cinetpay/transfert`,
      });
      await this.systemTx((tx) =>
        tx.payment.update({
          where: { id: refund.id },
          data: { status: 'en_attente', rawPayload: { ...(refund.rawPayload as object), send: res.raw } as Prisma.InputJsonValue },
        }),
      );
    } catch (err) {
      const reason = err instanceof CinetPayError ? `${err.code ?? ''} ${err.message}`.trim() : String(err);
      await this.systemTx((tx) => tx.payment.update({ where: { id: refund.id }, data: { status: 'echoue', failureReason: reason.slice(0, 500) } }));
      await this.flush([['refund.failed', { refundId: refund.id, reason }]]);
      throw new PaymentError('TRANSFERT_ECHOUE', `Le remboursement n'a pas pu être envoyé : ${reason}`, 502);
    }
    return { refundId: refund.id };
  }

  async reconcileRefund(clientTransactionId: string): Promise<ReconcileOutcome> {
    const existing = await this.systemTx((tx) =>
      tx.payment.findUnique({ where: { provider_providerTxId: { provider: 'cinetpay', providerTxId: clientTransactionId } } }),
    );
    if (!existing || existing.kind !== 'remboursement') return 'unknown';
    if (FINAL_STATUSES.includes(existing.status)) return 'already_final';

    const check = await this.transfer.checkTransfer(clientTransactionId);
    const events: PendingEvent[] = [];

    const outcome = await this.systemTx(async (tx): Promise<ReconcileOutcome> => {
      await this.lockRow(tx, 'payments', existing.id);
      const refund = await tx.payment.findUniqueOrThrow({ where: { id: existing.id } });
      if (FINAL_STATUSES.includes(refund.status)) return 'already_final';
      const raw = { ...(refund.rawPayload as object | null), last_check: check.raw } as Prisma.InputJsonValue;

      if (check.status === 'validated') {
        await tx.payment.update({
          where: { id: refund.id },
          data: { status: 'reussi', paidAt: new Date(), providerRef: check.transferId, rawPayload: raw },
        });
        const original = await tx.payment.findUniqueOrThrow({ where: { id: refund.refundOfId! }, include: { refunds: true } });
        const refunded = original.refunds.filter((r) => r.status === 'reussi').reduce((s, r) => s + r.amountXof, 0);
        await tx.payment.update({
          where: { id: original.id },
          data: { status: refunded >= original.amountXof ? 'rembourse' : 'partiellement_rembourse' },
        });
        const order = await tx.order.findUniqueOrThrow({ where: { id: refund.orderId } });
        if (order.paidXof === 0 && order.status !== 'remboursee') {
          await tx.order.update({ where: { id: order.id }, data: { status: 'remboursee' } });
        }
        await this.audit(tx, refund.tenantId, 'payment.refunded', refund.id, null, { amountXof: refund.amountXof, transferId: check.transferId });
        events.push(['payment.refunded', { refundId: refund.id, orderId: refund.orderId, amountXof: refund.amountXof }]);
        return 'succeeded';
      }
      if (check.status === 'rejected') {
        await tx.payment.update({ where: { id: refund.id }, data: { status: 'echoue', failureReason: `Transfert rejeté (${check.providerStatus})`, rawPayload: raw } });
        await this.audit(tx, refund.tenantId, 'payment.refund_failed', refund.id, null, { providerStatus: check.providerStatus });
        events.push(['refund.failed', { refundId: refund.id, orderId: refund.orderId }]);
        return 'failed';
      }
      return 'pending';
    });

    await this.flush(events);
    return outcome;
  }

  // ---------------------------------------------------------------------------
  // 4. JOB DE RAPPROCHEMENT (toutes les 2 minutes)
  // ---------------------------------------------------------------------------
  async runReconciliation(log: (msg: string, err?: unknown) => void = console.error): Promise<void> {
    const stale = new Date(Date.now() - 2 * 60 * 1000);
    const pending = await this.systemTx((tx) =>
      tx.payment.findMany({
        where: { provider: 'cinetpay', status: { in: ['initie', 'en_attente'] }, createdAt: { lt: stale } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
    );
    for (const p of pending) {
      try {
        if (p.kind === 'remboursement') await this.reconcileRefund(p.providerTxId!);
        else await this.reconcile(p.providerTxId!, 'cron');
      } catch (err) {
        log(`Rapprochement ${p.providerTxId} en erreur`, err);
      }
    }
    await this.cancelUnpaidOrders();
  }

  /** Annule les commandes dont la réservation a expiré et qui n'ont plus de paiement en cours. */
  private async cancelUnpaidOrders(): Promise<void> {
    await this.systemTx(async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          status: 'en_attente_paiement',
          stockReservedUntil: { lt: new Date() },
          payments: { none: { status: { in: ['initie', 'en_attente'] } } },
        },
        include: { items: true },
        take: 100,
      });
      for (const order of orders) {
        for (const item of order.items) {
          await tx.$executeRaw`
            UPDATE product_variants SET stock_reserved = greatest(stock_reserved - ${item.quantity}, 0)
             WHERE id = ${item.variantId}::uuid`;
        }
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'annulee', cancelledReason: 'Paiement non reçu dans le délai de réservation', stockReservedUntil: null },
        });
        await this.audit(tx, order.tenantId, 'order.auto_cancelled', order.id, { status: 'en_attente_paiement' }, { status: 'annulee' }, 'orders');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Lecture pour la page de confirmation (polling)
  // ---------------------------------------------------------------------------
  async getForCustomer(paymentId: string, customerId: string) {
    let payment = await this.systemTx((tx) =>
      tx.payment.findFirst({ where: { id: paymentId, order: { customerId } }, include: { order: { select: { number: true, status: true } } } }),
    );
    if (!payment) throw new PaymentError('PAIEMENT_INTROUVABLE', 'Paiement introuvable', 404);
    // Le client est revenu mais le webhook n'est pas encore arrivé : on interroge CinetPay (au plus toutes les 10 s).
    if (payment.status === 'en_attente' && Date.now() - payment.updatedAt.getTime() > 10_000) {
      await this.reconcile(payment.providerTxId!, 'return').catch(() => undefined);
      await this.systemTx((tx) => tx.payment.update({ where: { id: paymentId }, data: { updatedAt: new Date() } }));
      payment = await this.systemTx((tx) =>
        tx.payment.findFirst({ where: { id: paymentId }, include: { order: { select: { number: true, status: true } } } }),
      );
    }
    return {
      id: payment!.id,
      status: payment!.status,
      amountXof: payment!.amountXof,
      moyenPaiement: payment!.moyenPaiement,
      orderNumber: payment!.order.number,
      orderStatus: payment!.order.status,
    };
  }

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  /** Transaction « système » : les webhooks et jobs agissent hors contexte tenant (RLS contournée). */
  private systemTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx);
    });
  }

  private async lockRow(tx: Tx, table: 'orders' | 'payments', id: string): Promise<void> {
    if (table === 'orders') await tx.$queryRaw`SELECT 1 FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    else await tx.$queryRaw`SELECT 1 FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private async audit(
    tx: Tx,
    tenantId: string,
    action: string,
    entityId: string,
    before: object | null,
    after: object | null,
    entity = 'payments',
    actorId?: string,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actorId ?? null,
        actorType: actorId ? 'user' : 'system',
        action,
        entity,
        entityId,
        before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Les notifications (WhatsApp, e-mail, webhooks marchands) partent après le commit. */
  private async flush(events: PendingEvent[]): Promise<void> {
    for (const [type, payload] of events) {
      await this.events.emit(type, payload).catch(() => undefined);
    }
  }
}
