// Test de bout en bout du flux CinetPay (faux CinetPay, vraie base PostgreSQL chargée avec database/schema.sql).
// Lancer : APP_URL=postgresql://babi_app:...@localhost/babi_test npx tsx test/payments.e2e.ts
import { PrismaClient } from '@prisma/client';
import express from 'express';
import { createHmac } from 'node:crypto';
import { CinetPayClient, NOTIFY_TOKEN_FIELDS } from '../src/modules/payments/cinetpay/cinetpay.client';
import { CinetPayTransferClient } from '../src/modules/payments/cinetpay/cinetpay.transfer';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { paymentsRouter } from '../src/modules/payments/payments.routes';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.APP_URL } } });
const cfg = { apiKey: 'k', siteId: '123456', secretKey: 'sec' };
// Faux CinetPay : statut piloté par le test
const state: Record<string, any> = {}; let transferStatus = 'NEW';
const fakeFetch = (async (url: string, init: any) => {
  const u = String(url);
  if (u.endsWith('/v2/payment')) { const b = JSON.parse(init.body); state[b.transaction_id] = { amount: b.amount, status: 'WAITING_FOR_CUSTOMER' }; return new Response(JSON.stringify({ code: '201', data: { payment_url: 'https://checkout/' + b.transaction_id, payment_token: 't' } })); }
  if (u.endsWith('/v2/payment/check')) { const b = JSON.parse(init.body); const s = state[b.transaction_id]; const code = s.status === 'ACCEPTED' ? '00' : s.status === 'REFUSED' ? '600' : '662';
    return new Response(JSON.stringify({ code, message: 'x', data: { status: s.status, amount: String(s.amount), currency: 'XOF', payment_method: s.pm ?? 'OMCIV2', operator_id: 'OP1', payment_date: '2026-10-19 15:52:11' } })); }
  if (u.includes('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 'tok' } }));
  if (u.includes('/transfer/contact')) return new Response(JSON.stringify({ code: 0, data: [[{ status: 'success' }]] }));
  if (u.includes('/transfer/money/send')) return new Response(JSON.stringify({ code: 0, data: [[{ status: 'success', treatment_status: 'NEW' }]] }));
  if (u.includes('/transfer/check/money')) return new Response(JSON.stringify({ code: 0, data: [{ treatment_status: transferStatus, transaction_id: 'TR1' }] }));
  throw new Error('URL inattendue ' + u);
}) as unknown as typeof fetch;

const events: string[] = [];
const svc = new PaymentsService(prisma, new CinetPayClient(cfg, fakeFetch), new CinetPayTransferClient({ apiKey: 'k', password: 'p' }, fakeFetch),
  { emit: async (t) => { events.push(t); } }, { api: 'https://api.test', web: 'https://web.test' });
const ok = (c: boolean, m: string) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };

async function seed(total = 154000) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls','on',true)`;
    const t = await tx.tenant.create({ data: { slug: 'atelier-' + Math.random().toString(36).slice(2, 8), name: 'Atelier', phone: '+2250700000001' } });
    const u = await tx.user.create({ data: { phone: '+22505' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'), fullName: 'Aya Koné' } });
    const c = await tx.category.create({ data: { tenantId: t.id, slug: 'salon', name: 'Salon' } });
    const p = await tx.product.create({ data: { tenantId: t.id, categoryId: c.id, slug: 'f', name: 'Fauteuil', basePriceXof: 149000 } });
    const v = await tx.productVariant.create({ data: { tenantId: t.id, productId: p.id, sku: 'F1', priceXof: 149000, stock: 3, stockReserved: 1 } });
    const ht = Math.round((total - 5000) / 1.18);
    const o = await tx.order.create({ data: { tenantId: t.id, customerId: u.id, subtotalHtXof: ht, vatXof: total - 5000 - ht, shippingXof: 5000, totalTtcXof: total, stockReservedUntil: new Date(Date.now() + 1800e3) } });
    await tx.orderItem.create({ data: { tenantId: t.id, orderId: o.id, variantId: v.id, productName: 'Fauteuil', variantLabel: 'Orange', unitPriceXof: 149000, quantity: 1 } });
    return { u, o, v };
  });
}
const read = (fn: (tx: any) => Promise<any>) => prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.bypass_rls','on',true)`; return fn(tx); });

(async () => {
  // Serveur HTTP pour le webhook
  const app = express(); app.set('trust proxy', true);
  app.use(paymentsRouter({ service: svc, cinetpay: new CinetPayClient(cfg, fakeFetch), requireAuth: (_r, _s, n) => n(), requireRole: () => (_r, _s, n) => n(), log: () => {} }));
  const server = app.listen(0); const port = (server.address() as any).port;
  const notify = async (tx: string, key = cfg.secretKey) => {
    const f: Record<string, string> = { cpm_site_id: '123456', cpm_trans_id: tx, cpm_trans_date: '2026-10-19 15:52:11', cpm_amount: '154000', cpm_currency: 'XOF' };
    const token = createHmac('sha256', key).update(NOTIFY_TOKEN_FIELDS.map((k) => f[k] ?? '').join('')).digest('hex');
    return (await fetch(`http://127.0.0.1:${port}/v1/webhooks/cinetpay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-token': token }, body: new URLSearchParams(f) })).status;
  };

  // 1. Succès Orange Money via webhook signé
  const a = await seed();
  const init = await svc.initiate({ orderId: a.o.id, customerId: a.u.id, moyen: 'orange_money', payerPhone: '+2250700000009' });
  ok(init.paymentUrl.startsWith('https://checkout/'), 'initiation : URL du guichet renvoyée');
  const again = await svc.initiate({ orderId: a.o.id, customerId: a.u.id, moyen: 'orange_money', payerPhone: '+2250700000009' });
  ok(again.paymentId === init.paymentId, 'double clic : même tentative réutilisée');
  const pay = await read((tx) => tx.payment.findUnique({ where: { id: init.paymentId } }));
  ok((await notify(pay.providerTxId, 'mauvaise-cle')) === 401, 'webhook avec x-token falsifié → 401');
  ok((await notify(pay.providerTxId)) === 200, 'webhook pendant attente → 200, rien ne change');
  state[pay.providerTxId].status = 'ACCEPTED';
  ok((await notify(pay.providerTxId)) === 200, 'webhook après validation → 200');
  ok((await notify(pay.providerTxId)) === 200, 'webhook rejoué → 200 (idempotent)');
  let o = await read((tx) => tx.order.findUnique({ where: { id: a.o.id } }));
  let v = await read((tx) => tx.productVariant.findUnique({ where: { id: a.v.id } }));
  ok(o.status === 'payee' && o.paidXof === 154000, `commande payée, paid_xof = ${o.paidXof}`);
  ok(v.stock === 2 && v.stockReserved === 0, `stock 3→${v.stock}, réservé 1→${v.stockReserved}`);
  ok(events.filter((e) => e === 'payment.succeeded').length === 1, 'un seul événement payment.succeeded malgré 2 webhooks');

  // 2. Remboursement partiel puis total
  const r1 = await svc.refund({ paymentId: init.paymentId, amountXof: 50000, reason: 'Pied abîmé à la livraison', actorId: a.u.id });
  let tooMuch = false; try { await svc.refund({ paymentId: init.paymentId, amountXof: 110000, reason: 'test dépassement', actorId: a.u.id }); } catch { tooMuch = true; }
  ok(tooMuch, 'remboursement au-delà du reste refusé');
  const r1p = await read((tx) => tx.payment.findUnique({ where: { id: r1.refundId } }));
  transferStatus = 'VAL';
  ok((await svc.reconcileRefund(r1p.providerTxId)) === 'succeeded', 'transfert validé');
  o = await read((tx) => tx.order.findUnique({ where: { id: a.o.id } }));
  const orig = await read((tx) => tx.payment.findUnique({ where: { id: init.paymentId } }));
  ok(o.paidXof === 104000 && orig.status === 'partiellement_rembourse', `paid_xof = ${o.paidXof}, original ${orig.status}`);
  const r2 = await svc.refund({ paymentId: init.paymentId, amountXof: 104000, reason: 'Annulation complète', actorId: a.u.id });
  const r2p = await read((tx) => tx.payment.findUnique({ where: { id: r2.refundId } }));
  await svc.reconcileRefund(r2p.providerTxId);
  o = await read((tx) => tx.order.findUnique({ where: { id: a.o.id } }));
  ok(o.status === 'remboursee' && o.paidXof === 0, `commande ${o.status}, paid_xof = ${o.paidXof}`);

  // 3. Échec Wave
  const b = await seed();
  const ib = await svc.initiate({ orderId: b.o.id, customerId: b.u.id, moyen: 'wave', payerPhone: '+2250100000002' });
  const pb = await read((tx) => tx.payment.findUnique({ where: { id: ib.paymentId } }));
  state[pb.providerTxId].status = 'REFUSED';
  ok((await svc.reconcile(pb.providerTxId, 'return')) === 'failed', 'paiement Wave refusé → echoue');
  o = await read((tx) => tx.order.findUnique({ where: { id: b.o.id } }));
  ok(o.status === 'en_attente_paiement', 'commande reste payable avec un autre moyen');

  // 4. Montant falsifié côté guichet
  const c = await seed();
  const ic = await svc.initiate({ orderId: c.o.id, customerId: c.u.id, moyen: 'mtn_momo', payerPhone: '+2250500000003' });
  const pc = await read((tx) => tx.payment.findUnique({ where: { id: ic.paymentId } }));
  state[pc.providerTxId] = { status: 'ACCEPTED', amount: 100, pm: 'MOMOCI' };
  ok((await svc.reconcile(pc.providerTxId, 'webhook')) === 'mismatch', 'montant reçu ≠ attendu → non validé, alerte');

  // 5. Expiration + annulation automatique
  const d = await seed();
  const id_ = await svc.initiate({ orderId: d.o.id, customerId: d.u.id, moyen: 'moov', payerPhone: '+2250100000004' });
  await read((tx) => tx.$executeRaw`UPDATE payments SET expires_at = now() - interval '1 min', created_at = now() - interval '31 min' WHERE id = ${id_.paymentId}::uuid`);
  await read((tx) => tx.$executeRaw`UPDATE orders SET stock_reserved_until = now() - interval '1 min' WHERE id = ${d.o.id}::uuid`);
  await svc.runReconciliation(() => {});
  const pd = await read((tx) => tx.payment.findUnique({ where: { id: id_.paymentId } }));
  o = await read((tx) => tx.order.findUnique({ where: { id: d.o.id } }));
  v = await read((tx) => tx.productVariant.findUnique({ where: { id: d.v.id } }));
  ok(pd.status === 'expire' && o.status === 'annulee' && v.stockReserved === 0, `paiement ${pd.status}, commande ${o.status}, réservé ${v.stockReserved}`);

  const audits = await read((tx) => tx.auditLog.count());
  ok(audits > 10, `${audits} entrées d'audit écrites`);
  server.close(); await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
