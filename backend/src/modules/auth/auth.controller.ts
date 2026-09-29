import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import * as registrationService from './auth.registration.service';
import * as twoFactorService from './auth.twofactor.service';
import { successResponse } from '../../utils/response';
import { UnauthorizedError } from '../../utils/AppError';

/** Every 2FA-management route runs behind `authenticate`, so this is set. */
function currentUserId(req: Request): string {
  const id = req.user?.sub;
  if (!id) throw new UnauthorizedError('Authentication required');
  return id;
}

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

    // Two outcomes share this endpoint: a completed login, or a 2FA challenge
    // carrying no session credentials. Both are 200 — the challenge is a
    // successful password step, not a failure — so the client branches on
    // `requires2FA` rather than on the status code.
    if ('requires2FA' in result && result.requires2FA) {
      successResponse(res, result, 'Enter your verification code to continue', 200);
      return;
    }

    successResponse(res, result, 'Login successful', 200);
  } catch (error) {
    next(error);
  }
}

export async function verifyTwoFactorController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await authService.verifyTwoFactor(req.body);
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

// ── Registration, verification, password reset ───────────────────────────────

export async function registerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await registrationService.register(req.body);
    successResponse(res, result, result.message, 201);
  } catch (error) {
    next(error);
  }
}

export async function verifyEmailController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await registrationService.verifyEmail(req.body);
    successResponse(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

export async function resendVerificationController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await registrationService.resendVerification(req.body);
    successResponse(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

export async function forgotPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await registrationService.forgotPassword(req.body);
    successResponse(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await registrationService.resetPassword(req.body);
    successResponse(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

// ── Two-step verification management ─────────────────────────────────────────

export async function twoFactorStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status = await twoFactorService.getStatus(currentUserId(req));
    successResponse(res, status, 'Two-step verification status');
  } catch (error) {
    next(error);
  }
}

export async function beginTotpSetupController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const setup = await twoFactorService.beginTotpSetup(currentUserId(req));
    successResponse(res, setup, 'Scan the QR code with your authenticator app');
  } catch (error) {
    next(error);
  }
}

export async function confirmTotpSetupController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await twoFactorService.confirmTotpSetup(
      currentUserId(req),
      req.body.code as string,
    );
    successResponse(res, result, 'Two-step verification is now on. Save your backup codes.');
  } catch (error) {
    next(error);
  }
}

export async function enableEmailTwoFactorController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await twoFactorService.enableEmailTwoFactor(currentUserId(req));
    successResponse(res, result, 'Two-step verification is now on. Save your backup codes.');
  } catch (error) {
    next(error);
  }
}

export async function disableTwoFactorController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await twoFactorService.disable(currentUserId(req), req.body.password as string);
    successResponse(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

export async function regenerateBackupCodesController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await twoFactorService.regenerateBackupCodes(
      currentUserId(req),
      req.body.password as string,
    );
    successResponse(res, result, 'New backup codes issued. Your previous codes no longer work.');
  } catch (error) {
    next(error);
  }
}
