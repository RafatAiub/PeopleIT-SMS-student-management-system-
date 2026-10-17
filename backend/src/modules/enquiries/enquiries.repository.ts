import { EnquiryStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { EnquiryQueryDtoType } from './enquiries.dto';
import { dhakaDayBounds } from '../crm/crm.logic';

// =============================================================================
// Admission Enquiry repository — every query takes institutionId.
// =============================================================================

export const enquirySelect = {
  id: true,
  studentName: true,
  guardianName: true,
  phone: true,
  email: true,
  classInterested: true,
  source: true,
  status: true,
  notes: true,
  assignedToUserId: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  followUpAt: true,
  convertedStudentId: true,
  convertedStudent: { select: { id: true, studentId: true, status: true } },
  createdAt: true,
  updatedAt: true,
  // T4 CRM extras
  stageId: true,
  stage: { select: { id: true, name: true, nameBn: true, color: true, order: true, isWon: true, isLost: true } },
  nextStep: true,
  priority: true,
  lostReason: true,
  stageChangedAt: true,
  wonAt: true,
  _count: { select: { tasks: { where: { done: false } } } },
} as const;

function startOfTomorrow(): Date {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}

export type EnquiryFilters = Partial<EnquiryQueryDtoType> & { ownerUserId?: string };

export function buildWhere(
  institutionId: string,
  query: EnquiryFilters,
): Prisma.AdmissionEnquiryWhereInput {
  const where: Prisma.AdmissionEnquiryWhereInput = {
    institutionId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
    // T4 "mine" (resolved by the controller to the signed-in user).
    ...(query.ownerUserId ? { assignedToUserId: query.ownerUserId } : {}),
    ...(query.stageId ? { stageId: query.stageId } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.classInterested ? { classInterested: { equals: query.classInterested, mode: 'insensitive' } } : {}),
    ...(query.source ? { source: { equals: query.source, mode: 'insensitive' } } : {}),
    ...(query.search
      ? {
          OR: [
            { studentName: { contains: query.search, mode: 'insensitive' } },
            { guardianName: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { classInterested: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  if (query.followUp) {
    where.status = query.status ?? { notIn: ['ENROLLED', 'LOST'] };
    where.followUpAt = query.followUp === 'due' ? { lt: startOfTomorrow() } : { gte: startOfTomorrow() };
  }
  if (query.due) {
    const { start, end } = dhakaDayBounds();
    where.status = query.status ?? { notIn: ['ENROLLED', 'LOST'] };
    where.followUpAt = query.due === 'overdue' ? { lt: start } : { gte: start, lt: end };
  }
  return where;
}

export async function list(institutionId: string, query: EnquiryQueryDtoType & { ownerUserId?: string }) {
  const where = buildWhere(institutionId, query);
  const [items, total] = await prisma.$transaction([
    prisma.admissionEnquiry.findMany({
      where,
      select: enquirySelect,
      orderBy: query.followUp || query.due ? { followUpAt: 'asc' } : { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.admissionEnquiry.count({ where }),
  ]);
  return { items, total };
}

export async function board(
  institutionId: string,
  filters: { search?: string; assignedToUserId?: string },
  limit: number,
) {
  const base = buildWhere(institutionId, filters);
  const statuses = Object.values(EnquiryStatus);
  const [cards, counts] = await Promise.all([
    Promise.all(
      statuses.map((status) =>
        prisma.admissionEnquiry.findMany({
          where: { ...base, status },
          select: enquirySelect,
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
      ),
    ),
    prisma.admissionEnquiry.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  return statuses.map((status, i) => ({ status, total: countMap[status] ?? 0, items: cards[i] }));
}

export function findById(institutionId: string, id: string) {
  return prisma.admissionEnquiry.findFirst({ where: { id, institutionId }, select: enquirySelect });
}

export function create(data: Prisma.AdmissionEnquiryUncheckedCreateInput) {
  return prisma.admissionEnquiry.create({ data, select: enquirySelect });
}

export async function update(institutionId: string, id: string, data: Prisma.AdmissionEnquiryUncheckedUpdateManyInput) {
  const result = await prisma.admissionEnquiry.updateMany({ where: { id, institutionId }, data });
  if (result.count === 0) return null;
  return findById(institutionId, id);
}

export function remove(institutionId: string, id: string) {
  return prisma.admissionEnquiry.deleteMany({ where: { id, institutionId } });
}

export async function funnelCounts(institutionId: string, range: { from?: Date; to?: Date }) {
  const createdAt =
    range.from || range.to
      ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
      : undefined;
  const enquiryWhere: Prisma.AdmissionEnquiryWhereInput = { institutionId, ...(createdAt ? { createdAt } : {}) };

  const [byStatus, converted, convertedApproved, enrolled, applicationsPending, applicationsTotal] =
    await Promise.all([
      prisma.admissionEnquiry.groupBy({ by: ['status'], where: enquiryWhere, _count: { _all: true } }),
      prisma.admissionEnquiry.count({ where: { ...enquiryWhere, convertedStudentId: { not: null } } }),
      prisma.admissionEnquiry.count({ where: { ...enquiryWhere, convertedStudent: { status: 'ACTIVE' } } }),
      prisma.admissionEnquiry.count({
        where: { ...enquiryWhere, OR: [{ status: 'ENROLLED' }, { convertedStudent: { status: 'ACTIVE' } }] },
      }),
      prisma.student.count({ where: { institutionId, status: 'PENDING', ...(createdAt ? { createdAt } : {}) } }),
      // Applications in the window: every PENDING application, plus
      // applications created from an enquiry that have since been decided.
      // (An approved public application with no enquiry is indistinguishable
      // from an admin-created student, so it is not counted here.)
      prisma.student.count({
        where: {
          institutionId,
          ...(createdAt ? { createdAt } : {}),
          OR: [{ status: 'PENDING' }, { admissionEnquiries: { some: {} } }],
        },
      }),
    ]);

  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    convertedToApplication: converted,
    convertedApproved,
    enrolled,
    applicationsPending,
    applicationsTotal,
  };
}
