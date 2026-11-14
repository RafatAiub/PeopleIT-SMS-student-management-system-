import { logger } from '../../utils/logger';
import { dateKeyOf } from './dues.logic';
import { refreshAllInstitutions } from './restriction.service';

// =============================================================================
// P4 nightly refresh of the cached dues figures (StudentFeeStatus) at about
// 02:00 Asia/Dhaka. Started from server.ts only when BACKGROUND_JOBS is on.
// Checks also refresh a stale student on demand, so a missed night only means
// the restricted-students list refreshes on first open.
// =============================================================================

const CHECK_MS = 30 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let lastRunDay: string | null = null;

export function startFeeDuesRefreshJob() {
  if (timer) return;
  const tick = () => {
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', hour12: false }).format(now));
    const day = dateKeyOf(now);
    if (hour !== 2 || lastRunDay === day) return;
    lastRunDay = day;
    refreshAllInstitutions()
      .then((r) => logger.info('P4 nightly dues refresh done', r))
      .catch((error) => logger.error('P4 nightly dues refresh crashed', { error: error instanceof Error ? error.message : String(error) }));
  };
  timer = setInterval(tick, CHECK_MS);
  timer.unref();
}

export function stopFeeDuesRefreshJob() {
  if (timer) clearInterval(timer);
  timer = null;
}
