import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, ValidationError, LockedError } from '../utils/AppError';
import { errorResponse } from '../utils/response';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// Postgres SQLSTATE codes for a foreign-key constraint blocking the query —
// 23503 is the general "foreign_key_violation", 23001 is specifically
// "restrict_violation" (an ON DELETE RESTRICT relation, e.g. deleting an
// IdCardTemplate that still has IdCard rows pointing at it).
const FK_VIOLATION_SQLSTATES = ['23503', '23001'];

// =============================================================================
// Global Error Handler Middleware
// Must be mounted last in app.ts (after all routes).
// Maps AppError subclasses to HTTP responses.
// Never leaks stack traces in production.
// =============================================================================

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

    // LockedError carries a retry countdown for the client to render
    if (err instanceof LockedError) {
      return errorResponse(res, err.message, err.statusCode, { retryAfterSeconds: err.retryAfterSeconds });
    }

    return errorResponse(res, err.message, err.statusCode);
  }

  // ── Prisma errors ──────────────────────────────────────────────────────────
  // instanceof against Prisma's own error classes (not a string compare on
  // err.name) — deleteMany() in particular doesn't always get wrapped as a
  // clean PrismaClientKnownRequestError the way delete() does; a
  // FK-constraint violation from it can surface as PrismaClientUnknownRequestError
  // instead, whose .message is the raw query-engine/Postgres error text
  // (including internal file paths) — that must never reach the client.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'unknown field';
      logger.warn('Prisma unique constraint violation', { fields, path: req.path });
      return errorResponse(res, `Duplicate value for: ${fields}`, 409);
    }

    if (err.code === 'P2025') {
      return errorResponse(res, 'Resource not found', 404);
    }

    if (err.code === 'P2003') {
      logger.warn('Prisma foreign key constraint violation', { path: req.path });
      return errorResponse(
        res,
        'This item is linked to other records and cannot be deleted. Remove the related records first, or contact support.',
        409,
      );
    }

    logger.error('Prisma error', { code: err.code, path: req.path });
    return errorResponse(res, 'Database error', 500);
  }

  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    if (FK_VIOLATION_SQLSTATES.some((sqlstate) => err.message.includes(sqlstate))) {
      logger.warn('Prisma foreign key constraint violation (unclassified)', { path: req.path });
      return errorResponse(
        res,
        'This item is linked to other records and cannot be deleted. Remove the related records first, or contact support.',
        409,
      );
    }

    logger.error('Unclassified Prisma error', { path: req.path });
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
