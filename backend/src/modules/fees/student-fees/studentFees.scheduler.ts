import { logger } from '../../../utils/logger';
import { dhakaParts } from './studentFees.logic';
import { runScheduledMonthly } from './studentFees.monthly';

// =============================================================================
// P2 monthly auto-invoice scheduler — an in-process hourly timer (same
// pattern as the CRM / platform-billing schedulers). It is started by
// startFeeOverdueJob(), which server.ts only calls when BACKGROUND_JOBS is
// on, so the scheduled run follows that switch; the manual "Generate now"
// endpoint works either way.
//
// Each tick at/after 06:00 Dhaka runs once per Dhaka day: every school whose
// generation day has come and that has not been billed for this month yet.
// Re-runs are harmless (one invoice per student per month, enforced by a
// unique key).
// =============================================================================

const HOUR_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 4 * 60 * 1000;
export const MONTHLY_RUN_HOUR = 6;

let timer: NodeJS.Timeout | null = null;
let lastDay: string | null = null;

export async function monthlyInvoiceTick(now: Date = new Date()): Promise<void> {
  const p = dhakaParts(now);
  const day = `${p.year}-${p.month}-${p.day}`;
  if (p.hour < MONTHLY_RUN_HOUR || lastDay === day) return;
  lastDay = day;
  try {
    const res = await runScheduledMonthly(now);
    if (res.schools.length > 0) logger.info('Monthly fee invoices — scheduled run', { period: res.period, schools: res.schools.length });
  } catch (error) {
    lastDay = null; // retry next hour
    logger.error('Monthly fee invoice run crashed', { error: error instanceof Error ? error.message : String(error) });
  }
}

export function startMonthlyInvoiceJob() {
  if (timer) return;
  timer = setTimeout(() => {
    void monthlyInvoiceTick();
    timer = setInterval(() => void monthlyInvoiceTick(), HOUR_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  timer.unref();
}

export function stopMonthlyInvoiceJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
