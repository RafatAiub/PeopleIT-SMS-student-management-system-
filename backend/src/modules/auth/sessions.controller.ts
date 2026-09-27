import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { ForbiddenError, UnauthorizedError } from '../../utils/AppError';
import * as sessionsService from './sessions.service';

// All routes run behind `authenticate` only (no setTenant) — like the 2FA
// routes they act on the caller's own account, and SUPER_ADMIN has no tenant.

function ownUserId(req: Request): string {
  const id = req.user?.sub;
  if (!id) throw new UnauthorizedError('Authentication required');
  // A support (impersonation) session must never see or end the real user's devices.
  if (req.user?.isSupportSession) {
    throw new ForbiddenError('Session management is not available during a support session');
  }
  return id;
}

export async function listSessionsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = ownUserId(req);
    successResponse(res, await sessionsService.listSessions(userId, req.user?.sessionId));
  } catch (error) {
    next(error);
  }
}

export async function revokeSessionController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = ownUserId(req);
    await sessionsService.revokeSession(userId, req.params.id);
    successResponse(res, { revoked: 1, wasCurrent: req.params.id === req.user?.sessionId }, 'Device signed out');
  } catch (error) {
    next(error);
  }
}

export async function revokeOtherSessionsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = ownUserId(req);
    const result = await sessionsService.revokeOtherSessions(
      userId,
      req.user?.sessionId,
      (req.body as { refreshToken?: string } | undefined)?.refreshToken,
    );
    successResponse(res, result, 'Signed out of all other devices');
  } catch (error) {
    next(error);
  }
}

export async function logoutAllController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = ownUserId(req);
    successResponse(res, await sessionsService.revokeAllSessions(userId), 'Signed out everywhere');
  } catch (error) {
    next(error);
  }
}
