import { Request, Response, NextFunction, RequestHandler } from 'express';
import * as aiService from './ai.service';
import * as analytics from './ai.analytics.service';
import * as knowledge from './ai.knowledge.service';
import { successResponse, paginatedResponse } from '../../utils/response';
import type { AiCallContext } from './ai.client';

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Wraps an async handler so errors go to next(). */
const wrap =
  (fn: Handler): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const ctxOf = (req: Request): AiCallContext => ({ institutionId: req.tenantId!, userId: req.user!.sub });
const requester = (req: Request) => ({ sub: req.user!.sub, role: req.user!.role });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (req: Request) => req.query as any;

// ── Status ──────────────────────────────────────────────────────────────────
export const getStatus = wrap(async (req, res) => {
  successResponse(res, await aiService.getStatus(req.tenantId!), 'AI status retrieved');
});

// ── 1. Comments ─────────────────────────────────────────────────────────────
export const generateComment = wrap(async (req, res) => {
  successResponse(res, await aiService.generateComment(ctxOf(req), req.body), 'AI comment generated successfully');
});

export const bulkGenerateComments = wrap(async (req, res) => {
  successResponse(res, await aiService.bulkGenerateComments(ctxOf(req), req.body), 'Comment drafts created for review', 201);
});

// ── Drafts ──────────────────────────────────────────────────────────────────
export const listDrafts = wrap(async (req, res) => {
  const query = q(req);
  const { items, total, counts } = await aiService.listDrafts(req.tenantId!, requester(req), query);
  paginatedResponse(res, items, total, query.page, query.pageSize, 'Drafts retrieved', { counts });
});

export const editDraft = wrap(async (req, res) => {
  successResponse(res, await aiService.editDraft(req.tenantId!, requester(req), req.params.id, req.body.content), 'Draft updated');
});

export const approveDraft = wrap(async (req, res) => {
  successResponse(res, await aiService.approveDraft(req.tenantId!, requester(req), req.params.id, req.body.content), 'Draft approved');
});

export const rejectDraft = wrap(async (req, res) => {
  successResponse(res, await aiService.rejectDraft(req.tenantId!, requester(req), req.params.id), 'Draft rejected');
});

// ── 2. Risk ─────────────────────────────────────────────────────────────────
export const getAcademicRiskScoring = wrap(async (req, res) => {
  const query = q(req);
  const { items, total, summary, windowDays } = await analytics.getRiskScoring(req.tenantId!, query);
  paginatedResponse(res, items, total, query.page, query.pageSize, 'Academic risk scores retrieved successfully', { summary, windowDays, demo: false });
});

export const explainRisk = wrap(async (req, res) => {
  successResponse(res, await analytics.explainRisk(ctxOf(req), req.params.studentId), 'Risk explanation generated');
});

// ── 3. Attendance patterns ──────────────────────────────────────────────────
export const getAttendancePatterns = wrap(async (req, res) => {
  const query = q(req);
  const { items, total, ...extra } = await analytics.getAttendancePatterns(ctxOf(req), query);
  paginatedResponse(res, items, total, query.page, query.pageSize, 'Attendance patterns retrieved', extra);
});

// ── 4. Fee risk ─────────────────────────────────────────────────────────────
export const getFeeRisk = wrap(async (req, res) => {
  const query = q(req);
  const { items, total, summary } = await analytics.getFeeRisk(req.tenantId!, query);
  paginatedResponse(res, items, total, query.page, query.pageSize, 'Fee risk retrieved', { summary });
});

export const draftFeeReminder = wrap(async (req, res) => {
  const result = await analytics.draftFeeReminder(ctxOf(req), req.params.studentId, req.body.language, req.body.tone);
  successResponse(res, result, 'Reminder drafted for review', 201);
});

// ── 5. Communication drafts ─────────────────────────────────────────────────
export const draftMessage = wrap(async (req, res) => {
  successResponse(res, await aiService.draftMessage(ctxOf(req), req.body), 'Message drafted for review', 201);
});

// ── 6. Dashboard ────────────────────────────────────────────────────────────
export const getDashboardInsights = wrap(async (req, res) => {
  successResponse(res, await aiService.getDashboardInsights(ctxOf(req), Boolean(q(req).refresh)), 'Dashboard insights generated successfully');
});

// ── 7. Workload ─────────────────────────────────────────────────────────────
export const getTeacherWorkload = wrap(async (req, res) => {
  const query = q(req);
  const { items, total, ...extra } = await analytics.getTeacherWorkload(ctxOf(req), query);
  paginatedResponse(res, items, total, query.page, query.pageSize, 'Teacher workload retrieved', extra);
});

// ── 8. Forecast ─────────────────────────────────────────────────────────────
export const getEnrolmentForecast = wrap(async (req, res) => {
  successResponse(res, await analytics.getEnrolmentForecast(ctxOf(req), Boolean(q(req).narrative)), 'Enrolment forecast generated');
});

// ── 9. Knowledge ────────────────────────────────────────────────────────────
export const listKnowledge = wrap(async (req, res) => {
  const query = q(req);
  const { items, total, categories } = await knowledge.listKnowledge(req.tenantId!, query);
  paginatedResponse(res, items, total, query.page, query.pageSize, 'Knowledge documents retrieved', { categories });
});

export const createKnowledge = wrap(async (req, res) => {
  successResponse(res, await knowledge.createKnowledge(req.tenantId!, req.user!.sub, req.body), 'Knowledge document created', 201);
});

export const updateKnowledge = wrap(async (req, res) => {
  successResponse(res, await knowledge.updateKnowledge(req.tenantId!, req.params.id, req.body), 'Knowledge document updated');
});

export const deleteKnowledge = wrap(async (req, res) => {
  await knowledge.deleteKnowledge(req.tenantId!, req.params.id);
  successResponse(res, null, 'Knowledge document deleted');
});

export const askKnowledge = wrap(async (req, res) => {
  successResponse(res, await knowledge.askKnowledge(ctxOf(req), req.body.question), 'Answer generated');
});

// ── 10. Guardian chat ───────────────────────────────────────────────────────
export const guardianChat = wrap(async (req, res) => {
  successResponse(res, await knowledge.guardianChat(ctxOf(req), req.body.message, req.body.studentId), 'Reply ready');
});

export const guardianReplies = wrap(async (req, res) => {
  successResponse(res, await knowledge.guardianReplies(req.tenantId!, req.user!.sub), 'Replies retrieved');
});

// ── 11. Admission assistant (public) ────────────────────────────────────────
export const admissionAssistant = wrap(async (req, res) => {
  successResponse(res, await knowledge.admissionAssistant(req.body), 'Reply ready');
});

// ── 12. Clean-up ────────────────────────────────────────────────────────────
export const getDataCleanup = wrap(async (req, res) => {
  const query = q(req);
  successResponse(res, await analytics.getDataCleanup(req.tenantId!, query.page, query.pageSize), 'Data clean-up suggestions retrieved');
});
