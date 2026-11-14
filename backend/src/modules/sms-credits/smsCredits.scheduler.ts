import { logger } from '../../utils/logger';
import { pollDeliveryStatus } from './smsCredits.delivery';

// =============================================================================
// P5 delivery-status poll — in-process timer (same pattern as
// crm/crm.scheduler.ts). Started from server.ts only when BACKGROUND_JOBS is
// on; SMS_STATUS_POLL=false disables it. Runs every 15 minutes.
// =============================================================================

const INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_DELAY_MS = 3 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startSmsStatusPollJob() {
  if (timer || (process.env.SMS_STATUS_POLL ?? '').toLowerCase() === 'false') return;
  const tick = () => {
    if (running) return;
    running = true;
    pollDeliveryStatus()
      .then((r) => {
        if (r.checked) logger.info('SMS delivery status poll', r);
      })
      .catch((error) => logger.error('SMS delivery status poll crashed', { error: error instanceof Error ? error.message : String(error) }))
      .finally(() => {
        running = false;
      });
  };
  timer = setTimeout(() => {
    tick();
    timer = setInterval(tick, INTERVAL_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  timer.unref();
}

export function stopSmsStatusPollJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
