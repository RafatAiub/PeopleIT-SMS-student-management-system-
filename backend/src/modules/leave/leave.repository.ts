import { prisma } from '../../config/prisma';
import { LeaveStatus, Prisma } from '@prisma/client';
import type {
  CreateLeaveTypeDtoType,
  UpdateLeaveTypeDtoType,
  LeaveRequestQueryDtoType,
} from './leave.dto';

const APPLICANT_SELECT = {
  firstName: true,
  lastName: true,
  email: true,
  role: true,
} as const;

const LEAVE_TYPE_SELECT = {
  name: true,
  isPaid: true,
} as const;

const REVIEWER_SELECT = {
  firstName: true,
  lastName: true,
} as const;

const LEAVE_REQUEST_INCLUDE = {
  applicant: { select: APPLICANT_SELECT },
  leaveType: { select: LEAVE_TYPE_SELECT },
  reviewedBy: { select: REVIEWER_SELECT },
} as const;

// --- Leave Type Repository Functions ---

export async function createLeaveType(institutionId: string, data: CreateLeaveTypeDtoType) {
  return prisma.leaveType.create({
    data: {
      institutionId,
      name: data.name,
      description: data.description,
      isPaid: data.isPaid,
      color: data.color,
    },
  });
}

export async function findLeaveTypeByName(institutionId: string, name: string) {
  return prisma.leaveType.findFirst({
    where: { institutionId, name },
  });
}

export async function findLeaveTypeById(institutionId: string, id: string) {
  return prisma.leaveType.findFirst({
    where: { id, institutionId },
  });
}

export async function findAllLeaveTypes(institutionId: string, includeInactive: boolean) {
  return prisma.leaveType.findMany({
    where: {
      institutionId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: 'asc' },
  });
}

export async function updateLeaveType(institutionId: string, id: string, data: UpdateLeaveTypeDtoType) {
  return prisma.leaveType.update({
    where: { id, institutionId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.isPaid !== undefined ? { isPaid: data.isPaid } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export async function countLeaveRequestsForType(institutionId: string, leaveTypeId: string) {
  return prisma.leaveRequest.count({ where: { institutionId, leaveTypeId } });
}

export async function deleteLeaveType(institutionId: string, id: string) {
  await prisma.leaveType.delete({ where: { id, institutionId } });
}

// --- Leave Request Repository Functions ---

export async function createLeaveRequest(
  institutionId: string,
  data: {
    applicantUserId: string;
    leaveTypeId: string | null;
    startDate: Date;
    endDate: Date;
    totalDays: number;
    reason: string;
  },
) {
  return prisma.leaveRequest.create({
    data: {
      institutionId,
      applicantUserId: data.applicantUserId,
      leaveTypeId: data.leaveTypeId,
      startDate: data.startDate,
      endDate: data.endDate,
      totalDays: data.totalDays,
      reason: data.reason,
    },
    include: LEAVE_REQUEST_INCLUDE,
  });
}

export async function findLeaveRequestById(institutionId: string, id: string) {
  return prisma.leaveRequest.findFirst({
    where: { id, institutionId },
    include: LEAVE_REQUEST_INCLUDE,
  });
}

/**
 * Finds a PENDING or APPROVED leave request for the same applicant whose date
 * range intersects [startDate, endDate], scoped to the institution. Used to
 * reject overlapping leave requests at creation time.
 */
export async function findOverlappingLeaveRequest(
  institutionId: string,
  applicantUserId: string,
  startDate: Date,
  endDate: Date,
) {
  return prisma.leaveRequest.findFirst({
    where: {
      institutionId,
      applicantUserId,
      status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
}

/**
 * `forcedApplicantUserId` pins the query to a single caller (the "mine" list)
 * and always wins over any `applicantUserId` present on the query itself
 * (the admin list, where it is an optional filter).
 */
function buildLeaveRequestWhere(
  institutionId: string,
  query: LeaveRequestQueryDtoType,
  forcedApplicantUserId?: string,
): Prisma.LeaveRequestWhereInput {
  const { status, leaveTypeId, dateFrom, dateTo, applicantUserId, audience } = query;
  return {
    institutionId,
    applicantUserId: forcedApplicantUserId ?? applicantUserId,
    ...(status ? { status } : {}),
    ...(leaveTypeId ? { leaveTypeId } : {}),
    ...(audience === 'STUDENT' ? { applicant: { role: 'STUDENT' } } : {}),
    ...(audience === 'STAFF' ? { applicant: { role: { not: 'STUDENT' } } } : {}),
    ...(dateFrom ? { endDate: { gte: dateFrom } } : {}),
    ...(dateTo ? { startDate: { lte: dateTo } } : {}),
  };
}

export async function findAllLeaveRequests(institutionId: string, query: LeaveRequestQueryDtoType) {
  const { page, pageSize } = query;
  const skip = (page - 1) * pageSize;
  const where = buildLeaveRequestWhere(institutionId, query);

  const [requests, total] = await prisma.$transaction([
    prisma.leaveRequest.findMany({
      where,
      skip,
      take: pageSize,
      include: LEAVE_REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { requests, total };
}

export async function findMyLeaveRequests(
  institutionId: string,
  applicantUserId: string,
  query: LeaveRequestQueryDtoType,
) {
  const { page, pageSize } = query;
  const skip = (page - 1) * pageSize;
  const where = buildLeaveRequestWhere(institutionId, query, applicantUserId);

  const [requests, total] = await prisma.$transaction([
    prisma.leaveRequest.findMany({
      where,
      skip,
      take: pageSize,
      include: LEAVE_REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { requests, total };
}

export async function updateLeaveRequestStatus(
  institutionId: string,
  id: string,
  data: {
    status: LeaveStatus;
    reviewedByUserId?: string | null;
    reviewedAt?: Date | null;
    reviewerComment?: string | null;
    cancelledAt?: Date | null;
  },
) {
  return prisma.leaveRequest.update({
    where: { id, institutionId },
    data,
    include: LEAVE_REQUEST_INCLUDE,
  });
}

/**
 * All APPROVED requests for one applicant whose startDate falls within
 * [yearStart, yearEnd) — used to build the monthly Leave Report. Bucketing by
 * startDate's month is a simplification: a request spanning a month
 * boundary (e.g. Jan 30 - Feb 2) is attributed entirely to its start month
 * rather than split across both.
 */
export async function findApprovedLeaveRequestsForReport(
  institutionId: string,
  applicantUserId: string,
  yearStart: Date,
  yearEnd: Date,
) {
  return prisma.leaveRequest.findMany({
    where: {
      institutionId,
      applicantUserId,
      status: LeaveStatus.APPROVED,
      startDate: { gte: yearStart, lt: yearEnd },
    },
    select: {
      startDate: true,
      totalDays: true,
      leaveTypeId: true,
      leaveType: { select: { name: true } },
    },
  });
}

export async function deleteLeaveRequest(institutionId: string, id: string) {
  await prisma.leaveRequest.delete({ where: { id, institutionId } });
}

/**
 * Institution admins who should be notified of leave events. Scoped to the
 * tenant and to active accounts only — a deactivated admin should not be
 * paged for a new leave request.
 */
export async function findAdminUserIdsForInstitution(institutionId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { institutionId, role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}
