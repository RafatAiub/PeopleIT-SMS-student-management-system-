// Scheduled report emails (ReportSchedule): a saved view + a 5-field cron +
// staff recipients. SUPER_ADMIN/ADMIN manage every schedule in the
// institution; ACCOUNTANT manages their own (finance views only, enforced by
// the report access map). Recipients must be active staff of the institution
// so report data never leaves the school's own accounts.
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { canAccessReport, isInstitutionWide } from './analytics.access';
import { nextRunAfter, nextRuns } from './analytics.logic';
import { institutionClock, type Requester } from './analytics.scope';
import { activeStaffEmails, executeSchedule, isEmailDemoMode, scheduleRunInclude } from './reportSchedule.runner';
import { findVisibleView } from './savedViews.service';
import type { CreateScheduleDtoType, CronPreviewDtoType, ReportKey, ScheduleQueryDtoType, UpdateScheduleDtoType } from './analytics.dto';

const scheduleSelect = {
  id: true,
  savedViewId: true,
  cron: true,
  recipients: true,
  format: true,
  lastRunAt: true,
  isActive: true,
  createdAt: true,
  createdByUserId: true,
  savedView: { select: { id: true, name: true, reportKey: true } },
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ReportScheduleSelect;

type ScheduleRow = Prisma.ReportScheduleGetPayload<{ select: typeof scheduleSelect }>;

function serialize(s: ScheduleRow, offset: number) {
  let nextRunAt: Date | null = null;
  if (s.isActive) {
    try {
      nextRunAt = nextRunAfter(s.cron, s.lastRunAt ?? s.createdAt, offset);
      // Overdue schedules run on the next scheduler tick.
      if (nextRunAt.getTime() < Date.now()) nextRunAt = new Date();
    } catch {
      nextRunAt = null;
    }
  }
  const { createdBy, ...rest } = s;
  return { ...rest, createdByName: `${createdBy.firstName} ${createdBy.lastName}`.trim(), nextRunAt };
}

function scopeWhere(institutionId: string, requester: Requester): Prisma.ReportScheduleWhereInput {
  return isInstitutionWide(requester.role) ? { institutionId } : { institutionId, createdByUserId: requester.sub };
}

async function assertRecipients(institutionId: string, recipients: string[]) {
  const allowed = await activeStaffEmails(institutionId, recipients);
  const unknown = recipients.filter((r) => !allowed.has(r.toLowerCase()));
  if (unknown.length > 0) {
    throw new BadRequestError(`Recipients must be active staff of this institution: ${unknown.join(', ')}`);
  }
}

async function assertView(institutionId: string, requester: Requester, savedViewId: string) {
  const view = await findVisibleView(institutionId, requester, savedViewId);
  if (!canAccessReport(requester.role, view.reportKey as ReportKey)) {
    throw new ForbiddenError('You do not have access to this report');
  }
  return view;
}

async function getOwnedOrThrow(institutionId: string, requester: Requester, id: string) {
  const s = await prisma.reportSchedule.findFirst({ where: { id, ...scopeWhere(institutionId, requester) }, select: scheduleSelect });
  if (!s) throw new NotFoundError('Schedule not found');
  return s;
}

export async function listSchedules(institutionId: string, requester: Requester, q: ScheduleQueryDtoType) {
  const where = scopeWhere(institutionId, requester);
  const [items, total, clock] = await Promise.all([
    prisma.reportSchedule.findMany({
      where,
      select: scheduleSelect,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.reportSchedule.count({ where }),
    institutionClock(institutionId),
  ]);
  return {
    items: items.map((s) => serialize(s, clock.offset)),
    meta: { total, page: q.page, pageSize: q.pageSize },
    demo: isEmailDemoMode(),
    timeZone: clock.timeZone,
  };
}

export async function createSchedule(institutionId: string, requester: Requester, data: CreateScheduleDtoType) {
  await assertView(institutionId, requester, data.savedViewId);
  await assertRecipients(institutionId, data.recipients);
  const created = await prisma.reportSchedule.create({
    data: {
      institutionId,
      savedViewId: data.savedViewId,
      cron: data.cron,
      recipients: data.recipients,
      format: data.format,
      isActive: data.isActive,
      createdByUserId: requester.sub,
    },
    select: scheduleSelect,
  });
  logger.info('Report schedule created', { institutionId, scheduleId: created.id });
  const clock = await institutionClock(institutionId);
  return { ...serialize(created, clock.offset), demo: isEmailDemoMode() };
}

export async function updateSchedule(institutionId: string, requester: Requester, id: string, data: UpdateScheduleDtoType) {
  await getOwnedOrThrow(institutionId, requester, id);
  if (data.savedViewId) await assertView(institutionId, requester, data.savedViewId);
  if (data.recipients) await assertRecipients(institutionId, data.recipients);
  const updated = await prisma.reportSchedule.update({
    where: { id },
    data: {
      ...(data.savedViewId !== undefined ? { savedViewId: data.savedViewId } : {}),
      ...(data.cron !== undefined ? { cron: data.cron } : {}),
      ...(data.recipients !== undefined ? { recipients: data.recipients } : {}),
      ...(data.format !== undefined ? { format: data.format } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    select: scheduleSelect,
  });
  const clock = await institutionClock(institutionId);
  return serialize(updated, clock.offset);
}

export async function deleteSchedule(institutionId: string, requester: Requester, id: string) {
  await getOwnedOrThrow(institutionId, requester, id);
  await prisma.reportSchedule.deleteMany({ where: { id, institutionId } });
  logger.info('Report schedule deleted', { institutionId, scheduleId: id });
}

/** Runs a schedule immediately (regardless of its cron) and advances lastRunAt. */
export async function runScheduleNow(institutionId: string, requester: Requester, id: string) {
  await getOwnedOrThrow(institutionId, requester, id);
  const schedule = await prisma.reportSchedule.findFirst({ where: { id, institutionId }, include: scheduleRunInclude });
  if (!schedule) throw new NotFoundError('Schedule not found');
  const now = new Date();
  let result;
  try {
    result = await executeSchedule(schedule, now);
  } catch (err) {
    if (err instanceof Error && !('statusCode' in err)) throw new BadRequestError(err.message);
    throw err;
  }
  await prisma.reportSchedule.updateMany({ where: { id, institutionId }, data: { lastRunAt: now } });
  return { ...result, lastRunAt: now };
}

/** Next fire times of a cron expression in the institution's timezone. */
export async function previewCron(institutionId: string, q: CronPreviewDtoType) {
  const clock = await institutionClock(institutionId);
  try {
    return { timeZone: clock.timeZone, runs: nextRuns(q.cron, new Date(), q.count, clock.offset) };
  } catch (err) {
    throw new BadRequestError((err as Error).message);
  }
}

/** Active staff with an email address — the allowed recipient list. */
export async function listRecipientOptions(institutionId: string) {
  const users = await prisma.user.findMany({
    where: { institutionId, isActive: true, role: { notIn: [UserRole.STUDENT, UserRole.GUARDIAN] } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 500,
  });
  return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, role: u.role }));
}
