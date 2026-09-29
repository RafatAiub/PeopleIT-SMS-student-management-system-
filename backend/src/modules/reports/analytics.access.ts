// Who may see which report — pure, shared by routes, services, saved views,
// schedules and the scheduler (which re-checks the schedule creator's role on
// every run). Keep in step with the frontend analytics.access.ts.
import { UserRole } from '@prisma/client';
import type { ReportKey } from './analytics.dto';

const { SUPER_ADMIN, ADMIN, MANAGEMENT, ACCOUNTANT, TEACHER } = UserRole;

export const REPORT_ROLES: Record<ReportKey, UserRole[]> = {
  finance: [SUPER_ADMIN, ADMIN, MANAGEMENT, ACCOUNTANT],
  // TEACHER is limited to their own sections by analytics.scope.ts.
  attendance: [SUPER_ADMIN, ADMIN, MANAGEMENT, TEACHER],
  academic: [SUPER_ADMIN, ADMIN, MANAGEMENT, TEACHER],
  // Mirrors the enquiries module (/enquiries/funnel is SUPER_ADMIN/ADMIN).
  admissions: [SUPER_ADMIN, ADMIN],
};

/** Every role that can open at least one report (saved views, filter options). */
export const ANALYTICS_ROLES: UserRole[] = [SUPER_ADMIN, ADMIN, MANAGEMENT, ACCOUNTANT, TEACHER];

/** Roles that may create/manage scheduled report emails. */
export const SCHEDULE_ROLES: UserRole[] = [SUPER_ADMIN, ADMIN, ACCOUNTANT];

/** Roles that see and manage every schedule/saved view in the institution. */
export const INSTITUTION_WIDE_ROLES: UserRole[] = [SUPER_ADMIN, ADMIN];

export function canAccessReport(role: string, key: ReportKey): boolean {
  return REPORT_ROLES[key].includes(role as UserRole);
}

export function allowedReportKeys(role: string): ReportKey[] {
  return (Object.keys(REPORT_ROLES) as ReportKey[]).filter((k) => canAccessReport(role, k));
}

export function isInstitutionWide(role: string): boolean {
  return INSTITUTION_WIDE_ROLES.includes(role as UserRole);
}
