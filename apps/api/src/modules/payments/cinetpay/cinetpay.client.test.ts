// Tests unitaires du client CinetPay : node --test (via tsx)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  CinetPayClient,
  NOTIFY_TOKEN_FIELDS,
  assertPayableAmount,
  mapPaymentMethod,
  sanitizeDescription,
  toNationalNumber,
} from './cinetpay.client';

const cfg = { apiKey: 'api-key', siteId: '123456', secretKey: 'secret-test' };

const notification: Record<string, string> = {
  cpm_site_id: '123456',
  cpm_trans_id: 'BMPLX1ABC2D3E4F5A6',
  cpm_trans_date: '2026-10-19 15:52:11',
  cpm_amount: '354500',
  cpm_currency: 'XOF',
  signature: 'abc',
  payment_method: 'OMCIV2',
  cel_phone_num: '0700000001',
  cpm_phone_prefixe: '225',
  cpm_language: 'fr',
  cpm_version: 'V4',
  cpm_payment_config: 'SINGLE',
  cpm_page_action: 'PAYMENT',
  cpm_custom: '',
  cpm_designation: 'Babi Mobilier commande BM-2026-000412',
  cpm_error_message: 'SUCCES',
};
const sign = (f: Record<string, string>, key = cfg.secretKey) =>
  createHmac('sha256', key).update(NOTIFY_TOKEN_FIELDS.map((k) => f[k] ?? '').join('')).digest('hex');

test('x-token valide accepté', () => {
  assert.equal(new CinetPayClient(cfg).verifyNotification(notification, sign(notification)), true);
});

test('x-token refusé si un champ est modifié', () => {
  const token = sign(notification);
  assert.equal(new CinetPayClient(cfg).verifyNotification({ ...notification, cpm_amount: '100' }, token), false);
});

test('x-token refusé si mauvaise clé, absent ou mal formé', () => {
  const c = new CinetPayClient(cfg);
  assert.equal(c.verifyNotification(notification, sign(notification, 'autre-cle')), false);
  assert.equal(c.verifyNotification(notification, undefined), false);
  assert.equal(c.verifyNotification(notification, 'zz'), false);
});

test('montants : entier, >= 100, multiple de 5', () => {
  assert.doesNotThrow(() => assertPayableAmount(354500));
  assert.throws(() => assertPayableAmount(354502));
  assert.throws(() => assertPayableAmount(95));
  assert.throws(() => assertPayableAmount(1000.5));
});

test('numéros et description', () => {
  assert.equal(toNationalNumber('+2250700000001'), '0700000001');
  assert.throws(() => toNationalNumber('0700000001'));
  assert.equal(sanitizeDescription('Commande #12 / promo_TABASKI & co'), 'Commande 12 promo TABASKI co');
});

test('correspondance des opérateurs', () => {
  assert.equal(mapPaymentMethod('OMCIV2'), 'orange_money');
  assert.equal(mapPaymentMethod('MOMOCI'), 'mtn_momo');
  assert.equal(mapPaymentMethod('FLOOZ'), 'moov');
  assert.equal(mapPaymentMethod('WAVECI'), 'wave');
  assert.equal(mapPaymentMethod('VISAM'), 'carte');
  assert.equal(mapPaymentMethod(''), null);
});

test('initPayment envoie XOF, MOBILE_MONEY et le numéro national', async () => {
  let sent: Record<string, unknown> = {};
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ code: '201', data: { payment_url: 'https://checkout.cinetpay.com/payment/x', payment_token: 't' } }));
  }) as unknown as typeof fetch;
  const r = await new CinetPayClient(cfg, fakeFetch).initPayment({
    transactionId: 'BMPX', amountXof: 354500, description: 'Commande BM-2026-000412',
    notifyUrl: 'https://api/n', returnUrl: 'https://web/r',
    customer: { name: 'Aya', surname: 'Koné', phone: '+2250700000001' },
  });
  assert.equal(r.paymentUrl, 'https://checkout.cinetpay.com/payment/x');
  assert.equal(sent.currency, 'XOF');
  assert.equal(sent.channels, 'MOBILE_MONEY');
  assert.equal(sent.customer_phone_number, '0700000001');
});

test('checkPayment normalise ACCEPTED, REFUSED et attente', async () => {
  const reply = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
  const ok = await new CinetPayClient(cfg, reply({ code: '00', message: 'SUCCES', data: { status: 'ACCEPTED', amount: '354500', currency: 'XOF', payment_method: 'WAVECI', operator_id: 'W1', payment_date: '2026-10-19 15:52:11' } })).checkPayment('x');
  assert.equal(ok.status, 'accepted');
  assert.equal(ok.amountXof, 354500);
  assert.equal(ok.moyen, 'wave');
  assert.equal(ok.paymentDate?.toISOString(), '2026-10-19T15:52:11.000Z');
  const ko = await new CinetPayClient(cfg, reply({ code: '600', message: 'PAYMENT_FAILED', data: { status: 'REFUSED' } })).checkPayment('x');
  assert.equal(ko.status, 'refused');
  const wait = await new CinetPayClient(cfg, reply({ code: '662', message: 'WAITING_CUSTOMER_PAYMENT', data: { status: 'WAITING_FOR_CUSTOMER' } })).checkPayment('x');
  assert.equal(wait.status, 'pending');
});
