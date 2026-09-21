import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import {
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  LockedError,
  AuthRequirementError,
} from '../../utils/AppError';
import { normalizeBdMobile } from '../../utils/phone';
import { classifyIdentifier } from './auth.dto';
import {
  hashToken,
  safeEqual,
  generateNumericCode,
  normalizeBackupCode,
  decryptSecret,
  verifyTotp,
} from './auth.crypto';
import { sendTwoFactorCodeEmail } from './auth.mail';
import type { LoginDtoType, RefreshDtoType, VerifyTwoFactorDtoType } from './auth.dto';
import type { JwtPayload } from '../../middleware/auth.middleware';

// =============================================================================
// Auth Service — Login, Refresh, Logout
// =============================================================================

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Lock the account for LOCKOUT_MINUTES after MAX_FAILED_ATTEMPTS consecutive
// wrong-password attempts. We deliberately never expose a remaining-attempts
// count to the client (only the eventual lockout message) — surfacing a
// counter would let an attacker time a brute-force run around it.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    institutionId: string;
  };
  tokens: TokenPair;
  requires2FA?: false;
}

/**
 * The half-finished login handed back when 2FA is on. Carries no session
 * credentials — `challengeToken` only proves the password step was passed and
 * is useless for anything but /auth/login/verify-2fa.
 */
export interface TwoFactorChallenge {
  requires2FA: true;
  method: 'EMAIL' | 'TOTP';
  challengeToken: string;
  expiresInSeconds: number;
  /** Masked, so the UI can say where the code went without exposing the address. */
  sentTo?: string;
}

export type LoginOutcome = AuthResult | TwoFactorChallenge;

// A 6-digit code has a million possibilities; capping attempts is what makes
// that enough. Five tries per code, then the code is dead and a new one is
// required — the login rate limiter caps how fast new ones can be requested.
const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MINUTES = 5;

/**
 * Issue a JWT access token
 */
function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
  });
}

/**
 * Issue an opaque refresh token (random, hashed before storage)
 */
function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

// ── Login ──────────────────────────────────────────────────────────────────────

// Every field login needs. Kept as one constant so the two lookup paths below
// cannot drift apart and silently omit, say, twoFactorEnabled.
const LOGIN_SELECT = {
  id: true,
  email: true,
  phone: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  status: true,
  institutionId: true,
  emailVerifiedAt: true,
  twoFactorEnabled: true,
  twoFactorMethod: true,
  failedLoginAttempts: true,
  lockedUntil: true,
} as const;

/**
 * Turn the submitted identifier into a Prisma `where` fragment.
 *
 * Email and phone are both globally unique, so the identifier alone is enough
 * to find the account — the institution code is a *constraint* on the result,
 * not part of the lookup. A phone number that does not normalise yields an
 * unmatchable clause rather than an error, keeping the response identical to
 * "no such user" and giving away nothing.
 */
function identifierWhere(identifier: string): { email: string } | { phone: string } {
  if (classifyIdentifier(identifier) === 'phone') {
    return { phone: normalizeBdMobile(identifier) ?? '\u0000no-match' };
  }
  return { email: identifier.trim().toLowerCase() };
}

