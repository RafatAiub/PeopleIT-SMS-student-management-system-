import { prisma } from '../../../config/prisma';
import { logger } from '../../../utils/logger';

// =============================================================================
// Marks UNPAID/PARTIAL invoices whose due date is before *today* (Bangladesh
// time) as OVERDUE. Per tenant, in batches, with the status re-checked in the
// UPDATE itself so a payment landing mid-run is never overwritten.
//
// Note: FeeRepository.applyPaymentToInvoice recomputes status to
// UNPAID/PARTIAL/PAID on every payment, so a partial payment on an OVERDUE
// invoice resets it to PARTIAL; the next run marks it OVERDUE again.
// =============================================================================

const BATCH_SIZE = 500;
export const OVERDUE_ELIGIBLE_STATUSES = ['UNPAID', 'PARTIAL'];

/**
 * Start of the current calendar day in a fixed-offset timezone, as a UTC
 * Date. Pure. Bangladesh is UTC+6 with no DST, so a fixed offset is exact.
 */
export function startOfTodayAt(now: Date, utcOffsetMinutes = 360): Date {
  const shifted = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  const startShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(startShifted - utcOffsetMinutes * 60_000);
}

async function markForTenant(institutionId: string, cutoff: Date): Promise<number> {
  let updated = 0;
  // Bounded loop: each pass flips up to BATCH_SIZE rows out of the eligible set.
  for (let pass = 0; pass < 10_000; pass++) {
    const ids = await prisma.invoice.findMany({
      where: { institutionId, status: { in: OVERDUE_ELIGIBLE_STATUSES }, dueDate: { lt: cutoff }, dueAmount: { gt: 0 } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (ids.length === 0) break;
    const res = await prisma.invoice.updateMany({
      where: { id: { in: ids.map((r) => r.id) }, institutionId, status: { in: OVERDUE_ELIGIBLE_STATUSES } },
      data: { status: 'OVERDUE' },
    });
    updated += res.count;
    if (res.count === 0) break;
  }
  return updated;
}

/** Run for one tenant (on-demand endpoint) or all tenants (daily job). */
export async function markOverdueInvoices(opts: { institutionId?: string; now?: Date } = {}) {
  const cutoff = startOfTodayAt(opts.now ?? new Date());

  let tenantIds: string[];
  if (opts.institutionId) {
    tenantIds = [opts.institutionId];
  } else {
    const groups = await prisma.invoice.groupBy({
      by: ['institutionId'],
      where: { status: { in: OVERDUE_ELIGIBLE_STATUSES }, dueDate: { lt: cutoff }, dueAmount: { gt: 0 } },
    });
    tenantIds = groups.map((g) => g.institutionId);
  }

  let total = 0;
  const perTenant: { institutionId: string; updated: number }[] = [];
  for (const id of tenantIds) {
    try {
      const updated = await markForTenant(id, cutoff);
      total += updated;
      perTenant.push({ institutionId: id, updated });
    } catch (error) {
      logger.error('Overdue marking failed for tenant', {
        institutionId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (total > 0) logger.info('Fee invoices marked OVERDUE', { total, tenants: perTenant.length });
  return { cutoff: cutoff.toISOString(), updated: total, tenants: perTenant.length };
}
