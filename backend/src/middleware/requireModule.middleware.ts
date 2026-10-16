import { Request, Response, NextFunction } from 'express';
import { ModuleDisabledError } from '../utils/AppError';
import { isModuleEnabled } from '../modules/institution/modules.service';
import type { ModuleKey } from '../modules/institution/modules.registry';

// =============================================================================
// requireModule('<key>') — T0 module-switch gate. Mount AFTER authenticate +
// setTenant on EVERY route of a switchable feature.
//
// Off (school switch off, or plan lacks it) → 403 { code: 'MODULE_DISABLED' }.
// A request with no tenant (a bare SUPER_ADMIN with no institution selected)
// passes through here; the route's own requireTenant() decides what to do.
// =============================================================================

export function requireModule(key: ModuleKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const institutionId = req.tenantId;
    if (!institutionId) return next();
    try {
      if (!(await isModuleEnabled(institutionId, key))) {
        return next(new ModuleDisabledError(key));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export default requireModule;
