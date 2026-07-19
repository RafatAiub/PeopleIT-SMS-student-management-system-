import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { successResponse } from '../../utils/response';

// =============================================================================
// Auth Controller — thin layer, delegates all logic to auth.service.ts
// =============================================================================

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await authService.login(req.body);
    successResponse(res, result, 'Login successful', 200);
  } catch (error) {
    next(error);
  }
}

export async function refreshController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tokens = await authService.refreshToken(req.body);
    successResponse(res, tokens, 'Token refreshed');
  } catch (error) {
    next(error);
  }
}

export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.logout(req.body.refreshToken as string);
    successResponse(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
}
