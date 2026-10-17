import { logger } from '../../utils/logger';
import { purgeExpired } from './trash.service';

// =============================================================================
// T5 daily trash purge — in-process timer (same pattern as
// library/library.scheduler.ts). Started from server.ts only when
// BACKGROUND_JOBS is on. Idempotent: a second instance finds nothing left.
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 6 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

export function startTrashPurgeJob() {
  if (timer) return;
  const run = () =>
    purgeExpired().catch((error) => {
      logger.error('Trash purge job crashed', { error: error instanceof Error ? error.message : String(error) });
    });
  timer = setTimeout(() => {
    run();
    timer = setInterval(run, DAY_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  timer.unref();
}

export function stopTrashPurgeJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
