import type { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../utils/response';
import { cache, ctxOf, paged, previewOf, q, wrap } from './sites.controller';
import * as svc from './sites.modules.service';

// =============================================================================
// Website custom modules — thin controllers (admin: /api/v1/sites/modules,
// public: /api/v1/public/sites/:siteId/modules).
// =============================================================================

/** Route guard: SUPER_ADMIN/ADMIN or a site-listed "Website developer" (see svc.canEditModuleCode). */
export const requireModuleDeveloper = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    await svc.assertModuleDeveloper(ctxOf(req));
    next();
  } catch (error) {
    next(error);
  }
};

export const list = wrap(async (req, res) => paged(res, await svc.listModules(ctxOf(req), q(req)), req));
export const get = wrap(async (req, res) => successResponse(res, await svc.getModule(ctxOf(req), req.params.id)));
export const create = wrap(async (req, res) => successResponse(res, await svc.createModule(ctxOf(req), req.body), 'Module created', 201));
export const update = wrap(async (req, res) => successResponse(res, await svc.updateModule(ctxOf(req), req.params.id, req.body), 'Module saved'));
export const remove = wrap(async (req, res) => {
  const force = ['true', '1'].includes(String(q(req).force ?? ''));
  successResponse(res, await svc.deleteModule(ctxOf(req), req.params.id, force), 'Module deleted');
});
export const publish = wrap(async (req, res) =>
  successResponse(res, await svc.publishModule(ctxOf(req), req.params.id, req.body?.note), 'Module published'),
);
export const versions = wrap(async (req, res) => paged(res, await svc.listModuleVersions(ctxOf(req), req.params.id, q(req)), req));
export const restore = wrap(async (req, res) =>
  successResponse(res, await svc.restoreModuleVersion(ctxOf(req), req.params.id, req.params.versionId), 'Version restored to draft'),
);
export const exportOne = wrap(async (req, res) => {
  const doc = await svc.exportModule(ctxOf(req), req.params.id);
  res.setHeader('Cache-Control', 'private, no-store');
  successResponse(res, doc);
});
export const importOne = wrap(async (req, res) => successResponse(res, await svc.importModule(ctxOf(req), req.body), 'Module imported', 201));
export const validateOne = wrap(async (req, res) => successResponse(res, svc.validateModule(req.body)));

// ── Public ──────────────────────────────────────────────────────────────────

export const publicList = wrap(async (req, res) => {
  const query = q(req);
  const r = await svc.publicModules(req.params.siteId, previewOf(req), { drafts: Boolean(query.drafts), key: query.key });
  cache(res, r.preview, 120);
  successResponse(res, r);
});

export const publicVersion = wrap(async (req, res) => {
  const p = req.params as unknown as { siteId: string; key: string; version: number };
  const r = await svc.publicModuleVersion(p.siteId, p.key, Number(p.version), previewOf(req));
  cache(res, r.preview, 600);
  successResponse(res, r);
});
