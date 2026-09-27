// Builds/parses the simple cron strings the schedule form offers (daily,
// weekly, monthly at a time) and describes any cron for display. The server
// validates and evaluates the full 5-field syntax.

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface CronParts {
  frequency: Frequency;
  time: string; // HH:mm
  weekday: number; // 0 = Sunday
  dayOfMonth: number;
  custom: string;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DEFAULT_CRON_PARTS: CronParts = { frequency: 'weekly', time: '08:00', weekday: 0, dayOfMonth: 1, custom: '0 8 * * 0' };

export function buildCron(p: CronParts): string {
  if (p.frequency === 'custom') return p.custom.trim();
  const [h, m] = p.time.split(':').map((n) => Number(n) || 0);
  if (p.frequency === 'daily') return `${m} ${h} * * *`;
  if (p.frequency === 'weekly') return `${m} ${h} * * ${p.weekday}`;
  return `${m} ${h} ${p.dayOfMonth} * *`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isInt = (s: string) => /^\d+$/.test(s);

/** Reverse of buildCron; anything else becomes "custom". */
export function parseCronParts(cron: string): CronParts {
  const f = cron.trim().split(/\s+/);
  const base = { ...DEFAULT_CRON_PARTS, custom: cron.trim() };
  if (f.length !== 5 || !isInt(f[0]) || !isInt(f[1]) || f[3] !== '*') return { ...base, frequency: 'custom' };
  const time = `${pad(Number(f[1]))}:${pad(Number(f[0]))}`;
  if (f[2] === '*' && f[4] === '*') return { ...base, frequency: 'daily', time };
  if (f[2] === '*' && isInt(f[4])) return { ...base, frequency: 'weekly', time, weekday: Number(f[4]) % 7 };
  if (isInt(f[2]) && f[4] === '*') return { ...base, frequency: 'monthly', time, dayOfMonth: Number(f[2]) };
  return { ...base, frequency: 'custom' };
}

/** English description with placeholders resolved; callers pass it through t(). */
export function describeCron(cron: string): { key: string; vars?: Record<string, string | number> } {
  const p = parseCronParts(cron);
  if (p.frequency === 'daily') return { key: 'Daily at {time}', vars: { time: p.time } };
  if (p.frequency === 'weekly') return { key: 'Every {day} at {time}', vars: { day: WEEKDAY_NAMES[p.weekday], time: p.time } };
  if (p.frequency === 'monthly') return { key: 'Monthly on day {d} at {time}', vars: { d: p.dayOfMonth, time: p.time } };
  return { key: 'Custom: {cron}', vars: { cron } };
}
