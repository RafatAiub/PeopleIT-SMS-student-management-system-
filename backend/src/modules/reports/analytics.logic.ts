// Pure helpers behind the analytics endpoints and the scheduled-report job:
// date ranges and bucketing, attendance/collection rates, aging buckets,
// fee-head allocation, chronic-absentee detection, a small 5-field cron
// evaluator and CSV rendering. No prisma / IO imports — unit-tested DB-free.

export const round2 = (n: number) => Math.round(n * 100) / 100;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// ── Dates ──────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' of a Date read as UTC. */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** UTC midnight of a 'YYYY-MM-DD' key. */
export function fromDateKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDays(key: string, days: number): string {
  return toDateKey(new Date(fromDateKey(key).getTime() + days * DAY_MS));
}

/** Whole days from `fromKey` to `toKey` (positive when toKey is later). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((fromDateKey(toKey).getTime() - fromDateKey(fromKey).getTime()) / DAY_MS);
}

/** Today's calendar date in a zone given as a fixed UTC offset in minutes. */
export function localTodayKey(now: Date, offsetMinutes: number): string {
  return toDateKey(new Date(now.getTime() + offsetMinutes * MINUTE_MS));
}

/**
 * UTC offset (minutes, east positive) of an IANA zone at an instant. Falls
 * back to +360 (Asia/Dhaka, which has no DST) for an unknown zone.
 */
export function tzOffsetMinutes(timeZone: string | null | undefined, at: Date = new Date()): number {
  const FALLBACK = 360;
  if (!timeZone) return FALLBACK;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    const truncated = Math.floor(at.getTime() / 1000) * 1000;
    return Math.round((asUtc - truncated) / MINUTE_MS);
  } catch {
    return FALLBACK;
  }
}

export type RangePreset = 'today' | 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

/**
 * Concrete [from, to] date keys (inclusive) for a relative preset, evaluated
 * against `todayKey`. Saved views store the preset so scheduled emails always
 * cover a fresh window rather than the dates the view was saved with.
 */
