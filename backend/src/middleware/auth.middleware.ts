// ⚠️ APPROVAL GATE: This file requires manual security review before production deployment.
// ============================================================================
// Auth Middleware — JWT Access Token Verification
// Sets req.user from verified JWT payload.
// Throws 401 on invalid, expired, or missing tokens.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';

export interface JwtPayload {
  sub: string;        // userId
  institutionId?: string | null;
  role: string;
  email: string;
  iat?: number;
  exp?: number;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      tenantId?: string;
    }
  }
}

/**
 * Verifies the Bearer JWT access token from Authorization header.
 * Attaches decoded payload to req.user.
 * Tenant middleware must run after this.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization header missing or malformed');
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token || token.trim() === '') {
      throw new UnauthorizedError('Access token is required');
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Access token has expired');
      }
      if (jwtError instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Access token is invalid');
      }
      throw new UnauthorizedError('Token verification failed');
    }

    // Validate required fields (institutionId is optional only for SUPER_ADMIN)
    if (!decoded.sub || !decoded.role || (decoded.role !== 'SUPER_ADMIN' && !decoded.institutionId)) {
      throw new UnauthorizedError('Token payload is malformed');
    }

    req.user = decoded;

    logger.debug('Auth middleware: token verified', {
      userId: decoded.sub,
      institutionId: decoded.institutionId,
      role: decoded.role,
    });

    next();
  } catch (error) {
    next(error);
  }
}

export default authenticate;
