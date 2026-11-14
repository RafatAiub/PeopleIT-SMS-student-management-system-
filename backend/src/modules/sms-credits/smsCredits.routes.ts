import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { successResponse } from '../../utils/response';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/AppError';
import * as service from './smsCredits.service';
import * as payments from './smsCredits.payments';
import { checkDlrToken, dlrToken, handleDlrWebhook } from './smsCredits.delivery';
import { ensureWallet } from './smsWallet.service';
import {
  AdjustDto,
  CheckoutDto,
  DemoConfirmDto,
  LedgerQueryDto,
  LogQueryDto,
  ManualCreditDto,
  PackDto,
  ReviewSenderIdDto,
  SenderIdRequestDto,
  SettingsDto,
  type LogQueryDtoType,
} from './smsCredits.dto';

// =============================================================================
// P5 SMS credits routes, mounted in app.ts:
//   smsCreditsGatewayRouter → /api/v1/sms-credits/gateway   (public payment callbacks)
//   smsDlrRouter            → /api/v1/sms-credits/dlr       (public, token-protected DLR webhooks)
//   smsCreditsAdminRouter   → /api/v1/sms-credits/admin     (SUPER_ADMIN)
//   smsCreditsRouter        → /api/v1/sms-credits           (school ADMIN)
// =============================================================================

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

function sendFile(res: Response, file: { buffer: Buffer; filename: string; contentType: string }) {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
}

// ── School ADMIN ────────────────────────────────────────────────────────────

export const smsCreditsRouter = Router();
const admin = [authenticate, setTenant, requireRole(UserRole.ADMIN)];

smsCreditsRouter.get('/overview', ...admin, h(async (req, res) => successResponse(res, await service.getMyOverview(req.tenantId!))));
smsCreditsRouter.put(
  '/settings',
  ...admin,
  validate({ body: SettingsDto }),
  h(async (req, res) => successResponse(res, await service.updateSettings(req.tenantId!, req.user!.sub, req.body), 'Settings saved')),
);
smsCreditsRouter.get(
  '/ledger',
  ...admin,
  validate({ query: LedgerQueryDto }),
  h(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number };
    const r = await service.listLedger(req.tenantId!, q.page, q.pageSize);
    res.json({ success: true, message: 'Success', data: r.data, meta: r.meta });
  }),
);
smsCreditsRouter.get(
  '/messages/export',
  ...admin,
  validate({ query: LogQueryDto }),
  h(async (req, res) => sendFile(res, await service.exportMessagesCsv(req.query as unknown as LogQueryDtoType, req.tenantId!))),
);
smsCreditsRouter.get(
  '/messages',
  ...admin,
  validate({ query: LogQueryDto }),
  h(async (req, res) => {
    const r = await service.listMessages(req.query as unknown as LogQueryDtoType, req.tenantId!);
    res.json({ success: true, message: 'Success', data: r.data, meta: r.meta });
  }),
);
smsCreditsRouter.get('/sender-id', ...admin, h(async (req, res) => successResponse(res, await service.listMySenderRequests(req.tenantId!))));
smsCreditsRouter.post(
  '/sender-id',
  ...admin,
  validate({ body: SenderIdRequestDto }),
  h(async (req, res) => successResponse(res, await service.requestSenderId(req.tenantId!, req.user!.sub, req.body), 'Sender ID requested', 201)),
);
smsCreditsRouter.delete('/sender-id/:id', ...admin, h(async (req, res) => successResponse(res, await service.cancelSenderRequest(req.tenantId!, req.user!.sub, req.params.id), 'Request cancelled')));
smsCreditsRouter.get('/packs', ...admin, h(async (_req, res) => successResponse(res, await service.listPacks(false))));
smsCreditsRouter.get('/purchases', ...admin, h(async (req, res) => successResponse(res, await payments.listPurchases(req.tenantId!))));
smsCreditsRouter.get('/purchases/:id', ...admin, h(async (req, res) => successResponse(res, await payments.getPurchase(req.tenantId!, req.params.id))));
smsCreditsRouter.post(
  '/checkout',
  ...admin,
  validate({ body: CheckoutDto }),
  h(async (req, res) => successResponse(res, await payments.startCheckout(req.tenantId!, { sub: req.user!.sub, email: req.user!.email }, req.body), 'Checkout started')),
);
smsCreditsRouter.post(
  '/purchases/:id/demo-confirm',
  ...admin,
  validate({ body: DemoConfirmDto }),
  h(async (req, res) => successResponse(res, await payments.confirmDemoPurchase(req.tenantId!, req.params.id, req.body.outcome, req.user!.sub))),
);

// ── Super-admin ─────────────────────────────────────────────────────────────

export const smsCreditsAdminRouter = Router();
smsCreditsAdminRouter.use(authenticate, requireRole(UserRole.SUPER_ADMIN));

