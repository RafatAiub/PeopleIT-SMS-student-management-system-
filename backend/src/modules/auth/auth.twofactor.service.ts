import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { TwoFactorMethod } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError, BadRequestError, UnauthorizedError } from '../../utils/AppError';
import {
  hashToken,
  generateTotpSecret,
  buildTotpUri,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  generateBackupCode,
  normalizeBackupCode,
} from './auth.crypto';

// =============================================================================
// Two-step verification — enrolment and management (Settings → Security)
// =============================================================================
// Enrolment is deliberately two-phase for TOTP: the secret is generated and
// stored, but twoFactorEnabled stays false until the user proves their
// authenticator app produces a matching code. Enabling on an unconfirmed
// secret is the single most common way people lock themselves out.

const BACKUP_CODE_COUNT = 10;

export interface TwoFactorStatus {
  enabled: boolean;
  method: TwoFactorMethod | null;
  /** True when a TOTP secret exists but has not been confirmed yet. */
  pendingSetup: boolean;
  backupCodesRemaining: number;
}

export async function getStatus(userId: string): Promise<TwoFactorStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorMethod: true,
      twoFactorSecret: true,
      twoFactorVerifiedAt: true,
    },
  });
  if (!user) throw new NotFoundError('User not found');

  const backupCodesRemaining = await prisma.backupCode.count({
    where: { userId, usedAt: null },
  });

  return {
    enabled: user.twoFactorEnabled,
    method: user.twoFactorMethod,
    pendingSetup: Boolean(user.twoFactorSecret) && !user.twoFactorEnabled,
    backupCodesRemaining,
  };
}

// ── TOTP enrolment ───────────────────────────────────────────────────────────

export interface TotpSetup {
  /** Data-URI PNG for the <img> tag. */
  qrCodeDataUrl: string;
  /** The same secret in text form, for users who cannot scan. */
  manualEntryKey: string;
  otpauthUri: string;
}

/**
 * Phase one: mint a secret and render the QR. Nothing is enabled yet, and
 * calling this again simply replaces an unconfirmed secret — so a user who
 * abandons setup halfway can start over cleanly.
 */
export async function beginTotpSetup(userId: string): Promise<TotpSetup> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorEnabled: true, twoFactorMethod: true },
  });
  if (!user) throw new NotFoundError('User not found');

  if (user.twoFactorEnabled && user.twoFactorMethod === TwoFactorMethod.TOTP) {
    throw new BadRequestError(
      'Google Authenticator is already set up. Turn it off first if you want to use a different device.',
    );
  }

  const secret = generateTotpSecret();
  const otpauthUri = buildTotpUri(secret, user.email);

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encryptSecret(secret), twoFactorVerifiedAt: null },
  });

  logger.info('TOTP setup started', { userId });

  return {
    qrCodeDataUrl: await QRCode.toDataURL(otpauthUri, { width: 240, margin: 1 }),
    manualEntryKey: secret,
    otpauthUri,
  };
}

export interface EnableResult {
  /** Shown exactly once — only hashes are kept. */
  backupCodes: string[];
  method: TwoFactorMethod;
}

/**
 * Phase two: the user types a code from their app. Only on success does 2FA
 * actually switch on, and only then are backup codes issued.
 */
export async function confirmTotpSetup(userId: string, code: string): Promise<EnableResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true },
  });

  if (!user?.twoFactorSecret) {
    throw new BadRequestError('Start the Google Authenticator setup again — no pending setup was found.');
  }

  let secret: string;
  try {
    secret = decryptSecret(user.twoFactorSecret);
  } catch {
    logger.error('Could not decrypt pending TOTP secret — check ENCRYPTION_KEY', { userId });
    throw new BadRequestError('Setup could not be completed. Please start again.');
  }

  if (!verifyTotp(secret, code)) {
    throw new BadRequestError(
      'That code did not match. Check your authenticator app and make sure your phone clock is correct.',
    );
  }

  const backupCodes = await enable(userId, TwoFactorMethod.TOTP);
  logger.info('TOTP enabled', { userId });
  return { backupCodes, method: TwoFactorMethod.TOTP };
}

// ── Email-code enrolment ─────────────────────────────────────────────────────

/**
 * No confirmation round-trip needed: the codes go to an address the account
 * has already verified, so there is no device to get wrong.
 */
export async function enableEmailTwoFactor(userId: string): Promise<EnableResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  });
  if (!user) throw new NotFoundError('User not found');

  if (!user.emailVerifiedAt) {
    throw new BadRequestError('Confirm your email address before turning on email two-step verification.');
  }

  const backupCodes = await enable(userId, TwoFactorMethod.EMAIL);
  logger.info('Email 2FA enabled', { userId });
  return { backupCodes, method: TwoFactorMethod.EMAIL };
}

// ── Shared enable / disable ──────────────────────────────────────────────────

async function enable(userId: string, method: TwoFactorMethod): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorMethod: method,
        twoFactorVerifiedAt: new Date(),
        // Switching to email clears any TOTP seed — a stale secret would keep
        // an old authenticator app working after the user thought they moved.
        ...(method === TwoFactorMethod.EMAIL ? { twoFactorSecret: null } : {}),
      },
    }),
    // Replace rather than append: re-enrolling invalidates the old printout.
    prisma.backupCode.deleteMany({ where: { userId } }),
    prisma.backupCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashToken(normalizeBackupCode(code)) })),
    }),
  ]);

  return codes;
}

/**
 * Turning 2FA off requires the current password. Without it, a borrowed
 * unlocked laptop is enough to strip the second factor — which would make the
 * whole feature decorative.
 */
export async function disable(userId: string, password: string): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, twoFactorEnabled: true },
  });
  if (!user) throw new NotFoundError('User not found');

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new UnauthorizedError('That password is not correct.');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorMethod: null,
        twoFactorSecret: null,
        twoFactorVerifiedAt: null,
      },
    }),
    prisma.backupCode.deleteMany({ where: { userId } }),
    prisma.otpCode.updateMany({
      where: { userId, purpose: 'LOGIN_2FA', consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);

  logger.warn('Two-step verification disabled', { userId });
  return { message: 'Two-step verification has been turned off.' };
}

/** Issue a fresh set, invalidating the old one. Password-gated for the same reason. */
export async function regenerateBackupCodes(
  userId: string,
  password: string,
): Promise<{ backupCodes: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, twoFactorEnabled: true },
  });
  if (!user) throw new NotFoundError('User not found');

  if (!user.twoFactorEnabled) {
    throw new BadRequestError('Two-step verification is not turned on.');
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new UnauthorizedError('That password is not correct.');
  }

  const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);

  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId } }),
    prisma.backupCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashToken(normalizeBackupCode(code)) })),
    }),
  ]);

  logger.info('Backup codes regenerated', { userId });
  return { backupCodes: codes };
}
