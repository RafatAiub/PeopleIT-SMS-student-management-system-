// Shared status metadata for the attendance register (grid, cards, weekly
// matrix). Kept local to this feature because the shared <StatusBadge>
// component (src/components/common/StatusBadge.tsx) doesn't know about
// HALF_DAY and this screen needs consistent P/A/L/H styling + keyboard keys
// everywhere.
import type { AttendanceStatus } from './AttendanceRegisterSheet';

export interface StatusOption {
  value: AttendanceStatus;
  label: string;
  shortLabel: string;
  /** Keyboard shortcut key (also shown in the segmented control). */
  key: 'P' | 'A' | 'L' | 'H';
  activeClass: string;
  idleClass: string;
  pillClass: string;
  dotClass: string;
}

export const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'PRESENT',
    label: 'Present',
    shortLabel: 'P',
    key: 'P',
    activeClass: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30',
    idleClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/10',
    pillClass: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20',
    dotClass: 'bg-emerald-500',
  },
  {
    value: 'ABSENT',
    label: 'Absent',
    shortLabel: 'A',
    key: 'A',
    activeClass: 'bg-rose-500 text-white shadow-md shadow-rose-500/30',
    idleClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-rose-100 dark:hover:bg-rose-500/10',
    pillClass: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20',
    dotClass: 'bg-rose-500',
  },
  {
    value: 'LATE',
    label: 'Late',
    shortLabel: 'L',
    key: 'L',
    activeClass: 'bg-amber-500 text-white shadow-md shadow-amber-500/30',
    idleClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-500/10',
    pillClass: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20',
    dotClass: 'bg-amber-500',
  },
  {
    value: 'HALF_DAY',
    label: 'Half day',
    shortLabel: 'H',
    key: 'H',
    activeClass: 'bg-blue-500 text-white shadow-md shadow-blue-500/30',
    idleClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-500/10',
    pillClass: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20',
    dotClass: 'bg-blue-500',
  },
];

export const STATUS_BY_KEY: Record<string, AttendanceStatus> = {
  P: 'PRESENT',
  A: 'ABSENT',
  L: 'LATE',
  H: 'HALF_DAY',
};

export function statusOption(status?: AttendanceStatus | string | null): StatusOption | undefined {
  return STATUS_OPTIONS.find((o) => o.value === status);
}

/** Rate used for the attendance heatmap: PRESENT=100, LATE=80, HALF_DAY=50, ABSENT=0. */
export function statusToRate(status?: AttendanceStatus | string | null): number | null {
  switch (status) {
    case 'PRESENT':
      return 100;
    case 'LATE':
      return 80;
    case 'HALF_DAY':
      return 50;
    case 'ABSENT':
      return 0;
    default:
      return null;
  }
}
