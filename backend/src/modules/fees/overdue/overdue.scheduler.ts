import { logger } from '../../../utils/logger';
import { markOverdueInvoices } from './overdue.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 2 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

// Daily OVERDUE sweep for fee invoices. A plain in-process timer (same
// pattern as holidays/holiday.scheduler.ts) rather than a BullMQ job, so it
// keeps running when Redis is unreachable. The sweep is idempotent, so a
// restart or a second instance running it again is harmless.
//
// Wire-up (server.ts — not edited by this module):
//   import { startFeeOverdueJob, stopFeeOverdueJob } from './modules/fees/overdue/overdue.scheduler';
//   startFeeOverdueJob();   // after server.listen(), next to startHolidaySyncJob()
//   stopFeeOverdueJob();    // in gracefulShutdown(), next to stopHolidaySyncJob()
export function startFeeOverdueJob() {
  if (timer) return;
  const run = () =>
    markOverdueInvoices().catch((error) => {
      logger.error('Fee overdue daily sweep crashed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

  timer = setTimeout(() => {
    run();
    timer = setInterval(run, DAY_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  timer.unref();
}

export function stopFeeOverdueJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
