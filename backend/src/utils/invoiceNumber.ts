import { redis } from '../config/redis';
import { prisma } from '../config/prisma';
import { logger } from './logger';

// =============================================================================
// Invoice Number Generator
// Format: INV-{TENANT-SLUG}-{YEAR}-{6-digit-zero-padded-counter}
// Uses Redis atomic INCR per institution to guarantee uniqueness.
//
// U6: Invoice.invoiceNo is a globally @unique column (no per-tenant scoping
// at the schema level), so the tenant's own short slug is folded into the
// generated number itself — two institutions' counters can never collide,
// without touching the schema.
// =============================================================================

const INVOICE_COUNTER_PREFIX = 'invoice_counter';
const INVOICE_COUNTER_TTL = 60 * 60 * 24 * 400; // ~13 months in seconds

/**
 * Derives a short, uppercase, alphanumeric-only tenant tag (<=10 chars) from
 * the institution's slug, for embedding in the invoice number. Falls back to
 * a truncated institutionId when the institution can't be found (should not
 * happen in practice — createInvoice already verified the student/tenant).
 */
export async function getInvoiceTenantTag(institutionId: string): Promise<string> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { slug: true },
  });

  const raw = institution?.slug || institutionId;
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (cleaned || 'TENANT').slice(0, 10);
}

/**
 * Generates a unique invoice number like INV-12345678-2024-000001
 * Uses Redis atomic increment (scoped per institution+year) to prevent race
 * conditions between concurrent invoice creations for the same tenant.
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
  const tenantTag = await getInvoiceTenantTag(institutionId);

  try {
    // Atomically increment the counter
    const counter = await redis.incr(redisKey);

    // Set TTL only when key is first created (counter === 1)
    if (counter === 1) {
      await redis.expire(redisKey, INVOICE_COUNTER_TTL);
    }

    // Zero-pad to 6 digits
    const paddedCounter = String(counter).padStart(6, '0');
    return `INV-${tenantTag}-${currentYear}-${paddedCounter}`;
  } catch (error) {
    logger.error('Failed to generate invoice number via Redis', {
      institutionId,
      year: currentYear,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback: timestamp-based (not guaranteed unique but prevents hard failure)
    const fallback = `INV-${tenantTag}-${currentYear}-${Date.now()}`;
    logger.warn(`Using fallback invoice number: ${fallback}`);
    return fallback;
  }
}

/**
 * Regenerates an invoice number by falling back to this tenant+year's
 * current max counter (read straight from the DB) + 1, used to recover from
 * a P2002 unique-constraint collision on Invoice.invoiceNo (e.g. the Redis
 * counter having fallen out of sync, or a fallback timestamp-based number
 * having collided).
 */
export async function generateInvoiceNumberFromDbMax(
  institutionId: string,
  year?: number,
): Promise<string> {
  const currentYear = year ?? new Date().getFullYear();
  const tenantTag = await getInvoiceTenantTag(institutionId);
  const prefix = `INV-${tenantTag}-${currentYear}-`;

  const latest = await prisma.invoice.findFirst({
    where: { institutionId, invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: 'desc' },
    select: { invoiceNo: true },
  });

  const lastCounter = latest ? parseInt(latest.invoiceNo.slice(prefix.length), 10) || 0 : 0;
  const nextCounter = lastCounter + 1;
  return `${prefix}${String(nextCounter).padStart(6, '0')}`;
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
