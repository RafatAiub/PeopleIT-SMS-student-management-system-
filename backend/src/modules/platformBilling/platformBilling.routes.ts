import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { successResponse } from '../../utils/response';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import { periodOf } from './platformBilling.logic';
import { getFinalAccess, invalidatePlatformAccess } from './platformBilling.access';
import * as service from './platformBilling.service';
import * as payments from './platformBilling.payments';
import * as collections from './platformBilling.collections';
import { runDailyReminders } from './platformBilling.reminders';
import { renderPlatformInvoicePdf, renderPlatformReceiptPdf } from './platformBilling.pdf';
import {
  AddActivityDto,
  CheckoutDto,
  CollectionsQueryDto,
  DemoConfirmDto,
  EditInvoiceLinesDto,
  GenerateInvoicesDto,
  ListInvoicesQueryDto,
  ManualPaymentDto,
  ReasonDto,
  SetOverrideDto,
  UpsertBillingProfileDto,
  type CollectionsQueryDtoType,
  type ListInvoicesQueryDtoType,
} from './platformBilling.dto';

// =============================================================================
// P1 platform billing routes. Three routers, mounted in app.ts BEFORE the
// legacy billing routers:
//   tenantPlatformBillingRouter  → /api/v1/billing/platform          (school)
//   adminPlatformBillingRouter   → /api/v1/billing/platform-admin    (SUPER_ADMIN)
//   platformGatewayRouter        → /api/v1/billing/platform-gateway  (public callbacks)
// All three live under /api/v1/billing, which the access middleware always
// lets through (RESTRICTED and DISABLED schools can still see their bill and
// pay it).
// =============================================================================

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

function sendPdf(res: Response, file: { pdf: Buffer; filename: string }, inline: boolean) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${file.filename}"`);
  res.send(file.pdf);
}

// ── School (tenant) ─────────────────────────────────────────────────────────

export const tenantPlatformBillingRouter = Router();
const tenant = [authenticate, setTenant];
const schoolAdmin = [authenticate, setTenant, requireRole(UserRole.ADMIN)];

// Every role: drives the app-wide banner and the "account disabled" screen.
tenantPlatformBillingRouter.get(
  '/status',
  ...tenant,
  h(async (req, res) => {
    const final = await getFinalAccess(req.tenantId!);
    successResponse(res, await service.getMyBillingStatus(req.tenantId!, req.user!.role, final));
  }),
);

tenantPlatformBillingRouter.get('/invoices', ...schoolAdmin, h(async (req, res) => successResponse(res, await service.listMyInvoices(req.tenantId!))));
tenantPlatformBillingRouter.get('/invoices/:id', ...schoolAdmin, h(async (req, res) => successResponse(res, await service.getInvoiceDetail(req.params.id, req.tenantId!))));
tenantPlatformBillingRouter.get(
  '/invoices/:id/pdf',
  ...schoolAdmin,
  h(async (req, res) => sendPdf(res, await renderPlatformInvoicePdf(req.params.id, req.tenantId!), req.query.inline === '1')),
);
tenantPlatformBillingRouter.get('/payments', ...schoolAdmin, h(async (req, res) => successResponse(res, await service.listMyPayments(req.tenantId!))));
tenantPlatformBillingRouter.get('/payments/:id', ...schoolAdmin, h(async (req, res) => successResponse(res, await payments.getMyPayment(req.tenantId!, req.params.id))));
tenantPlatformBillingRouter.get(
  '/payments/:id/receipt.pdf',
  ...schoolAdmin,
  h(async (req, res) => sendPdf(res, await renderPlatformReceiptPdf(req.params.id, req.tenantId!), req.query.inline === '1')),
);
tenantPlatformBillingRouter.get('/gateways', ...schoolAdmin, h(async (_req, res) => successResponse(res, payments.listPlatformGateways())));
tenantPlatformBillingRouter.post(
  '/checkout',
  ...schoolAdmin,
  validate({ body: CheckoutDto }),
  h(async (req, res) => successResponse(res, await payments.startCheckout(req.tenantId!, { sub: req.user!.sub, email: req.user!.email }, req.body), 'Checkout started')),
);
tenantPlatformBillingRouter.post(
  '/payments/:id/demo-confirm',
  ...schoolAdmin,
  validate({ body: DemoConfirmDto }),
  h(async (req, res) => successResponse(res, await payments.confirmDemoPayment(req.tenantId!, req.params.id, req.body.outcome, req.user!.sub))),
);
tenantPlatformBillingRouter.get('/pay-link/:token', ...schoolAdmin, h(async (req, res) => successResponse(res, await payments.resolvePayLink(req.tenantId!, req.params.token))));

// ── Super-admin ─────────────────────────────────────────────────────────────

export const adminPlatformBillingRouter = Router();
adminPlatformBillingRouter.use(authenticate, requireRole(UserRole.SUPER_ADMIN));

adminPlatformBillingRouter.get('/dashboard', h(async (_req, res) => successResponse(res, await service.getDashboard())));

adminPlatformBillingRouter.get('/profiles/:institutionId', h(async (req, res) => successResponse(res, await service.getProfile(req.params.institutionId))));
adminPlatformBillingRouter.put(
  '/profiles/:institutionId',
  validate({ body: UpsertBillingProfileDto }),
  h(async (req, res) => successResponse(res, await service.upsertProfile(req.user!.sub, req.params.institutionId, req.body), 'Billing profile saved')),
);
adminPlatformBillingRouter.put(
  '/profiles/:institutionId/override',
  validate({ body: SetOverrideDto }),
  h(async (req, res) => successResponse(res, await service.setOverride(req.user!.sub, req.params.institutionId, req.body), 'Access updated')),
);

