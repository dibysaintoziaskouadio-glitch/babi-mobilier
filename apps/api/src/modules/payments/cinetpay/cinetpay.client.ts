// Client HTTP CinetPay — guichet de paiement (API checkout v2).
// Aucun accès base de données ici : ce module ne fait que parler à CinetPay.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const CHECKOUT_URL = 'https://api-checkout.cinetpay.com/v2';

export interface CinetPayConfig {
  apiKey: string;
  siteId: string;
  /** Clé secrète (back-office CinetPay > Intégrations) servant au HMAC de l'en-tête x-token. */
  secretKey: string;
}

export type MoyenMobileMoney = 'orange_money' | 'mtn_momo' | 'moov' | 'wave';
export type MoyenPaiementCinetPay = MoyenMobileMoney | 'carte';

export class CinetPayError extends Error {
  constructor(message: string, readonly code?: string, readonly raw?: unknown) {
    super(message);
    this.name = 'CinetPayError';
  }
}

export interface InitPaymentInput {
  transactionId: string;
  amountXof: number;
  description: string;
  notifyUrl: string;
  returnUrl: string;
  customer: { name: string; surname: string; phone: string; email?: string | null };
  channels?: 'MOBILE_MONEY' | 'CREDIT_CARD' | 'WALLET' | 'ALL';
  metadata?: Record<string, string>;
}

export interface InitPaymentResult {
  paymentUrl: string;
  paymentToken: string;
  raw: unknown;
}

export type NormalizedStatus = 'accepted' | 'refused' | 'pending';

export interface CheckPaymentResult {
  status: NormalizedStatus;
  /** Statut et code bruts renvoyés par CinetPay, conservés pour l'audit. */
  providerStatus: string;
  providerCode: string;
  message: string;
  amountXof: number | null;
  currency: string | null;
  /** Opérateur réellement utilisé sur le guichet (le client peut changer d'opérateur). */
  moyen: MoyenPaiementCinetPay | null;
  operatorId: string | null;
  paymentDate: Date | null;
  raw: unknown;
}

/** Champs postés par CinetPay sur notify_url, dans l'ordre exact de calcul du x-token. */
export const NOTIFY_TOKEN_FIELDS = [
  'cpm_site_id',
  'cpm_trans_id',
  'cpm_trans_date',
  'cpm_amount',
  'cpm_currency',
  'signature',
  'payment_method',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'cpm_language',
  'cpm_version',
  'cpm_payment_config',
  'cpm_page_action',
  'cpm_custom',
  'cpm_designation',
  'cpm_error_message',
] as const;

const MIN_AMOUNT_XOF = 100;
const TIMEOUT_MS = 15_000;

