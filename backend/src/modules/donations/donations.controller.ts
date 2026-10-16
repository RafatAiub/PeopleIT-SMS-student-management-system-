import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { paginatedResponse, successResponse } from '../../utils/response';
import { mapSitesError } from '../sites/sites.config';
import type { CallbackKind } from '../fees/online/onlinePayment.service';
import * as svc from './donations.service';
import * as pub from './donations.public.service';

// =============================================================================
// Donations (T1) controllers — thin: parse, call the service, respond.
// =============================================================================

type Handler = (req: Request, res: Response) => Promise<unknown>;

const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

const ctxOf = (req: Request): svc.DonationCtx => ({
  institutionId: req.tenantId as string, // requireTenant runs first
  userId: req.user!.sub,
  role: req.user!.role,
});

const q = (req: Request) => req.query as any;
const paged = (res: Response, r: { items: unknown[]; total: number }, req: Request, extra?: Record<string, unknown>) =>
  paginatedResponse(res, r.items, r.total, Number(q(req).page ?? 1), Number(q(req).pageSize ?? 25), 'Success', extra);

// Funds
export const listFunds = wrap(async (req, res) => successResponse(res, await svc.listFunds(ctxOf(req))));
export const createFund = wrap(async (req, res) => successResponse(res, await svc.createFund(ctxOf(req), req.body), 'Fund created', 201));
export const updateFund = wrap(async (req, res) => successResponse(res, await svc.updateFund(ctxOf(req), req.params.id, req.body), 'Fund saved'));
export const deleteFund = wrap(async (req, res) => successResponse(res, await svc.deleteFund(ctxOf(req), req.params.id), 'Fund deleted'));

// Donors
export const listDonors = wrap(async (req, res) => paged(res, await svc.listDonors(ctxOf(req), q(req)), req));
export const getDonor = wrap(async (req, res) => successResponse(res, await svc.getDonor(ctxOf(req), req.params.id)));
export const createDonor = wrap(async (req, res) => successResponse(res, await svc.createDonor(ctxOf(req), req.body), 'Donor added', 201));
export const updateDonor = wrap(async (req, res) => successResponse(res, await svc.updateDonor(ctxOf(req), req.params.id, req.body), 'Donor saved'));
export const deleteDonor = wrap(async (req, res) => successResponse(res, await svc.deleteDonor(ctxOf(req), req.params.id), 'Donor deleted'));

// Campaigns
export const listCampaigns = wrap(async (req, res) => successResponse(res, await svc.listCampaigns(ctxOf(req))));
export const createCampaign = wrap(async (req, res) => successResponse(res, await svc.createCampaign(ctxOf(req), req.body), 'Campaign created', 201));
export const updateCampaign = wrap(async (req, res) => successResponse(res, await svc.updateCampaign(ctxOf(req), req.params.id, req.body), 'Campaign saved'));
export const deleteCampaign = wrap(async (req, res) => successResponse(res, await svc.deleteCampaign(ctxOf(req), req.params.id), 'Campaign deleted'));

