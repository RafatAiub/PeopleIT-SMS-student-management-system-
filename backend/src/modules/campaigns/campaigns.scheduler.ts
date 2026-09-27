import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { runCampaign, isRunning } from './campaigns.runner';

// =============================================================================
// Scheduled-campaign dispatcher — a plain in-process timer (like
// holidays/holiday.scheduler.ts) so scheduled sends keep working while Redis
// is unreachable.
// =============================================================================

const TICK_MS = 60 * 1000;
/** A SENDING campaign untouched this long is assumed orphaned by a crash/restart. */
const STALE_SENDING_MS = 15 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

export async function dispatchDueCampaigns(now = new Date()): Promise<number> {
  const due = await prisma.messageCampaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    select: { id: true },
    take: 20,
    orderBy: { scheduledAt: 'asc' },
  });

  let started = 0;
  for (const { id } of due) {
    // Atomic claim — only one process/instance flips SCHEDULED -> SENDING.
    const claimed = await prisma.messageCampaign.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'SENDING' },
    });
    if (claimed.count === 1) {
      started++;
      runCampaign(id).catch(() => undefined);
    }
  }

  // Resume campaigns orphaned mid-send; delivery dedupe prevents duplicates.
  const stale = await prisma.messageCampaign.findMany({
    where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
    select: { id: true },
    take: 5,
  });
  for (const { id } of stale) {
    if (isRunning(id)) continue;
    // Touch updatedAt first so a second instance does not resume it too.
    const touched = await prisma.messageCampaign.updateMany({
      where: { id, status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
      data: { status: 'SENDING' },
    });
    if (touched.count === 1) {
      logger.warn('Resuming orphaned campaign', { campaignId: id });
      runCampaign(id).catch(() => undefined);
    }
  }

  return started;
}

/** Idempotent — calling it twice never starts two timers. */
export function startCampaignScheduler(): void {
  if (timer) return;
  const tick = () =>
    dispatchDueCampaigns().catch((error) => {
      // Before the Wave C migration is applied the table does not exist —
      // log once per tick at debug level rather than flooding error logs.
      const message = error instanceof Error ? error.message : String(error);
      if (/does not exist|P2021/i.test(message)) logger.debug('Campaign scheduler idle: table missing', { message });
      else logger.error('Campaign scheduler tick failed', { error: message });
    });
  timer = setInterval(tick, TICK_MS);
  timer.unref();
}

export function stopCampaignScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
