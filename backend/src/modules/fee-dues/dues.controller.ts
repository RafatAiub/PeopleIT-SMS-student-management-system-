import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { successResponse } from '../../utils/response';
import { logger } from '../../utils/logger';
import { mapSchemaError } from '../../utils/schemaMissing';
import * as dues from './dues.service';
import * as restriction from './restriction.service';
import * as reminders from './reminders.service';
import * as reports from './reports.service';
import { CONTENT_TYPES, fileNameFor, render, type ExportFormat } from './export';
import { institutionTz } from './dues.sql';

// =============================================================================
// P4 fee-dues controllers (mounted at /api/v1/fee-dues).
// =============================================================================

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapSchemaError(error));
  }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (req: Request) => req.query as any;

/** Synchronous sends up to this many students; above it the send runs in the background. */
const INLINE_SEND_LIMIT = 25;

export const grid = wrap(async (req, res) => successResponse(res, await dues.getGrid(req.tenantId!, q(req))));
export const ledger = wrap(async (req, res) => {
  const data = await dues.getStudentLedger(req.tenantId!, req.params.studentId, q(req));
  const status = await restriction.evaluateStudent(req.tenantId!, req.params.studentId);
  const row = await restrictionRow(req.tenantId!, req.params.studentId);
  successResponse(res, { ...data, restriction: { ...status, ...row } });
});
export const defaulters = wrap(async (req, res) => successResponse(res, await dues.listDefaulters(req.tenantId!, q(req))));
export const widget = wrap(async (req, res) => successResponse(res, await dues.getWidget(req.tenantId!)));

export const previewReminders = wrap(async (req, res) => successResponse(res, await reminders.previewReminders(req.tenantId!, req.body)));
export const sendReminders = wrap(async (req, res) => {
  const tenantId = req.tenantId!;
  const userId = req.user!.sub;
  const count = req.body.studentIds?.length ?? Infinity;
  if (count <= INLINE_SEND_LIMIT) {
    const summary = await reminders.sendReminders(tenantId, userId, req.body);
    successResponse(res, { ...summary, done: true }, 'Reminders processed', 200);
    return;
  }
  const batchId = randomUUID();
  // Background: the HTTP request returns at once; the UI polls GET /reminders/batches/:id.
  reminders.sendReminders(tenantId, userId, req.body, batchId).catch((error) => {
    logger.error('Dues reminder batch failed', { batchId, error: error instanceof Error ? error.message : String(error) });
  });
  successResponse(res, { batchId, done: false }, 'Reminders are being sent', 202);
});
export const batch = wrap(async (req, res) => successResponse(res, await reminders.getBatch(req.tenantId!, req.params.batchId)));
export const reminderLog = wrap(async (req, res) => successResponse(res, await reminders.listReminderLog(req.tenantId!, q(req))));

export const getSettings = wrap(async (req, res) => successResponse(res, await restriction.getSettings(req.tenantId!)));
export const updateSettings = wrap(async (req, res) => successResponse(res, await restriction.updateSettings(req.tenantId!, req.user!.sub, req.body), 'Saved'));
export const restricted = wrap(async (req, res) => successResponse(res, await restriction.listRestricted(req.tenantId!, q(req))));
export const setManual = wrap(async (req, res) => {
  const state = req.body.state === 'AUTO' ? null : req.body.state;
  successResponse(res, await restriction.setManualState(req.tenantId!, req.user!.sub, req.params.studentId, state, req.body.reason), 'Saved');
});
export const setExempt = wrap(async (req, res) =>
  successResponse(res, await restriction.setExempt(req.tenantId!, req.user!.sub, req.params.studentId, req.body.exempt, req.body.reason ?? null), 'Saved'),
);
export const refresh = wrap(async (req, res) => successResponse(res, { rows: await restriction.refreshStatuses(req.tenantId!) }));

/** STUDENT / GUARDIAN: am I (or my child) restricted? Used by the portal to show the "Fees due" screen up front. */
export const myStatus = wrap(async (req, res) => {
  const ids = await restriction.studentIdsForUser(req.tenantId!, req.user!.sub, req.user!.role);
  const features = ['RESULTS', 'ADMIT_CARD', 'ID_CARD', 'ONLINE_EXAM'] as const;
  const out: Record<string, { blocked: boolean; studentIds: string[] }> = {};
  let contact: unknown = null;
  for (const f of features) {
    const c = await restriction.checkFeature(req.tenantId!, ids, f);
    out[f] = { blocked: c.blocked, studentIds: c.students.map((s) => s.studentId) };
    if (c.blocked) contact = c.contact;
  }
  successResponse(res, { features: out, contact });
});

export const reportOptions = wrap(async (req, res) => successResponse(res, await reports.filterOptions(req.tenantId!)));
export const report = wrap(async (req, res) => {
  const { format = 'json', ...params } = q(req);
  const doc = await reports.buildReport(req.tenantId!, req.params.key as reports.ReportKey, params);
  if (format === 'json') {
    successResponse(res, doc);
    return;
  }
  const inst = await institutionTz(req.tenantId!);
  const buf = await render(doc, format as ExportFormat, { name: inst.name, logoUrl: inst.logoUrl, address: inst.address, phone: inst.phone, email: inst.email });
  res.setHeader('Content-Type', CONTENT_TYPES[format as ExportFormat]);
  res.setHeader('Content-Disposition', `attachment; filename="${fileNameFor(doc, format as ExportFormat)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

async function restrictionRow(institutionId: string, studentId: string) {
  const row = await prisma.studentFeeStatus.findFirst({
    where: { institutionId, studentId },
    select: { manualState: true, manualReason: true, manualAt: true, exempt: true, exemptReason: true, lastPaymentAt: true, computedAt: true },
  });
  return row ?? { manualState: null, manualReason: null, manualAt: null, exempt: false, exemptReason: null, lastPaymentAt: null, computedAt: null };
}
