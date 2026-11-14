import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import {
  computePlatformAccess,
  daysPastDue,
  dhakaMidnight,
  duePaisa,
  paisaToNumber,
  UNPAID_STATUSES,
  type PlatformAccessLevel,
} from './platformBilling.logic';
import { presentInvoice } from './platformBilling.service';
import { actorName } from './platformBilling.shared';
import type { AddActivityDtoType, CollectionsQueryDtoType } from './platformBilling.dto';

// =============================================================================
// P1 collections board (super-admin): every school with unpaid platform
// invoices, how much and how late, the last contact, the next follow-up, who
// owns it, and the access level. Per school: a timeline that merges call
// logs / notes / promises, automatic payment and access entries, and every
// reminder sent (from PlatformReminderLog).
// =============================================================================

function dhakaDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return dhakaMidnight(y, m, d);
}

export interface BoardRow {
  id: string; // institution id (DataTable key)
  institutionId: string;
  name: string;
  slug: string;
  amountDue: number;
  unpaidInvoices: number;
  daysOverdue: number;
  oldestDueDate: Date | null;
  lastContactAt: Date | null;
  lastContactType: string | null;
  nextFollowUpAt: Date | null;
  promiseDate: Date | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  accessLevel: PlatformAccessLevel;
  accessSource: string;
  billingActive: boolean;
}

