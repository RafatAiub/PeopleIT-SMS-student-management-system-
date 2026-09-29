import { LeaveStatus } from '@prisma/client';
import * as leaveRepository from './leave.repository';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { notifySafe } from '../notifications/notifications.service';
import type {
  CreateLeaveTypeDtoType,
  UpdateLeaveTypeDtoType,
  LeaveTypeQueryDtoType,
  CreateLeaveRequestDtoType,
  LeaveRequestQueryDtoType,
  MyLeaveRequestQueryDtoType,
} from './leave.dto';

const MS_PER_DAY = 86_400_000;

function formatApplicantName(applicant: { firstName?: string; lastName?: string } | null | undefined) {
  if (!applicant) return 'Unknown';
  return `${applicant.firstName ?? ''} ${applicant.lastName ?? ''}`.trim() || 'Unknown';
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Student Leave requests have no LeaveType relation (leaveTypeId is null).
function formatLeaveTypeName(leaveType: { name?: string } | null | undefined) {
  return leaveType?.name ?? 'Leave';
}

// --- Leave Type Services ---

export async function createLeaveType(institutionId: string, data: CreateLeaveTypeDtoType) {
  const existing = await leaveRepository.findLeaveTypeByName(institutionId, data.name);
  if (existing) {
    throw new ConflictError(`A leave type named '${data.name}' already exists`);
  }
  const leaveType = await leaveRepository.createLeaveType(institutionId, data);
  logger.info('Leave type created', { leaveTypeId: leaveType.id, institutionId });
  return leaveType;
}

export async function listLeaveTypes(institutionId: string, query: LeaveTypeQueryDtoType) {
  return leaveRepository.findAllLeaveTypes(institutionId, query.includeInactive);
}

export async function updateLeaveType(institutionId: string, id: string, data: UpdateLeaveTypeDtoType) {
  const leaveType = await leaveRepository.findLeaveTypeById(institutionId, id);
  if (!leaveType) {
    throw new NotFoundError(`Leave type with ID '${id}' not found`);
  }
  if (data.name && data.name !== leaveType.name) {
    const existing = await leaveRepository.findLeaveTypeByName(institutionId, data.name);
    if (existing && existing.id !== id) {
      throw new ConflictError(`A leave type named '${data.name}' already exists`);
    }
  }
  const updated = await leaveRepository.updateLeaveType(institutionId, id, data);
  logger.info('Leave type updated', { leaveTypeId: id, institutionId });
  return updated;
}

// Permanent removal — only allowed while no LeaveRequest references it (the
// FK is ON DELETE RESTRICT, and a request's leave-type history shouldn't
// silently disappear). A type that's already in use should be deactivated
// via updateLeaveType({isActive: false}) instead, not deleted.
export async function deleteLeaveType(institutionId: string, id: string) {
  const leaveType = await leaveRepository.findLeaveTypeById(institutionId, id);
  if (!leaveType) {
    throw new NotFoundError(`Leave type with ID '${id}' not found`);
  }
  const usageCount = await leaveRepository.countLeaveRequestsForType(institutionId, id);
  if (usageCount > 0) {
    throw new ConflictError(
      `'${leaveType.name}' is used by ${usageCount} leave request${usageCount === 1 ? '' : 's'} and can't be deleted — deactivate it instead`,
    );
  }
  await leaveRepository.deleteLeaveType(institutionId, id);
  logger.info('Leave type deleted', { leaveTypeId: id, institutionId });
}

// --- Leave Request Services ---

export async function createLeaveRequest(
  institutionId: string,
  applicantUserId: string,
  applicantRole: string,
  data: CreateLeaveRequestDtoType,
) {
  // Student Leave has no leave-type concept at all — a STUDENT applicant's
  // request never carries a leaveTypeId, regardless of what the client
  // sends. Every other self-service role must pick an active leave type.
  const isStudent = applicantRole === 'STUDENT';
  let leaveTypeId: string | null = null;

  if (!isStudent) {
    if (!data.leaveTypeId) {
      throw new ValidationError('leaveTypeId is required');
    }
    const leaveType = await leaveRepository.findLeaveTypeById(institutionId, data.leaveTypeId);
    if (!leaveType || !leaveType.isActive) {
      throw new NotFoundError(`Leave type with ID '${data.leaveTypeId}' not found`);
    }
    leaveTypeId = data.leaveTypeId;
  }

  const overlapping = await leaveRepository.findOverlappingLeaveRequest(
    institutionId,
    applicantUserId,
    data.startDate,
    data.endDate,
  );
  if (overlapping) {
    throw new ConflictError('You already have a pending or approved leave request in this date range');
  }

  const totalDays = Math.round((data.endDate.getTime() - data.startDate.getTime()) / MS_PER_DAY) + 1;

  const leaveRequest = await leaveRepository.createLeaveRequest(institutionId, {
    applicantUserId,
    leaveTypeId,
    startDate: data.startDate,
    endDate: data.endDate,
    totalDays,
    reason: data.reason,
  });

  logger.info('Leave request created', {
    leaveRequestId: leaveRequest.id,
    applicantUserId,
    institutionId,
  });

  const adminUserIds = await leaveRepository.findAdminUserIdsForInstitution(institutionId);
  if (adminUserIds.length > 0) {
    notifySafe({
      institutionId,
      type: 'LEAVE_REQUESTED',
      recipientUserIds: adminUserIds,
      contextId: leaveRequest.id,
      vars: {
        applicantName: formatApplicantName(leaveRequest.applicant),
        leaveTypeName: formatLeaveTypeName(leaveRequest.leaveType),
        startDate: formatDate(leaveRequest.startDate),
        endDate: formatDate(leaveRequest.endDate),
        totalDays: leaveRequest.totalDays,
        reason: leaveRequest.reason,
      },
    });
  }

  return leaveRequest;
}

export async function listAllLeaveRequests(institutionId: string, query: LeaveRequestQueryDtoType) {
  const { requests, total } = await leaveRepository.findAllLeaveRequests(institutionId, query);
  return { requests, total };
}

// Fixed monthly entitlement used by the Leave Report — not stored per user,
// not configurable via the UI. Product only specified "2 days a month"; a
// per-institution/per-role configurable allocation is a v2 concern (same
// deferral the leave-balance table itself got — see the original module spec).
const MONTHLY_LEAVE_ALLOCATION_DAYS = 2;

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Per-month breakdown (Jan-Dec of `year`) of a single applicant's APPROVED
 * leave: days used per leave type, days used total, and days remaining
 * against a fixed monthly allocation. Each month resets independently (no
 * rollover/annual pool) per product's "2 days a month" framing.
 */
export async function getLeaveReport(institutionId: string, applicantUserId: string, year?: number) {
  const targetYear = year ?? new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(targetYear, 0, 1));
  const yearEnd = new Date(Date.UTC(targetYear + 1, 0, 1));

  const requests = await leaveRepository.findApprovedLeaveRequestsForReport(
    institutionId,
    applicantUserId,
    yearStart,
    yearEnd,
  );

  const months = Array.from({ length: 12 }, (_, i) => {
    const usedByType = new Map<string, { leaveTypeId: string; leaveTypeName: string; days: number }>();
    for (const r of requests) {
      if (r.startDate.getUTCMonth() !== i) continue;
      // r.leaveTypeId is null for a Student Leave request (no leave-type
      // concept) — the report is staff-only in the UI, but this guards the
      // grouping regardless of who's queried.
      const key = r.leaveTypeId ?? '__no_type__';
      const entry = usedByType.get(key) ?? {
        leaveTypeId: key,
        leaveTypeName: formatLeaveTypeName(r.leaveType),
        days: 0,
      };
      entry.days += r.totalDays;
      usedByType.set(key, entry);
    }
    const usedTotal = Array.from(usedByType.values()).reduce((sum, t) => sum + t.days, 0);
    return {
      month: i + 1,
      monthLabel: MONTH_LABELS[i],
      allocatedDays: MONTHLY_LEAVE_ALLOCATION_DAYS,
      usedByType: Array.from(usedByType.values()),
      usedTotal,
      remainingDays: Math.max(0, MONTHLY_LEAVE_ALLOCATION_DAYS - usedTotal),
    };
  });

  return { year: targetYear, months };
}