smsCreditsAdminRouter.get('/overview', h(async (_req, res) => successResponse(res, await service.adminOverview())));
smsCreditsAdminRouter.get('/provider-balances', h(async (_req, res) => successResponse(res, await service.providerBalances())));
smsCreditsAdminRouter.get(
  '/messages/export',
  validate({ query: LogQueryDto }),
  h(async (req, res) => sendFile(res, await service.exportMessagesCsv(req.query as unknown as LogQueryDtoType, null))),
);
smsCreditsAdminRouter.get(
  '/messages',
  validate({ query: LogQueryDto }),
  h(async (req, res) => {
    const r = await service.listMessages(req.query as unknown as LogQueryDtoType, null);
    res.json({ success: true, message: 'Success', data: r.data, meta: r.meta });
  }),
);
smsCreditsAdminRouter.get('/packs', h(async (_req, res) => successResponse(res, await service.listPacks(true))));
smsCreditsAdminRouter.post('/packs', validate({ body: PackDto }), h(async (req, res) => successResponse(res, await service.createPack(req.user!.sub, req.body), 'Pack created', 201)));
smsCreditsAdminRouter.put('/packs/:id', validate({ body: PackDto }), h(async (req, res) => successResponse(res, await service.updatePack(req.user!.sub, req.params.id, req.body), 'Pack saved')));
smsCreditsAdminRouter.get(
  '/sender-requests',
  h(async (req, res) => {
    const s = String(req.query.status ?? '');
    const status = s === 'REQUESTED' || s === 'APPROVED' || s === 'REJECTED' ? s : undefined;
    successResponse(res, await service.listSenderRequests(status));
  }),
);
smsCreditsAdminRouter.post(
  '/sender-requests/:id/review',
  validate({ body: ReviewSenderIdDto }),
  h(async (req, res) => successResponse(res, await service.reviewSenderRequest(req.user!.sub, req.params.id, req.body), 'Saved')),
);
smsCreditsAdminRouter.get(
  '/schools/:institutionId',
  h(async (req, res) => {
    const inst = await prisma.institution.findUnique({ where: { id: req.params.institutionId }, select: { id: true, name: true } });
    if (!inst) throw new NotFoundError('School not found');
    await ensureWallet(inst.id);
    const [overview, ledger, purchases] = await Promise.all([
      service.getMyOverview(inst.id),
      service.listLedger(inst.id, 1, 50),
      payments.listPurchases(inst.id, 50),
    ]);
    successResponse(res, { institution: inst, overview, ledger: ledger.data, purchases });
  }),
);
smsCreditsAdminRouter.delete('/schools/:institutionId/sender-id', h(async (req, res) => successResponse(res, await service.clearSenderId(req.user!.sub, req.params.institutionId), 'Sender ID cleared')));
smsCreditsAdminRouter.post(
  '/schools/:institutionId/credits',
  validate({ body: ManualCreditDto }),
  h(async (req, res) => successResponse(res, await payments.recordManualCredit(req.user!.sub, req.params.institutionId, req.body), 'Credits added', 201)),
);
smsCreditsAdminRouter.post(
  '/schools/:institutionId/adjust',
  validate({ body: AdjustDto }),
  h(async (req, res) => successResponse(res, await service.adjustSchoolCredits(req.user!.sub, req.params.institutionId, req.body), 'Balance updated')),
);
smsCreditsAdminRouter.get('/purchases', h(async (_req, res) => successResponse(res, await payments.listPurchases(null, 200))));
smsCreditsAdminRouter.get('/purchases/:id', h(async (req, res) => successResponse(res, await payments.getPurchase(null, req.params.id))));

// ── Public: payment gateway callbacks ───────────────────────────────────────

export const smsCreditsGatewayRouter = Router();
const KINDS: payments.CallbackKind[] = ['ipn', 'success', 'fail', 'cancel', 'callback'];

async function gatewayCallback(req: Request, res: Response) {
  const gateway = payments.gatewayFromSlug(req.params.gateway ?? '');
  const kind = req.params.kind as payments.CallbackKind;
  const payload = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) };
  if (!gateway || !KINDS.includes(kind)) {
    res.status(404).json({ success: false, message: 'Unknown gateway callback' });
    return;
  }
  let redirectTo = `${env.FRONTEND_URL}/sms?purchase=failed`;
  try {
    redirectTo = await payments.handleCreditGatewayCallback(gateway, kind, payload);
  } catch (error) {
    logger.error('Unhandled error in SMS credits gateway callback', { gateway, kind, error: (error as Error).message });
  }
  if (kind === 'ipn') {
    res.status(200).json({ success: true });
    return;
  }
  res.redirect(303, redirectTo);
}
smsCreditsGatewayRouter.get('/:gateway/:kind', gatewayCallback);
smsCreditsGatewayRouter.post('/:gateway/:kind', gatewayCallback);

// ── Public: delivery reports (token-protected) ──────────────────────────────

export const smsDlrRouter = Router();
async function dlr(req: Request, res: Response) {
  if (!dlrToken()) {
    res.status(404).json({ success: false, message: 'Delivery reports are not enabled' });
    return;
  }
  const token = req.query.token ?? req.headers['x-dlr-token'];
  if (!checkDlrToken(token)) {
    res.status(403).json({ success: false, message: 'Invalid token' });
    return;
  }
  const payload = req.method === 'GET' ? { ...(req.query as Record<string, unknown>), token: undefined } : req.body;
  try {
    const r = await handleDlrWebhook(req.params.provider ?? '', payload);
    res.status(200).json({ success: true, ...r });
  } catch (error) {
    logger.error('SMS DLR webhook failed', { provider: req.params.provider, error: (error as Error).message });
    res.status(200).json({ success: false });
  }
}
smsDlrRouter.get('/:provider', dlr);
smsDlrRouter.post('/:provider', dlr);
