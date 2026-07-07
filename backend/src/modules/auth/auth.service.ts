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
} from '../../utils/AppError';
import type { LoginDtoType, RefreshDtoType } from './auth.dto';
import type { JwtPayload } from '../../middleware/auth.middleware';

// =============================================================================
// Auth Service — Login, Refresh, Logout
// =============================================================================

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

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
}

/**
 * Hash a token for storage — never store raw refresh tokens
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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

export async function login(dto: LoginDtoType): Promise<AuthResult> {
  let user: any = null;
  let institutionId: string | null = null;

  // 1. Check if institutionCode is missing (Super Admin smart login)
  if (!dto.institutionCode || dto.institutionCode.trim() === '') {
    // Look up the user directly, ensuring they have the SUPER_ADMIN role
    user = await prisma.user.findFirst({
      where: {
        email: dto.email,
        role: 'SUPER_ADMIN',
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        institutionId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Institution code is required to sign in');
    }
  } else {
    // 2. Find institution by code
    const institution = await prisma.institution.findUnique({
      where: { slug: dto.institutionCode },
      select: { id: true, isActive: true, name: true },
    });

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    if (!institution.isActive) {
      throw new ForbiddenError('Institution account is suspended');
    }

    institutionId = institution.id;

    // Find user scoped STRICTLY to this institution
    user = await prisma.user.findFirst({
      where: {
        institutionId: institution.id,
        email: dto.email,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        institutionId: true,
      },
    });
  }

  // Use a constant-time comparison path to avoid user enumeration
  const dummyHash = '$2a$12$invalidhashforsecuritypurposesonly000000000000000000000';
  const hashToCompare = user ? user.passwordHash : dummyHash;
  const passwordMatch = await bcrypt.compare(dto.password, hashToCompare);

  if (!user || !passwordMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new ForbiddenError('Your account has been deactivated');
  }

  // 3. Issue tokens
  const jwtPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    institutionId: user.institutionId,
    role: user.role,
    email: user.email,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);

  // 4. Persist hashed refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenHash,
        expiresAt,
      },
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
      institutionId: user.institutionId,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
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
