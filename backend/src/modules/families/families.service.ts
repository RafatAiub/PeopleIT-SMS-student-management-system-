import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { teacherSectionIds } from '../reports/analytics.scope';
import { isModuleEnabled } from '../institution/modules.service';
import { familyCharacterSummaries } from '../character/character.service';
import { assignConcession } from '../fees/concessions/concession.service';
import { attendanceSummary, defaultFamilyName, familyDues, isPayable } from './families.logic';
import { syncFamilies } from './families.sync';
import type { AddMembersDtoType, CreateFamilyDtoType, ListQueryDtoType, SiblingConcessionDtoType, UpdateFamilyDtoType } from './families.dto';

// =============================================================================
// Family profile (T3). Every query is scoped by ctx.institutionId. Views:
//   staff    ADMIN / ACCOUNTANT / MANAGEMENT / SUPER_ADMIN — everything
//   teacher  read-only, only families with a child in their sections;
//            contacts, children, attendance, character (no money, notes, docs)
//   guardian only their own family; no staff notes
// =============================================================================

export interface FamilyCtx {
  institutionId: string;
  userId: string;
  role: string;
}

export type FamilyView = 'staff' | 'teacher' | 'guardian';

const STAFF = new Set(['ADMIN', 'ACCOUNTANT', 'MANAGEMENT', 'SUPER_ADMIN']);
export const isFamilyStaff = (ctx: FamilyCtx) => STAFF.has(ctx.role);
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

// ── Access ───────────────────────────────────────────────────────────────────

async function familyOrThrow(institutionId: string, id: string) {
  const f = await prisma.family.findFirst({ where: { id, institutionId }, select: { id: true, name: true, primaryGuardianId: true } });
  if (!f) throw new NotFoundError('Family not found');
  return f;
}

/** The signed-in guardian's Guardian row (null when the user has none). */
async function guardianOfUser(ctx: FamilyCtx) {
  return prisma.guardian.findFirst({
    where: { institutionId: ctx.institutionId, userId: ctx.userId },
    select: { id: true, familyMember: { select: { familyId: true } }, students: { select: { studentId: true } } },
  });
}

/** Families a guardian belongs to: their own membership, else their children's families. */
async function guardianFamilyIds(ctx: FamilyCtx): Promise<string[]> {
  const g = await guardianOfUser(ctx);
  if (!g) return [];
  const ids = new Set<string>();
  if (g.familyMember) ids.add(g.familyMember.familyId);
  const kids = g.students.map((s) => s.studentId);
  if (kids.length) {
    const rows = await prisma.familyStudent.findMany({ where: { institutionId: ctx.institutionId, studentId: { in: kids } }, select: { familyId: true } });
    for (const r of rows) ids.add(r.familyId);
  }
  return [...ids];
}

/** Resolves the caller's view of a family, or 404 (never reveals other families). */
export async function familyAccess(ctx: FamilyCtx, familyId: string): Promise<FamilyView> {
  await familyOrThrow(ctx.institutionId, familyId);
  if (isFamilyStaff(ctx)) return 'staff';
  if (ctx.role === 'TEACHER') {
    const allowed = await teacherSectionIds(ctx.institutionId, ctx.userId);
    const hit = allowed.size
      ? await prisma.familyStudent.count({ where: { familyId, student: { sectionId: { in: [...allowed] } } } })
      : 0;
    if (hit > 0) return 'teacher';
  }
  if (ctx.role === 'GUARDIAN' && (await guardianFamilyIds(ctx)).includes(familyId)) return 'guardian';
  throw new NotFoundError('Family not found');
}

// ── Profile ──────────────────────────────────────────────────────────────────

const guardianSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  relationship: true,
  occupation: true,
  emergencyPhone: true,
  avatarUrl: true,
  userId: true,
} satisfies Prisma.GuardianSelect;

/** Current session year window, else the last 120 days. */
async function attendanceWindow(institutionId: string): Promise<{ from: Date; to: Date; label: string | null }> {
  const year = await prisma.academicYear.findFirst({ where: { institutionId, isCurrent: true }, select: { label: true, startDate: true, endDate: true } });
  if (year) return { from: year.startDate, to: year.endDate, label: year.label };
  const to = new Date();
  return { from: new Date(to.getTime() - 120 * 86_400_000), to, label: null };
}

