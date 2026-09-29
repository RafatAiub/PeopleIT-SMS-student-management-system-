import bcrypt from 'bcryptjs';
import { UserRole, UserStatus, VerificationPurpose } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../utils/AppError';
import { normalizeBdMobile } from '../../utils/phone';
import { classifyIdentifier } from './auth.dto';
import { hashToken, generateUrlToken } from './auth.crypto';
import { sendVerificationEmail, sendPasswordResetEmail } from './auth.mail';
import type {
  RegisterDtoType,
  VerifyEmailDtoType,
  ResendVerificationDtoType,
  ForgotPasswordDtoType,
  ResetPasswordDtoType,
} from './auth.dto';

// =============================================================================
// Registration, email verification, password reset
// =============================================================================

const EMAIL_TOKEN_TTL_MINUTES = 60 * 24; // 24h — links get opened the next day
const RESET_TOKEN_TTL_MINUTES = 60; // 1h — a live password-reset link is riskier

/**
 * Deliberately uniform response for every flow that takes an email or phone
 * from an unauthenticated caller. Telling the truth ("no such account") would
 * turn these endpoints into a membership oracle for the whole platform.
 */
const NEUTRAL_ACK =
  'If an account matches those details, we have sent an email with next steps.';

// ── Registration ─────────────────────────────────────────────────────────────

export interface RegisterResult {
  message: string;
  requiresApproval: boolean;
}

/**
 * Self-service signup against an existing institution.
 *
 * Two gates apply before the account is usable: the email must be confirmed
 * (proves the address is theirs) and an administrator must approve
 * (proves they belong at that institution). Neither substitutes for the other
 * — an institution code is not a secret, so verification alone would let
 * anyone in.
 */
export async function register(dto: RegisterDtoType): Promise<RegisterResult> {
  const institution = await prisma.institution.findUnique({
    where: { slug: dto.institutionCode },
    select: { id: true, isActive: true, name: true },
  });

  if (!institution) {
    throw new NotFoundError('We could not find an institution with that code. Please check and try again.');
  }
  if (!institution.isActive) {
    throw new ForbiddenError('That institution is not currently accepting registrations.');
  }

  const phone = normalizeBdMobile(dto.phone);

  // Email and phone are both globally unique. Reporting the conflict is
  // unavoidable — we cannot create the row — but the message stays generic
  // about *which* institution holds it.
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: dto.email }, ...(phone ? [{ phone }] : [])] },
    select: { id: true, email: true, phone: true, emailVerifiedAt: true },
  });

  if (existing) {
    if (existing.email === dto.email) {
      throw new ConflictError(
        'An account already exists with that email address. Try signing in, or reset your password.',
      );
    }
    throw new ConflictError('An account already exists with that mobile number.');
  }

  const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);
  const rawToken = generateUrlToken();

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        institutionId: institution.id,
        email: dto.email,
        phone,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        // A requested role, not a granted one — the account cannot sign in
        // until an admin approves, and they can change it then.
        role: dto.role as UserRole,
        status: UserStatus.PENDING_APPROVAL,
        isActive: true,
      },
      select: { id: true, email: true, firstName: true },
    });

    await tx.verificationToken.create({
      data: {
        userId: created.id,
        email: created.email,
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
        token: hashToken(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    });

    return created;
  });

  // Outside the transaction: a slow or failing SMTP server must not roll back
  // a valid registration. If this throws, the account exists unverified and
  // the user can request a fresh link.
  await sendVerificationEmail({
    to: user.email,
    firstName: user.firstName,
    token: rawToken,
    expiresInMinutes: EMAIL_TOKEN_TTL_MINUTES,
  });

  logger.info('User self-registered', {
    userId: user.id,
    institutionId: institution.id,
    role: dto.role,
  });

  return {
    message:
      'Check your email to confirm your address. Your account will be active once an administrator approves it.',
    requiresApproval: true,
  };
}

// ── Email verification ───────────────────────────────────────────────────────

export interface VerifyEmailResult {
  message: string;
  pendingApproval: boolean;
}

