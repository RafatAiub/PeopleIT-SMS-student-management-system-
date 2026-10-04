import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { monthRange } from '../attendance/attendance.logic';
import * as repo from './staff-attendance.repository';
import {
  addStaffStatus,
  emptyStaffCounts,
  isoDay,
  leaveSuggestions,
  parseDay,
  staffAttendancePercentage,
  type StaffCounts,
} from './staff-attendance.logic';
import type { StaffBulkSubmitDtoType } from './staff-attendance.dto';

function staffName(u: { firstName: string; lastName: string }) {
  return `${u.firstName} ${u.lastName}`.trim();
}

export async function getRegister(institutionId: string, day: string) {
  const date = parseDay(day);
  const [roster, records, leaves] = await Promise.all([
    repo.findStaffRoster(institutionId),
    repo.findRecordsForDay(institutionId, date),
    repo.findApprovedLeavesCovering(institutionId, date, date),
  ]);
  const byUser = new Map(records.map((r) => [r.staffUserId, r]));
  const suggestions = leaveSuggestions(
    leaves.map((l) => ({ ...l, leaveTypeName: l.leaveType?.name ?? null })),
    day,
  );

  const staff = roster.map((u) => {
    const rec = byUser.get(u.id);
    const onLeave = suggestions.has(u.id);
    return {
      userId: u.id,
      name: staffName(u),
      email: u.email,
      role: u.role,
      department: u.staffProfile?.department ?? null,
      designation: u.staffProfile?.designation ?? null,
      employeeId: u.staffProfile?.employeeId ?? null,
      status: rec?.status ?? null,
      checkIn: rec?.checkIn ?? null,
      checkOut: rec?.checkOut ?? null,
      note: rec?.note ?? null,
      suggestedStatus: onLeave ? 'LEAVE' : null,
      leaveType: onLeave ? suggestions.get(u.id) ?? null : null,
    };
  });

  const counts = staff.reduce((c, s) => (s.status ? addStaffStatus(c, s.status) : c), emptyStaffCounts());
  return { date: day, staff, counts, unmarked: staff.filter((s) => !s.status).length };
}

export async function submitBulk(institutionId: string, markedByUserId: string, data: StaffBulkSubmitDtoType) {
  const ids = [...new Set(data.records.map((r) => r.staffUserId))];
  const valid = await repo.findStaffUsersByIds(institutionId, ids);
  if (valid.length !== ids.length) {
    throw new BadRequestError('Some staff IDs are invalid or belong to another institution');
  }
  const saved = await repo.upsertMany(institutionId, parseDay(data.date), markedByUserId, data.records);
  logger.info('Staff attendance submitted', { institutionId, date: data.date, count: saved.length });
  return { count: saved.length };
}

export async function getMonthlyReport(institutionId: string, month: string) {
  const range = monthRange(month);
  if (!range) throw new BadRequestError('month must be YYYY-MM');
  const [roster, records] = await Promise.all([
    repo.findStaffRoster(institutionId),
    repo.findRecordsInRange(institutionId, range.start, range.end),
  ]);

  const countsBy = new Map<string, StaffCounts>();
  for (const r of records) {
    const c = countsBy.get(r.staffUserId) ?? emptyStaffCounts();
    addStaffStatus(c, r.status);
    countsBy.set(r.staffUserId, c);
  }

  const rows = roster.map((u) => {
    const c = countsBy.get(u.id) ?? emptyStaffCounts();
    return {
      userId: u.id,
      name: staffName(u),
      role: u.role,
      department: u.staffProfile?.department ?? null,
      designation: u.staffProfile?.designation ?? null,
      ...c,
      percentage: staffAttendancePercentage(c),
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.present += r.present;
      acc.absent += r.absent;
      acc.late += r.late;
      acc.leave += r.leave;
      acc.halfDay += r.halfDay;
      acc.total += r.total;
      return acc;
    },
    emptyStaffCounts(),
  );

  return {
    month,
    rows,
    totals: { ...totals, percentage: staffAttendancePercentage(totals), staffCount: rows.length },
  };
}

export async function getStaffDetail(institutionId: string, staffUserId: string, month: string) {
  const range = monthRange(month);
  if (!range) throw new BadRequestError('month must be YYYY-MM');
  const valid = await repo.findStaffUsersByIds(institutionId, [staffUserId]);
  if (valid.length === 0) throw new NotFoundError('Staff member not found');
  return buildDetail(institutionId, staffUserId, month, range);
}

export async function getMine(institutionId: string, userId: string, month: string) {
  const range = monthRange(month);
  if (!range) throw new BadRequestError('month must be YYYY-MM');
  return buildDetail(institutionId, userId, month, range);
}

async function buildDetail(
  institutionId: string,
  staffUserId: string,
  month: string,
  range: { start: Date; end: Date },
) {
  const [records, leaves] = await Promise.all([
    repo.findRecordsInRange(institutionId, range.start, range.end, staffUserId),
    repo.findApprovedLeavesCovering(institutionId, range.start, range.end, [staffUserId]),
  ]);
  const counts = records.reduce((c, r) => addStaffStatus(c, r.status), emptyStaffCounts());
  return {
    month,
    staffUserId,
    days: records.map((r) => ({
      date: isoDay(r.date),
      status: r.status,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      note: r.note,
    })),
    approvedLeaves: leaves.map((l) => ({
      startDate: isoDay(l.startDate),
      endDate: isoDay(l.endDate),
      leaveType: l.leaveType?.name ?? null,
    })),
    counts,
    percentage: staffAttendancePercentage(counts),
  };
}
