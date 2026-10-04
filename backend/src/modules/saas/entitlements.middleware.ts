import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { evaluateResourceLimit, isFeatureEnabled } from './entitlements.service';
import { limitExceededMessage } from './entitlements.logic';

// =============================================================================
// Plan gating middleware. Mount AFTER authenticate + setTenant.
//
// Both fail OPEN on unexpected errors (logged): a broken entitlement lookup
// must never stop a school from taking attendance or admitting a student.
// A request without a tenant (bare SUPER_ADMIN) is never gated.
// =============================================================================

/** 402 Payment Required — distinct from 403 so the UI can offer "Upgrade". */
export class PlanRestrictionError extends AppError {
  constructor(message: string) {
    super(message, 402);
  }
}

export function requireFeature(flag: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const institutionId = req.tenantId;
    if (!institutionId) return next();
    let blocked: PlanRestrictionError | null = null;
    try {
      const feature = await isFeatureEnabled(institutionId, flag);
      if (!feature.enabled) {
        blocked = new PlanRestrictionError(`${feature.label} is not included in your current plan.`);
      }
    } catch (error) {
      logger.error('requireFeature: entitlement lookup failed — allowing request', {
        flag,
        institutionId,
        error: (error as Error).message,
      });
    }
    next(blocked ?? undefined);
  };
}

/**
 * Reject when adding `increment` units of `resource` would exceed the plan
 * limit. `increment` may be a function of the request (e.g. rows in a batch).
 */
export function checkLimit(resource: string, increment: number | ((req: Request) => number) = 1) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const institutionId = req.tenantId;
    if (!institutionId) return next();
    let blocked: PlanRestrictionError | null = null;
    try {
      const amount = typeof increment === 'function' ? increment(req) : increment;
      const result = await evaluateResourceLimit(institutionId, resource, amount);
      if (!result.allowed && result.limit !== null) {
        blocked = new PlanRestrictionError(limitExceededMessage(result.label, result.limit));
      }
    } catch (error) {
      logger.error('checkLimit: entitlement lookup failed — allowing request', {
        resource,
        institutionId,
        error: (error as Error).message,
      });
    }
    next(blocked ?? undefined);
  };
}
