import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { isMissingSchemaError } from '../../utils/schemaMissing';
import { cleanupDataExports, scheduleDataExportJob } from './dataExport.runner';

// =============================================================================
// Hourly in-process maintenance for data exports (Redis-independent):
//   - boot: jobs left RUNNING by a previous process are marked FAILED;
//           PENDING jobs are re-queued
//   - hourly: delete files past their 7-day expiry, fail stale jobs
// Wire into server.ts next to the other in-process jobs.
// =============================================================================

const HOUR = 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let bootTimer: NodeJS.Timeout | null = null;

async function recoverOnBoot(): Promise<void> {
  const interrupted = await prisma.dataExportJob.updateMany({
    where: { status: 'RUNNING' },
    data: { status: 'FAILED', completedAt: new Date() },
  });
  const pending = await prisma.dataExportJob.findMany({ where: { status: 'PENDING' }, select: { id: true }, take: 50 });
  pending.forEach((job) => scheduleDataExportJob(job.id));
  if (interrupted.count || pending.length) {
    logger.info('Data export: boot recovery', { markedFailed: interrupted.count, requeued: pending.length });
  }
}

async function tick(): Promise<void> {
  try {
    const result = await cleanupDataExports();
    if (result.expired || result.failed) logger.info('Data export cleanup', result);
  } catch (error) {
    if (isMissingSchemaError(error)) return; // migration not applied yet
    logger.error('Data export cleanup failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

export function startDataExportJob(): void {
  if (timer) return;
  bootTimer = setTimeout(() => {
    recoverOnBoot()
      .catch((error) => {
        if (!isMissingSchemaError(error)) {
          logger.error('Data export boot recovery failed', { error: error instanceof Error ? error.message : String(error) });
        }
      })
      .finally(() => void tick());
  }, 30_000);
  bootTimer.unref();
  timer = setInterval(() => void tick(), HOUR);
  timer.unref();
}

export function stopDataExportJob(): void {
  if (bootTimer) clearTimeout(bootTimer);
  if (timer) clearInterval(timer);
  bootTimer = null;
  timer = null;
}
