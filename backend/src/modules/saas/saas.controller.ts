import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import * as entitlementsService from './entitlements.service';
import * as onboardingService from './onboarding.service';

function tenantOf(req: Request): string {
  if (!req.tenantId) {
    throw new ValidationError('Select an institution first (X-Institution-Id header) — this endpoint is tenant-scoped.');
  }
  return req.tenantId;
}

export async function getEntitlements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // A bare SUPER_ADMIN (no tenant selected) is never plan-gated.
    if (!req.tenantId && req.user?.role === 'SUPER_ADMIN') {
      successResponse(res, {
        plan: null,
        subscription: null,
        unlimited: true,
        configured: true,
        platform: true,
        features: {},
        limits: {},
      });
      return;
    }
    const data = await entitlementsService.getEntitlements(tenantOf(req));
    successResponse(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await onboardingService.getOnboarding(tenantOf(req)));
  } catch (error) {
    next(error);
  }
}

export async function updateOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await onboardingService.updateOnboarding(tenantOf(req), req.body), 'Onboarding updated');
  } catch (error) {
    next(error);
  }
}