export async function getCollectionsBoard(q: CollectionsQueryDtoType, viewerUserId: string, now: Date = new Date()) {
  const unpaid = await prisma.platformInvoice.findMany({
    where: { status: { in: UNPAID_STATUSES } },
    select: { institutionId: true, total: true, paidAmount: true, waivedAmount: true, status: true, dueDate: true },
  });

  const agg = new Map<string, { due: number; count: number; oldest: Date | null }>();
  for (const inv of unpaid) {
    const due = duePaisa(inv);
    if (due <= 0) continue;
    const a = agg.get(inv.institutionId) ?? { due: 0, count: 0, oldest: null };
    a.due += due;
    a.count += 1;
    if (!a.oldest || inv.dueDate < a.oldest) a.oldest = inv.dueDate;
    agg.set(inv.institutionId, a);
  }
  const ids = [...agg.keys()];
  if (ids.length === 0) return { rows: [] as BoardRow[], totals: { schools: 0, amountDue: 0, overdueSchools: 0 } };

  const [schools, contacts, reminders, promises] = await Promise.all([
    prisma.institution.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        platformBillingProfile: {
          select: { isActive: true, accessOverride: true, autoRestrictAfterDays: true, collectionAssigneeId: true, nextFollowUpAt: true },
        },
      },
    }),
    prisma.platformCollectionActivity.groupBy({
      by: ['institutionId'],
      where: { institutionId: { in: ids }, type: { in: ['CALL', 'NOTE', 'PROMISE_TO_PAY'] } },
      _max: { createdAt: true },
    }),
    prisma.platformReminderLog.groupBy({
      by: ['institutionId'],
      where: { institutionId: { in: ids }, result: 'SENT' },
      _max: { createdAt: true },
    }),
    prisma.platformCollectionActivity.findMany({
      where: { institutionId: { in: ids }, type: 'PROMISE_TO_PAY' },
      orderBy: { createdAt: 'desc' },
      distinct: ['institutionId'],
      select: { institutionId: true, promiseDate: true },
    }),
  ]);

  const lastContact = new Map(contacts.map((c) => [c.institutionId, c._max.createdAt]));
  const lastReminder = new Map(reminders.map((r) => [r.institutionId, r._max.createdAt]));
  const promiseOf = new Map(promises.map((p) => [p.institutionId, p.promiseDate]));
  const assigneeIds = [...new Set(schools.map((s) => s.platformBillingProfile?.collectionAssigneeId).filter((x): x is string => !!x))];
  const assignees = assigneeIds.length
    ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const assigneeName = new Map(assignees.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  let rows: BoardRow[] = schools.map((s) => {
    const a = agg.get(s.id)!;
    const past = a.oldest ? daysPastDue(a.oldest, now) : 0;
    const daysOverdue = past > 0 ? past : 0;
    const p = s.platformBillingProfile;
    const access = s.isActive
      ? computePlatformAccess({
          billingActive: p?.isActive ?? false,
          override: p?.accessOverride ?? null,
          autoRestrictAfterDays: p?.autoRestrictAfterDays ?? null,
          maxDaysOverdue: daysOverdue || null,
        })
      : { level: 'DISABLED' as const, source: 'SUSPENDED' };
    const call = lastContact.get(s.id) ?? null;
    const rem = lastReminder.get(s.id) ?? null;
    const lastContactAt = call && rem ? (call > rem ? call : rem) : call ?? rem;
    return {
      id: s.id,
      institutionId: s.id,
      name: s.name,
      slug: s.slug,
      amountDue: paisaToNumber(a.due),
      unpaidInvoices: a.count,
      daysOverdue,
      oldestDueDate: a.oldest,
      lastContactAt,
      lastContactType: lastContactAt ? (lastContactAt === call ? 'CONTACT' : 'REMINDER') : null,
      nextFollowUpAt: p?.nextFollowUpAt ?? null,
      promiseDate: promiseOf.get(s.id) ?? null,
      assigneeUserId: p?.collectionAssigneeId ?? null,
      assigneeName: p?.collectionAssigneeId ? assigneeName.get(p.collectionAssigneeId) ?? null : null,
      accessLevel: access.level,
      accessSource: access.source,
      billingActive: p?.isActive ?? false,
    };
  });

  if (q.q) {
    const needle = q.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle) || r.slug.toLowerCase().includes(needle));
  }
  if (q.assignee) {
    const target = q.assignee === 'me' ? viewerUserId : q.assignee;
    rows = rows.filter((r) => (q.assignee === 'none' ? !r.assigneeUserId : r.assigneeUserId === target));
  }
  if (q.accessLevel) rows = rows.filter((r) => r.accessLevel === q.accessLevel);
  if (q.overdueOnly === 'true') rows = rows.filter((r) => r.daysOverdue > 0);

  const time = (d: Date | null, empty: number) => (d ? d.getTime() : empty);
  const sorters: Record<CollectionsQueryDtoType['sort'], (a: BoardRow, b: BoardRow) => number> = {
    amount: (a, b) => b.amountDue - a.amountDue,
    daysOverdue: (a, b) => b.daysOverdue - a.daysOverdue || b.amountDue - a.amountDue,
    nextFollowUp: (a, b) => time(a.nextFollowUpAt, Infinity) - time(b.nextFollowUpAt, Infinity),
    lastContact: (a, b) => time(a.lastContactAt, 0) - time(b.lastContactAt, 0),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  rows.sort(sorters[q.sort]);

  return {
    rows,
    totals: {
      schools: rows.length,
      amountDue: Math.round(rows.reduce((s, r) => s + r.amountDue, 0) * 100) / 100,
      overdueSchools: rows.filter((r) => r.daysOverdue > 0).length,
    },
  };
}

export interface TimelineEntry {
  id: string;
  kind: 'ACTIVITY' | 'REMINDER';
  type: string;
  at: Date;
  body: string | null;
  callOutcome?: string | null;
  promiseDate?: Date | null;
  nextFollowUpAt?: Date | null;
  actorName?: string | null;
  channel?: string;
  result?: string;
  recipient?: string;
  providerResponse?: string | null;
  invoiceNumber?: string | null;
}

