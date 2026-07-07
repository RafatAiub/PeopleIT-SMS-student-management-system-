import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/AppError';

// =============================================================================
// Zod Validation Middleware Factory
// Usage: router.post('/path', validate({ body: MySchema }), controller)
// =============================================================================

interface ValidationTargets {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Creates an Express middleware that validates req.body, req.query, and/or
 * req.params against provided Zod schemas.
 * Throws ValidationError (422) on failure, passes validated+parsed data through.
 */
export function validate(schemas: ValidationTargets) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          throw formatZodError(result.error, 'body');
        }
        req.body = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          throw formatZodError(result.error, 'query');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.query = result.data as any;
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          throw formatZodError(result.error, 'params');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.params = result.data as any;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function formatZodError(error: ZodError, source: string): ValidationError {
  const errors = error.errors.map((e) => ({
    field: `${source}.${e.path.join('.')}`,
    message: e.message,
    code: e.code,
  }));
  return new ValidationError(`Validation failed in ${source}`, errors);
}
