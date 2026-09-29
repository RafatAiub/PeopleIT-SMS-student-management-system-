// Date-range and filter helpers shared by the analytics tabs (no components).
import type { RangePreset, ReportFilters, ReportKey } from './analytics.types';

/** Per-tab defaults: dated tabs start on the last 30 days, the others on any time. */
export const defaultFilters = (tab: ReportKey): ReportFilters =>
  tab === 'finance' || tab === 'attendance' ? { preset: 'last30' } : {};

const toKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (key: string, n: number) => toKey(new Date(new Date(`${key}T00:00:00Z`).getTime() + n * 86400000));

/** Local "today" as YYYY-MM-DD in the browser's timezone. */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Same presets as backend analytics.logic.ts presetRange(). */
export function presetRange(preset: RangePreset, today = todayKey()): { from: string; to: string } | null {
  const [y, m] = today.split('-').map(Number);
  const monthStart = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'thisMonth':
      return { from: monthStart(y, m), to: today };
    case 'lastMonth':
      return { from: monthStart(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1), to: addDays(monthStart(y, m), -1) };
    case 'thisYear':
      return { from: `${y}-01-01`, to: today };
    default:
      return null;
  }
}

/** Effective from/to for a filter set (preset wins over explicit dates). */
export function effectiveRange(f: ReportFilters): { from?: string; to?: string } {
  if (f.preset && f.preset !== 'custom') return presetRange(f.preset) ?? {};
  return { from: f.from, to: f.to };
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
