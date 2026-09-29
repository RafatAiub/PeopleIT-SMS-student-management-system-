import { Request, Response, NextFunction } from 'express';
import { paginatedResponse, successResponse } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import * as service from './campaigns.service';

// =============================================================================
// Campaign + Message Group controller — thin; all rules live in the service.
// =============================================================================

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function ctx(req: Request): { tenantId: string; actor: service.Actor } {
  // A platform SUPER_ADMIN must pick an institution (x-institution-id) first.
  if (!req.tenantId) throw new ValidationError('Select an institution first');
  return { tenantId: req.tenantId, actor: { userId: req.user!.sub, role: req.user!.role } };
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): Handler =>
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

const q = (req: Request) => req.query as unknown as { page: number; pageSize: number } & Record<string, unknown>;

// ── Campaigns ──────────────────────────────────────────────────────────────

export const getConfig = wrap(async (_req, res) => {
  successResponse(res, service.getChannelConfig());
});

export const preview = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.previewAudience(tenantId, actor, req.body));
});

export const list = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  const query = q(req);
  const { items, total } = await service.listCampaigns(tenantId, actor, query as never);
  paginatedResponse(res, items, total, query.page, query.pageSize);
});

export const get = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.getCampaign(tenantId, actor, req.params.id));
});

export const deliveries = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  const query = q(req);
  const { items, total } = await service.listDeliveries(tenantId, actor, req.params.id, query as never);
  paginatedResponse(res, items, total, query.page, query.pageSize);
});

export const create = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.createCampaign(tenantId, actor, req.body), 'Campaign draft created', 201);
});

export const update = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.updateCampaign(tenantId, actor, req.params.id, req.body), 'Campaign updated');
});

export const remove = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  await service.deleteCampaign(tenantId, actor, req.params.id);
  successResponse(res, null, 'Campaign deleted');
});

export const send = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  const result = await service.sendCampaign(tenantId, actor, req.params.id, req.body?.scheduledAt);
  const message = result.demo
    ? 'Demo mode — provider not configured; recipients counted, nothing was really sent'
    : result.scheduled
      ? 'Campaign scheduled'
      : 'Campaign is sending';
  successResponse(res, result, message, 202);
});

export const cancel = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.cancelCampaign(tenantId, actor, req.params.id), 'Campaign cancelled');
});

// ── Message groups ──────────────────────────────────────────────────────────

export const listGroups = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  const query = q(req);
  const { items, total } = await service.listGroups(tenantId, actor, query as never);
  paginatedResponse(res, items, total, query.page, query.pageSize);
});

export const memberCandidates = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  const query = q(req);
  const { items, total } = await service.listMemberCandidates(tenantId, actor, query as never);
  paginatedResponse(res, items, total, query.page, query.pageSize);
});

export const getGroup = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.getGroup(tenantId, actor, req.params.id));
});

export const createGroup = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.createGroup(tenantId, actor, req.body), 'Group created', 201);
});

export const updateGroup = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.updateGroup(tenantId, actor, req.params.id, req.body), 'Group updated');
});

export const deleteGroup = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  await service.deleteGroup(tenantId, actor, req.params.id);
  successResponse(res, null, 'Group deleted');
});

export const addMembers = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  successResponse(res, await service.addGroupMembers(tenantId, actor, req.params.id, req.body.userIds), 'Members added');
});

export const removeMember = wrap(async (req, res) => {
  const { tenantId, actor } = ctx(req);
  await service.removeGroupMember(tenantId, actor, req.params.id, req.params.userId);
  successResponse(res, null, 'Member removed');
});
