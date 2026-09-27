import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { mapSchemaError } from '../../utils/schemaMissing';
import * as service from './apiKeys.service';
import * as publicApi from './publicApi.service';
import { API_KEY_SCOPES, API_KEY_SCOPE_LABELS } from './apiKeys.logic';
import type { ListApiKeysQuery, PublicAttendanceSummaryQuery, PublicInvoicesQuery, PublicStudentsQuery } from './apiKeys.dto';

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapSchemaError(error));
  }
};

// ── Management (JWT, SUPER_ADMIN / ADMIN) ─────────────────────────────────

export const listScopes = wrap(async (_req, res) => {
  successResponse(res, API_KEY_SCOPES.map((scope) => ({ scope, label: API_KEY_SCOPE_LABELS[scope] })));
});

export const list = wrap(async (req, res) => {
  successResponse(res, await service.listApiKeys(req.tenantId!, req.query as unknown as ListApiKeysQuery));
});

export const create = wrap(async (req, res) => {
  const created = await service.createApiKey(req.tenantId!, req.user!.sub, req.body);
  successResponse(res, created, 'API key created — copy it now, it will not be shown again', 201);
});

export const revoke = wrap(async (req, res) => {
  successResponse(res, await service.revokeApiKey(req.tenantId!, req.params.id), 'API key revoked');
});

// ── Public API (API key) ──────────────────────────────────────────────────

export const publicStudents = wrap(async (req, res) => {
  successResponse(res, await publicApi.listStudents(req.tenantId!, req.query as unknown as PublicStudentsQuery));
});

export const publicAttendanceSummary = wrap(async (req, res) => {
  successResponse(res, await publicApi.attendanceSummary(req.tenantId!, req.query as unknown as PublicAttendanceSummaryQuery));
});

export const publicInvoices = wrap(async (req, res) => {
  successResponse(res, await publicApi.listInvoices(req.tenantId!, req.query as unknown as PublicInvoicesQuery));
});
