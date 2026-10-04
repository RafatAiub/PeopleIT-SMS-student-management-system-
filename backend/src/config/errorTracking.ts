import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../utils/logger';

// =============================================================================
// Optional error tracking (Sentry). A strict NO-OP unless SENTRY_DSN is set.
//
// `@sentry/node` is NOT a dependency. To enable:
//   1. npm install @sentry/node --workspace=backend
//   2. set SENTRY_DSN (and optionally SENTRY_ENVIRONMENT, SENTRY_TRACES_SAMPLE_RATE)
// If SENTRY_DSN is set but the package is missing, a warning is logged once
// and everything stays a no-op — the app never fails to boot because of this.
//
// Wiring (lead):
//   server.ts — first lines, before other imports that may throw:
//       import { initErrorTracking } from './config/errorTracking';
//       initErrorTracking();
//   app.ts — immediately BEFORE `app.use(globalErrorHandler)`:
//       import { errorTrackingHandler } from './config/errorTracking';
//       app.use(errorTrackingHandler);
// =============================================================================

interface SentryLike {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, context?: Record<string, unknown>): string;
  flush?(timeout?: number): Promise<boolean>;
}

let sentry: SentryLike | null = null;
let initialised = false;

export function isErrorTrackingEnabled(): boolean {
  return sentry !== null;
}

export function initErrorTracking(): void {
  if (initialised) return;
  initialised = true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    // Optional dependency — resolved at runtime only when configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@sentry/node') as SentryLike;
    const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
    mod.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0,
      sendDefaultPii: false,
      // Never ship request bodies / auth headers — they can carry passwords, OTPs and tokens.
      beforeSend(event: { request?: { data?: unknown; headers?: Record<string, unknown>; cookies?: unknown } }) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
            delete event.request.headers['x-api-key'];
          }
        }
        return event;
      },
    });
    sentry = mod;
    logger.info('Error tracking enabled (Sentry)');
  } catch {
    logger.warn('SENTRY_DSN is set but @sentry/node is not installed — error tracking stays off');
  }
}

/** Report a handled error. No-op when disabled. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!sentry) return;
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // never let reporting break the request
  }
}

/**
 * Express error middleware: reports 5xx / unexpected errors, then passes the
 * error on unchanged to the existing globalErrorHandler.
 */
export const errorTrackingHandler: ErrorRequestHandler = (err: unknown, req: Request, _res: Response, next: NextFunction) => {
  if (sentry) {
    const status = (err as { statusCode?: number } | null)?.statusCode;
    if (!status || status >= 500) {
      captureError(err, {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        institutionId: req.tenantId,
        userId: req.user?.sub,
      });
    }
  }
  next(err);
};

export async function flushErrorTracking(timeoutMs = 2000): Promise<void> {
  if (sentry?.flush) await sentry.flush(timeoutMs).catch(() => undefined);
}