export async function verifyEmail(dto: VerifyEmailDtoType): Promise<VerifyEmailResult> {
  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(dto.token) },
    select: {
      id: true,
      userId: true,
      email: true,
      purpose: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { status: true, emailVerifiedAt: true } },
    },
  });

  if (!record || record.purpose !== VerificationPurpose.EMAIL_VERIFICATION) {
    throw new BadRequestError('That confirmation link is not valid. Please request a new one.');
  }

  // Already-verified is a success, not an error: people click the link twice,
  // and mail clients pre-fetch it. Failing here would be alarming and useless.
  if (record.consumedAt) {
    return {
      message: 'Your email address is already confirmed.',
      pendingApproval: record.user.status === UserStatus.PENDING_APPROVAL,
    };
  }

  if (record.expiresAt < new Date()) {
    throw new BadRequestError('That confirmation link has expired. Please request a new one.');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date(), email: record.email },
    }),
    prisma.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    // Any other outstanding verification links for this user are now moot.
    prisma.verificationToken.updateMany({
      where: {
        userId: record.userId,
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    }),
  ]);

  logger.info('Email verified', { userId: record.userId });

  const pendingApproval = record.user.status === UserStatus.PENDING_APPROVAL;

  return {
    message: pendingApproval
      ? 'Email confirmed. Your account is now waiting for an administrator to approve it.'
      : 'Email confirmed. You can now sign in.',
    pendingApproval,
  };
}

export async function resendVerification(dto: ResendVerificationDtoType): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({
    where: { email: dto.email },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
  });

  // Neutral acknowledgement whether or not the account exists, and whether or
  // not it is already verified — otherwise this endpoint answers "does X have
  // an account here?" for any address.
  if (!user || user.emailVerifiedAt) {
    return { message: NEUTRAL_ACK };
  }

  const rawToken = generateUrlToken();

  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: {
        userId: user.id,
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    }),
    prisma.verificationToken.create({
      data: {
        userId: user.id,
        email: user.email,
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
        token: hashToken(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  await sendVerificationEmail({
    to: user.email,
    firstName: user.firstName,
    token: rawToken,
    expiresInMinutes: EMAIL_TOKEN_TTL_MINUTES,
  });

  logger.info('Verification email resent', { userId: user.id });
  return { message: NEUTRAL_ACK };
}

// ── Password reset ───────────────────────────────────────────────────────────
// Replaces the previous dead implementation in institution.service.ts, which
// minted a token against a hard-coded localhost URL that no endpoint consumed.

export async function forgotPassword(dto: ForgotPasswordDtoType): Promise<{ message: string }> {
  const where =
    classifyIdentifier(dto.identifier) === 'phone'
      ? { phone: normalizeBdMobile(dto.identifier) ?? '\u0000no-match' }
      : { email: dto.identifier.toLowerCase() };

  const user = await prisma.user.findFirst({
    where,
    select: { id: true, email: true, firstName: true, isActive: true, status: true },
  });

  if (!user || !user.isActive || user.status !== UserStatus.ACTIVE) {
    return { message: NEUTRAL_ACK };
  }

  const rawToken = generateUrlToken();

  await prisma.$transaction([
    // One live reset link at a time — an old link left valid is an extra
    // window for anyone who gained brief mailbox access.
    prisma.verificationToken.updateMany({
      where: { userId: user.id, purpose: VerificationPurpose.PASSWORD_RESET, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.verificationToken.create({
      data: {
        userId: user.id,
        email: user.email,
        purpose: VerificationPurpose.PASSWORD_RESET,
        token: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  await sendPasswordResetEmail({
    to: user.email,
    firstName: user.firstName,
    token: rawToken,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  });

  logger.info('Password reset requested', { userId: user.id });
  return { message: NEUTRAL_ACK };
}

export async function resetPassword(dto: ResetPasswordDtoType): Promise<{ message: string }> {
  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(dto.token) },
    select: { id: true, userId: true, purpose: true, expiresAt: true, consumedAt: true },
  });

  if (!record || record.purpose !== VerificationPurpose.PASSWORD_RESET || record.consumedAt) {
    throw new BadRequestError('That reset link is not valid or has already been used.');
  }
  if (record.expiresAt < new Date()) {
    throw new BadRequestError('That reset link has expired. Please request a new one.');
  }

  const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        // Clear any lockout: someone who just proved mailbox control should
        // not be left waiting out a countdown caused by the attacker.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    // Revoke every existing session — the whole point of a reset is to evict
    // whoever might already be signed in.
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, isRevoked: false },
      data: { isRevoked: true },
    }),
  ]);

  logger.info('Password reset completed', { userId: record.userId });
  return { message: 'Your password has been changed. You can now sign in.' };
}