export async function getSchoolCollections(institutionId: string, now: Date = new Date()) {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { id: true, name: true, slug: true, isActive: true, phone: true, contactPhone: true, platformBillingProfile: true },
  });
  if (!institution) throw new NotFoundError('Institution not found');

  const [invoices, activities, reminders] = await Promise.all([
    prisma.platformInvoice.findMany({ where: { institutionId }, orderBy: { period: 'desc' }, take: 24 }),
    prisma.platformCollectionActivity.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { invoice: { select: { invoiceNumber: true } } },
    }),
    prisma.platformReminderLog.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { invoice: { select: { invoiceNumber: true } } },
    }),
  ]);

  const timeline: TimelineEntry[] = [
    ...activities.map((a) => ({
      id: a.id,
      kind: 'ACTIVITY' as const,
      type: a.type,
      at: a.createdAt,
      body: a.body,
      callOutcome: a.callOutcome,
      promiseDate: a.promiseDate,
      nextFollowUpAt: a.nextFollowUpAt,
      actorName: a.actorName,
      invoiceNumber: a.invoice?.invoiceNumber ?? null,
    })),
    ...reminders.map((r) => ({
      id: r.id,
      kind: 'REMINDER' as const,
      type: r.kind,
      at: r.createdAt,
      body: null,
      channel: r.channel,
      result: r.result,
      recipient: r.recipient,
      providerResponse: r.providerResponse,
      invoiceNumber: r.invoice?.invoiceNumber ?? null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const assigneeId = institution.platformBillingProfile?.collectionAssigneeId;
  return {
    institution: { id: institution.id, name: institution.name, slug: institution.slug, isActive: institution.isActive, phone: institution.contactPhone ?? institution.phone },
    profile: institution.platformBillingProfile,
    assigneeName: assigneeId ? await actorName(assigneeId) : null,
    invoices: invoices.map((i) => presentInvoice(i, now)),
    timeline: timeline.slice(0, 300),
  };
}

export async function addActivity(actorUserId: string, institutionId: string, dto: AddActivityDtoType) {
  const profile = await prisma.institutionBillingProfile.findUnique({ where: { institutionId }, select: { id: true } });
  if (!profile) throw new NotFoundError('This school has no billing profile');
  if (dto.invoiceId) {
    const inv = await prisma.platformInvoice.findFirst({ where: { id: dto.invoiceId, institutionId }, select: { id: true } });
    if (!inv) throw new BadRequestError('That invoice does not belong to this school');
  }
  if (dto.assigneeUserId) {
    const staff = await prisma.user.findFirst({ where: { id: dto.assigneeUserId, role: 'SUPER_ADMIN' }, select: { id: true } });
    if (!staff) throw new BadRequestError('Assign to a PeopleNIT team member (super admin)');
  }

  const promiseDate = dto.promiseDate ? dhakaDay(dto.promiseDate) : null;
  // A promise without an explicit follow-up is followed up on the promised day.
  const followUp = dto.nextFollowUpAt === null ? null : dto.nextFollowUpAt ? dhakaDay(dto.nextFollowUpAt) : promiseDate;

  const activity = await prisma.platformCollectionActivity.create({
    data: {
      institutionId,
      invoiceId: dto.invoiceId ?? null,
      type: dto.type,
      callOutcome: dto.type === 'CALL' ? dto.callOutcome ?? null : null,
      body: dto.body ?? null,
      promiseDate,
      nextFollowUpAt: followUp,
      assigneeUserId: dto.assigneeUserId ?? null,
      actorUserId,
      actorName: await actorName(actorUserId),
    },
  });

  const profileUpdate: { nextFollowUpAt?: Date | null; collectionAssigneeId?: string | null } = {};
  if (dto.nextFollowUpAt !== undefined || promiseDate) profileUpdate.nextFollowUpAt = followUp;
  if (dto.assigneeUserId !== undefined) profileUpdate.collectionAssigneeId = dto.assigneeUserId;
  if (Object.keys(profileUpdate).length) {
    await prisma.institutionBillingProfile.update({ where: { institutionId }, data: profileUpdate });
  }
  return activity;
}

/** PeopleNIT team members (SUPER_ADMIN users) — assignee picker. */
export async function listPlatformStaff() {
  return prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { firstName: 'asc' },
  });
}
