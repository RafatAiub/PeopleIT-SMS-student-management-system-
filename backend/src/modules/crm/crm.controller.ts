import { Request, Response, NextFunction } from 'express';
import { paginatedResponse, successResponse } from '../../utils/response';
import * as svc from './crm.service';
import { saveStages } from './crm.stages';
import { moveToStage } from '../enquiries/enquiries.service';

// =============================================================================
// T4 Admissions CRM controllers — thin: parse, call the service, respond.
// =============================================================================

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const ctxOf = (req: Request): svc.CrmCtx => ({ institutionId: req.tenantId as string, userId: req.user!.sub, role: req.user!.role });
const q = (req: Request) => req.query as any;

// Stages & board
export const listStages = wrap(async (req, res) => successResponse(res, await svc.getStagesWithCounts(ctxOf(req).institutionId)));
export const putStages = wrap(async (req, res) => {
  await saveStages(ctxOf(req).institutionId, req.body);
  successResponse(res, await svc.getStagesWithCounts(ctxOf(req).institutionId), 'Pipeline saved');
});
export const board = wrap(async (req, res) => successResponse(res, await svc.getBoard(ctxOf(req), q(req))));
export const filterOptions = wrap(async (req, res) => successResponse(res, await svc.getFilterOptions(ctxOf(req).institutionId)));
export const moveStage = wrap(async (req, res) =>
  successResponse(res, await moveToStage(ctxOf(req).institutionId, req.params.id, req.body, { userId: ctxOf(req).userId }), 'Stage updated'),
);

// Timeline
export const timeline = wrap(async (req, res) => successResponse(res, await svc.getTimeline(ctxOf(req), req.params.id)));
export const addActivity = wrap(async (req, res) => successResponse(res, await svc.addActivity(ctxOf(req), req.params.id, req.body), 'Activity logged', 201));

// Tasks
export const listTasks = wrap(async (req, res) => {
  const r = await svc.listTasks(ctxOf(req), q(req));
  paginatedResponse(res, r.items, r.total, q(req).page, q(req).pageSize);
});
export const taskSummary = wrap(async (req, res) => successResponse(res, await svc.taskSummary(ctxOf(req))));
export const createTask = wrap(async (req, res) => successResponse(res, await svc.createTask(ctxOf(req), req.body), 'Task added', 201));
export const updateTask = wrap(async (req, res) => successResponse(res, await svc.updateTask(ctxOf(req), req.params.id, req.body), 'Task saved'));
export const deleteTask = wrap(async (req, res) => {
  await svc.deleteTask(ctxOf(req), req.params.id);
  successResponse(res, null, 'Task deleted');
});

// Contacts
export const listContacts = wrap(async (req, res) => {
  const r = await svc.listContacts(ctxOf(req), q(req));
  res.status(200).json({
    success: true,
    message: 'Success',
    data: r.items,
    meta: {
      total: r.total,
      page: q(req).page,
      pageSize: q(req).pageSize,
      totalPages: Math.ceil(r.total / q(req).pageSize),
      hasNext: q(req).page * q(req).pageSize < r.total,
      hasPrev: q(req).page > 1,
      donationsEnabled: r.donationsEnabled,
    },
  });
});
export const contactTags = wrap(async (req, res) => successResponse(res, await svc.contactTags(ctxOf(req).institutionId)));
export const createContact = wrap(async (req, res) => successResponse(res, await svc.createContact(ctxOf(req), req.body), 'Contact added', 201));
export const updateContact = wrap(async (req, res) => successResponse(res, await svc.updateContact(ctxOf(req), req.params.id, req.body), 'Contact saved'));
export const deleteContact = wrap(async (req, res) => {
  await svc.deleteContact(ctxOf(req), req.params.id);
  successResponse(res, null, 'Contact deleted');
});
export const linkDonor = wrap(async (req, res) => successResponse(res, await svc.linkContactToDonor(ctxOf(req), req.params.id), 'Linked to donor'));

// Duplicates & merge
export const duplicateGroups = wrap(async (req, res) => successResponse(res, await svc.listDuplicateGroups(ctxOf(req))));
export const duplicateCheck = wrap(async (req, res) => successResponse(res, await svc.checkDuplicates(ctxOf(req), req.body)));
export const merge = wrap(async (req, res) => successResponse(res, await svc.mergeEnquiries(ctxOf(req), req.body.keepId, req.body.dropId), 'Enquiries merged'));

// Report
export const report = wrap(async (req, res) => successResponse(res, await svc.getReport(ctxOf(req), q(req))));
export const reportCsv = wrap(async (req, res) => {
  const csv = await svc.reportCsv(ctxOf(req), q(req));
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="admissions-conversion-${q(req).groupBy}-${stamp}.csv"`);
  // BOM so Excel opens Bangla names correctly.
  res.send(`\uFEFF${csv}`);
});
