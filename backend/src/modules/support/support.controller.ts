import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { mapSchemaError } from '../../utils/schemaMissing';
import * as service from './support.service';
import type { ListTicketsQuery, PlatformListTicketsQuery } from './support.dto';

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapSchemaError(error));
  }
};

const viewerOf = (req: Request): service.Viewer => ({ userId: req.user!.sub, role: req.user!.role });

// ── Tenant ─────────────────────────────────────────────────────────────────
export const list = wrap(async (req, res) => {
  successResponse(res, await service.listTenantTickets(req.tenantId!, viewerOf(req), req.query as unknown as ListTicketsQuery));
});
export const create = wrap(async (req, res) => {
  successResponse(res, await service.createTicket(req.tenantId!, viewerOf(req), req.body), 'Support ticket created', 201);
});
export const get = wrap(async (req, res) => {
  successResponse(res, await service.getTenantTicket(req.tenantId!, viewerOf(req), req.params.id));
});
export const reply = wrap(async (req, res) => {
  successResponse(res, await service.replyTenantTicket(req.tenantId!, viewerOf(req), req.params.id, req.body.body), 'Reply sent', 201);
});
export const update = wrap(async (req, res) => {
  successResponse(res, await service.updateTenantTicket(req.tenantId!, viewerOf(req), req.params.id, req.body), 'Ticket updated');
});

// ── Platform (SUPER_ADMIN) ─────────────────────────────────────────────────
export const platformList = wrap(async (req, res) => {
  successResponse(res, await service.listPlatformTickets(viewerOf(req), req.query as unknown as PlatformListTicketsQuery));
});
export const platformGet = wrap(async (req, res) => {
  successResponse(res, await service.getPlatformTicket(req.params.id));
});
export const platformReply = wrap(async (req, res) => {
  successResponse(res, await service.replyPlatformTicket(viewerOf(req), req.params.id, req.body.body), 'Reply sent', 201);
});
export const platformUpdate = wrap(async (req, res) => {
  successResponse(res, await service.updatePlatformTicket(viewerOf(req), req.params.id, req.body), 'Ticket updated');
});
export const platformAgents = wrap(async (_req, res) => {
  successResponse(res, await service.listPlatformAgents());
});
