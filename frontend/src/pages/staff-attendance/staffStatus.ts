import type { StaffStatus } from './staffAttendance.queries';

export interface StaffStatusOption {
  value: StaffStatus;
  label: string;
  key: 'P' | 'A' | 'L' | 'V' | 'H';
  activeClass: string;
  pillClass: string;
}

// P/A/L/H match the student register; V = leaVe (L is already Late).
export const STAFF_STATUS_OPTIONS: StaffStatusOption[] = [
  {
    value: 'PRESENT',
    label: 'Present',
    key: 'P',
    activeClass: 'bg-emerald-600 text-white',
    pillClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  },
  {
    value: 'ABSENT',
    label: 'Absent',
    key: 'A',
    activeClass: 'bg-rose-600 text-white',
    pillClass: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  },
  {
    value: 'LATE',
    label: 'Late',
    key: 'L',
    activeClass: 'bg-amber-600 text-white',
    pillClass: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  },
  {
    value: 'LEAVE',
    label: 'Leave',
    key: 'V',
    activeClass: 'bg-violet-600 text-white',
    pillClass: 'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
  },
  {
    value: 'HALF_DAY',
    label: 'Half day',
    key: 'H',
    activeClass: 'bg-blue-600 text-white',
    pillClass: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  },
];

export const STAFF_STATUS_BY_KEY: Record<string, StaffStatus> = Object.fromEntries(
  STAFF_STATUS_OPTIONS.map((o) => [o.key, o.value]),
);

export function staffStatusOption(status: string | null | undefined) {
  return STAFF_STATUS_OPTIONS.find((o) => o.value === status);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function percentTone(p: number | null): string {
  if (p === null) return 'text-slate-500';
  if (p < 75) return 'text-rose-700 dark:text-rose-400 font-semibold';
  if (p < 90) return 'text-amber-700 dark:text-amber-400';
  return 'text-emerald-700 dark:text-emerald-400';
}
