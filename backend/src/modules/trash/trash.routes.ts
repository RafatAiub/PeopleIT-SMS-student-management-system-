import { Router, Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { paginatedResponse, successResponse } from '../../utils/response';
import { ConflictError } from '../../utils/AppError';
import * as svc from './trash.service';
import { TRASH_TYPES } from './trash.registry';

// =============================================================================
// T5 Trash — /api/v1/trash (every school).
//   GET  /            list (type, search, page)          ADMIN
//   GET  /summary     counts per type                    ADMIN
//   POST /restore     {ids[]}  ADMIN; any staff for items they deleted (Undo)
//   POST /purge       {ids[], confirm:'DELETE'}          ADMIN only
// =============================================================================

const ListDto = z.object({
  type: z.enum(TRASH_TYPES as [string, ...string[]]).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
const IdsDto = z.object({ ids: z.array(z.string().min(1).max(60)).min(1).max(100) });
const PurgeDto = IdsDto.extend({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }) });

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const ctxOf = (req: Request): svc.TrashCtx => ({ institutionId: req.tenantId as string, userId: req.user!.sub, role: req.user!.role });

const SA = UserRole.SUPER_ADMIN;
const ADMINS = requireRole(SA, UserRole.ADMIN);
// Anyone who can delete something can undo their own delete.
const DELETERS = requireRole(SA, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.MANAGEMENT, UserRole.LIBRARIAN, UserRole.TRANSPORT_OFFICER);

export const trashRouter = Router();
trashRouter.use(authenticate, setTenant, requireTenant, auditLog);

trashRouter.get('/summary', ADMINS, wrap(async (req, res) => successResponse(res, await svc.summary(ctxOf(req)))));
trashRouter.get(
  '/',
  ADMINS,
  validate({ query: ListDto }),
  wrap(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListDto>;
    const r = await svc.listEntries(ctxOf(req), q as never);
    paginatedResponse(res, r.items, r.total, q.page, q.pageSize);
  }),
);
trashRouter.post(
  '/restore',
  DELETERS,
  validate({ body: IdsDto }),
  wrap(async (req, res) => {
    const ids: string[] = req.body.ids;
    // One item (the Undo toast): its own error status (404/403/409 conflict) reaches the UI.
    if (ids.length === 1) {
      const r = await svc.restoreEntry(ctxOf(req), ids[0]);
      return successResponse(res, { results: [{ id: r.id, ok: true }], restored: 1 }, 'Restored');
    }
    const results = await svc.bulk(ctxOf(req), ids, 'restore');
    const ok = results.filter((r) => r.ok).length;
    return successResponse(res, { results, restored: ok }, ok === results.length ? 'Restored' : `Restored ${ok} of ${results.length}`);
  }),
);
trashRouter.post(
  '/purge',
  ADMINS,
  validate({ body: PurgeDto }),
  wrap(async (req, res) => {
    const ids: string[] = req.body.ids;
    if (ids.length === 1) {
      const r = await svc.purgeEntry(ctxOf(req), ids[0]);
      if (!r.purged) throw new ConflictError(r.reason ?? 'It could not be deleted permanently');
      return successResponse(res, { results: [{ id: ids[0], ok: true }], purged: 1 }, 'Deleted permanently');
    }
    const results = await svc.bulk(ctxOf(req), ids, 'purge');
    const ok = results.filter((r) => r.ok).length;
    return successResponse(res, { results, purged: ok }, ok === results.length ? 'Deleted permanently' : `Deleted ${ok} of ${results.length}`);
  }),
);

export default trashRouter;
