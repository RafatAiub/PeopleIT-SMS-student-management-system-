import { logger } from '../../utils/logger';
import * as repo from './repository';
import { loadDeferred } from './deferredStore';
import { sendEmail } from './sender';

// =============================================================================
// Retries EmailLog rows left DEFERRED once their `notBefore` (next UTC
// midnight, when the daily budget resets) has passed. Plain in-process timer,
// same pattern as holidays/holiday.scheduler.ts — keeps working even when
// Redis/BullMQ are down (a deferred email with no stashed payload just fails
// permanently rather than blocking anything else).
// =============================================================================

const TICK_MS = 15 * 60 * 1000; // every 15 min — deferrals only become due at UTC midnight, no need for tighter polling
const STARTUP_DELAY_MS = 30 * 1000;

let timer: NodeJS.Timeout | null = null;

export async function runDeferredRetrySweep(): Promise<{ attempted: number; sent: number; stillDeferred: number; failed: number }> {
  const due = await repo.findDueDeferred(200);
  let sent = 0;
  let stillDeferred = 0;
  let failed = 0;

  for (const row of due) {
    const payload = await loadDeferred(row.id);
    if (!payload) {
      await repo.markFailed(row.id, null, 'deferred retry payload was lost (Redis TTL/eviction) — could not resend');
      failed++;
      continue;
    }

    const result = await sendEmail(payload);
    if (result.status === 'SENT') sent++;
    else if (result.status === 'DEFERRED') stillDeferred++;
    else failed++;
  }

  if (due.length > 0) {
    logger.info('Deferred email retry sweep', { attempted: due.length, sent, stillDeferred, failed });
  }
  return { attempted: due.length, sent, stillDeferred, failed };
}

export function startEmailDeferredRetryJob(): void {
  const run = () =>
    runDeferredRetrySweep().catch((error) => {
      logger.error('Deferred email retry sweep crashed', { error: error instanceof Error ? error.message : String(error) });
    });

  timer = setTimeout(() => {
    run();
    timer = setInterval(run, TICK_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  timer.unref();
}

export function stopEmailDeferredRetryJob(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
