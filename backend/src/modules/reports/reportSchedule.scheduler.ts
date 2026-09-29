import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { isScheduleDue, tzOffsetMinutes } from './analytics.logic';
import { executeSchedule, scheduleRunInclude } from './reportSchedule.runner';

const TICK_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 3 * 60 * 1000;
const BATCH = 500;

let timer: NodeJS.Timeout | null = null;
let running = false;

// Scheduled report emails. A plain in-process timer (same pattern as
// holidays/holiday.scheduler.ts) so it keeps running when Redis is down.
// Every tick loads active schedules, and for each one whose next cron time
// (after lastRunAt, or creation) has passed, claims it with a conditional
// update on lastRunAt — so a second instance never sends the same run twice —
// then renders and emails it. Demo mode (no SMTP) is handled by the runner.
//
// Wire-up (server.ts — not edited by this module):
//   import { startReportScheduleJob, stopReportScheduleJob } from './modules/reports/reportSchedule.scheduler';
//   startReportScheduleJob();   // after server.listen(), next to startFeeOverdueJob()
//   stopReportScheduleJob();    // in gracefulShutdown(), next to stopFeeOverdueJob()
export async function runDueReportSchedules(now = new Date()): Promise<{ checked: number; ran: number; failed: number }> {
  const schedules = await prisma.reportSchedule.findMany({
    where: { isActive: true },
    include: { ...scheduleRunInclude, institution: { select: { name: true, slug: true, isActive: true, timezone: true } } },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });

  let ran = 0;
  let failed = 0;
  for (const s of schedules) {
    const offset = tzOffsetMinutes(s.institution.timezone, now);
    if (!isScheduleDue(s.cron, s.lastRunAt, s.createdAt, now, offset)) continue;

    const claim = await prisma.reportSchedule.updateMany({
      where: { id: s.id, lastRunAt: s.lastRunAt },
      data: { lastRunAt: now },
    });
    if (claim.count !== 1) continue;

    try {
      await executeSchedule(s, now);
      ran += 1;
    } catch (error) {
      failed += 1;
      logger.warn('Scheduled report skipped', {
        scheduleId: s.id,
        institutionId: s.institutionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { checked: schedules.length, ran, failed };
}

export function startReportScheduleJob() {
  if (timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runDueReportSchedules();
      if (r.ran || r.failed) logger.info('Report schedule tick', r);
    } catch (error) {
      // e.g. before the Wave C migration creates the ReportSchedule table.
      logger.error('Report schedule tick crashed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  timer = setTimeout(() => {
    void run();
    timer = setInterval(() => void run(), TICK_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  timer.unref();
}

export function stopReportScheduleJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
