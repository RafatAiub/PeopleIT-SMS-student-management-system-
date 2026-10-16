import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { successResponse } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import { getModules, toModulesResponse, updateModules } from './modules.service';

// =============================================================================
// GET /api/v1/institution/modules  any signed-in user of the school (gating)
// PUT /api/v1/institution/modules  ADMIN, SUPER_ADMIN — { modules: { key: bool } }
// Key validation (unknown key, plan entitlement) happens in the service so
// the registry stays the only list of keys.
// =============================================================================

export const UpdateModulesDto = z.object({
  modules: z
    .record(z.string().max(64), z.boolean())
    .refine((m) => Object.keys(m).length > 0, { message: 'Nothing to update' }),
});

function tenantOf(req: Request): string {
  if (!req.tenantId) throw new ValidationError('Select an institution first — module switches are per school.');
  return req.tenantId;
}

export async function getModulesController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, toModulesResponse(await getModules(tenantOf(req))));
  } catch (error) {
    next(error);
  }
}

export async function updateModulesController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const modules = await updateModules(tenantOf(req), req.body.modules, { userId: req.user!.sub, role: req.user!.role });
    successResponse(res, toModulesResponse(modules), 'Modules updated');
  } catch (error) {
    next(error);
  }
}