export async function login(dto: LoginDtoType): Promise<LoginOutcome> {
  const where = identifierWhere(dto.identifier);
  const hasCode = Boolean(dto.institutionCode && dto.institutionCode.trim() !== '');

  let institution: { id: string; isActive: boolean; name: string } | null = null;

  if (hasCode) {
    institution = await prisma.institution.findUnique({
      where: { slug: dto.institutionCode!.trim() },
      select: { id: true, isActive: true, name: true },
    });

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }
    if (!institution.isActive) {
      throw new ForbiddenError('Institution account is suspended');
    }
  }

  // One lookup either way. When a code was supplied it narrows the query, so a
  // right-password/wrong-institution attempt fails exactly like a wrong
  // password rather than confirming the account exists elsewhere.
  const user = await prisma.user.findFirst({
    where: institution ? { ...where, institutionId: institution.id } : where,
    select: LOGIN_SELECT,
  });

  // Reject before the password check if this account is already locked out,
  // so a locked user gets an immediate, clear countdown instead of another
  // "invalid password" attempt burning against nothing.
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    const minutesLeft = Math.ceil(retryAfterSeconds / 60);
    throw new LockedError(
      `Too many failed login attempts. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
      retryAfterSeconds,
    );
  }

  // Use a constant-time comparison path to avoid user enumeration
  const dummyHash = '$2a$12$invalidhashforsecuritypurposesonly000000000000000000000';
  const hashToCompare = user ? user.passwordHash : dummyHash;
  const passwordMatch = await bcrypt.compare(dto.password, hashToCompare);

  if (!user || !passwordMatch) {
    // Only a known user can accrue lockout state — this mirrors the existing
    // enumeration-safe design (unknown emails never touch the database again).
    if (user) {
      const attempts = user.failedLoginAttempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil },
        });
        throw new LockedError(
          `Too many failed login attempts. Please try again in ${LOCKOUT_MINUTES} minutes.`,
          LOCKOUT_MINUTES * 60,
        );
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts },
      });
    }
    // Message stays "email or password" shaped but covers both identifiers.
    throw new UnauthorizedError('Invalid credentials');
  }

  // Password was correct — from here the account definitely exists, so the
  // remaining checks can be specific without leaking anything new.
  assertAccountUsable(user);

  // Successful login — clear any accrued failed-attempt state.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  // Two-step verification: stop here and hand back a challenge instead of
  // tokens. Nothing that authenticates the session is issued until the second
  // factor is proven.
  if (user.twoFactorEnabled && user.twoFactorMethod) {
    return startTwoFactorChallenge(user);
  }

  return issueSession(user);
}

/**
 * Gate checks that run only after the password has been verified.
 * Ordered most-actionable first: a user who is both unapproved and unverified
 * is told about approval, because verifying their email would not let them in.
 */
function assertAccountUsable(user: { status: string; isActive: boolean; emailVerifiedAt: Date | null; email: string }): void {
  if (user.status === 'PENDING_APPROVAL') {
    throw new AuthRequirementError(
      'ACCOUNT_PENDING_APPROVAL',
      'Your account is waiting for an administrator to approve it. You will be emailed once it is active.',
    );
  }
  if (user.status === 'REJECTED') {
    throw new AuthRequirementError(
      'ACCOUNT_REJECTED',
      'Your registration was not approved. Please contact your institution.',
    );
  }
  if (user.status === 'SUSPENDED' || !user.isActive) {
    throw new AuthRequirementError(
      'ACCOUNT_SUSPENDED',
      'Your account has been deactivated. Please contact your institution.',
    );
  }
  if (!user.emailVerifiedAt) {
    // `email` is echoed back so the sign-in page can offer "resend to <addr>"
    // without a second round-trip. Safe: they just proved they own the account.
    throw new AuthRequirementError(
      'EMAIL_NOT_VERIFIED',
      'Please confirm your email address before signing in. Check your inbox for the confirmation link.',
      { email: user.email },
    );
  }
}

/** Mint the access + refresh pair and record the login. */
async function issueSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  institutionId: string | null;
}): Promise<AuthResult> {
  const jwtPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    institutionId: user.institutionId,
    role: user.role,
    email: user.email,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.$transaction([
    prisma.refreshToken.create({
      data: { userId: user.id, token: refreshTokenHash, expiresAt },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  logger.info('User logged in', { userId: user.id, institutionId: user.institutionId });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      institutionId: user.institutionId as string,
    },
    tokens: { accessToken, refreshToken },
  };
}

// ── Two-step verification ─────────────────────────────────────────────────────

/**
 * Signed with JWT_REFRESH_SECRET rather than the access secret — deliberate
 * domain separation. `authenticate` only ever verifies against
 * JWT_ACCESS_SECRET, so a challenge token can never be replayed as a session
 * token even if the purpose claim were somehow ignored.
 */
interface MfaChallengePayload {
  sub: string;
  purpose: 'MFA_CHALLENGE';
}

function signChallengeToken(userId: string): string {
  const payload: MfaChallengePayload = { sub: userId, purpose: 'MFA_CHALLENGE' };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.MFA_CHALLENGE_EXPIRES_IN as any,
  });
}

function verifyChallengeToken(token: string): string {
  let decoded: MfaChallengePayload;
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as MfaChallengePayload;
  } catch {
    throw new UnauthorizedError('Your sign-in session expired. Please sign in again.');
  }
  if (decoded.purpose !== 'MFA_CHALLENGE' || !decoded.sub) {
    throw new UnauthorizedError('Invalid sign-in session');
  }
  return decoded.sub;
}

/** `ha****@example.com` — enough to recognise, not enough to harvest. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '****';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

async function startTwoFactorChallenge(user: {
  id: string;
  email: string;
  firstName: string;
  twoFactorMethod: string | null;
}): Promise<TwoFactorChallenge> {
  const method = user.twoFactorMethod === 'TOTP' ? 'TOTP' : 'EMAIL';
  const challengeToken = signChallengeToken(user.id);
  const expiresInSeconds = OTP_TTL_MINUTES * 60;

  if (method === 'TOTP') {
    // Nothing to send — the code is generated on the user's own device.
    logger.info('2FA challenge issued (TOTP)', { userId: user.id });
    return { requires2FA: true, method, challengeToken, expiresInSeconds };
  }

  const code = generateNumericCode(6);

  // Retire any outstanding codes first: leaving several live at once would
  // multiply the guessing surface for the same attempt budget.
  await prisma.$transaction([
    prisma.otpCode.updateMany({
      where: { userId: user.id, purpose: 'LOGIN_2FA', consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.otpCode.create({
      data: {
        userId: user.id,
        purpose: 'LOGIN_2FA',
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  await sendTwoFactorCodeEmail({
    to: user.email,
    firstName: user.firstName,
    code,
    expiresInMinutes: OTP_TTL_MINUTES,
  });

  logger.info('2FA challenge issued (EMAIL)', { userId: user.id });

  return {
    requires2FA: true,
    method,
    challengeToken,
    expiresInSeconds,
    sentTo: maskEmail(user.email),
  };
}

/**
 * Second step of login: exchange a challenge token plus a code for a session.
 * Accepts an emailed OTP, a TOTP code, or a one-time backup code.
 */
export async function verifyTwoFactor(dto: VerifyTwoFactorDtoType): Promise<AuthResult> {
  const userId = verifyChallengeToken(dto.challengeToken);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: LOGIN_SELECT,
  });

  if (!user || !user.twoFactorEnabled) {
    throw new UnauthorizedError('Invalid sign-in session');
  }

  // Re-check the gates: an admin may have suspended the account during the
  // few minutes between the password step and this one.
  assertAccountUsable(user);

  const code = dto.code.trim();
  const accepted =
    (await tryBackupCode(user.id, code)) ||
    (user.twoFactorMethod === 'TOTP'
      ? await tryTotpCode(user.id, code)
      : await tryEmailOtp(user.id, code));

  if (!accepted) {
    logger.warn('2FA verification failed', { userId: user.id, method: user.twoFactorMethod });
    throw new UnauthorizedError('That code is not valid or has expired. Please try again.');
  }

  logger.info('2FA verification succeeded', { userId: user.id, method: user.twoFactorMethod });
  return issueSession(user);
}

async function tryEmailOtp(userId: string, code: string): Promise<boolean> {
  const otp = await prisma.otpCode.findFirst({
    where: { userId, purpose: 'LOGIN_2FA', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) return false;

  if (otp.expiresAt < new Date() || otp.attempts >= MAX_OTP_ATTEMPTS) {
    // Burn it so a stale or exhausted code cannot be retried later.
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    return false;
  }

  if (!safeEqual(otp.codeHash, hashToken(code))) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: otp.attempts + 1 } });
    return false;
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return true;
}

async function tryTotpCode(userId: string, code: string): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true },
  });
  if (!row?.twoFactorSecret) return false;

  try {
    return verifyTotp(decryptSecret(row.twoFactorSecret), code);
  } catch (error) {
    // A secret that will not decrypt means ENCRYPTION_KEY changed under us.
    // Log loudly: every TOTP user is locked out until it is restored.
    logger.error('Could not decrypt TOTP secret — check ENCRYPTION_KEY', { userId });
    return false;
  }
}

/**
 * Backup codes are tried first on every attempt, and their format (8 chars
 * from a letter-heavy alphabet) cannot collide with a 6-digit OTP or TOTP.
 */
async function tryBackupCode(userId: string, code: string): Promise<boolean> {
  const normalized = normalizeBackupCode(code);
  if (normalized.length !== 8) return false;

  const candidate = await prisma.backupCode.findFirst({
    where: { userId, usedAt: null, codeHash: hashToken(normalized) },
  });
  if (!candidate) return false;

  await prisma.backupCode.update({ where: { id: candidate.id }, data: { usedAt: new Date() } });
  logger.warn('Backup code consumed for sign-in', { userId });
  return true;
}

// ── Refresh Token ──────────────────────────────────────────────────────────────

export async function refreshToken(dto: RefreshDtoType): Promise<TokenPair> {
  const tokenHash = hashToken(dto.refreshToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { token: tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      isRevoked: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          institutionId: true,
          isActive: true,
        },
      },
    },
  });

  if (!stored || stored.isRevoked) {
    throw new UnauthorizedError('Invalid or revoked refresh token');
  }

  if (stored.expiresAt < new Date()) {
    // Cleanup expired token
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw new UnauthorizedError('Refresh token has expired');
  }

  if (!stored.user.isActive) {
    throw new ForbiddenError('Account has been deactivated');
  }

  // Rotate refresh token (revoke old, issue new)
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 7);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    }),
    prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        token: newRefreshTokenHash,
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  const jwtPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: stored.user.id,
    institutionId: stored.user.institutionId,
    role: stored.user.role,
    email: stored.user.email,
  };

  const accessToken = signAccessToken(jwtPayload);

  logger.info('Token refreshed', { userId: stored.userId });

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(refreshTokenValue: string): Promise<void> {
  const tokenHash = hashToken(refreshTokenValue);

  const stored = await prisma.refreshToken.findUnique({
    where: { token: tokenHash },
    select: { id: true },
  });

  if (stored) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });
    logger.info('Refresh token revoked on logout');
  }
  // Silently succeed even if token not found (idempotent)
}
