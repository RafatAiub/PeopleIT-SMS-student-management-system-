import { logger } from '../../utils/logger';
import { dhakaDayKey, dhakaParts, periodOf } from './platformBilling.logic';
import { generateForAll, markOverdue } from './platformBilling.service';
import { runDailyReminders } from './platformBilling.reminders';

// =============================================================================
// P1 platform billing scheduler — in-process hourly timer (same pattern as
// crm.scheduler.ts). Started from server.ts only when BACKGROUND_JOBS is on.
//
// Once per Asia/Dhaka day (first tick after midnight):
//   1. generate this month's invoice for every school with an active profile
//      (idempotent: one invoice per school per month; on the 1st this is the
//      monthly run, on later days it only catches schools set up since);
//   2. mark unpaid invoices past their due day OVERDUE.
// Once per Dhaka day at or after REMINDER_HOUR (09:00): send reminders.
// Double sends are impossible: invoices are unique per (school, month) and
// every reminder has a per-day dedupe key.
// =============================================================================

const HOUR_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 3 * 60 * 1000;
export const REMINDER_HOUR = 9;

let timer: NodeJS.Timeout | null = null;
let lastCycleDay: string | null = null;
let lastReminderDay: string | null = null;

export async function runBillingCycle(now: Date = new Date()) {
  const generated = await generateForAll(periodOf(now), { now });
  const overdue = await markOverdue(now);
  if (generated.created > 0 || overdue > 0) {
    logger.info('Platform billing daily cycle', { period: generated.period, created: generated.created, markedOverdue: overdue });
  }
  return { generated, overdue };
}

export function platformBillingTick(now: Date = new Date()): Promise<void>[] {
  const day = dhakaDayKey(now);
  const jobs: Promise<void>[] = [];
  if (lastCycleDay !== day) {
    lastCycleDay = day;
    jobs.push(
      runBillingCycle(now)
        .then(() => undefined)
        .catch((error) => {
          lastCycleDay = null; // retry next hour
          logger.error('Platform billing cycle crashed', { error: error instanceof Error ? error.message : String(error) });
        }),
    );
  }
  if (dhakaParts(now).hour >= REMINDER_HOUR && lastReminderDay !== day) {
    lastReminderDay = day;
    jobs.push(
      // Wait for today's generation/overdue pass first so reminders see it.
      Promise.all(jobs.slice())
        .then(() => runDailyReminders(now))
        .then(() => undefined)
        .catch((error) => {
          lastReminderDay = null;
          logger.error('Platform billing reminders crashed', { error: error instanceof Error ? error.message : String(error) });
        }),
    );
  }
  return jobs;
}

export function startPlatformBillingJob() {
  if (timer) return;
  timer = setTimeout(() => {
    platformBillingTick();
    timer = setInterval(() => platformBillingTick(), HOUR_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  timer.unref();
}

export function stopPlatformBillingJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Test hook. */
export function resetPlatformBillingSchedulerState() {
  lastCycleDay = null;
  lastReminderDay = null;
}
