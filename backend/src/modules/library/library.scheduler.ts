import { logger } from '../../utils/logger';
import { markOverdueLoans } from './library.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 3 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

// Daily sweep that stores OVERDUE on ISSUED library loans past their due
// date. A plain in-process timer (same pattern as holidays/holiday.scheduler.ts
// and fees/overdue/overdue.scheduler.ts) so it keeps running when Redis is
// unreachable. Idempotent — a restart or a second instance re-running it is
// harmless. availableCopies is never touched: an OVERDUE loan still holds
// its copy until returned.
//
// Wire-up (server.ts — not edited by this module):
//   import { startLibraryOverdueJob, stopLibraryOverdueJob } from './modules/library/library.scheduler';
//   startLibraryOverdueJob();   // after server.listen(), next to startFeeOverdueJob()
//   stopLibraryOverdueJob();    // in gracefulShutdown(), next to stopFeeOverdueJob()
export function startLibraryOverdueJob() {
  if (timer) return;
  const run = () =>
    markOverdueLoans().catch((error) => {
      logger.error('Library overdue daily sweep crashed', {
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

export function stopLibraryOverdueJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
