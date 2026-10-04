// Configurable timetable layout — which days/period rows are shown in the
// grid. Persisted per-browser, keyed by institution, so a personalisation on
// one device never leaks to another institution/tenant sharing the browser.
// This is a display preference only: it never changes what the backend
// stores, and any slot that already exists (a day or start time not in the
// saved settings) is still shown — see `mergeWithSlots`.

export interface PeriodDef {
  id: string;
  label: string;
  /** 24-hour HH:MM, matches the backend's startTime/endTime format exactly. */
  start: string;
  end: string;
  isBreak?: boolean;
}

export interface TimetableSettings {
  days: string[]; // backend DayOfWeek enum values, e.g. 'SATURDAY'
  periods: PeriodDef[];
}

export const ALL_DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

export const DEFAULT_SETTINGS: TimetableSettings = {
  days: ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
  periods: [
    { id: 'p1', label: 'Period 1', start: '09:00', end: '09:45' },
    { id: 'p2', label: 'Period 2', start: '09:45', end: '10:30' },
    { id: 'p3', label: 'Period 3', start: '10:30', end: '11:15' },
    { id: 'break1', label: 'Tiffin Break', start: '11:15', end: '11:30', isBreak: true },
    { id: 'p4', label: 'Period 4', start: '11:30', end: '12:15' },
    { id: 'p5', label: 'Period 5', start: '12:15', end: '13:00' },
  ],
};

const storageKey = (institutionId?: string | null) => `timetable-settings-${institutionId || 'default'}`;

export function loadTimetableSettings(institutionId?: string | null): TimetableSettings {
  try {
    const raw = localStorage.getItem(storageKey(institutionId));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.days) || !Array.isArray(parsed?.periods)) return DEFAULT_SETTINGS;
    return parsed;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveTimetableSettings(institutionId: string | null | undefined, settings: TimetableSettings) {
  try {
    localStorage.setItem(storageKey(institutionId), JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private mode / quota) — setting simply won't persist.
  }
}

export function dayLabel(day: string) {
  return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
}

/** '09:00' -> '9:00 AM' for display only; the backend never sees this format. */
export function formatTime12(hhmm: string) {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${period}`;
}

interface SlotLike {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

/**
 * Returns a view of `settings` (never persisted back) that additionally
 * includes any day or start time present in `slots` but missing from the
 * saved settings — so a slot created before the layout was customised (or
 * from a different device/period scheme) is never silently hidden.
 */
export function mergeWithSlots(settings: TimetableSettings, slots: SlotLike[]): TimetableSettings {
  const days = [...settings.days];
  for (const s of slots) {
    if (!days.includes(s.dayOfWeek)) days.push(s.dayOfWeek);
  }

  const periods = [...settings.periods];
  for (const s of slots) {
    if (!periods.some((p) => p.start === s.startTime)) {
      periods.push({
        id: `slot-${s.startTime}`,
        label: `${formatTime12(s.startTime)} – ${formatTime12(s.endTime)}`,
        start: s.startTime,
        end: s.endTime,
      });
    }
  }
  periods.sort((a, b) => a.start.localeCompare(b.start));

  return { days, periods };
}
