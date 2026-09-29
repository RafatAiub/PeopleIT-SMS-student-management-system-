import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import {
  LoginDto,
  VerifyTwoFactorDto,
  RegisterDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshDto,
  LogoutDto,
} from './auth.dto';
import {
  loginController,
  verifyTwoFactorController,
  refreshController,
  logoutController,
  registerController,
  verifyEmailController,
  resendVerificationController,
  forgotPasswordController,
  resetPasswordController,
  twoFactorStatusController,
  beginTotpSetupController,
  confirmTotpSetupController,
  enableEmailTwoFactorController,
  disableTwoFactorController,
  regenerateBackupCodesController,
} from './auth.controller';

// =============================================================================
// Auth Routes — /api/v1/auth
// =============================================================================
// Public:
//   POST /register                 self-service signup (pending approval)
//   POST /verify-email             confirm an emailed link
//   POST /resend-verification      request a fresh confirmation link
//   POST /forgot-password          request a reset link
//   POST /reset-password           set a new password from a reset link
//   POST /login                    step one — email or phone + password
//   POST /login/verify-2fa         step two — code from email / authenticator
//   POST /refresh                  rotate the access token
//   POST /logout                   revoke a refresh token
// Authenticated (Settings → Security):
//   GET  /2fa                      current status
//   POST /2fa/totp/setup           generate a secret + QR
//   POST /2fa/totp/confirm         prove a code, then switch on
//   POST /2fa/email/enable         switch on emailed codes
//   POST /2fa/disable              switch off (password required)
//   POST /2fa/backup-codes         reissue backup codes (password required)
// =============================================================================

const router = Router();

/** Re-prompting for the password is what makes these actions safe. */
const PasswordConfirmDto = z.object({
  password: z.string().min(1, 'Password is required'),
});

const CodeDto = z.object({
  code: z.string().trim().min(4, 'Enter the 6-digit code').max(20, 'Code is too long'),
});

// ── Public ───────────────────────────────────────────────────────────────────

router.post('/register', validate({ body: RegisterDto }), registerController);
router.post('/verify-email', validate({ body: VerifyEmailDto }), verifyEmailController);
router.post(
  '/resend-verification',
  validate({ body: ResendVerificationDto }),
  resendVerificationController,
);
router.post('/forgot-password', validate({ body: ForgotPasswordDto }), forgotPasswordController);
router.post('/reset-password', validate({ body: ResetPasswordDto }), resetPasswordController);

// Login — step one. Accepts an email address or a BD mobile number as
// `identifier`. Returns either a session or a 2FA challenge.
router.post('/login', validate({ body: LoginDto }), loginController);

// Login — step two, only when two-step verification is enabled.
router.post(
  '/login/verify-2fa',
  validate({ body: VerifyTwoFactorDto }),
  verifyTwoFactorController,
);

// Refresh access token — no auth required (uses refresh token)
router.post('/refresh', validate({ body: RefreshDto }), refreshController);

// Logout — revoke refresh token
router.post('/logout', validate({ body: LogoutDto }), logoutController);

// ── Authenticated: two-step verification management ──────────────────────────
// No setTenant here on purpose — these act on the caller's own account, which
// is identified by the JWT alone. SUPER_ADMIN has no institution, and would be
// rejected by the tenant middleware.

router.get('/2fa', authenticate, twoFactorStatusController);
router.post('/2fa/totp/setup', authenticate, beginTotpSetupController);
router.post(
  '/2fa/totp/confirm',
  authenticate,
  validate({ body: CodeDto }),
  confirmTotpSetupController,
);
router.post('/2fa/email/enable', authenticate, enableEmailTwoFactorController);
router.post(
  '/2fa/disable',
  authenticate,
  validate({ body: PasswordConfirmDto }),
  disableTwoFactorController,
);
router.post(
  '/2fa/backup-codes',
  authenticate,
  validate({ body: PasswordConfirmDto }),
  regenerateBackupCodesController,
);

export default router;
