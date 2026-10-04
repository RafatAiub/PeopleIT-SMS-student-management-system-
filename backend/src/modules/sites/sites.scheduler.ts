// =============================================================================
// Sites in-process jobs (plain timers, Redis-independent, like the other
// schedulers):
//   - every 10 minutes: re-check PENDING_DNS / VERIFYING custom domains
//   - every minute:     publish pages whose scheduledPublishAt has passed
// Both are idempotent, so a second instance running them is harmless.
// Until the Sites migration is applied the queries fail with "table does not
// exist"; that is logged once at debug level, not as an error.
// =============================================================================

import { logger } from '../../utils/logger';
import { isMissingSchemaError } from '../../utils/schemaMissing';
import { getSystemActorUserId } from '../../utils/systemActor';
import { recheckPendingDomains } from './sites.domains.service';
import { runScheduledPublishes } from './sites.service';

const DOMAIN_INTERVAL_MS = 10 * 60 * 1000;
const PUBLISH_INTERVAL_MS = 60 * 1000;
const STARTUP_DELAY_MS = 90 * 1000;

const timers: NodeJS.Timeout[] = [];
let schemaWarned = false;

function guard(name: string, fn: () => Promise<unknown>) {
  return () =>
    fn().catch((error) => {
      if (isMissingSchemaError(error)) {
        if (!schemaWarned) logger.debug('Sites jobs idle: the Sites migration is not applied yet');
        schemaWarned = true;
        return;
      }
      logger.error(`Sites job "${name}" crashed`, { error: error instanceof Error ? error.message : String(error) });
    });
}

function every(ms: number, run: () => void) {
  const first = setTimeout(() => {
    run();
    const t = setInterval(run, ms);
    t.unref();
    timers.push(t);
  }, STARTUP_DELAY_MS);
  first.unref();
  timers.push(first);
}

export function startDomainCheckJob() {
  if (timers.length) return;
  every(DOMAIN_INTERVAL_MS, guard('domain-check', recheckPendingDomains));
  every(
    PUBLISH_INTERVAL_MS,
    guard('scheduled-publish', async () => runScheduledPublishes((await getSystemActorUserId()) ?? 'system')),
  );
}

export function stopDomainCheckJob() {
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
}