export async function getProfile(ctx: FamilyCtx, familyId: string) {
  const view = await familyAccess(ctx, familyId);
  const family = await prisma.family.findFirst({
    where: { id: familyId, institutionId: ctx.institutionId },
    include: {
      guardians: { include: { guardian: { select: guardianSelect } }, orderBy: { createdAt: 'asc' } },
      students: {
        include: {
          student: {
            select: {
              id: true, studentId: true, firstName: true, lastName: true, avatarUrl: true, rollNumber: true, status: true, gender: true, dateOfBirth: true,
              class: { select: { id: true, name: true } }, section: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!family) throw new NotFoundError('Family not found');
  const studentIds = family.students.map((s) => s.studentId);
  const guardians = family.guardians.map((g) => ({ ...g.guardian, hasLogin: Boolean(g.guardian.userId), userId: undefined, isPrimary: g.guardianId === family.primaryGuardianId }));
  const money = view !== 'teacher';

  const win = await attendanceWindow(ctx.institutionId);
  const [attendance, invoices, payments, familyPayments, notes, documents, links, character, donationsOn] = await Promise.all([
    studentIds.length
      ? prisma.attendance.findMany({ where: { institutionId: ctx.institutionId, studentId: { in: studentIds }, date: { gte: win.from, lte: win.to } }, select: { studentId: true, status: true } })
      : Promise.resolve([]),
    money && studentIds.length
      ? prisma.invoice.findMany({
          where: { institutionId: ctx.institutionId, studentId: { in: studentIds }, status: { not: 'CANCELLED' } },
          select: { id: true, invoiceNo: true, studentId: true, totalAmount: true, paidAmount: true, dueAmount: true, dueDate: true, status: true },
          orderBy: { dueDate: 'asc' },
        })
      : Promise.resolve([]),
    money && studentIds.length
      ? prisma.payment.findMany({
          where: { invoice: { institutionId: ctx.institutionId, studentId: { in: studentIds } }, status: 'COMPLETED' },
          select: { id: true, amount: true, method: true, paidAt: true, receiptNo: true, invoice: { select: { invoiceNo: true, studentId: true } }, familyAllocation: { select: { familyPaymentId: true } } },
          orderBy: { paidAt: 'desc' },
          take: 15,
        })
      : Promise.resolve([]),
    money
      ? prisma.familyPayment.findMany({
          where: { institutionId: ctx.institutionId, familyId, status: 'SUCCESS' },
          select: { id: true, source: true, method: true, amount: true, completedAt: true, isDemo: true, _count: { select: { allocations: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : Promise.resolve([]),
    view === 'staff'
      ? prisma.familyNote.findMany({ where: { familyId }, orderBy: { createdAt: 'desc' }, take: 100 })
      : Promise.resolve([]),
    money && studentIds.length
      ? prisma.studentDocument.findMany({
          where: { institutionId: ctx.institutionId, studentId: { in: studentIds } },
          select: { id: true, studentId: true, name: true, type: true, fileUrl: true, uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
          take: 50,
        })
      : Promise.resolve([]),
    view === 'staff' && studentIds.length
      ? prisma.guardianStudent.findMany({
          where: { studentId: { in: studentIds }, guardian: { institutionId: ctx.institutionId, OR: [{ familyMember: null }, { familyMember: { familyId: { not: familyId } } }] } },
          select: { studentId: true, guardian: { select: { ...guardianSelect, familyMember: { select: { familyId: true } } } } },
        })
      : Promise.resolve([]),
    familyCharacterSummaries(ctx.institutionId, studentIds),
    money ? isModuleEnabled(ctx.institutionId, 'islamic.donations') : Promise.resolve(false),
  ]);

  const dueRows = invoices.map((i) => ({ id: i.id, dueAmount: num(i.dueAmount), dueDate: i.dueDate, status: i.status }));
  const children = family.students.map(({ student }) => {
    const mine = dueRows.filter((_, k) => invoices[k].studentId === student.id);
    const ch = character.find((c) => c.student.id === student.id);
    return {
      ...student,
      attendance: attendanceSummary(attendance.filter((a) => a.studentId === student.id).map((a) => a.status)),
      fees: money
        ? {
            ...familyDues(mine),
            unpaid: invoices
              .filter((i) => i.studentId === student.id && isPayable({ dueAmount: num(i.dueAmount), status: i.status }))
              .map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, totalAmount: num(i.totalAmount), dueAmount: num(i.dueAmount), dueDate: i.dueDate, status: i.status })),
          }
        : null,
      character: ch ? { points: ch.points, overall: ch.latest?.overall ?? null, band: ch.latest?.band ?? null, periodName: ch.latest?.period.name ?? null, badges: ch.badges.slice(0, 3), badgeCount: ch.badges.length } : null,
    };
  });

  // Donations (T1) by this family's guardians: linked logins or matching phone.
  let donations: { total: number; count: number; recent: unknown[] } | null = null;
  if (donationsOn && family.guardians.length) {
    const userIds = family.guardians.map((g) => g.guardian.userId).filter((x): x is string => Boolean(x));
    const phones = family.guardians.map((g) => g.guardian.phone).filter(Boolean);
    const where: Prisma.DonationWhereInput = {
      institutionId: ctx.institutionId,
      status: 'PAID',
      donor: { OR: [...(userIds.length ? [{ userId: { in: userIds } }] : []), ...(phones.length ? [{ phone: { in: phones } }] : [])] },
    };
    const [agg, recent] = await Promise.all([
      prisma.donation.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.donation.findMany({ where, select: { id: true, amount: true, paidAt: true, receiptNo: true, fund: { select: { name: true, nameBn: true } } }, orderBy: { paidAt: 'desc' }, take: 5 }),
    ]);
    donations = { total: num(agg._sum.amount), count: agg._count._all, recent: recent.map((d) => ({ ...d, amount: num(d.amount) })) };
  }

  // Sibling concessions (staff): what each child already has + what can be applied.
  let concessions: { active: unknown[]; available: unknown[] } | null = null;
  if (view === 'staff' && studentIds.length) {
    const [active, available] = await Promise.all([
      prisma.studentConcession.findMany({
        where: { institutionId: ctx.institutionId, studentId: { in: studentIds } },
        select: { id: true, studentId: true, concession: { select: { id: true, name: true, type: true, value: true } } },
      }),
      prisma.concession.findMany({ where: { institutionId: ctx.institutionId, isActive: true }, select: { id: true, name: true, type: true, value: true }, orderBy: { name: 'asc' } }),
    ]);
    concessions = {
      active: active.map((a) => ({ ...a, concession: { ...a.concession, value: num(a.concession.value) } })),
      available: available.map((c) => ({ ...c, value: num(c.value) })),
    };
  }

  const otherGuardians = new Map<string, unknown>();
  for (const l of links) {
    if (!otherGuardians.has(l.guardian.id)) {
      const { userId: _u, familyMember, ...g } = l.guardian;
      otherGuardians.set(l.guardian.id, { ...g, inOtherFamily: Boolean(familyMember) });
    }
  }

  return {
    view,
    family: { id: family.id, name: family.name, primaryGuardianId: family.primaryGuardianId, source: family.source, createdAt: family.createdAt },
    guardians: view === 'teacher' ? guardians.map(({ email: _e, occupation: _o, ...g }) => g) : guardians,
    otherGuardians: [...otherGuardians.values()],
    children,
    attendanceWindow: { from: win.from, to: win.to, label: win.label },
    fees: money ? familyDues(dueRows) : null,
    recentPayments: payments.map((p) => ({
      id: p.id, amount: num(p.amount), method: p.method, paidAt: p.paidAt, receiptNo: p.receiptNo,
      invoiceNo: p.invoice.invoiceNo, studentId: p.invoice.studentId, familyPaymentId: p.familyAllocation?.familyPaymentId ?? null,
    })),
    familyPayments: familyPayments.map((p) => ({ ...p, amount: num(p.amount), invoiceCount: p._count.allocations, _count: undefined })),
    notes,
    documents,
    donations,
    concessions,
    permissions: {
      canEdit: ['ADMIN', 'MANAGEMENT', 'SUPER_ADMIN', 'ACCOUNTANT'].includes(ctx.role),
      canNotes: view === 'staff',
      canPayOffline: ['ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'].includes(ctx.role),
      canConcession: ['ADMIN', 'SUPER_ADMIN'].includes(ctx.role),
      canPayOnline: view === 'guardian',
    },
  };
}

/** Guardian portal: "My family" (groups any newly linked children first). */
export async function myFamily(ctx: FamilyCtx) {
  if (ctx.role !== 'GUARDIAN') throw new ForbiddenError('Only guardians have a family page');
  const g = await guardianOfUser(ctx);
  if (!g) return null;
  const kids = g.students.map((s) => s.studentId);
  if (kids.length) await syncFamilies(ctx.institutionId, { studentIds: kids, limit: 50 });
  const ids = await guardianFamilyIds(ctx);
  if (ids.length === 0) return null;
  // Own membership first; otherwise the family with the most of their children.
  const own = (await guardianOfUser(ctx))?.familyMember?.familyId;
  return getProfile(ctx, own && ids.includes(own) ? own : ids[0]);
}

// ── Lookups, list, search ────────────────────────────────────────────────────

export async function familyIdForStudent(ctx: FamilyCtx, studentId: string) {
  const s = await prisma.student.findFirst({ where: { id: studentId, institutionId: ctx.institutionId }, select: { id: true } });
  if (!s) throw new NotFoundError('Student not found');
  await syncFamilies(ctx.institutionId, { studentIds: [studentId], limit: 1 });
  const m = await prisma.familyStudent.findUnique({ where: { studentId }, select: { familyId: true } });
  if (!m) return { familyId: null };
  await familyAccess(ctx, m.familyId); // teacher scope etc.
  return { familyId: m.familyId };
}

export async function familyIdForGuardian(ctx: FamilyCtx, guardianId: string) {
  const g = await prisma.guardian.findFirst({ where: { id: guardianId, institutionId: ctx.institutionId }, select: { id: true, students: { select: { studentId: true } } } });
  if (!g) throw new NotFoundError('Guardian not found');
  if (g.students.length) await syncFamilies(ctx.institutionId, { studentIds: g.students.map((s) => s.studentId), limit: 30 });
  const own = await prisma.familyGuardian.findUnique({ where: { guardianId }, select: { familyId: true } });
  if (own) return { familyId: own.familyId };
  const viaChild = g.students.length
    ? await prisma.familyStudent.findFirst({ where: { studentId: { in: g.students.map((s) => s.studentId) } }, select: { familyId: true } })
    : null;
  return { familyId: viaChild?.familyId ?? null };
}

function searchWhere(institutionId: string, q?: string): Prisma.FamilyWhereInput {
  if (!q) return { institutionId };
  const c = { contains: q, mode: 'insensitive' as const };
  return {
    institutionId,
    OR: [
      { name: c },
      { guardians: { some: { guardian: { OR: [{ firstName: c }, { lastName: c }, { phone: { contains: q } }, { email: c }] } } } },
      { students: { some: { student: { OR: [{ firstName: c }, { lastName: c }, { studentId: c }] } } } },
    ],
  };
}

const listInclude = {
  guardians: { select: { guardian: { select: { id: true, firstName: true, lastName: true, phone: true } } }, take: 3 },
  students: { select: { student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } }, section: { select: { name: true } } } } }, take: 8 },
  _count: { select: { students: true, guardians: true } },
} satisfies Prisma.FamilyInclude;

export async function listFamilies(ctx: FamilyCtx, q: ListQueryDtoType) {
  await syncFamilies(ctx.institutionId, { limit: 200 });
  const where = searchWhere(ctx.institutionId, q.q);
  const [items, total] = await Promise.all([
    prisma.family.findMany({ where, include: listInclude, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.family.count({ where }),
  ]);
  return { items, total };
}

export async function searchFamilies(ctx: FamilyCtx, q: string) {
  const rows = await prisma.family.findMany({ where: searchWhere(ctx.institutionId, q), include: listInclude, orderBy: { name: 'asc' }, take: 8 });
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    guardians: f.guardians.map((g) => `${g.guardian.firstName} ${g.guardian.lastName}`.trim()),
    children: f.students.map((s) => `${s.student.firstName} ${s.student.lastName}`.trim()),
    childCount: f._count.students,
  }));
}

// ── Grouping (explicit) ──────────────────────────────────────────────────────

async function assertMembers(institutionId: string, studentIds: string[], guardianIds: string[]) {
  const [s, g] = await Promise.all([
    studentIds.length ? prisma.student.count({ where: { institutionId, id: { in: studentIds } } }) : 0,
    guardianIds.length ? prisma.guardian.count({ where: { institutionId, id: { in: guardianIds } } }) : 0,
  ]);
  if (s !== new Set(studentIds).size) throw new NotFoundError('Student not found');
  if (g !== new Set(guardianIds).size) throw new NotFoundError('Guardian not found');
}

/** Deletes families that ended up with no members, notes or payments. */
async function cleanupEmpty(tx: Prisma.TransactionClient, institutionId: string, familyIds: string[]) {
  if (!familyIds.length) return;
  await tx.family.deleteMany({
    where: { institutionId, id: { in: familyIds }, students: { none: {} }, guardians: { none: {} }, notes: { none: {} }, payments: { none: {} } },
  });
}

async function moveMembers(tx: Prisma.TransactionClient, institutionId: string, familyId: string, studentIds: string[], guardianIds: string[]) {
  const [oldS, oldG] = await Promise.all([
    tx.familyStudent.findMany({ where: { studentId: { in: studentIds } }, select: { familyId: true } }),
    tx.familyGuardian.findMany({ where: { guardianId: { in: guardianIds } }, select: { familyId: true } }),
  ]);
  if (studentIds.length) {
    await tx.familyStudent.deleteMany({ where: { studentId: { in: studentIds } } });
    await tx.familyStudent.createMany({ data: studentIds.map((studentId) => ({ institutionId, familyId, studentId })) });
  }
  if (guardianIds.length) {
    await tx.familyGuardian.deleteMany({ where: { guardianId: { in: guardianIds } } });
    await tx.familyGuardian.createMany({ data: guardianIds.map((guardianId) => ({ institutionId, familyId, guardianId })) });
    await tx.family.updateMany({ where: { primaryGuardianId: { in: guardianIds }, id: { not: familyId } }, data: { primaryGuardianId: null } });
  }
  const touched = [...new Set([...oldS, ...oldG].map((x) => x.familyId))].filter((x) => x !== familyId);
  await cleanupEmpty(tx, institutionId, touched);
}

export async function createFamily(ctx: FamilyCtx, dto: CreateFamilyDtoType) {
  const studentIds = [...new Set(dto.studentIds)];
  const guardianIds = [...new Set(dto.guardianIds)];
  await assertMembers(ctx.institutionId, studentIds, guardianIds);
  if (dto.primaryGuardianId && !guardianIds.includes(dto.primaryGuardianId)) throw new ValidationError('The primary guardian must be one of the guardians');
  return prisma.$transaction(async (tx) => {
    const fam = await tx.family.create({
      data: { institutionId: ctx.institutionId, name: dto.name, primaryGuardianId: dto.primaryGuardianId ?? guardianIds[0] ?? null, source: 'MANUAL', createdById: ctx.userId },
    });
    await moveMembers(tx, ctx.institutionId, fam.id, studentIds, guardianIds);
    return fam;
  });
}

export async function updateFamily(ctx: FamilyCtx, familyId: string, dto: UpdateFamilyDtoType) {
  await familyOrThrow(ctx.institutionId, familyId);
  if (dto.primaryGuardianId) {
    const member = await prisma.familyGuardian.findFirst({ where: { familyId, guardianId: dto.primaryGuardianId } });
    if (!member) throw new ValidationError('The primary guardian must be a member of this family');
  }
  return prisma.family.update({ where: { id: familyId }, data: dto });
}

export async function addMembers(ctx: FamilyCtx, familyId: string, dto: AddMembersDtoType) {
  await familyOrThrow(ctx.institutionId, familyId);
  const studentIds = [...new Set(dto.studentIds)];
  const guardianIds = [...new Set(dto.guardianIds)];
  await assertMembers(ctx.institutionId, studentIds, guardianIds);
  await prisma.$transaction((tx) => moveMembers(tx, ctx.institutionId, familyId, studentIds, guardianIds));
  return { familyId, added: studentIds.length + guardianIds.length };
}

/**
 * Ungroups a student: they move into a family of their own (MANUAL), so the
 * automatic sync never pulls them back.
 */
export async function removeStudent(ctx: FamilyCtx, familyId: string, studentId: string) {
  await familyOrThrow(ctx.institutionId, familyId);
  const m = await prisma.familyStudent.findFirst({ where: { familyId, studentId }, include: { student: { select: { firstName: true, lastName: true } } } });
  if (!m) throw new NotFoundError('Student is not in this family');
  return prisma.$transaction(async (tx) => {
    const fam = await tx.family.create({
      data: { institutionId: ctx.institutionId, name: defaultFamilyName(m.student), source: 'MANUAL', createdById: ctx.userId },
    });
    await moveMembers(tx, ctx.institutionId, fam.id, [studentId], []);
    return { familyId: fam.id };
  });
}

export async function removeGuardian(ctx: FamilyCtx, familyId: string, guardianId: string) {
  const fam = await familyOrThrow(ctx.institutionId, familyId);
  const res = await prisma.familyGuardian.deleteMany({ where: { familyId, guardianId } });
  if (res.count === 0) throw new NotFoundError('Guardian is not in this family');
  if (fam.primaryGuardianId === guardianId) await prisma.family.update({ where: { id: familyId }, data: { primaryGuardianId: null } });
  return { familyId, removed: guardianId };
}

export async function mergeFamilies(ctx: FamilyCtx, targetId: string, otherId: string) {
  if (targetId === otherId) throw new BadRequestError('Choose a different family to merge');
  await Promise.all([familyOrThrow(ctx.institutionId, targetId), familyOrThrow(ctx.institutionId, otherId)]);
  await prisma.$transaction(async (tx) => {
    await tx.familyStudent.updateMany({ where: { familyId: otherId }, data: { familyId: targetId } });
    await tx.familyGuardian.updateMany({ where: { familyId: otherId }, data: { familyId: targetId } });
    await tx.familyNote.updateMany({ where: { familyId: otherId }, data: { familyId: targetId } });
    await tx.familyPayment.updateMany({ where: { familyId: otherId }, data: { familyId: targetId } });
    await tx.family.delete({ where: { id: otherId } });
  });
  return { familyId: targetId, merged: otherId };
}

// ── Notes (staff only) ───────────────────────────────────────────────────────

export async function addNote(ctx: FamilyCtx, familyId: string, body: string) {
  await familyOrThrow(ctx.institutionId, familyId);
  const user = await prisma.user.findFirst({ where: { id: ctx.userId }, select: { firstName: true, lastName: true } });
  return prisma.familyNote.create({
    data: { institutionId: ctx.institutionId, familyId, body, authorId: ctx.userId, authorName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Staff' },
  });
}

export async function deleteNote(ctx: FamilyCtx, familyId: string, noteId: string) {
  const note = await prisma.familyNote.findFirst({ where: { id: noteId, familyId, institutionId: ctx.institutionId } });
  if (!note) throw new NotFoundError('Note not found');
  if (note.authorId !== ctx.userId && !['ADMIN', 'SUPER_ADMIN'].includes(ctx.role)) throw new ForbiddenError('Only the author or an admin can delete this note');
  await prisma.familyNote.delete({ where: { id: noteId } });
  return { id: noteId };
}

// ── Sibling concession (quick action over the existing concessions module) ───

export async function applySiblingConcession(ctx: FamilyCtx, familyId: string, dto: SiblingConcessionDtoType) {
  await familyOrThrow(ctx.institutionId, familyId);
  const members = await prisma.familyStudent.findMany({ where: { familyId, studentId: { in: dto.studentIds } }, select: { studentId: true } });
  if (members.length !== new Set(dto.studentIds).size) throw new ValidationError('Every student must be in this family');
  let applied = 0;
  for (const m of members) {
    await assignConcession(ctx.institutionId, { studentId: m.studentId, concessionId: dto.concessionId, note: dto.note ?? 'Sibling concession' });
    applied += 1;
  }
  return { applied };
}
