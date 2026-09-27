import { Prisma } from '@prisma/client';
import { AppError } from './AppError';

// =============================================================================
// Detects "table/column does not exist" errors — the Wave C migration
// (20260927000000_wave_c_feature_foundation) may not be applied yet. Used by
// fire-and-forget hooks (webhook emit, usage summary) so a missing table
// degrades to "feature not available" instead of an error.
// =============================================================================

const MISSING_SCHEMA_CODES = new Set(['P2021', 'P2022']);

export function isMissingSchemaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return MISSING_SCHEMA_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /42P01|42703|does not exist/i.test(error.message);
  }
  return false;
}

export const SCHEMA_NOT_READY_MESSAGE =
  'This feature needs the Wave C database migration (20260927000000_wave_c_feature_foundation), which has not been applied yet';

/** Controllers pass errors through this so a missing table becomes a clear 503. */
export function mapSchemaError(error: unknown): unknown {
  return isMissingSchemaError(error) ? new AppError(SCHEMA_NOT_READY_MESSAGE, 503) : error;
}