// Donation records
export const listDonations = wrap(async (req, res) => {
  const r = await svc.listDonations(ctxOf(req), q(req));
  paged(res, r, req, { summary: { paidTotal: r.paidTotal } });
});
export const getDonation = wrap(async (req, res) => successResponse(res, await svc.getDonation(ctxOf(req), req.params.id)));
export const recordDonation = wrap(async (req, res) => successResponse(res, await svc.recordDonation(ctxOf(req), req.body), 'Donation recorded', 201));
export const refundDonation = wrap(async (req, res) => successResponse(res, await svc.refundDonation(ctxOf(req), req.params.id, req.body.reason), 'Donation refunded'));
export const getReceipt = wrap(async (req, res) => successResponse(res, await svc.getReceipt(ctxOf(req), req.params.id)));
export const emailReceipt = wrap(async (req, res) => successResponse(res, await svc.emailReceipt(ctxOf(req), req.params.id)));
export const exportCsv = wrap(async (req, res) => {
  const csv = await svc.exportCsv(ctxOf(req), q(req));
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="donations-${stamp}.csv"`);
  // BOM so Excel opens Bangla names correctly.
  res.send(`\uFEFF${csv}`);
});

// Recurring pledges
export const listRecurring = wrap(async (req, res) => paged(res, await svc.listRecurring(ctxOf(req), q(req)), req));
export const createRecurring = wrap(async (req, res) => successResponse(res, await svc.createRecurring(ctxOf(req), req.body), 'Monthly pledge added', 201));
export const updateRecurring = wrap(async (req, res) => successResponse(res, await svc.updateRecurring(ctxOf(req), req.params.id, req.body), 'Monthly pledge saved'));
export const deleteRecurring = wrap(async (req, res) => successResponse(res, await svc.deleteRecurring(ctxOf(req), req.params.id), 'Monthly pledge deleted'));
export const remindRecurring = wrap(async (req, res) => successResponse(res, await svc.sendDueReminders(ctxOf(req), req.body?.ids), 'Reminders sent'));

// Disbursements
export const listDisbursements = wrap(async (req, res) => paged(res, await svc.listDisbursements(ctxOf(req), q(req)), req));
export const createDisbursement = wrap(async (req, res) => successResponse(res, await svc.createDisbursement(ctxOf(req), req.body), 'Payout recorded', 201));
export const deleteDisbursement = wrap(async (req, res) => successResponse(res, await svc.deleteDisbursement(ctxOf(req), req.params.id), 'Payout deleted'));

// Reports + dashboard
export const report = wrap(async (req, res) => successResponse(res, await svc.report(ctxOf(req), q(req))));
export const summary = wrap(async (req, res) => successResponse(res, await svc.dashboardSummary(ctxOf(req))));

// Guardian portal
export const myDonations = wrap(async (req, res) => successResponse(res, await svc.myDonations(ctxOf(req).institutionId, req.user!.sub)));
export const myReceipt = wrap(async (req, res) => successResponse(res, await svc.myReceipt(ctxOf(req).institutionId, req.user!.sub, req.params.id)));

// ── Public (website) ─────────────────────────────────────────────────────────

const pwrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapSitesError(error));
  }
};

const previewOf = (req: Request): string | undefined =>
  (typeof req.query.preview === 'string' ? req.query.preview : undefined) ??
  (typeof req.headers['x-site-preview'] === 'string' ? (req.headers['x-site-preview'] as string) : undefined);

export const publicOptions = pwrap(async (req, res) => {
  const preview = previewOf(req);
  res.setHeader('Cache-Control', preview ? 'private, no-store' : 'public, max-age=30, stale-while-revalidate=120');
  successResponse(res, await pub.donationOptions(req.params.siteId, preview));
});
export const publicCreate = pwrap(async (req, res) =>
  successResponse(res, await pub.createPublicDonation(req.params.siteId, req.body), 'Donation started', 201),
);
export const publicGet = pwrap(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  successResponse(res, await pub.getPublicDonation(req.params.siteId, req.params.reference));
});
export const publicDemoPay = pwrap(async (req, res) =>
  successResponse(res, await pub.demoPayDonation(req.params.siteId, req.params.reference, req.body.outcome)),
);

/** Never throws to the client — always redirects (or 200s an IPN). */
export async function payCallback(req: Request, res: Response): Promise<void> {
  const gateway = String(req.params.gateway ?? '');
  const kind = req.params.kind as CallbackKind;
  const payload = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) };
  let redirectTo = `${env.FRONTEND_URL}/?donation=failed`;
  try {
    redirectTo = await pub.handleDonationGatewayCallback(gateway, kind, payload);
  } catch (error) {
    logger.error('Unhandled error while processing a donation gateway callback', {
      gateway,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (kind === 'ipn') {
    res.status(200).json({ success: true });
    return;
  }
  res.redirect(303, redirectTo);
}
