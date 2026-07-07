import { redis } from '../config/redis';
import { logger } from './logger';

// =============================================================================
// Invoice Number Generator
// Format: INV-{YEAR}-{6-digit-zero-padded-counter}
// Uses Redis atomic INCR per institution to guarantee uniqueness.
// =============================================================================

const INVOICE_COUNTER_PREFIX = 'invoice_counter';
const INVOICE_COUNTER_TTL = 60 * 60 * 24 * 400; // ~13 months in seconds

/**
 * Generates a unique invoice number like INV-2024-000001
 * Uses Redis atomic increment to prevent race conditions.
 *
 * @param institutionId - The institution's ID (scopes counter per tenant)
 * @param year - Optional year override; defaults to current year
 */
export async function generateInvoiceNumber(
  institutionId: string,
  year?: number,
): Promise<string> {
  const currentYear = year ?? new Date().getFullYear();
  const redisKey = `${INVOICE_COUNTER_PREFIX}:${institutionId}:${currentYear}`;

  try {
    // Atomically increment the counter
    const counter = await redis.incr(redisKey);

    // Set TTL only when key is first created (counter === 1)
    if (counter === 1) {
      await redis.expire(redisKey, INVOICE_COUNTER_TTL);
    }

    // Zero-pad to 6 digits
    const paddedCounter = String(counter).padStart(6, '0');
    return `INV-${currentYear}-${paddedCounter}`;
  } catch (error) {
    logger.error('Failed to generate invoice number via Redis', {
      institutionId,
      year: currentYear,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback: timestamp-based (not guaranteed unique but prevents hard failure)
    const fallback = `INV-${currentYear}-${Date.now()}`;
    logger.warn(`Using fallback invoice number: ${fallback}`);
    return fallback;
  }
}

/**
 * Peek at the current counter value without incrementing (for admin/debug)
 */
export async function getCurrentInvoiceCounter(
  institutionId: string,
  year?: number,
): Promise<number> {
  const currentYear = year ?? new Date().getFullYear();
  const redisKey = `${INVOICE_COUNTER_PREFIX}:${institutionId}:${currentYear}`;
  const val = await redis.get(redisKey);
  return val ? parseInt(val, 10) : 0;
}
