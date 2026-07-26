import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ForbiddenError } from '../utils/AppError';
import { logger } from '../utils/logger';

/**
 * Middleware enforcing read-only access for support sessions.
 * Blocks POST, PUT, PATCH, DELETE operations when isSupportSession && isReadOnly.
 */
export function enforceReadOnly(req: Request, _res: Response, next: NextFunction): void {
  try {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method.toUpperCase())) {
      return next();
    }

    let isSupportSession = req.user?.isSupportSession;
    let isReadOnly = req.user?.isReadOnly;

    // If req.user is not yet attached by authMiddleware, inspect Authorization header
    if (isSupportSession === undefined && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
          if (decoded) {
            isSupportSession = decoded.isSupportSession;
            isReadOnly = decoded.isReadOnly;
          }
        } catch {
          // Token decoding errors handled by auth.middleware
        }
      }
    }

    if (isSupportSession && isReadOnly) {
      logger.warn('Support session read-only violation attempt blocked', {
        method: req.method,
        path: req.originalUrl,
      });
      throw new ForbiddenError('Support session is operating in Read-Only mode. Data modifications are prohibited.');
    }

    next();
  } catch (error) {
    next(error);
  }
}

export default enforceReadOnly;