export function presetRange(preset: RangePreset, todayKey: string): { from: string; to: string } | null {
  const [y, m] = todayKey.split('-').map(Number);
  const monthStart = (yy: number, mm: number) => toDateKey(new Date(Date.UTC(yy, mm - 1, 1)));
  switch (preset) {
    case 'today':
      return { from: todayKey, to: todayKey };
    case 'last7':
      return { from: addDays(todayKey, -6), to: todayKey };
    case 'last30':
      return { from: addDays(todayKey, -29), to: todayKey };
    case 'last90':
      return { from: addDays(todayKey, -89), to: todayKey };
    case 'thisMonth':
      return { from: monthStart(y, m), to: todayKey };
    case 'lastMonth': {
      const from = monthStart(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
      return { from, to: addDays(monthStart(y, m), -1) };
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: todayKey };
    default:
      return null;
  }
}

export interface DateRange {
  from: string;
  to: string;
  /** Number of calendar days in the range, inclusive. */
  days: number;
}

/** Longest window an analytics request may cover. */
export const MAX_RANGE_DAYS = 731;

/**
 * Resolves the effective range: a non-custom preset wins, then explicit
 * from/to, defaulting to the last 30 days. A missing end defaults to today,
 * a missing start to 29 days before the end. Throws on an inverted or
 * over-long range.
 */
export function resolveRange(
  input: { from?: string | null; to?: string | null; preset?: RangePreset | null },
  todayKey: string,
): DateRange {
  let from = input.from ?? null;
  let to = input.to ?? null;
  if (input.preset && input.preset !== 'custom') {
    const r = presetRange(input.preset, todayKey)!;
    from = r.from;
    to = r.to;
  }
  if (!to) to = from && from > todayKey ? from : todayKey;
  if (!from) from = addDays(to, -29);
  if (from > to) throw new Error('"from" must be on or before "to"');
  const days = daysBetweenKeys(from, to) + 1;
  if (days > MAX_RANGE_DAYS) throw new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  return { from, to, days };
}

/** UTC instants bounding a local-date range for timestamp columns (paidAt). */
export function rangeInstants(range: DateRange, offsetMinutes: number): { gte: Date; lt: Date } {
  const shift = offsetMinutes * MINUTE_MS;
  return {
    gte: new Date(fromDateKey(range.from).getTime() - shift),
    lt: new Date(fromDateKey(addDays(range.to, 1)).getTime() - shift),
  };
}

export type Granularity = 'day' | 'month';

/** Daily buckets up to ~2 months, monthly beyond, unless explicitly asked. */
export function resolveGranularity(range: DateRange, requested?: Granularity | null): Granularity {
  if (requested) return requested;
  return range.days <= 62 ? 'day' : 'month';
}

/** Bucket key of a timestamp in local time: 'YYYY-MM-DD' or 'YYYY-MM'. */
export function bucketKey(at: Date, granularity: Granularity, offsetMinutes: number): string {
  const key = toDateKey(new Date(at.getTime() + offsetMinutes * MINUTE_MS));
  return granularity === 'day' ? key : key.slice(0, 7);
}

/** Every bucket key in the range, in order, so charts show gaps as zero. */
export function seriesKeys(range: DateRange, granularity: Granularity): string[] {
  const keys: string[] = [];
  if (granularity === 'day') {
    for (let i = 0; i < range.days; i++) keys.push(addDays(range.from, i));
    return keys;
  }
  let [y, m] = range.from.split('-').map(Number);
  const [ty, tm] = range.to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

// ── Rates ──────────────────────────────────────────────────────────────────

export interface StatusCounts {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  total: number;
}

export const emptyCounts = (): StatusCounts => ({ present: 0, absent: 0, late: 0, halfDay: 0, total: 0 });

/** Adds `n` records of an attendance status (PRESENT/ABSENT/LATE/HALF_DAY). */
export function addStatus(c: StatusCounts, status: string, n = 1): StatusCounts {
  if (status === 'PRESENT') c.present += n;
  else if (status === 'ABSENT') c.absent += n;
  else if (status === 'LATE') c.late += n;
  else if (status === 'HALF_DAY') c.halfDay += n;
  else return c; // unknown statuses are ignored, not counted in the total
  c.total += n;
  return c;
}

export function mergeCounts(a: StatusCounts, b: StatusCounts): StatusCounts {
  return {
    present: a.present + b.present,
    absent: a.absent + b.absent,
    late: a.late + b.late,
    halfDay: a.halfDay + b.halfDay,
    total: a.total + b.total,
  };
}

/**
 * Attendance rate in percent: PRESENT and LATE count as attended, HALF_DAY
 * as half a day, ABSENT as none. Null when nothing was marked.
 */
export function attendanceRate(c: StatusCounts): number | null {
  if (c.total <= 0) return null;
  return round2(((c.present + c.late + c.halfDay * 0.5) / c.total) * 100);
}

/** Absence rate in percent (ABSENT full, HALF_DAY half). Null when nothing was marked. */
export function absenceRate(c: StatusCounts): number | null {
  if (c.total <= 0) return null;
  return round2(((c.absent + c.halfDay * 0.5) / c.total) * 100);
}

/** Collected / billed in percent, 0 when nothing was billed, capped at 100. */
export function collectionRate(collected: number, billed: number): number {
  if (!(billed > 0)) return 0;
  return Math.min(100, round2((collected / billed) * 100));
}

// ── Aging ──────────────────────────────────────────────────────────────────

export type AgingBucketKey = 'current' | '0-30' | '31-60' | '61-90' | '90+';

export const AGING_BUCKETS: Array<{ key: AgingBucketKey; label: string }> = [
  { key: 'current', label: 'Not yet due' },
  { key: '0-30', label: '0–30 days overdue' },
  { key: '31-60', label: '31–60 days overdue' },
  { key: '61-90', label: '61–90 days overdue' },
  { key: '90+', label: 'Over 90 days overdue' },
];

/**
 * Bucket for an outstanding balance `daysOverdue` days past its due date.
 * Zero or negative (due today or later) is "current"; 1–30 is "0-30"; etc.
 */
export function agingBucketFor(daysOverdue: number): AgingBucketKey {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '0-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

export interface AgingInput {
  dueAmount: number;
  dueDate: Date;
}

export function buildAging(rows: AgingInput[], asOfKey: string) {
  const buckets = new Map<AgingBucketKey, { amount: number; count: number }>(
    AGING_BUCKETS.map((b) => [b.key, { amount: 0, count: 0 }]),
  );
  for (const r of rows) {
    if (!(r.dueAmount > 0)) continue;
    const key = agingBucketFor(daysBetweenKeys(toDateKey(r.dueDate), asOfKey));
    const b = buckets.get(key)!;
    b.amount += r.dueAmount;
    b.count += 1;
  }
  const list = AGING_BUCKETS.map((b) => ({
    bucket: b.key,
    label: b.label,
    amount: round2(buckets.get(b.key)!.amount),
    count: buckets.get(b.key)!.count,
  }));
  const totalOutstanding = round2(list.reduce((s, b) => s + b.amount, 0));
  const totalOverdue = round2(list.filter((b) => b.bucket !== 'current').reduce((s, b) => s + b.amount, 0));
  return { asOf: asOfKey, buckets: list, totalOutstanding, totalOverdue };
}

// ── Fee-head allocation ────────────────────────────────────────────────────

export interface InvoiceHeadLine {
  headId: string;
  headName: string;
  netAmount: number;
}

export const UNALLOCATED_HEAD = { id: 'unallocated', name: 'Unallocated' };

/**
 * Payments carry no fee head, so each payment is split across its invoice's
 * line items in proportion to their net amounts. Invoices without positive
 * line totals land in "Unallocated". Returns heads sorted by amount (desc).
 */
export function allocatePaymentsByHead(
  payments: Array<{ invoiceId: string; amount: number }>,
  linesByInvoice: Map<string, InvoiceHeadLine[]>,
) {
  const totals = new Map<string, { id: string; name: string; amount: number }>();
  const add = (id: string, name: string, amount: number) => {
    const cur = totals.get(id);
    if (cur) cur.amount += amount;
    else totals.set(id, { id, name, amount });
  };
  for (const p of payments) {
    const lines = (linesByInvoice.get(p.invoiceId) ?? []).filter((l) => l.netAmount > 0);
    const lineTotal = lines.reduce((s, l) => s + l.netAmount, 0);
    if (lineTotal <= 0) {
      add(UNALLOCATED_HEAD.id, UNALLOCATED_HEAD.name, p.amount);
      continue;
    }
    for (const l of lines) add(l.headId, l.headName, (p.amount * l.netAmount) / lineTotal);
  }
  return Array.from(totals.values())
    .map((t) => ({ ...t, amount: round2(t.amount) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

// ── Attendance patterns ────────────────────────────────────────────────────

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Per-weekday totals and rates from per-date counts (dates as 'YYYY-MM-DD'). */
export function weekdayPattern(daily: Array<{ date: string; counts: StatusCounts }>) {
  const byDay = WEEKDAYS.map(() => ({ counts: emptyCounts(), days: 0 }));
  for (const d of daily) {
    const idx = fromDateKey(d.date).getUTCDay();
    byDay[idx].counts = mergeCounts(byDay[idx].counts, d.counts);
    if (d.counts.total > 0) byDay[idx].days += 1;
  }
  return byDay.map((b, i) => ({
    weekday: i,
    label: WEEKDAYS[i],
    days: b.days,
    ...b.counts,
    rate: attendanceRate(b.counts),
  }));
}

export interface ChronicCandidate {
  studentId: string;
  counts: StatusCounts;
}

/**
 * Students whose absence rate is at or above `thresholdPercent`, among those
 * with at least `minDays` marked days (so one absence out of two days does not
 * flag a newly enrolled student). Sorted by absence rate, then absences, desc.
 */
export function findChronicAbsentees(candidates: ChronicCandidate[], thresholdPercent: number, minDays: number) {
  return candidates
    .filter((c) => c.counts.total >= Math.max(1, minDays))
    .map((c) => ({ ...c, absenceRate: absenceRate(c.counts) ?? 0 }))
    .filter((c) => c.absenceRate >= thresholdPercent)
    .sort((a, b) => b.absenceRate - a.absenceRate || b.counts.absent - a.counts.absent || a.studentId.localeCompare(b.studentId));
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (Math.max(1, page) - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), meta: { total: items.length, page, pageSize } };
}

// ── Cron ───────────────────────────────────────────────────────────────────
// Standard 5-field cron (minute hour day-of-month month day-of-week) with
// '*', lists, ranges and steps. Evaluated in the institution's local time,
// given as a fixed UTC offset. When both day fields are restricted a day
// matches if EITHER does (classic Vixie-cron semantics).

export interface CronSpec {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domAny: boolean;
  dowAny: boolean;
}

const CRON_FIELDS: Array<{ name: string; min: number; max: number }> = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
];

function parseCronField(raw: string, field: { name: string; min: number; max: number }): Set<number> {
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`Invalid ${field.name} "${part}"`);
    const step = m[2] !== undefined ? Number(m[2]) : 1;
    if (!(step >= 1)) throw new Error(`Invalid step in ${field.name} "${part}"`);
    let lo: number;
    let hi: number;
    if (m[1] === '*') {
      lo = field.min;
      hi = field.max;
    } else if (m[1].includes('-')) {
      [lo, hi] = m[1].split('-').map(Number);
    } else {
      lo = Number(m[1]);
      // "5/15" means "from 5 to the end, every 15".
      hi = m[2] !== undefined ? field.max : lo;
    }
    if (lo < field.min || hi > field.max || lo > hi) {
      throw new Error(`${field.name} "${part}" is outside ${field.min}-${field.max}`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): CronSpec {
  const fields = (expr ?? '').trim().split(/\s+/);
  if (fields.length !== 5 || fields[0] === '') {
    throw new Error('Cron must have 5 fields: minute hour day-of-month month day-of-week');
  }
  const [minutes, hours, daysOfMonth, months, dowRaw] = fields.map((f, i) => parseCronField(f, CRON_FIELDS[i]));
  const daysOfWeek = new Set(Array.from(dowRaw).map((d) => (d === 7 ? 0 : d)));
  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    domAny: fields[2] === '*',
    dowAny: fields[4] === '*',
  };
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

function dayMatches(spec: CronSpec, wall: Date): boolean {
  const dom = spec.daysOfMonth.has(wall.getUTCDate());
  const dow = spec.daysOfWeek.has(wall.getUTCDay());
  if (spec.domAny && spec.dowAny) return true;
  if (spec.domAny) return dow;
  if (spec.dowAny) return dom;
  return dom || dow;
}

/**
 * First instant strictly after `after` at which the cron fires, evaluating
 * the fields in local wall-clock time (`offsetMinutes` east of UTC). Throws
 * when the expression can never fire (e.g. "0 0 31 2 *").
 */
export function nextRunAfter(cron: string | CronSpec, after: Date, offsetMinutes = 360): Date {
  const spec = typeof cron === 'string' ? parseCron(cron) : cron;
  const shift = offsetMinutes * MINUTE_MS;
  // Wall-clock time encoded as a UTC Date; start at the next whole minute.
  let t = Math.floor((after.getTime() + shift) / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  const limitYear = new Date(t).getUTCFullYear() + 5;

  while (new Date(t).getUTCFullYear() <= limitYear) {
    const w = new Date(t);
    const y = w.getUTCFullYear();
    const mo = w.getUTCMonth();
    const d = w.getUTCDate();
    const h = w.getUTCHours();
    if (!spec.months.has(mo + 1)) {
      t = Date.UTC(y, mo + 1, 1, 0, 0);
      continue;
    }
    if (!dayMatches(spec, w)) {
      t = Date.UTC(y, mo, d + 1, 0, 0);
      continue;
    }
    if (!spec.hours.has(h)) {
      t = Date.UTC(y, mo, d, h + 1, 0);
      continue;
    }
    if (!spec.minutes.has(w.getUTCMinutes())) {
      t += MINUTE_MS;
      continue;
    }
    return new Date(t - shift);
  }
  throw new Error('Cron expression never fires');
}

export function nextRuns(cron: string, after: Date, count: number, offsetMinutes = 360): Date[] {
  const spec = parseCron(cron);
  const out: Date[] = [];
  let cursor = after;
  for (let i = 0; i < count; i++) {
    cursor = nextRunAfter(spec, cursor, offsetMinutes);
    out.push(cursor);
  }
  return out;
}

/**
 * Whether a schedule should run now: its next fire time after the last run
 * (or after creation, for a schedule that never ran) has arrived.
 */
export function isScheduleDue(
  cron: string,
  lastRunAt: Date | null,
  createdAt: Date,
  now: Date,
  offsetMinutes = 360,
): boolean {
  try {
    return nextRunAfter(cron, lastRunAt ?? createdAt, offsetMinutes).getTime() <= now.getTime();
  } catch {
    return false;
  }
}

// ── CSV ────────────────────────────────────────────────────────────────────

/** UTF-8 byte-order mark so Excel opens Bangla text in CSVs correctly. */
export const BOM = String.fromCharCode(0xfeff);

export type CsvCell = string | number | boolean | null | undefined | Date;

/**
 * One CSV cell: quoted when it contains a delimiter, quote or newline, and
 * with a leading apostrophe on text that a spreadsheet would treat as a
 * formula (=, +, -, @, tab, CR). Numbers are written verbatim.
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export interface CsvSection {
  title: string;
  headers: string[];
  rows: CsvCell[][];
}

/** Several titled tables in one file, separated by a blank line. */
export function sectionsToCsv(sections: CsvSection[]): string {
  return sections.map((s) => `${csvCell(s.title)}\r\n${toCsv(s.headers, s.rows)}`).join('\r\n\r\n');
}
