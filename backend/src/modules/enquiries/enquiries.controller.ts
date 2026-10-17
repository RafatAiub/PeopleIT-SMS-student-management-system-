import { Request, Response, NextFunction } from 'express';
import { paginatedResponse, successResponse } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import * as service from './enquiries.service';

// =============================================================================
// Admission Enquiry controller
// =============================================================================

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): Handler =>
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const actor = (req: Request) => ({ userId: req.user?.sub ?? null });

function tenant(req: Request): string {
  if (!req.tenantId) throw new ValidationError('Select an institution first');
  return req.tenantId;
}

export const list = wrap(async (req, res) => {
  const query = req.query as never as { page: number; pageSize: number };
  const { items, total } = await service.listEnquiries(tenant(req), query as never, actor(req));
  paginatedResponse(res, items, total, query.page, query.pageSize);
});

export const board = wrap(async (req, res) => {
  successResponse(res, await service.getBoard(tenant(req), req.query as never));
});

export const funnel = wrap(async (req, res) => {
  successResponse(res, await service.getFunnel(tenant(req), req.query as never));
});

export const assignees = wrap(async (req, res) => {
  successResponse(res, await service.listAssignees(tenant(req)));
});

export const get = wrap(async (req, res) => {
  successResponse(res, await service.getEnquiry(tenant(req), req.params.id));
});

export const create = wrap(async (req, res) => {
  successResponse(res, await service.createEnquiry(tenant(req), req.body, actor(req)), 'Enquiry created', 201);
});

export const update = wrap(async (req, res) => {
  successResponse(res, await service.updateEnquiry(tenant(req), req.params.id, req.body, actor(req)), 'Enquiry updated');
});

export const updateStatus = wrap(async (req, res) => {
  const { status, note } = req.body as { status: string; note?: string };
  successResponse(res, await service.updateStatus(tenant(req), req.params.id, status, note, actor(req)), 'Status updated');
});

export const remove = wrap(async (req, res) => {
  const trash = await service.deleteEnquiry(tenant(req), req.params.id, { userId: req.user?.sub ?? null, role: req.user?.role });
  successResponse(res, { trash }, 'Enquiry moved to trash');
});

export const convert = wrap(async (req, res) => {
  successResponse(
    res,
    await service.convertToApplication(tenant(req), req.params.id, req.body, actor(req)),
    'Enquiry converted to an online application',
    201,
  );
});

// ── Public ──────────────────────────────────────────────────────────────────

export const publicCapture = wrap(async (req, res) => {
  successResponse(res, await service.capturePublicEnquiry(req.body), 'Thank you — the school will contact you soon', 201);
});

export const publicApplicationStatus = wrap(async (req, res) => {
  successResponse(res, await service.getApplicationStatus(req.query as never));
});
