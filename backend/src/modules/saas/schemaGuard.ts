import { Prisma } from '@prisma/client';
import { logger } from '../../utils/logger';

// =============================================================================
// Schema guard — the Wave C migration (20260927000000_wave_c_feature_foundation)
// may not be applied yet. Queries against its new tables/columns then fail
// with P2021 (table missing) / P2022 (column missing). SaaS-layer reads use
// this helper to fall back to "not configured" instead of failing the request,
// so existing tenants keep working until the migration runs.
// =============================================================================

const MISSING_SCHEMA_CODES = new Set(['P2021', 'P2022']);

export function isMissingSchemaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return MISSING_SCHEMA_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    // Raw Postgres: 42P01 undefined_table, 42703 undefined_column.
    return /42P01|42703|does not exist/i.test(error.message);
  }
  return false;
}

/**
 * Run a query that touches Wave C schema; on a missing-schema error return
 * `fallback` (and log once per call site) instead of throwing. Any other
 * error is re-thrown.
 */
export async function withSchemaFallback<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      logger.warn(`SaaS: Wave C schema not available for "${label}" — using fallback`);
      return fallback;
    }
    throw error;
  }
}
