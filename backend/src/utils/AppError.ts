// =============================================================================
// Custom Error Classes — Maps to HTTP status codes in error.middleware.ts
// =============================================================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  public readonly errors: unknown;

  constructor(message = 'Validation failed', errors?: unknown) {
    super(message, 422);
    this.errors = errors;
  }
}

export class LockedError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message, 423);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * A 403 that the client must *react* to rather than merely display — an
 * unverified email needs a "resend" button, a pending account needs different
 * copy from a suspended one. The `code` lets the frontend branch on the reason
 * without string-matching the human-readable message.
 */
export class AuthRequirementError extends AppError {
  public readonly code:
    | 'EMAIL_NOT_VERIFIED'
    | 'ACCOUNT_PENDING_APPROVAL'
    | 'ACCOUNT_REJECTED'
    | 'ACCOUNT_SUSPENDED';
  public readonly details?: Record<string, unknown>;

  constructor(
    code: AuthRequirementError['code'],
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, 403);
    this.code = code;
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, false);
  }
}
