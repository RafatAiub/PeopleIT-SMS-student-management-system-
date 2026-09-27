import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { redis } from '../../../config/redis';
import { getInvoiceTenantTag } from '../../../utils/invoiceNumber';
import { logger } from '../../../utils/logger';

// =============================================================================
// Payment receipt numbers — RCP-{TENANT-TAG}-{YEAR}-{6-digit counter}.
// Same tenant tag as invoice numbers (utils/invoiceNumber.ts), so two
// institutions never collide on the globally-unique Payment.receiptNo.
//
// Counter source: a per-tenant/year Redis INCR (bounded by a short timeout so
// a Redis outage never hangs a payment), falling back to the DB's current max
// for this prefix. Callers retry on a P2002 collision via nextReceiptNumber's
// `attempt` offset.
// =============================================================================

const RECEIPT_COUNTER_PREFIX = 'receipt_counter';
const RECEIPT_COUNTER_TTL = 60 * 60 * 24 * 400;
const REDIS_TIMEOUT_MS = 1500;

/** Pure formatter: RCP-TAG-2026-000042. */
export function formatReceiptNumber(tenantTag: string, year: number, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1) {
    throw new Error(`Invalid receipt counter: ${counter}`);
  }
  return `RCP-${tenantTag}-${year}-${String(counter).padStart(6, '0')}`;
}

/** Pure: the trailing counter of a receipt number with the given prefix, or 0. */
export function parseReceiptCounter(receiptNo: string | null | undefined, prefix: string): number {
  if (!receiptNo || !receiptNo.startsWith(prefix)) return 0;
  const n = parseInt(receiptNo.slice(prefix.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function receiptPrefix(tenantTag: string, year: number): string {
  return `RCP-${tenantTag}-${year}-`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('redis timeout')), ms)),
  ]);
}

async function dbMaxCounter(institutionId: string, prefix: string): Promise<number> {
  const latest = await prisma.payment.findFirst({
    where: { receiptNo: { startsWith: prefix }, invoice: { institutionId } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  });
  return parseReceiptCounter(latest?.receiptNo, prefix);
}

/**
 * Generates the next receipt number. attempt > 0 means a previous number
 * collided (P2002) — skip Redis and go straight to DB max + attempt.
 */
export async function nextReceiptNumber(institutionId: string, attempt = 0, now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const tag = await getInvoiceTenantTag(institutionId);
  const prefix = receiptPrefix(tag, year);

  if (attempt === 0) {
    const key = `${RECEIPT_COUNTER_PREFIX}:${institutionId}:${year}`;
    try {
      let counter = await withTimeout(redis.incr(key), REDIS_TIMEOUT_MS);
      if (counter === 1) {
        // First use of this key (fresh year, or Redis was flushed) — make sure
        // we start above whatever is already in the DB.
        const dbMax = await dbMaxCounter(institutionId, prefix);
        if (dbMax >= counter) {
          counter = await withTimeout(redis.incrby(key, dbMax), REDIS_TIMEOUT_MS);
        }
        withTimeout(redis.expire(key, RECEIPT_COUNTER_TTL), REDIS_TIMEOUT_MS).catch(() => undefined);
      }
      return formatReceiptNumber(tag, year, counter);
    } catch (error) {
      logger.warn('Receipt counter via Redis unavailable — using DB max', {
        institutionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const dbMax = await dbMaxCounter(institutionId, prefix);
  return formatReceiptNumber(tag, year, dbMax + 1 + Math.max(attempt - 1, 0));
}

/** true when a Prisma error is a unique violation on Payment.receiptNo. */
export function isReceiptNoCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('receiptNo');
}

/**
 * Runs `create(receiptNo)` with a fresh receipt number, retrying up to 3
 * times on a receiptNo unique collision.
 */
export async function withReceiptNumber<T>(institutionId: string, create: (receiptNo: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const receiptNo = await nextReceiptNumber(institutionId, attempt);
    try {
      return await create(receiptNo);
    } catch (error) {
      if (!isReceiptNoCollision(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
