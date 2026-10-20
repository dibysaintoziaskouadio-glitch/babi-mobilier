import 'server-only';
import { z } from 'zod';
import { withTenant } from './db';
import { roundUpTo5, splitTtc } from './money';
import { normalizeIvorianPhone } from './phone';
import { variantLabel } from './catalog';

export const MOBILE_MONEY = ['orange_money', 'mtn_momo', 'moov', 'wave'] as const;
export type MobileMoney = (typeof MOBILE_MONEY)[number];

/** Au-delà de ce montant, le paiement à la livraison exige un acompte de 10 % en mobile money. */
export const COD_DEPOSIT_THRESHOLD_XOF = 300_000;
export const COD_DEPOSIT_RATE = 0.1;
const MOBILE_MONEY_RESERVATION_MS = 30 * 60 * 1000;
const COD_RESERVATION_MS = 72 * 60 * 60 * 1000;

export const checkoutSchema = z
  .object({
    items: z
      .array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(20) }))
      .min(1, 'Votre panier est vide')
      .max(30),
    mode: z.enum(['livraison', 'retrait']),
    commune: z.string().trim().max(60).optional(),
    quartier: z.string().trim().max(80).optional(),
    landmark: z.string().trim().max(200).optional(),
    contactPhone: z.string().transform((v, ctx) => {
      const p = normalizeIvorianPhone(v);
      if (!p) ctx.addIssue({ code: 'custom', message: 'Numéro de contact invalide' });
      return p ?? '';
    }),
    payment: z.enum(['orange_money', 'mtn_momo', 'moov', 'wave', 'cash']),
    /** Opérateur utilisé pour l'acompte quand payment = cash et que le total dépasse le seuil */
    depositOperator: z.enum(MOBILE_MONEY).optional(),
    payerPhone: z.string().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'livraison' && !v.commune) ctx.addIssue({ code: 'custom', path: ['commune'], message: 'Choisissez votre commune' });
    if (v.mode === 'livraison' && (!v.landmark || v.landmark.length < 5)) {
      ctx.addIssue({ code: 'custom', path: ['landmark'], message: 'Indiquez un repère pour le livreur' });
    }
  });

export type CheckoutInput = z.input<typeof checkoutSchema>;

export class CheckoutError extends Error {}

export interface PlacedOrder {
  orderId: string;
  number: string;
  totalXof: number;
  /** Montant à payer tout de suite en mobile money (total, ou acompte), 0 pour un paiement à la livraison sans acompte. */
  payNowXof: number;
  /** Opérateur et numéro à utiliser pour payNowXof */
  operator: MobileMoney | null;
  payerPhone: string | null;
}

/**
 * Crée la commande dans une transaction limitée au tenant : prix relus en base,
 * stock réservé sous verrou, frais de livraison selon la zone, TVA 18 % incluse.
 */
