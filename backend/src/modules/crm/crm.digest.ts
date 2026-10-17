import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { notify } from '../notifications/notifications.service';
import { dhakaDateKey, dhakaDayBounds, selectDigest, type DigestEntry } from './crm.logic';
import { LIVE_TASK } from './crm.service';

// =============================================================================
// T4 daily CRM digest: every staff member with open CRM tasks (or enquiry next
// steps) overdue or due today gets ONE in-app + email notification
// (CRM_TASK_DIGEST) through the normal notification pipeline. Idempotent per
// person per Dhaka day: the contextId is `crm-digest:<YYYY-MM-DD>`, so a
// restart, a second instance or a manual re-run sends nothing new.
// =============================================================================

const ROW_LIMIT = 5000;

/** Builds the per-user digest for one institution (no sending). */
export async function buildDigest(institutionId: string, now = new Date()): Promise<DigestEntry[]> {
  const { end } = dhakaDayBounds(now);
  const [tasks, followUps] = await Promise.all([
    prisma.crmTask.findMany({
      where: { institutionId, done: false, assigneeUserId: { not: null }, dueAt: { lt: end }, assignee: { isActive: true }, AND: [LIVE_TASK] },
      select: { id: true, title: true, dueAt: true, done: true, assigneeUserId: true, enquiry: { select: { studentName: true } } },
      orderBy: { dueAt: 'asc' },
      take: ROW_LIMIT,
    }),
    prisma.admissionEnquiry.findMany({
      where: { institutionId, assignedToUserId: { not: null }, followUpAt: { lt: end }, status: { notIn: ['ENROLLED', 'LOST'] }, assignedTo: { isActive: true } },
      select: { id: true, studentName: true, nextStep: true, followUpAt: true, assignedToUserId: true },
      orderBy: { followUpAt: 'asc' },
      take: ROW_LIMIT,
    }),
  ]);
  return selectDigest(
    tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, done: t.done, assigneeUserId: t.assigneeUserId, enquiryName: t.enquiry?.studentName ?? null })),
    followUps.map((f) => ({ id: f.id, studentName: f.studentName, nextStep: f.nextStep, followUpAt: f.followUpAt, assignedToUserId: f.assignedToUserId, closed: false })),
    now,
  );
}

/** Sends today's digest for one institution. Returns how many people were notified. */
export async function sendDigestForInstitution(institutionId: string, now = new Date()): Promise<number> {
  const entries = await buildDigest(institutionId, now);
  const dateKey = dhakaDateKey(now);
  for (const e of entries) {
    await notify({
      institutionId,
      type: 'CRM_TASK_DIGEST',
      recipientUserIds: [e.userId],
      vars: {
        date: dateKey,
        overdue: e.overdue,
        dueToday: e.dueToday,
        followUps: e.followUps,
        total: e.overdue + e.dueToday + e.followUps,
        list: e.lines.map((l) => `• ${l}`).join('\n'),
      },
      data: { link: '/admissions/tasks' },
      contextId: `crm-digest:${dateKey}`,
    });
  }
  return entries.length;
}

/** All active institutions that have anything due (one cheap query to find them). */
export async function runDailyCrmDigest(now = new Date()): Promise<{ institutions: number; recipients: number }> {
  const { end } = dhakaDayBounds(now);
  const [fromTasks, fromEnquiries] = await Promise.all([
    prisma.crmTask.groupBy({ by: ['institutionId'], where: { done: false, assigneeUserId: { not: null }, dueAt: { lt: end }, institution: { isActive: true }, AND: [LIVE_TASK] } }),
    prisma.admissionEnquiry.groupBy({
      by: ['institutionId'],
      where: { assignedToUserId: { not: null }, followUpAt: { lt: end }, status: { notIn: ['ENROLLED', 'LOST'] }, institution: { isActive: true } },
    }),
  ]);
  const ids = [...new Set([...fromTasks, ...fromEnquiries].map((r) => r.institutionId))];
  let recipients = 0;
  for (const id of ids) {
    try {
      recipients += await sendDigestForInstitution(id, now);
    } catch (error) {
      logger.error('CRM digest failed for institution', { institutionId: id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  logger.info('CRM daily digest sent', { institutions: ids.length, recipients });
  return { institutions: ids.length, recipients };
}
