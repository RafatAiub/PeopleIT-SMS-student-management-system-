import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { isModuleEnabled } from '../institution/modules.service';
import { buildWhere, enquirySelect } from '../enquiries/enquiries.repository';
import { appendNote } from '../enquiries/enquiries.logic';
import {
  computeConversion,
  computeStageFunnel,
  dhakaDayBounds,
  duplicateReasons,
  findDuplicateGroups,
  mergeFill,
  overallConversion,
  toCsv,
  type ReportGroupBy,
  type ReportRow,
} from './crm.logic';
import { listStages, logActivity, type Actor } from './crm.stages';
import type {
  BoardFiltersDtoType,
  ContactQueryDtoType,
  CreateContactDtoType,
  CreateTaskDtoType,
  DuplicateCheckDtoType,
  LogActivityDtoType,
  ReportQueryDtoType,
  TaskQueryDtoType,
  UpdateContactDtoType,
  UpdateTaskDtoType,
} from './crm.dto';

// =============================================================================
// T4 Admissions CRM service. Every query is scoped by institutionId.
// Managers (SUPER_ADMIN support session, ADMIN) see everything; other staff
// only reach their own tasks (checked here, not just in the router).
// =============================================================================

export interface CrmCtx {
  institutionId: string;
  userId: string;
  role: UserRole | string;
}

const MANAGER_ROLES = new Set<string>(['SUPER_ADMIN', 'ADMIN']);
export const isManager = (ctx: CrmCtx) => MANAGER_ROLES.has(ctx.role);
const actorOf = (ctx: CrmCtx): Actor => ({ userId: ctx.userId });

/**
 * T5: a task on a trashed enquiry is hidden with it. The relation is optional,
 * so this can't be a generic child scope; `enquiry: {}` gets deletedAt: null
 * from the soft-delete layer.
 */
export const LIVE_TASK: Prisma.CrmTaskWhereInput = { OR: [{ enquiryId: null }, { enquiry: {} }] };