export async function listMyLeaveRequests(
  institutionId: string,
  callerId: string,
  query: MyLeaveRequestQueryDtoType,
) {
  const { requests, total } = await leaveRepository.findMyLeaveRequests(
    institutionId,
    callerId,
    query as LeaveRequestQueryDtoType,
  );
  return { requests, total };
}

/**
 * ADMIN may view any request in their institution; everyone else only their
 * own. A non-owner gets NotFoundError rather than ForbiddenError — matches
 * this codebase's ownership pattern of not leaking existence to non-owners.
 */
export async function getLeaveRequest(institutionId: string, callerId: string, callerRole: string, id: string) {
  const leaveRequest = await leaveRepository.findLeaveRequestById(institutionId, id);
  if (!leaveRequest) {
    throw new NotFoundError(`Leave request with ID '${id}' not found`);
  }
  if (callerRole !== 'ADMIN' && leaveRequest.applicantUserId !== callerId) {
    throw new NotFoundError(`Leave request with ID '${id}' not found`);
  }
  return leaveRequest;
}

// Admin-only, permanent removal — used to clean up a request regardless of
// its status (e.g. stray/mistaken entries), unlike cancel which only ever
// soft-transitions a PENDING request the applicant owns.
export async function deleteLeaveRequest(institutionId: string, id: string) {
  const leaveRequest = await leaveRepository.findLeaveRequestById(institutionId, id);
  if (!leaveRequest) {
    throw new NotFoundError(`Leave request with ID '${id}' not found`);
  }
  await leaveRepository.deleteLeaveRequest(institutionId, id);
  logger.info('Leave request deleted', { leaveRequestId: id, institutionId });
}

