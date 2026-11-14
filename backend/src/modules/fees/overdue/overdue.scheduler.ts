import { logger } from '../../../utils/logger';
import { markOverdueInvoices } from './overdue.service';
import { applyLateFines } from '../student-fees/studentFees.fines';
import { startMonthlyInvoiceJob, stopMonthlyInvoiceJob } from '../student-fees/studentFees.scheduler';

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 2 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

// Daily OVERDUE sweep for fee invoices. A plain in-process timer (same
// pattern as holidays/holiday.scheduler.ts) rather than a BullMQ job, so it
// keeps running when Redis is unreachable. The sweep is idempotent, so a
// restart or a second instance running it again is harmless.
//
// P2: after marking overdue, the same daily run adds late fines (idempotent
// per invoice per fine period). The P2 monthly auto-invoice timer is started
// and stopped together with this job, so it follows BACKGROUND_JOBS too.
//
// Wire-up (server.ts — not edited by this module):
//   import { startFeeOverdueJob, stopFeeOverdueJob } from './modules/fees/overdue/overdue.scheduler';
//   startFeeOverdueJob();   // after server.listen(), next to startHolidaySyncJob()
//   stopFeeOverdueJob();    // in gracefulShutdown(), next to stopHolidaySyncJob()
export function startFeeOverdueJob() {
  if (timer) return;
  const run = () =>
    markOverdueInvoices()
      .then(() => applyLateFines())
      .catch((error) => {
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
  startMonthlyInvoiceJob();
}

export function stopFeeOverdueJob() {
  if (timer) clearTimeout(timer);
  timer = null;
  stopMonthlyInvoiceJob();
}