const STAFF_ROLES = ['ADMIN', 'TEACHER', 'MANAGEMENT', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER'] as const;

async function assertStaff(institutionId: string, userId: string | null | undefined) {
  if (!userId) return;
  const user = await prisma.user.findFirst({
    where: { id: userId, institutionId, isActive: true, role: { in: [...STAFF_ROLES] } },
    select: { id: true },
  });
  if (!user) throw new NotFoundError('Staff member not found in this institution');
}

async function enquiryOrThrow(institutionId: string, id: string) {
  const e = await prisma.admissionEnquiry.findFirst({ where: { id, institutionId }, select: enquirySelect });
  if (!e) throw new NotFoundError('Enquiry not found');
  return e;
}

async function userNames(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
}

// ── Stages & board ──────────────────────────────────────────────────────────

export async function getStagesWithCounts(institutionId: string) {
  const stages = await listStages(institutionId);
  const counts = await prisma.admissionEnquiry.groupBy({ by: ['stageId'], where: { institutionId }, _count: { _all: true } });
  const map = new Map(counts.map((c) => [c.stageId, c._count._all]));
  return stages.map((s) => ({ ...s, enquiryCount: map.get(s.id) ?? 0 }));
}

export async function getBoard(ctx: CrmCtx, f: BoardFiltersDtoType) {
  const stages = await listStages(ctx.institutionId);
  const base = buildWhere(ctx.institutionId, {
    search: f.search,
    assignedToUserId: f.assignedToUserId,
    ownerUserId: f.mine === 'true' ? ctx.userId : undefined,
    due: f.due,
    source: f.source,
    classInterested: f.classInterested,
    priority: f.priority,
  });
  // `due` constrains status to open stages; on the board that just empties the won/lost columns.
  const [cards, counts] = await Promise.all([
    Promise.all(
      stages.map((s) =>
        prisma.admissionEnquiry.findMany({
          where: { ...base, stageId: s.id },
          select: enquirySelect,
          orderBy: [{ stageChangedAt: 'desc' }, { updatedAt: 'desc' }],
          take: f.limit,
        }),
      ),
    ),
    prisma.admissionEnquiry.groupBy({ by: ['stageId'], where: base, _count: { _all: true } }),
  ]);
  const countMap = new Map(counts.map((c) => [c.stageId, c._count._all]));
  return {
    columns: stages.map((stage, i) => ({ stage, total: countMap.get(stage.id) ?? 0, items: cards[i] })),
    // Enquiries whose stage was deleted out from under them (should not happen; shown so nothing is invisible).
    unstaged: countMap.get(null) ?? 0,
  };
}

/** Distinct sources and classes for the quick-filter dropdowns. */
export async function getFilterOptions(institutionId: string) {
  const [sources, classes] = await Promise.all([
    prisma.admissionEnquiry.groupBy({ by: ['source'], where: { institutionId, source: { not: null } }, _count: { _all: true }, orderBy: { source: 'asc' }, take: 100 }),
    prisma.admissionEnquiry.groupBy({ by: ['classInterested'], where: { institutionId, classInterested: { not: null } }, _count: { _all: true }, orderBy: { classInterested: 'asc' }, take: 200 }),
  ]);
  return {
    sources: sources.map((s) => s.source as string),
    classes: classes.map((c) => c.classInterested as string).filter((c) => c.trim() !== ''),
  };
}

// ── Timeline ────────────────────────────────────────────────────────────────

export async function getTimeline(ctx: CrmCtx, enquiryId: string) {
  await enquiryOrThrow(ctx.institutionId, enquiryId);
  const [activities, tasks] = await Promise.all([
    prisma.crmActivity.findMany({
      where: { institutionId: ctx.institutionId, enquiryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 300,
      select: { id: true, type: true, body: true, metadata: true, actorUserId: true, actorName: true, createdAt: true },
    }),
    prisma.crmTask.findMany({
      where: { institutionId: ctx.institutionId, enquiryId },
      orderBy: [{ done: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
      select: taskSelect,
    }),
  ]);
  const names = await userNames(activities.map((a) => a.actorUserId));
  return {
    activities: activities.map((a) => ({ ...a, actorName: (a.actorUserId && names.get(a.actorUserId)) || a.actorName || null })),
    tasks,
  };
}

export async function addActivity(ctx: CrmCtx, enquiryId: string, input: LogActivityDtoType) {
  await enquiryOrThrow(ctx.institutionId, enquiryId);
  const at = input.at ?? undefined;
  if (at && at.getTime() > Date.now() + 5 * 60 * 1000) throw new ValidationError('An activity cannot be in the future');
  const row = await logActivity(prisma, { institutionId: ctx.institutionId, enquiryId, type: input.type, body: input.body, at, actor: actorOf(ctx) });
  // Touch the enquiry so "last updated" reflects contact made.
  await prisma.admissionEnquiry.updateMany({ where: { id: enquiryId, institutionId: ctx.institutionId }, data: { updatedAt: new Date() } });
  return row;
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export const taskSelect = {
  id: true,
  title: true,
  notes: true,
  dueAt: true,
  done: true,
  doneAt: true,
  assigneeUserId: true,
  assignee: { select: { id: true, firstName: true, lastName: true } },
  enquiryId: true,
  enquiry: { select: { id: true, studentName: true, phone: true, guardianName: true } },
  createdById: true,
  createdAt: true,
} as const;

export async function listTasks(ctx: CrmCtx, q: TaskQueryDtoType) {
  const manager = isManager(ctx);
  const where: Prisma.CrmTaskWhereInput = { institutionId: ctx.institutionId, AND: [LIVE_TASK] };
  if (!manager || q.scope === 'mine') where.assigneeUserId = ctx.userId;
  else if (q.assigneeUserId) where.assigneeUserId = q.assigneeUserId;
  if (q.enquiryId) {
    if (!manager) throw new ForbiddenError('Only admins can list an enquiry’s tasks');
    where.enquiryId = q.enquiryId;
  }
  const { start, end } = dhakaDayBounds();
  if (q.status === 'open') where.done = false;
  else if (q.status === 'done') where.done = true;
  else if (q.status === 'overdue') Object.assign(where, { done: false, dueAt: { lt: start } });
  else if (q.status === 'today') Object.assign(where, { done: false, dueAt: { gte: start, lt: end } });

  const [items, total] = await prisma.$transaction([
    prisma.crmTask.findMany({
      where,
      select: taskSelect,
      orderBy: q.status === 'done' ? [{ doneAt: 'desc' }] : [{ done: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.crmTask.count({ where }),
  ]);
  return { items, total };
}

/** Badge counts for the signed-in user's open tasks. */
export async function taskSummary(ctx: CrmCtx) {
  const { start, end } = dhakaDayBounds();
  const mine: Prisma.CrmTaskWhereInput = { institutionId: ctx.institutionId, assigneeUserId: ctx.userId, done: false, AND: [LIVE_TASK] };
  const [open, overdue, today] = await Promise.all([
    prisma.crmTask.count({ where: mine }),
    prisma.crmTask.count({ where: { ...mine, dueAt: { lt: start } } }),
    prisma.crmTask.count({ where: { ...mine, dueAt: { gte: start, lt: end } } }),
  ]);
  return { open, overdue, today };
}

export async function createTask(ctx: CrmCtx, input: CreateTaskDtoType) {
  let enquiry: { id: string; assignedToUserId: string | null } | null = null;
  if (input.enquiryId) {
    enquiry = await prisma.admissionEnquiry.findFirst({ where: { id: input.enquiryId, institutionId: ctx.institutionId }, select: { id: true, assignedToUserId: true } });
    if (!enquiry) throw new NotFoundError('Enquiry not found');
  }
  // Default owner: the enquiry's owner, else whoever created the task.
  const assigneeUserId = input.assigneeUserId === undefined ? enquiry?.assignedToUserId ?? ctx.userId : input.assigneeUserId;
  await assertStaff(ctx.institutionId, assigneeUserId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.crmTask.create({
      data: {
        institutionId: ctx.institutionId,
        enquiryId: enquiry?.id ?? null,
        title: input.title,
        notes: input.notes ?? null,
        dueAt: input.dueAt ?? null,
        assigneeUserId: assigneeUserId ?? null,
        createdById: ctx.userId,
      },
      select: taskSelect,
    });
    if (enquiry) {
      await logActivity(tx, {
        institutionId: ctx.institutionId,
        enquiryId: enquiry.id,
        type: 'TASK_CREATED',
        body: task.title,
        metadata: { taskId: task.id, dueAt: task.dueAt?.toISOString() ?? null, assigneeUserId: task.assigneeUserId },
        actor: actorOf(ctx),
      });
    }
    return task;
  });
}

async function taskOrThrow(ctx: CrmCtx, id: string) {
  const task = await prisma.crmTask.findFirst({ where: { id, institutionId: ctx.institutionId, AND: [LIVE_TASK] }, select: taskSelect });
  if (!task) throw new NotFoundError('Task not found');
  // Non-managers may only touch their own tasks; others look absent.
  if (!isManager(ctx) && task.assigneeUserId !== ctx.userId) throw new NotFoundError('Task not found');
  return task;
}

export async function updateTask(ctx: CrmCtx, id: string, input: UpdateTaskDtoType) {
  const task = await taskOrThrow(ctx, id);
  const manager = isManager(ctx);
  if (!manager && (input.assigneeUserId !== undefined || input.title !== undefined || input.dueAt !== undefined)) {
    throw new ForbiddenError('You can mark your task done or add notes; ask an admin to change anything else');
  }
  if (input.assigneeUserId !== undefined) await assertStaff(ctx.institutionId, input.assigneeUserId);
  const data: Prisma.CrmTaskUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt;
  if (input.assigneeUserId !== undefined) data.assigneeUserId = input.assigneeUserId;
  const toggled = input.done !== undefined && input.done !== task.done;
  if (toggled) {
    data.done = input.done;
    data.doneAt = input.done ? new Date() : null;
  }
  return prisma.$transaction(async (tx) => {
    // Guarded on the previous `done` so two clicks can't log twice.
    const res = await tx.crmTask.updateMany({ where: { id, institutionId: ctx.institutionId, ...(toggled ? { done: task.done } : {}) }, data });
    if (res.count && toggled && task.enquiryId) {
      await logActivity(tx, {
        institutionId: ctx.institutionId,
        enquiryId: task.enquiryId,
        type: input.done ? 'TASK_DONE' : 'TASK_REOPENED',
        body: task.title,
        metadata: { taskId: task.id },
        actor: actorOf(ctx),
      });
    }
    return tx.crmTask.findFirst({ where: { id }, select: taskSelect });
  });
}

export async function deleteTask(ctx: CrmCtx, id: string) {
  if (!isManager(ctx)) throw new ForbiddenError('Only admins can delete tasks');
  await taskOrThrow(ctx, id);
  await prisma.crmTask.deleteMany({ where: { id, institutionId: ctx.institutionId } });
}

// ── Contacts ────────────────────────────────────────────────────────────────

const contactSelect = {
  id: true,
  type: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  organisation: true,
  tags: true,
  notes: true,
  ownerUserId: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
  enquiryId: true,
  enquiry: { select: { id: true, studentName: true } },
  donorId: true,
  donor: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

export async function listContacts(ctx: CrmCtx, q: ContactQueryDtoType) {
  const where: Prisma.CrmContactWhereInput = {
    institutionId: ctx.institutionId,
    ...(q.type ? { type: q.type } : {}),
    ...(q.tag ? { tags: { has: q.tag.toLowerCase() } } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { phone: { contains: q.search } },
            { email: { contains: q.search, mode: 'insensitive' } },
            { organisation: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total, donationsOn] = await Promise.all([
    prisma.crmContact.findMany({ where, select: contactSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.crmContact.count({ where }),
    isModuleEnabled(ctx.institutionId, 'islamic.donations'),
  ]);
  // Donor links are only shown while the donations module is on.
  return { items: donationsOn ? items : items.map((c) => ({ ...c, donorId: null, donor: null })), total, donationsEnabled: donationsOn };
}

export async function contactTags(institutionId: string) {
  const rows = await prisma.$queryRaw<Array<{ tag: string; n: bigint }>>`
    SELECT t AS tag, COUNT(*)::bigint AS n FROM "CrmContact", unnest("tags") AS t
    WHERE "institutionId" = ${institutionId} GROUP BY t ORDER BY n DESC, t ASC LIMIT 100`;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.n) }));
}

async function checkContactLinks(ctx: CrmCtx, input: { enquiryId?: string | null; donorId?: string | null; ownerUserId?: string | null }) {
  if (input.enquiryId) {
    const e = await prisma.admissionEnquiry.findFirst({ where: { id: input.enquiryId, institutionId: ctx.institutionId }, select: { id: true } });
    if (!e) throw new NotFoundError('Enquiry not found');
  }
  if (input.donorId) {
    if (!(await isModuleEnabled(ctx.institutionId, 'islamic.donations'))) throw new ValidationError('Turn on Donations in Settings → Modules to link donors');
    const d = await prisma.donor.findFirst({ where: { id: input.donorId, institutionId: ctx.institutionId }, select: { id: true } });
    if (!d) throw new NotFoundError('Donor not found');
  }
  await assertStaff(ctx.institutionId, input.ownerUserId);
}

export async function createContact(ctx: CrmCtx, input: CreateContactDtoType) {
  await checkContactLinks(ctx, input);
  return prisma.crmContact.create({
    data: {
      institutionId: ctx.institutionId,
      type: input.type,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      organisation: input.organisation ?? null,
      tags: input.tags,
      notes: input.notes ?? null,
      ownerUserId: input.ownerUserId ?? null,
      enquiryId: input.enquiryId ?? null,
      donorId: input.donorId ?? null,
    },
    select: contactSelect,
  });
}

export async function updateContact(ctx: CrmCtx, id: string, input: UpdateContactDtoType) {
  const existing = await prisma.crmContact.findFirst({ where: { id, institutionId: ctx.institutionId }, select: { id: true, phone: true, email: true } });
  if (!existing) throw new NotFoundError('Contact not found');
  await checkContactLinks(ctx, input);
  const phone = input.phone !== undefined ? input.phone : existing.phone;
  const email = input.email !== undefined ? input.email : existing.email;
  if (!phone && !email) throw new ValidationError('Give a phone number or an email');
  const data: Prisma.CrmContactUncheckedUpdateInput = {};
  for (const k of ['type', 'name', 'phone', 'email', 'address', 'organisation', 'tags', 'notes', 'ownerUserId', 'enquiryId', 'donorId'] as const) {
    if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  }
  await prisma.crmContact.updateMany({ where: { id, institutionId: ctx.institutionId }, data: data as Prisma.CrmContactUncheckedUpdateManyInput });
  return prisma.crmContact.findFirst({ where: { id, institutionId: ctx.institutionId }, select: contactSelect });
}

export async function deleteContact(ctx: CrmCtx, id: string) {
  const res = await prisma.crmContact.deleteMany({ where: { id, institutionId: ctx.institutionId } });
  if (!res.count) throw new NotFoundError('Contact not found');
}

/** Finds (by phone, then email) or creates the donor profile for a contact and links it. Donations module must be on. */
export async function linkContactToDonor(ctx: CrmCtx, id: string) {
  if (!(await isModuleEnabled(ctx.institutionId, 'islamic.donations'))) throw new ValidationError('Turn on Donations in Settings → Modules to link donors');
  const contact = await prisma.crmContact.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!contact) throw new NotFoundError('Contact not found');
  if (contact.donorId) return prisma.crmContact.findFirst({ where: { id }, select: contactSelect });
  const or: Prisma.DonorWhereInput[] = [];
  if (contact.phone) or.push({ phone: contact.phone });
  if (contact.email) or.push({ email: { equals: contact.email, mode: 'insensitive' } });
  let donor = or.length ? await prisma.donor.findFirst({ where: { institutionId: ctx.institutionId, OR: or }, select: { id: true } }) : null;
  if (!donor) {
    donor = await prisma.donor.create({
      data: { institutionId: ctx.institutionId, name: contact.name, phone: contact.phone, email: contact.email, address: contact.address, notes: contact.notes },
      select: { id: true },
    });
  }
  await prisma.crmContact.updateMany({ where: { id, institutionId: ctx.institutionId }, data: { donorId: donor.id, type: contact.type === 'OTHER' ? 'DONOR' : contact.type } });
  return prisma.crmContact.findFirst({ where: { id }, select: contactSelect });
}

// ── Duplicates & merge ──────────────────────────────────────────────────────

const DUP_SCAN_LIMIT = 5000;
const dupSelect = {
  id: true,
  studentName: true,
  guardianName: true,
  phone: true,
  email: true,
  classInterested: true,
  status: true,
  stage: { select: { id: true, name: true, color: true } },
  convertedStudentId: true,
  createdAt: true,
} as const;

/** Enquiries that look like the given person (form warning before saving). */
export async function checkDuplicates(ctx: CrmCtx, input: DuplicateCheckDtoType) {
  if (!input.studentName && !input.phone && !input.email) return [];
  const rows = await prisma.admissionEnquiry.findMany({
    where: { institutionId: ctx.institutionId, ...(input.excludeId ? { id: { not: input.excludeId } } : {}) },
    select: dupSelect,
    orderBy: { createdAt: 'desc' },
    take: DUP_SCAN_LIMIT,
  });
  const probe = { id: '__probe__', studentName: input.studentName, guardianName: input.guardianName, phone: input.phone, email: input.email };
  return rows
    .map((r) => ({ ...r, reasons: duplicateReasons(probe, r) }))
    .filter((r) => r.reasons.length > 0)
    .slice(0, 10);
}

/** All duplicate clusters among the most recent enquiries. */
export async function listDuplicateGroups(ctx: CrmCtx) {
  const rows = await prisma.admissionEnquiry.findMany({
    where: { institutionId: ctx.institutionId },
    select: dupSelect,
    orderBy: { createdAt: 'desc' },
    take: DUP_SCAN_LIMIT,
  });
  const groups = findDuplicateGroups(rows);
  return { scanned: rows.length, groups: groups.slice(0, 200) };
}

/**
 * Merges `dropId` into `keepId`: empty fields on the kept enquiry are filled
 * from the other, notes are combined, activities/tasks/contacts move over, a
 * MERGED activity keeps a snapshot of the removed record, then the duplicate is
 * deleted. Both converted to (different) applications → refused.
 */
export async function mergeEnquiries(ctx: CrmCtx, keepId: string, dropId: string) {
  const merged = await prisma.$transaction(async (tx) => {
    const [keep, drop] = await Promise.all([
      tx.admissionEnquiry.findFirst({ where: { id: keepId, institutionId: ctx.institutionId } }),
      tx.admissionEnquiry.findFirst({ where: { id: dropId, institutionId: ctx.institutionId } }),
    ]);
    if (!keep || !drop) throw new NotFoundError('Enquiry not found');
    if (keep.convertedStudentId && drop.convertedStudentId && keep.convertedStudentId !== drop.convertedStudentId) {
      throw new ConflictError('Both enquiries were converted to different applications — handle the applications first');
    }
    const patch: Prisma.AdmissionEnquiryUncheckedUpdateManyInput = { ...(mergeFill(keep as never, drop as never) as object) };
    if (!keep.convertedStudentId && drop.convertedStudentId) patch.convertedStudentId = drop.convertedStudentId;
    if (drop.notes) patch.notes = appendNote(keep.notes, `Merged from ${drop.studentName} (${drop.phone}): ${drop.notes}`);
    if (!keep.wonAt && drop.wonAt) patch.wonAt = drop.wonAt;
    // Keep the earliest enquiry date, so "days to admit" stays honest.
    if (drop.createdAt < keep.createdAt) patch.createdAt = drop.createdAt;

    await tx.crmActivity.updateMany({ where: { institutionId: ctx.institutionId, enquiryId: drop.id }, data: { enquiryId: keep.id } });
    await tx.crmTask.updateMany({ where: { institutionId: ctx.institutionId, enquiryId: drop.id }, data: { enquiryId: keep.id } });
    await tx.crmContact.updateMany({ where: { institutionId: ctx.institutionId, enquiryId: drop.id }, data: { enquiryId: keep.id } });
    if (Object.keys(patch).length) await tx.admissionEnquiry.updateMany({ where: { id: keep.id, institutionId: ctx.institutionId }, data: patch });
    await logActivity(tx, {
      institutionId: ctx.institutionId,
      enquiryId: keep.id,
      type: 'MERGED',
      body: `Merged duplicate: ${drop.studentName} (${drop.phone})`,
      metadata: JSON.parse(JSON.stringify({ merged: drop })) as Prisma.InputJsonValue,
      actor: actorOf(ctx),
    });
    await tx.admissionEnquiry.deleteMany({ where: { id: drop.id, institutionId: ctx.institutionId } });
    return keep.id;
  });
  logger.info('Enquiries merged', { institutionId: ctx.institutionId, keepId, dropId });
  return enquiryOrThrow(ctx.institutionId, merged);
}

// ── Conversion report ───────────────────────────────────────────────────────

const REPORT_ROW_LIMIT = 20000;

export async function getReport(ctx: CrmCtx, q: ReportQueryDtoType) {
  const createdAt = q.from || q.to ? { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } : undefined;
  const [stages, enquiries] = await Promise.all([
    listStages(ctx.institutionId),
    prisma.admissionEnquiry.findMany({
      where: { institutionId: ctx.institutionId, ...(createdAt ? { createdAt } : {}) },
      select: { id: true, createdAt: true, wonAt: true, source: true, classInterested: true, assignedToUserId: true, stageId: true },
      orderBy: { createdAt: 'asc' },
      take: REPORT_ROW_LIMIT,
    }),
  ]);
  const lostIds = new Set(stages.filter((s) => s.isLost).map((s) => s.id));
  const lostEnquiryIds = enquiries.filter((e) => e.stageId && lostIds.has(e.stageId)).map((e) => e.id);
  // History only matters for lost enquiries (how far did they get?).
  const history = lostEnquiryIds.length
    ? await prisma.crmActivity.findMany({
        where: { institutionId: ctx.institutionId, type: 'STAGE_CHANGE', enquiryId: { in: lostEnquiryIds.slice(0, 5000) } },
        select: { enquiryId: true, metadata: true },
      })
    : [];
  const visited = new Map<string, string[]>();
  for (const h of history) {
    const m = (h.metadata ?? {}) as { fromStageId?: string | null; toStageId?: string | null };
    const list = visited.get(h.enquiryId) ?? [];
    if (m.fromStageId) list.push(m.fromStageId);
    if (m.toStageId) list.push(m.toStageId);
    visited.set(h.enquiryId, list);
  }
  const rows: ReportRow[] = enquiries.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    wonAt: e.wonAt,
    source: e.source,
    classInterested: e.classInterested,
    ownerId: e.assignedToUserId,
    stageId: e.stageId,
    visitedStageIds: visited.get(e.id),
  }));
  const groups = computeConversion(rows, stages, q.groupBy as ReportGroupBy);
  const names = q.groupBy === 'owner' ? await userNames(groups.map((g) => g.key)) : new Map<string, string>();
  return {
    range: { from: q.from ?? null, to: q.to ?? null },
    truncated: enquiries.length >= REPORT_ROW_LIMIT,
    stages,
    overall: overallConversion(rows, stages),
    funnel: computeStageFunnel(rows, stages),
    groupBy: q.groupBy,
    groups: groups.map((g) => ({ ...g, label: q.groupBy === 'owner' ? (g.key ? names.get(g.key) ?? 'Former staff' : 'Unassigned') : g.key })),
  };
}

export async function reportCsv(ctx: CrmCtx, q: ReportQueryDtoType) {
  const r = await getReport(ctx, q);
  const groupCsv = toCsv(
    [q.groupBy, 'Enquiries', 'Admitted', 'Lost', 'Open', 'Conversion %', 'Avg days to admit'],
    r.groups.map((g) => [g.label, g.total, g.won, g.lost, g.open, g.conversionRate, g.avgDaysToAdmit ?? '']),
  );
  const funnelCsv = toCsv(
    ['Stage', 'Currently in stage', 'Reached stage', 'Reached %'],
    r.funnel.steps.map((s) => [s.name, s.current, s.reached, s.rate]),
  );
  const totals = toCsv(
    ['Total enquiries', 'Admitted', 'Lost', 'Conversion %', 'Avg days to admit'],
    [[r.overall.total, r.overall.won, r.overall.lost, r.overall.conversionRate, r.overall.avgDaysToAdmit ?? '']],
  );
  return `${totals}\r\n${funnelCsv}\r\n${groupCsv}`;
}
