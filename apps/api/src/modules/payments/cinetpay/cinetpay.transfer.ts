// Client de l'API de transfert CinetPay, utilisée pour rembourser un client sur son
// numéro mobile money. Le guichet de paiement n'expose pas d'API de remboursement :
// on renvoie l'argent depuis le solde de transfert du compte marchand.
//
// Prérequis côté CinetPay : module « Transfert » activé, solde de transfert approvisionné,
// mot de passe API défini. Les formats ci-dessous suivent la documentation publique de
// l'API de transfert ; validez-les sur votre compte avec un transfert de 100 FCFA.
import { CinetPayError, assertPayableAmount, type MoyenMobileMoney } from './cinetpay.client';

export const TRANSFER_URL = 'https://client.cinetpay.com/v1';
const TOKEN_TTL_MS = 4 * 60 * 1000; // le jeton expire au bout de 5 min
const TIMEOUT_MS = 20_000;

export interface CinetPayTransferConfig {
  apiKey: string;
  password: string;
}

export type TransferStatus = 'validated' | 'rejected' | 'pending';

export interface TransferCheckResult {
  status: TransferStatus;
  providerStatus: string;
  transferId: string | null;
  raw: unknown;
}

/** Code opérateur attendu par l'API de transfert pour la Côte d'Ivoire. */
const TRANSFER_METHOD: Record<MoyenMobileMoney, string> = {
  orange_money: 'OM',
  mtn_momo: 'MOMO',
  moov: 'FLOOZ',
  wave: 'WAVECI',
};

export class CinetPayTransferClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly cfg: CinetPayTransferConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** Enregistre le bénéficiaire (sans effet s'il existe déjà) puis envoie l'argent. */
  async refundToMobileMoney(input: {
    clientTransactionId: string;
    phoneE164: string;
    amountXof: number;
    moyen: MoyenMobileMoney;
    name: string;
    surname: string;
    email?: string | null;
    notifyUrl: string;
  }): Promise<{ raw: unknown }> {
    assertPayableAmount(input.amountXof);
    const phone = input.phoneE164.replace(/^\+225/, '');
    const token = await this.getToken();

    const contact = await this.postForm(`/transfer/contact?token=${token}&lang=fr`, {
      data: JSON.stringify([
        { prefix: '225', phone, name: input.name, surname: input.surname, email: input.email || `${phone}@clients.babimobilier.ci` },
      ]),
    });
    // code 0 = succès ; un contact déjà existant est signalé par ligne, sans bloquer l'envoi.
    if (contact.code !== 0 && contact.code !== '0') {
      throw new CinetPayError(`Ajout du bénéficiaire refusé : ${contact.message}`, String(contact.code), contact);
    }

    const sent = await this.postForm(`/transfer/money/send/contact?token=${token}&lang=fr`, {
      data: JSON.stringify([
        {
          prefix: '225',
          phone,
          amount: input.amountXof,
          client_transaction_id: input.clientTransactionId,
          notify_url: input.notifyUrl,
          payment_method: TRANSFER_METHOD[input.moyen],
        },
      ]),
    });
    if (sent.code !== 0 && sent.code !== '0') {
      throw new CinetPayError(`Transfert refusé : ${sent.message} ${sent.description ?? ''}`.trim(), String(sent.code), sent);
    }
    return { raw: sent };
  }

  /** Statut d'un transfert : VAL = envoyé, REJ = rejeté, NEW/REC = en cours de traitement. */
  async checkTransfer(clientTransactionId: string): Promise<TransferCheckResult> {
    const token = await this.getToken();
    const res = await this.get(
      `/transfer/check/money?token=${token}&lang=fr&client_transaction_id=${encodeURIComponent(clientTransactionId)}`,
    );
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    const providerStatus = String(row?.treatment_status ?? row?.status ?? '');
    const status: TransferStatus =
      providerStatus === 'VAL' ? 'validated' : providerStatus === 'REJ' ? 'rejected' : 'pending';
    return { status, providerStatus, transferId: row?.transaction_id ? String(row.transaction_id) : null, raw: res };
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const res = await this.postForm('/auth/login', { apikey: this.cfg.apiKey, password: this.cfg.password });
    const value = res?.data?.token;
    if (!value) throw new CinetPayError(`Authentification transfert refusée : ${res?.message}`, String(res?.code), res);
    this.token = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
    return value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async postForm(path: string, fields: Record<string, string>): Promise<any> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(fields).toString(),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async get(path: string): Promise<any> {
    return this.request(path, { method: 'GET', headers: { Accept: 'application/json' } });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request(path: string, init: RequestInit): Promise<any> {
    let response: Response;
    try {
      response = await this.fetchFn(`${TRANSFER_URL}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new CinetPayError(`API de transfert injoignable : ${(err as Error).message}`, 'RESEAU');
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new CinetPayError(`Réponse illisible de l'API de transfert (HTTP ${response.status})`, 'REPONSE_INVALIDE', text);
    }
  }
}
