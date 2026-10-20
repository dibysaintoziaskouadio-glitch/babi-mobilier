// Routes HTTP des paiements (Express). En NestJS, chaque handler devient une méthode
// de contrôleur ; la logique reste dans PaymentsService.
import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import type { MoyenPaiement } from '@prisma/client';
import { CinetPayClient } from './cinetpay/cinetpay.client';
import { PaymentError, PaymentsService } from './payments.service';

/** Fourni par le middleware d'authentification JWT de l'API. */
export interface AuthUser {
  id: string;
  roles: string[];
}
type AuthedRequest = Request & { user?: AuthUser };
type Guard = (req: AuthedRequest, res: Response, next: NextFunction) => void;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REFUND_WITHOUT_OWNER = 500_000; // au-delà, rôle super_admin requis

export function paymentsRouter(deps: {
  service: PaymentsService;
  cinetpay: CinetPayClient;
  requireAuth: Guard;
  requireRole: (...roles: string[]) => Guard;
  log: (msg: string, meta?: Record<string, unknown>) => void;
}): Router {
  const { service, cinetpay, requireAuth, requireRole, log } = deps;
  const router = express.Router();
  const form = express.urlencoded({ extended: false, limit: '20kb' });
  const json = express.json({ limit: '20kb' });

  // ---------------------------------------------------------------- Initiation
  router.post('/v1/payments', requireAuth, json, async (req: AuthedRequest, res) => {
    const { order_id, moyen_paiement, payer_phone } = req.body ?? {};
    if (!UUID.test(String(order_id))) return problem(res, 400, 'ORDER_ID_INVALIDE', 'order_id doit être un UUID');
    try {
      const result = await service.initiate({
        orderId: order_id,
        customerId: req.user!.id,
        moyen: moyen_paiement as MoyenPaiement,
        payerPhone: String(payer_phone ?? ''),
      });
      res.status(201).json({
        id: result.paymentId,
        status: 'en_attente',
        provider: 'cinetpay',
        amount_xof: result.amountXof,
        payment_url: result.paymentUrl,
        expires_at: result.expiresAt.toISOString(),
      });
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // ------------------------------------------------- Statut (page de confirmation)
  router.get('/v1/payments/:id', requireAuth, async (req: AuthedRequest, res) => {
    if (!UUID.test(req.params.id)) return problem(res, 400, 'ID_INVALIDE', 'Identifiant invalide');
    try {
      res.json(await service.getForCustomer(req.params.id, req.user!.id));
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // ------------------------------------------------------------ Webhook paiement
  // CinetPay teste la disponibilité de notify_url en GET : répondre 200.
  router.get('/v1/webhooks/cinetpay', (_req, res) => res.sendStatus(200));

  router.post('/v1/webhooks/cinetpay', form, async (req, res) => {
    const fields = (req.body ?? {}) as Record<string, string>;
    const txId = fields.cpm_trans_id;

    if (!cinetpay.verifyNotification(fields, req.header('x-token'))) {
      log('Webhook CinetPay rejeté : x-token invalide', { txId, ip: req.ip });
      return res.sendStatus(401);
    }
    if (fields.cpm_site_id !== cinetpay.siteId || !txId) {
      log('Webhook CinetPay rejeté : site_id ou transaction absente', { txId, site: fields.cpm_site_id });
      return res.sendStatus(400);
    }
    try {
      const outcome = await service.reconcile(txId, 'webhook');
      log('Webhook CinetPay traité', { txId, outcome });
      res.sendStatus(200);
    } catch (err) {
      // 500 : CinetPay pourra renotifier ; le job de rapprochement prend le relais de toute façon.
      log('Webhook CinetPay en erreur', { txId, error: String(err) });
      res.sendStatus(500);
    }
  });

  // ------------------------------------------- Webhook transfert (remboursements)
  // Pas de signature documentée pour ce flux : la notification ne sert que de signal,
  // le statut est toujours relu via checkTransfer(). Un appel forgé ne peut rien valider.
  router.post('/v1/webhooks/cinetpay/transfert', form, async (req, res) => {
    const fields = (req.body ?? {}) as Record<string, string>;
    const clientTxId = fields.client_transaction_id ?? fields.cpm_trans_id;
    if (!clientTxId || !/^BMR[0-9A-Z]{10,30}$/.test(clientTxId)) return res.sendStatus(200);
    try {
      const outcome = await service.reconcileRefund(clientTxId);
      log('Webhook transfert traité', { clientTxId, outcome });
      res.sendStatus(200);
    } catch (err) {
      log('Webhook transfert en erreur', { clientTxId, error: String(err) });
      res.sendStatus(500);
    }
  });

  // --------------------------------------------------------------- Remboursement
  router.post('/v1/admin/payments/:id/refund', requireAuth, requireRole('admin', 'super_admin'), json, async (req: AuthedRequest, res) => {
    if (!UUID.test(req.params.id)) return problem(res, 400, 'ID_INVALIDE', 'Identifiant invalide');
    const amount = Number(req.body?.amount_xof);
    if (amount > MAX_REFUND_WITHOUT_OWNER && !req.user!.roles.includes('super_admin')) {
      return problem(res, 403, 'PLAFOND_DEPASSE', `Au-delà de ${MAX_REFUND_WITHOUT_OWNER} FCFA, validation super_admin requise`);
    }
    try {
      const { refundId } = await service.refund({
        paymentId: req.params.id,
        amountXof: amount,
        reason: String(req.body?.reason ?? ''),
        actorId: req.user!.id,
      });
      res.status(202).json({ refund_id: refundId, status: 'en_attente' });
    } catch (err) {
      handleError(res, err, log);
    }
  });

  return router;
}

function problem(res: Response, status: number, code: string, detail: string) {
  return res.status(status).type('application/problem+json').json({ type: 'about:blank', title: code, status, detail, code });
}

function handleError(res: Response, err: unknown, log: (m: string, meta?: Record<string, unknown>) => void) {
  if (err instanceof PaymentError) return problem(res, err.httpStatus, err.code, err.message);
  log('Erreur paiement inattendue', { error: String(err) });
  return problem(res, 500, 'ERREUR_INTERNE', 'Une erreur est survenue, réessayez dans un instant');
}
