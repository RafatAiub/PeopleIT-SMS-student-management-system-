import { logger } from '../../utils/logger';
import { dhakaDateKey, dhakaHour } from './crm.logic';
import { runDailyCrmDigest } from './crm.digest';

// =============================================================================
// T4 CRM digest scheduler — in-process timer (same pattern as
// library/library.scheduler.ts). Checks hourly; sends once per Dhaka day at or
// after DIGEST_HOUR. Started from server.ts only when BACKGROUND_JOBS is on.
// Double sends are impossible anyway: every digest carries a per-day
// idempotency key (see crm.digest.ts).
// =============================================================================

const HOUR_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 4 * 60 * 1000;
export const DIGEST_HOUR = 7; // 07:00 Asia/Dhaka

let timer: NodeJS.Timeout | null = null;
let lastRunDay: string | null = null;

export function startCrmDigestJob() {
  if (timer) return;
  const tick = () => {
    const now = new Date();
    const day = dhakaDateKey(now);
    if (lastRunDay === day || dhakaHour(now) < DIGEST_HOUR) return;
    lastRunDay = day;
    runDailyCrmDigest(now).catch((error) => {
      lastRunDay = null; // retry next hour
      logger.error('CRM daily digest crashed', { error: error instanceof Error ? error.message : String(error) });
    });
  };
  timer = setTimeout(() => {
    tick();
    timer = setInterval(tick, HOUR_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  timer.unref();
}

export function stopCrmDigestJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