adminPlatformBillingRouter.post(
  '/invoices/generate',
  validate({ body: GenerateInvoicesDto }),
  h(async (req, res) => {
    const period = req.body.period ?? periodOf(new Date());
    const opts = { actorUserId: req.user!.sub, manual: true };
    const result = req.body.institutionId
      ? await service.generateInvoice(req.body.institutionId, period, opts)
      : await service.generateForAll(period, opts);
    await service.markOverdue();
    invalidatePlatformAccess();
    successResponse(res, result, 'Invoices generated');
  }),
);
adminPlatformBillingRouter.get(
  '/invoices/export',
  validate({ query: ListInvoicesQueryDto }),
  h(async (req, res) => {
    const file = await service.exportInvoices(req.query as unknown as ListInvoicesQueryDtoType);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }),
);
adminPlatformBillingRouter.get(
  '/invoices',
  validate({ query: ListInvoicesQueryDto }),
  h(async (req, res) => {
    const r = await service.listInvoices(req.query as unknown as ListInvoicesQueryDtoType);
    res.json({ success: true, message: 'Success', data: r.data, meta: r.meta });
  }),
);
adminPlatformBillingRouter.get('/invoices/:id', h(async (req, res) => successResponse(res, await service.getInvoiceDetail(req.params.id))));
adminPlatformBillingRouter.get('/invoices/:id/pdf', h(async (req, res) => sendPdf(res, await renderPlatformInvoicePdf(req.params.id), req.query.inline === '1')));
adminPlatformBillingRouter.patch(
  '/invoices/:id/lines',
  validate({ body: EditInvoiceLinesDto }),
  h(async (req, res) => successResponse(res, await service.editInvoiceLines(req.user!.sub, req.params.id, req.body), 'Invoice updated')),
);
adminPlatformBillingRouter.post(
  '/invoices/:id/waive',
  validate({ body: ReasonDto }),
  h(async (req, res) => successResponse(res, await service.waiveInvoice(req.user!.sub, req.params.id, req.body.reason), 'Invoice waived')),
);
adminPlatformBillingRouter.post(
  '/invoices/:id/cancel',
  validate({ body: ReasonDto }),
  h(async (req, res) => successResponse(res, await service.cancelInvoice(req.user!.sub, req.params.id, req.body.reason), 'Invoice cancelled')),
);
adminPlatformBillingRouter.post(
  '/invoices/:id/payments',
  validate({ body: ManualPaymentDto }),
  h(async (req, res) => successResponse(res, await payments.recordManualPayment(req.user!.sub, req.params.id, req.body), 'Payment recorded', 201)),
);
adminPlatformBillingRouter.post(
  '/invoices/:id/remind',
  h(async (req, res) => successResponse(res, await runDailyReminders(new Date(), { onlyInvoiceId: req.params.id, manual: true }), 'Reminder sent')),
);
adminPlatformBillingRouter.get('/payments/:id/receipt.pdf', h(async (req, res) => sendPdf(res, await renderPlatformReceiptPdf(req.params.id), req.query.inline === '1')));

adminPlatformBillingRouter.get(
  '/collections',
  validate({ query: CollectionsQueryDto }),
  h(async (req, res) => successResponse(res, await collections.getCollectionsBoard(req.query as unknown as CollectionsQueryDtoType, req.user!.sub))),
);
adminPlatformBillingRouter.get('/collections/:institutionId', h(async (req, res) => successResponse(res, await collections.getSchoolCollections(req.params.institutionId))));
adminPlatformBillingRouter.post(
  '/collections/:institutionId/activities',
  validate({ body: AddActivityDto }),
  h(async (req, res) => successResponse(res, await collections.addActivity(req.user!.sub, req.params.institutionId, req.body), 'Saved', 201)),
);
adminPlatformBillingRouter.get('/staff', h(async (_req, res) => successResponse(res, await collections.listPlatformStaff())));

// ── Public gateway callbacks ────────────────────────────────────────────────

export const platformGatewayRouter = Router();
const KINDS: payments.CallbackKind[] = ['ipn', 'success', 'fail', 'cancel', 'callback'];

async function gatewayCallback(req: Request, res: Response) {
  const gateway = payments.gatewayFromSlug(req.params.gateway ?? '');
  const kind = req.params.kind as payments.CallbackKind;
  const payload = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) };
  if (!gateway || !KINDS.includes(kind)) {
    res.status(404).json({ success: false, message: 'Unknown gateway callback' });
    return;
  }
  let redirectTo = `${env.FRONTEND_URL}/billing?payment=failed`;
  try {
    redirectTo = await payments.handlePlatformGatewayCallback(gateway, kind, payload);
  } catch (error) {
    logger.error('Unhandled error in platform billing gateway callback', { gateway, kind, error: (error as Error).message });
  }
  if (kind === 'ipn') {
    res.status(200).json({ success: true });
    return;
  }
  res.redirect(303, redirectTo);
}
platformGatewayRouter.get('/:gateway/:kind', gatewayCallback);
platformGatewayRouter.post('/:gateway/:kind', gatewayCallback);