/** CinetPay refuse certains caractères dans la description (#, /, $, _, &). */
export function sanitizeDescription(text: string): string {
  return text.replace(/[#/$_&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function assertPayableAmount(amountXof: number): void {
  if (!Number.isInteger(amountXof) || amountXof < MIN_AMOUNT_XOF || amountXof % 5 !== 0) {
    throw new CinetPayError(
      `Montant invalide : ${amountXof} FCFA (entier, minimum ${MIN_AMOUNT_XOF}, multiple de 5)`,
      'MONTANT_INVALIDE',
    );
  }
}

/** +2250700000001 → 0700000001 (CinetPay attend le numéro national, pays porté par customer_country). */
export function toNationalNumber(e164: string): string {
  const m = /^\+225(\d{10})$/.exec(e164);
  if (!m) throw new CinetPayError(`Numéro ivoirien invalide : ${e164}`, 'TELEPHONE_INVALIDE');
  return m[1];
}

/**
 * Libellés d'opérateurs observés dans payment_method (OM, OMCIV2, MOMO, MOMOCI, FLOOZ, WAVECI, VISAM…).
 * La correspondance se fait par motif pour rester robuste aux variantes : à confirmer sur les
 * premières transactions réelles de votre compte.
 */
export function mapPaymentMethod(raw: string | null | undefined): MoyenPaiementCinetPay | null {
  if (!raw) return null;
  const v = raw.toUpperCase();
  if (v.includes('WAVE')) return 'wave';
  if (v.startsWith('OM') || v.includes('ORANGE')) return 'orange_money';
  if (v.includes('MOMO') || v.includes('MTN')) return 'mtn_momo';
  if (v.includes('FLOOZ') || v.includes('MOOV')) return 'moov';
  if (v.includes('VISA') || v.includes('MASTER') || v.includes('CARD') || v.includes('CB')) return 'carte';
  return null;
}

/** "2026-10-19 15:52:11" (heure d'Abidjan = UTC) → Date */
function parseCinetPayDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw) return null;
  const d = new Date(raw.replace(' ', 'T') + (raw.includes('Z') || raw.includes('+') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export class CinetPayClient {
  constructor(
    private readonly cfg: CinetPayConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** Étape 1 : crée la transaction chez CinetPay et renvoie l'URL du guichet. */
  async initPayment(input: InitPaymentInput): Promise<InitPaymentResult> {
    assertPayableAmount(input.amountXof);
    const body = {
      apikey: this.cfg.apiKey,
      site_id: this.cfg.siteId,
      transaction_id: input.transactionId,
      amount: input.amountXof,
      currency: 'XOF',
      description: sanitizeDescription(input.description),
      notify_url: input.notifyUrl,
      return_url: input.returnUrl,
      channels: input.channels ?? 'MOBILE_MONEY',
      lang: 'fr',
      metadata: JSON.stringify(input.metadata ?? {}),
      customer_name: input.customer.name,
      customer_surname: input.customer.surname,
      customer_phone_number: toNationalNumber(input.customer.phone),
      customer_email: input.customer.email ?? undefined,
      customer_country: 'CI',
      customer_city: 'Abidjan',
    };
    const res = await this.postJson(`${CHECKOUT_URL}/payment`, body);
    if (res.code !== '201' || !res.data?.payment_url) {
      throw new CinetPayError(String(res.description ?? res.message ?? 'Initiation refusée'), String(res.code), res);
    }
    return { paymentUrl: res.data.payment_url, paymentToken: res.data.payment_token, raw: res };
  }

  /** Étape 4 : seule source fiable du statut d'une transaction. */
  async checkPayment(transactionId: string): Promise<CheckPaymentResult> {
    const res = await this.postJson(`${CHECKOUT_URL}/payment/check`, {
      apikey: this.cfg.apiKey,
      site_id: this.cfg.siteId,
      transaction_id: transactionId,
    });
    const data = res.data ?? {};
    const providerStatus = String(data.status ?? res.message ?? '');
    const providerCode = String(res.code ?? '');

    let status: NormalizedStatus = 'pending';
    if (providerCode === '00' && providerStatus === 'ACCEPTED') status = 'accepted';
    else if (['REFUSED', 'CANCELED', 'CANCELLED'].includes(providerStatus) || ['600', '627'].includes(providerCode)) {
      status = 'refused';
    }

    const amount = Number(data.amount);
    return {
      status,
      providerStatus,
      providerCode,
      message: String(res.message ?? ''),
      amountXof: Number.isFinite(amount) ? amount : null,
      currency: data.currency ? String(data.currency) : null,
      moyen: mapPaymentMethod(data.payment_method),
      operatorId: data.operator_id ? String(data.operator_id) : null,
      paymentDate: parseCinetPayDate(data.payment_date),
      raw: res,
    };
  }

  /**
   * Étape 3 : vérifie l'en-tête x-token d'une notification.
   * x-token = HMAC-SHA256(secretKey, concaténation des champs NOTIFY_TOKEN_FIELDS), en hexadécimal.
   */
  verifyNotification(fields: Record<string, unknown>, xToken: string | undefined): boolean {
    if (!xToken || !/^[0-9a-f]{64}$/i.test(xToken)) return false;
    const payload = NOTIFY_TOKEN_FIELDS.map((k) => (fields[k] == null ? '' : String(fields[k]))).join('');
    const expected = createHmac('sha256', this.cfg.secretKey).update(payload).digest();
    const received = Buffer.from(xToken, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  get siteId(): string {
    return this.cfg.siteId;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async postJson(url: string, body: unknown): Promise<any> {
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new CinetPayError(`CinetPay injoignable : ${(err as Error).message}`, 'RESEAU');
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new CinetPayError(`Réponse CinetPay illisible (HTTP ${response.status})`, 'REPONSE_INVALIDE', text);
    }
  }
}
