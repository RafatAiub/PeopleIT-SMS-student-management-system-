import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../utils/AppError';
import { errorResponse } from '../utils/response';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// =============================================================================
// Global Error Handler Middleware
// Must be mounted last in app.ts (after all routes).
// Maps AppError subclasses to HTTP responses.
// Never leaks stack traces in production.
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  // ── Zod validation errors ───────────────────────────────────────────────────
  if (err instanceof ZodError) {
    const formatted = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    logger.warn('Validation error', { errors: formatted, path: req.path });
    return errorResponse(res, 'Validation failed', 422, formatted);
  }

  // ── Known operational errors (AppError subclasses) ─────────────────────────
  if (err instanceof AppError && err.isOperational) {
    logger.warn(`[${err.name}] ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });

    // ValidationError carries extra error details
    if (err instanceof ValidationError) {
      return errorResponse(res, err.message, err.statusCode, err.errors);
    }

    return errorResponse(res, err.message, err.statusCode);
  }

  // ── Prisma errors ──────────────────────────────────────────────────────────
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as Error & { code?: string; meta?: { target?: string[] } };

    if (prismaErr.code === 'P2002') {
      const fields = prismaErr.meta?.target?.join(', ') ?? 'unknown field';
      logger.warn('Prisma unique constraint violation', { fields, path: req.path });
      return errorResponse(res, `Duplicate value for: ${fields}`, 409);
    }

    if (prismaErr.code === 'P2025') {
      return errorResponse(res, 'Resource not found', 404);
    }

    logger.error('Prisma error', { code: prismaErr.code, path: req.path });
    return errorResponse(res, 'Database error', 500);
  }

  // ── JWT errors ─────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Invalid or expired token', 401);
  }

  // ── Unknown/unhandled errors ───────────────────────────────────────────────
  logger.error('Unhandled error', {
    error: err.message,
    name: err.name,
    path: req.path,
    method: req.method,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Never leak stack traces in production
  const message =
    env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message;

  return errorResponse(res, message, 500);
}
