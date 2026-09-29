// Mirrors backend/src/modules/reports/analytics.access.ts — keep in step.
import type { ReportKey } from './analytics.types';

export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'TEACHER'
  | 'ACCOUNTANT'
  | 'LIBRARIAN'
  | 'TRANSPORT_OFFICER'
  | 'GUARDIAN'
  | 'STUDENT'
  | 'MANAGEMENT';

export const REPORT_ROLES: Record<ReportKey, Role[]> = {
  finance: ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'ACCOUNTANT'],
  attendance: ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'TEACHER'],
  academic: ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'TEACHER'],
  admissions: ['SUPER_ADMIN', 'ADMIN'],
};

export const ANALYTICS_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'ACCOUNTANT', 'TEACHER'];
export const SCHEDULE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];

export const canAccessReport = (role: string | undefined, key: ReportKey) =>
  !!role && REPORT_ROLES[key].includes(role as Role);

export const allowedReportKeys = (role: string | undefined): ReportKey[] =>
  (Object.keys(REPORT_ROLES) as ReportKey[]).filter((k) => canAccessReport(role, k));

export const canManageSchedules = (role: string | undefined) => !!role && SCHEDULE_ROLES.includes(role as Role);

export const REPORT_LABELS: Record<ReportKey, string> = {
  finance: 'Finance',
  attendance: 'Attendance',
  academic: 'Academic',
  admissions: 'Admissions',
};