export async function placeOrder(tenantId: string, customerId: string, raw: CheckoutInput): Promise<PlacedOrder> {
  const input = checkoutSchema.parse(raw);
  const quantities = new Map<string, number>();
  for (const i of input.items) quantities.set(i.variantId, (quantities.get(i.variantId) ?? 0) + i.quantity);

  return withTenant(tenantId, async (tx) => {
    const ids = [...quantities.keys()];
    // Verrou sur les variantes : deux clients ne peuvent pas réserver la dernière pièce en même temps.
    await tx.$queryRaw`SELECT 1 FROM product_variants WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
    const variants = await tx.productVariant.findMany({
      where: { id: { in: ids }, tenantId, isActive: true, product: { isPublished: true } },
      include: { product: { select: { name: true } } },
    });
    if (variants.length !== ids.length) throw new CheckoutError('Un article de votre panier n\'est plus disponible.');
    for (const v of variants) {
      const q = quantities.get(v.id)!;
      if (v.stock - v.stockReserved < q) {
        throw new CheckoutError(`Stock insuffisant pour « ${v.product.name} » : ${Math.max(0, v.stock - v.stockReserved)} disponible(s).`);
      }
    }

    // Zone de livraison
    const zone =
      input.mode === 'retrait'
        ? await tx.deliveryZone.findFirst({ where: { tenantId, type: 'retrait_showroom', isActive: true } })
        : await tx.deliveryZone.findFirst({
            where: { tenantId, type: 'abidjan', isActive: true, communes: { has: input.commune! } },
          });
    if (!zone) {
      throw new CheckoutError(input.mode === 'retrait' ? 'Le retrait en showroom n\'est pas disponible.' : 'Nous ne livrons pas encore cette commune.');
    }
    if (input.payment === 'cash' && !zone.codAllowed) {
      throw new CheckoutError('Le paiement à la livraison n\'est pas disponible pour cette zone.');
    }

    // Montants (prix TTC relus en base, jamais ceux du navigateur)
    const itemsTtc = variants.reduce((s, v) => s + v.priceXof * quantities.get(v.id)!, 0);
    const { ht, tva } = splitTtc(itemsTtc);
    const shipping = zone.baseFeeXof;
    const total = itemsTtc + shipping;
    if (total % 5 !== 0) throw new CheckoutError('Montant de commande invalide, contactez le service client.');

    const codThreshold = zone.codMaxXof ?? COD_DEPOSIT_THRESHOLD_XOF;
    const deposit = input.payment === 'cash' && total > codThreshold ? roundUpTo5(total * COD_DEPOSIT_RATE) : 0;
    const operator: MobileMoney | null = input.payment === 'cash' ? (deposit > 0 ? input.depositOperator ?? null : null) : input.payment;
    const payNow = input.payment === 'cash' ? deposit : total;
    const payerPhone = payNow > 0 ? normalizeIvorianPhone(input.payerPhone ?? '') ?? input.contactPhone : null;
    if (payNow > 0 && !operator) throw new CheckoutError('Choisissez l\'opérateur pour régler l\'acompte.');

    const address =
      input.mode === 'livraison'
        ? await tx.address.create({
            data: {
              userId: customerId,
              city: 'Abidjan',
              commune: input.commune,
              quartier: input.quartier || null,
              landmark: input.landmark,
              phone: input.contactPhone,
            },
          })
        : null;

    const waitsForPayment = payNow > 0;
    const order = await tx.order.create({
      data: {
        tenantId,
        customerId,
        addressId: address?.id,
        deliveryZoneId: zone.id,
        status: waitsForPayment ? 'en_attente_paiement' : 'confirmee',
        channel: 'pwa',
        subtotalHtXof: ht,
        vatXof: tva,
        shippingXof: shipping,
        totalTtcXof: total,
        depositXof: deposit,
        customerNote: input.note || null,
        deliverySnapshot: {
          mode: input.mode,
          zone: zone.name,
          commune: input.commune ?? null,
          quartier: input.quartier ?? null,
          repere: input.landmark ?? null,
          telephone: input.contactPhone,
          paiement: input.payment,
        },
        stockReservedUntil: new Date(Date.now() + (waitsForPayment ? MOBILE_MONEY_RESERVATION_MS : COD_RESERVATION_MS)),
      },
    });

    for (const v of variants) {
      const q = quantities.get(v.id)!;
      await tx.orderItem.create({
        data: {
          tenantId,
          orderId: order.id,
          variantId: v.id,
          productName: v.product.name,
          variantLabel: variantLabel(v.attributes),
          unitPriceXof: v.priceXof,
          quantity: q,
        },
      });
      await tx.productVariant.update({ where: { id: v.id }, data: { stockReserved: { increment: q } } });
    }

    await tx.shipment.create({ data: { tenantId, orderId: order.id, zoneId: zone.id, zoneType: zone.type } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: customerId,
        action: 'order.created',
        entity: 'orders',
        entityId: order.id,
        after: { total, deposit, payment: input.payment, zone: zone.name },
      },
    });

    return { orderId: order.id, number: order.number, totalXof: total, payNowXof: payNow, operator, payerPhone };
  });
}

export async function getOrderForCustomer(tenantId: string, orderId: string, customerId: string) {
  return withTenant(tenantId, (tx) =>
    tx.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'desc' } },
        shipment: { select: { status: true, scheduledFor: true, slot: true } },
      },
    }),
  );
}
