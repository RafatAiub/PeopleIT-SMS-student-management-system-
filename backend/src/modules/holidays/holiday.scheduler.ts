import { logger } from '../../utils/logger';
import { syncAllGovernmentHolidays } from './holiday.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000;

let timer: NodeJS.Timeout | null = null;

// Daily government-holiday sync. A plain in-process timer rather than a
// BullMQ job so it keeps running even when Redis is unreachable; the sync is
// idempotent, so a restart (or a second instance) running it again is harmless.
export function startHolidaySyncJob() {
  const run = () =>
    syncAllGovernmentHolidays().catch((error) => {
      logger.error('Government holiday daily sync crashed', {
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

export function stopHolidaySyncJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