export async function cancelLeaveRequest(institutionId: string, callerId: string, id: string) {
  const leaveRequest = await leaveRepository.findLeaveRequestById(institutionId, id);
  if (!leaveRequest) {
    throw new NotFoundError(`Leave request with ID '${id}' not found`);
  }
  if (leaveRequest.applicantUserId !== callerId) {
    throw new NotFoundError(`Leave request with ID '${id}' not found`);
  }
  if (leaveRequest.status !== LeaveStatus.PENDING) {
    throw new ConflictError('Only pending leave requests can be cancelled');
  }

  const updated = await leaveRepository.updateLeaveRequestStatus(institutionId, id, {
    status: LeaveStatus.CANCELLED,
    cancelledAt: new Date(),
  });

  logger.info('Leave request cancelled', { leaveRequestId: id, institutionId, callerId });
  return updated;
}

export async function approveLeaveRequest(
  institutionId: string,
  callerId: string,
  id: string,
  reviewerComment?: string,
) {
  const leaveRequest = await leaveRepository.findLeaveRequestById(institutionId, id);
  if (!leaveRequest) {
    throw new NotFoundError(`Leave request with ID '${id}' not found`);
  }
  if (leaveRequest.status !== LeaveStatus.PENDING) {
    throw new ConflictError('Only pending leave requests can be approved');
  }

  const updated = await leaveRepository.updateLeaveRequestStatus(institutionId, id, {
    status: LeaveStatus.APPROVED,
    reviewedByUserId: callerId,
    reviewedAt: new Date(),
    reviewerComment: reviewerComment ?? null,
  });

  logger.info('Leave request approved', { leaveRequestId: id, institutionId, callerId });

  notifySafe({
    institutionId,
    type: 'LEAVE_APPROVED',
    recipientUserIds: [updated.applicantUserId],
    contextId: updated.id,
    vars: {
      applicantName: formatApplicantName(updated.applicant),
      leaveTypeName: formatLeaveTypeName(updated.leaveType),
      startDate: formatDate(updated.startDate),
      endDate: formatDate(updated.endDate),
      totalDays: updated.totalDays,
      reviewerComment: updated.reviewerComment ?? '',
    },
  });

  return updated;
}

export async function rejectLeaveRequest(
  institutionId: string,
  callerId: string,
  id: string,
  reviewerComment: string,
) {
  const leaveRequest = await leaveRepository.findLeaveRequestById(institutionId, id);
  if (!leaveRequest) {
    throw new NotFoundError(`Leave request with ID '${id}' not found`);
  }
  if (leaveRequest.status !== LeaveStatus.PENDING) {
    throw new ConflictError('Only pending leave requests can be rejected');
  }

  const updated = await leaveRepository.updateLeaveRequestStatus(institutionId, id, {
    status: LeaveStatus.REJECTED,
    reviewedByUserId: callerId,
    reviewedAt: new Date(),
    reviewerComment,
  });

  logger.info('Leave request rejected', { leaveRequestId: id, institutionId, callerId });

  notifySafe({
    institutionId,
    type: 'LEAVE_REJECTED',
    recipientUserIds: [updated.applicantUserId],
    contextId: updated.id,
    vars: {
      applicantName: formatApplicantName(updated.applicant),
      leaveTypeName: formatLeaveTypeName(updated.leaveType),
      startDate: formatDate(updated.startDate),
      endDate: formatDate(updated.endDate),
      totalDays: updated.totalDays,
      reviewerComment: updated.reviewerComment ?? '',
    },
  });

  return updated;
}
