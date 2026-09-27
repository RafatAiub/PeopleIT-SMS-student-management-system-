import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import * as analytics from './analytics.service';
import * as savedViews from './savedViews.service';
import * as schedules from './schedules.service';
import { renderReportCsv } from './analytics.csv';
import { BOM } from './analytics.logic';
import type { Requester } from './analytics.scope';
import type { ReportKey } from './analytics.dto';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const requester = (req: Request): Requester => ({ sub: req.user!.sub, role: req.user!.role });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const query = <T>(req: Request) => req.query as any as T;

function handle(fn: (req: Request, res: Response) => Promise<unknown>): Handler {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };
}

export const filterOptions = handle(async (req, res) => {
  successResponse(res, await analytics.getFilterOptions(req.tenantId!, requester(req)), 'Filter options retrieved');
});

export const finance = handle(async (req, res) => {
  successResponse(res, await analytics.getFinanceAnalytics(req.tenantId!, requester(req), query(req)), 'Finance analytics retrieved');
});

export const defaulters = handle(async (req, res) => {
  successResponse(res, await analytics.getTopDefaulters(req.tenantId!, requester(req), query(req)), 'Top defaulters retrieved');
});

export const attendance = handle(async (req, res) => {
  successResponse(res, await analytics.getAttendanceAnalytics(req.tenantId!, requester(req), query(req)), 'Attendance analytics retrieved');
});

export const chronicAbsentees = handle(async (req, res) => {
  successResponse(res, await analytics.getChronicAbsentees(req.tenantId!, requester(req), query(req)), 'Chronic absentees retrieved');
});

export const academic = handle(async (req, res) => {
  successResponse(res, await analytics.getAcademicAnalytics(req.tenantId!, requester(req), query(req)), 'Academic analytics retrieved');
});

export const exportCsv = handle(async (req, res) => {
  const reportKey = req.params.reportKey as ReportKey;
  const report = await renderReportCsv(req.tenantId!, requester(req), reportKey, query(req));
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${reportKey}-report-${date}.csv"`);
  res.status(200).send(`${BOM}${report.csv}`);
});

// ── Saved views ──────────────────────────────────────────────────────────────

export const listViews = handle(async (req, res) => {
  successResponse(res, await savedViews.listViews(req.tenantId!, requester(req), query(req)), 'Saved views retrieved');
});

export const createView = handle(async (req, res) => {
  successResponse(res, await savedViews.createView(req.tenantId!, requester(req), req.body), 'Saved view created', 201);
});

export const updateView = handle(async (req, res) => {
  successResponse(res, await savedViews.updateView(req.tenantId!, requester(req), req.params.id, req.body), 'Saved view updated');
});

export const deleteView = handle(async (req, res) => {
  await savedViews.deleteView(req.tenantId!, requester(req), req.params.id);
  successResponse(res, null, 'Saved view deleted');
});

// ── Schedules ────────────────────────────────────────────────────────────────

export const listSchedules = handle(async (req, res) => {
  successResponse(res, await schedules.listSchedules(req.tenantId!, requester(req), query(req)), 'Schedules retrieved');
});

export const createSchedule = handle(async (req, res) => {
  successResponse(res, await schedules.createSchedule(req.tenantId!, requester(req), req.body), 'Schedule created', 201);
});

export const updateSchedule = handle(async (req, res) => {
  successResponse(res, await schedules.updateSchedule(req.tenantId!, requester(req), req.params.id, req.body), 'Schedule updated');
});

export const deleteSchedule = handle(async (req, res) => {
  await schedules.deleteSchedule(req.tenantId!, requester(req), req.params.id);
  successResponse(res, null, 'Schedule deleted');
});

export const runSchedule = handle(async (req, res) => {
  const result = await schedules.runScheduleNow(req.tenantId!, requester(req), req.params.id);
  successResponse(res, result, result.demo ? 'Report rendered (demo mode — email not sent)' : 'Report sent');
});

export const previewCron = handle(async (req, res) => {
  successResponse(res, await schedules.previewCron(req.tenantId!, query(req)), 'Next runs computed');
});

export const recipientOptions = handle(async (req, res) => {
  successResponse(res, await schedules.listRecipientOptions(req.tenantId!), 'Recipients retrieved');
});
