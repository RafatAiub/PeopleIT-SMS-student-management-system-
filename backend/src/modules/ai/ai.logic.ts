// =============================================================================
// AI module — pure calculation logic (no Prisma, no network).
//
// Everything in here is deterministic and DB-free so it can be unit tested in
// isolation (see backend/tests/ai-logic.test.ts). The service layer fetches
// aggregates from the database and hands plain numbers to these functions.
// =============================================================================

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export const DAY_MS = 24 * 60 * 60 * 1000;

// ── 1. Academic risk scoring ────────────────────────────────────────────────

export interface RiskInput {
  /** Attendance rows in the window. */
  attendanceTotal: number;
  /** PRESENT + LATE + HALF_DAY rows (attended at least partly). */
  attendancePresent: number;
  lateCount: number;
  /** Sum of marksObtained / sum of maxMarks × 100, or null with no results. */
  averagePercent: number | null;
  /** Teacher-set assignments for the student's class/section whose due date has passed. */
  assignmentsDue: number;
  /** How many of those the student submitted. */
  assignmentsSubmitted: number;
}

export interface RiskFactor {
  key: 'attendance' | 'marks' | 'late' | 'assignments';
  label: string;
  /** Points this factor adds to the 0–100 score. */
  contribution: number;
  /** Maximum points the factor can add. */
  maxContribution: number;
  /** Human-readable value, e.g. "72.5%" or "3 of 8 missed". */
  value: string;
  /** False when there was no data for this factor (it then contributes 0). */
  hasData: boolean;
  detail: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  attendanceRate: number | null;
  averageMarks: number | null;
  missedAssignments: number;
  reason: string;
}

/** Weights sum to 100. Higher score = higher risk. */
export const RISK_WEIGHTS = { attendance: 40, marks: 35, late: 10, assignments: 15 } as const;
export const RISK_THRESHOLDS = { high: 60, medium: 30 } as const;

export function riskLevelFor(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.high) return 'HIGH';
  if (score >= RISK_THRESHOLDS.medium) return 'MEDIUM';
  return 'LOW';
}

/**
 * Combines attendance rate, average marks, lateness and missed assignments
 * into a 0–100 risk score with a per-factor breakdown.
 *   - attendance: 0 points at ≥95%, full 40 at ≤60%, linear between
 *   - marks: 0 points at ≥75%, full 35 at ≤33% (the BD pass mark), linear
 *   - late: share of attended days marked LATE; full 10 at ≥20%
 *   - assignments: share of due assignments not submitted; full 15 at ≥50%
 * A factor with no data contributes 0 and is flagged `hasData: false` — the
 * score never invents a value for missing data.
 */
export function computeRiskScore(input: RiskInput): RiskResult {
  const factors: RiskFactor[] = [];

  const hasAttendance = input.attendanceTotal > 0;
  const attendanceRate = hasAttendance ? (input.attendancePresent / input.attendanceTotal) * 100 : null;
  factors.push({
    key: 'attendance',
    label: 'Attendance rate',
    maxContribution: RISK_WEIGHTS.attendance,
    contribution: hasAttendance ? round1(RISK_WEIGHTS.attendance * clamp01((95 - attendanceRate!) / 35)) : 0,
    value: hasAttendance ? `${round1(attendanceRate!)}%` : 'No records',
    hasData: hasAttendance,
    detail: hasAttendance
      ? `Attended ${input.attendancePresent} of ${input.attendanceTotal} recorded days.`
      : 'No attendance has been recorded in this period.',
  });

  const hasMarks = input.averagePercent !== null && Number.isFinite(input.averagePercent);
  factors.push({
    key: 'marks',
    label: 'Average marks',
    maxContribution: RISK_WEIGHTS.marks,
    contribution: hasMarks ? round1(RISK_WEIGHTS.marks * clamp01((75 - input.averagePercent!) / 42)) : 0,
    value: hasMarks ? `${round1(input.averagePercent!)}%` : 'No results',
    hasData: hasMarks,
    detail: hasMarks
      ? `Average of all entered exam marks is ${round1(input.averagePercent!)}%.`
      : 'No exam results have been entered yet.',
  });

  const lateRate = hasAttendance ? input.lateCount / input.attendanceTotal : 0;
  factors.push({
    key: 'late',
    label: 'Late arrivals',
    maxContribution: RISK_WEIGHTS.late,
    contribution: hasAttendance ? round1(RISK_WEIGHTS.late * clamp01(lateRate / 0.2)) : 0,
    value: hasAttendance ? `${input.lateCount} late` : 'No records',
    hasData: hasAttendance,
    detail: hasAttendance
      ? `Marked late on ${input.lateCount} of ${input.attendanceTotal} recorded days.`
      : 'No attendance has been recorded in this period.',
  });

  const due = Math.max(0, input.assignmentsDue);
  const submitted = Math.min(due, Math.max(0, input.assignmentsSubmitted));
  const missed = due - submitted;
  factors.push({
    key: 'assignments',
    label: 'Missed assignments',
    maxContribution: RISK_WEIGHTS.assignments,
    contribution: due > 0 ? round1(RISK_WEIGHTS.assignments * clamp01(missed / due / 0.5)) : 0,
    value: due > 0 ? `${missed} of ${due} missed` : 'None due',
    hasData: due > 0,
    detail: due > 0
      ? `Submitted ${submitted} of ${due} assignments whose due date has passed.`
      : 'No assignments with a passed due date for this class.',
  });

  const score = Math.min(100, Math.round(factors.reduce((s, f) => s + f.contribution, 0)));
  const level = riskLevelFor(score);

  const drivers = factors
    .filter((f) => f.contribution >= 5)
    .sort((a, b) => b.contribution - a.contribution)
    .map((f) => `${f.label.toLowerCase()} (${f.value})`);
  const reason =
    drivers.length === 0
      ? factors.every((f) => !f.hasData)
        ? 'Not enough data yet to assess this student.'
        : 'No significant risk factors in the recorded data.'
      : `Main factors: ${drivers.join(', ')}.`;

  return {
    score,
    level,
    factors,
    attendanceRate: attendanceRate === null ? null : round1(attendanceRate),
    averageMarks: hasMarks ? round1(input.averagePercent!) : null,
    missedAssignments: missed,
    reason,
  };
}

// ── 2. Attendance pattern detection ─────────────────────────────────────────

export interface AttendanceRecordLite {
  date: Date;
  status: string;
}

export interface AbsenceRun {
  start: Date;
  end: Date;
  length: number;
  /** True when the run reaches the student's most recent record (still absent). */
  ongoing: boolean;
}

/**
 * Finds runs of ≥ `minRun` consecutive ABSENT records. "Consecutive" means
 * consecutive recorded school days for that student — days with no record
 * (holidays, weekends) don't break a run; any non-ABSENT record does.
 */
export function findConsecutiveAbsenceRuns(records: AttendanceRecordLite[], minRun = 3): AbsenceRun[] {
  const sorted = [...records].sort((a, b) => a.date.getTime() - b.date.getTime());
  const runs: AbsenceRun[] = [];
  let runStart: Date | null = null;
  let runEnd: Date | null = null;
  let length = 0;

  const close = (ongoing: boolean) => {
    if (runStart && runEnd && length >= minRun) runs.push({ start: runStart, end: runEnd, length, ongoing });
    runStart = null;
    runEnd = null;
    length = 0;
  };

  for (const r of sorted) {
    if (r.status === 'ABSENT') {
      if (!runStart) runStart = r.date;
      runEnd = r.date;
      length += 1;
    } else {
      close(false);
    }
  }
  close(true);
  return runs;
}

export interface WindowCounts {
  total: number;
  present: number;
}

export interface DropResult {
  isDrop: boolean;
  previousRate: number | null;
  recentRate: number | null;
  /** recent − previous, in percentage points (negative = worse). */
  delta: number | null;
}

/**
 * Sudden drop: recent-window rate is at least `thresholdPts` percentage
 * points below the previous-window rate. Both windows need at least
 * `minRecords` records, so one absent day on a sparse record isn't a "drop".
 */
export function detectAttendanceDrop(
  previous: WindowCounts,
  recent: WindowCounts,
  thresholdPts = 15,
  minRecords = 5,
): DropResult {
  const previousRate = previous.total > 0 ? (previous.present / previous.total) * 100 : null;
  const recentRate = recent.total > 0 ? (recent.present / recent.total) * 100 : null;
  if (previousRate === null || recentRate === null) {
    return { isDrop: false, previousRate: previousRate === null ? null : round1(previousRate), recentRate: recentRate === null ? null : round1(recentRate), delta: null };
  }
  const delta = recentRate - previousRate;
  return {
    isDrop: previous.total >= minRecords && recent.total >= minRecords && delta <= -thresholdPts,
    previousRate: round1(previousRate),
    recentRate: round1(recentRate),
    delta: round1(delta),
  };
}

export type TrendDirection = 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';

export function classTrend(previous: WindowCounts, recent: WindowCounts, stablePts = 3): {
  direction: TrendDirection;
  previousRate: number | null;
  recentRate: number | null;
  delta: number | null;
} {
  const d = detectAttendanceDrop(previous, recent, Infinity, 1);
  if (d.delta === null) return { direction: 'INSUFFICIENT_DATA', ...d };
  const direction: TrendDirection = d.delta >= stablePts ? 'IMPROVING' : d.delta <= -stablePts ? 'DECLINING' : 'STABLE';
  return { direction, previousRate: d.previousRate, recentRate: d.recentRate, delta: d.delta };
}

// ── 3. Fee collection risk ──────────────────────────────────────────────────

export interface FeeInvoiceLite {
  dueDate: Date;
  status: string; // UNPAID, PARTIAL, PAID, OVERDUE, CANCELLED
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  /** Most recent payment against the invoice, if any. */
  lastPaidAt: Date | null;
}

export interface FeeRiskResult {
  score: number;
  level: RiskLevel;
  outstandingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  oldestOverdueDays: number;
  paidInvoices: number;
  latePaidCount: number;
  partialCount: number;
  avgDaysLate: number;
  nextDueDate: Date | null;
  suggestedReminderDate: Date | null;
  factors: { label: string; contribution: number; maxContribution: number; value: string }[];
  reason: string;
}

const OPEN_STATUSES = new Set(['UNPAID', 'PARTIAL', 'OVERDUE']);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  return new Date(startOfDay(d).getTime() + n * DAY_MS);
}

/**
 * Scores a student's fee-collection risk from their invoice history and
 * suggests when to send the next reminder.
 *   - overdue age (40): full at ≥60 days since the oldest unpaid due date
 *   - habitually late (30): share of paid invoices settled after the due date
 *   - partial payments (15): share of invoices that were only partly paid
 *   - number overdue (15): full at ≥3 overdue invoices
 */
export function scoreFeeRisk(invoices: FeeInvoiceLite[], now = new Date()): FeeRiskResult {
  const live = invoices.filter((i) => i.status !== 'CANCELLED');
  const today = startOfDay(now);

  const open = live.filter((i) => OPEN_STATUSES.has(i.status) && i.dueAmount > 0);
  const overdue = open.filter((i) => startOfDay(i.dueDate).getTime() < today.getTime());
  const outstandingAmount = open.reduce((s, i) => s + i.dueAmount, 0);
  const overdueAmount = overdue.reduce((s, i) => s + i.dueAmount, 0);
  const oldestOverdueDays = overdue.length
    ? Math.floor((today.getTime() - Math.min(...overdue.map((i) => startOfDay(i.dueDate).getTime()))) / DAY_MS)
    : 0;

  const paid = live.filter((i) => i.status === 'PAID');
  const lateDays = paid
    .filter((i) => i.lastPaidAt)
    .map((i) => Math.floor((startOfDay(i.lastPaidAt!).getTime() - startOfDay(i.dueDate).getTime()) / DAY_MS));
  const latePaid = lateDays.filter((d) => d > 0);
  const avgDaysLate = latePaid.length ? Math.round(latePaid.reduce((s, d) => s + d, 0) / latePaid.length) : 0;
  const partialCount = live.filter((i) => i.status === 'PARTIAL' || (i.paidAmount > 0 && i.dueAmount > 0)).length;

  const factors = [
    { label: 'Overdue age', maxContribution: 40, contribution: round1(40 * clamp01(oldestOverdueDays / 60)), value: overdue.length ? `${oldestOverdueDays} days` : 'Nothing overdue' },
    { label: 'Paid late before', maxContribution: 30, contribution: paid.length ? round1(30 * clamp01(latePaid.length / paid.length)) : 0, value: paid.length ? `${latePaid.length} of ${paid.length} paid invoices` : 'No payment history' },
    { label: 'Partial payments', maxContribution: 15, contribution: live.length ? round1(15 * clamp01(partialCount / live.length)) : 0, value: `${partialCount} partly paid` },
    { label: 'Invoices overdue', maxContribution: 15, contribution: round1(15 * clamp01(overdue.length / 3)), value: `${overdue.length} overdue` },
  ];
  const score = Math.min(100, Math.round(factors.reduce((s, f) => s + f.contribution, 0)));
  const level = riskLevelFor(score);

  const upcoming = open
    .filter((i) => startOfDay(i.dueDate).getTime() >= today.getTime())
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const nextDueDate = upcoming[0]?.dueDate ?? null;

  let suggestedReminderDate: Date | null = null;
  if (overdue.length) {
    // Already overdue: high risk → today; medium → in 2 days; low → in 3 days.
    suggestedReminderDate = addDays(today, level === 'HIGH' ? 0 : level === 'MEDIUM' ? 2 : 3);
  } else if (nextDueDate) {
    // Upcoming: remind earlier for families who usually pay late.
    const leadDays = level === 'HIGH' ? 7 : level === 'MEDIUM' || avgDaysLate > 0 ? 5 : 2;
    const candidate = addDays(nextDueDate, -leadDays);
    suggestedReminderDate = candidate.getTime() < today.getTime() ? today : candidate;
  }

  const reasonParts: string[] = [];
  if (overdue.length) reasonParts.push(`${overdue.length} invoice(s) overdue, oldest by ${oldestOverdueDays} days`);
  if (latePaid.length) reasonParts.push(`paid late ${latePaid.length} time(s) before (avg ${avgDaysLate} days late)`);
  if (partialCount) reasonParts.push(`${partialCount} partly paid invoice(s)`);
  const reason = reasonParts.length ? `${reasonParts.join('; ')}.` : 'No overdue or late-payment history.';

  return {
    score,
    level,
    outstandingAmount: round2(outstandingAmount),
    overdueAmount: round2(overdueAmount),
    overdueCount: overdue.length,
    oldestOverdueDays,
    paidInvoices: paid.length,
    latePaidCount: latePaid.length,
    partialCount,
    avgDaysLate,
    nextDueDate,
    suggestedReminderDate,
    factors,
    reason,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ── 4. Enrolment forecast (simple linear trend) ─────────────────────────────

export interface ForecastPoint {
  x: number; // year
  y: number; // admissions
}

export type ForecastConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface LinearForecast {
  forecast: number;
  low: number;
  high: number;
  slope: number;
  intercept: number;
  r2: number | null;
  n: number;
  confidence: ForecastConfidence;
  method: 'linear-trend' | 'last-value' | 'none';
  note: string;
}

/**
 * Least-squares straight line through (year, admissions) points, projected
 * to `targetX`. The ± band is one residual standard error (min ±1). With
 * fewer than 2 points there is no trend: 1 point repeats that value (LOW
 * confidence), 0 points forecasts 0 with method 'none'.
 */
export function linearForecast(points: ForecastPoint[], targetX: number): LinearForecast {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n === 0) {
    return { forecast: 0, low: 0, high: 0, slope: 0, intercept: 0, r2: null, n, confidence: 'LOW', method: 'none', note: 'No historical admissions to base a forecast on.' };
  }
  if (n === 1) {
    const y = Math.max(0, Math.round(pts[0].y));
    return { forecast: y, low: y, high: y, slope: 0, intercept: y, r2: null, n, confidence: 'LOW', method: 'last-value', note: 'Only one year of data — repeating last year; no trend can be estimated.' };
  }
  const meanX = pts.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - meanX) * (p.y - meanY);
    sxx += (p.x - meanX) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const predict = (x: number) => intercept + slope * x;

  let ssRes = 0;
  let ssTot = 0;
  for (const p of pts) {
    ssRes += (p.y - predict(p.x)) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const se = n > 2 ? Math.sqrt(ssRes / (n - 2)) : Math.abs(pts[1].y - pts[0].y) / 2;
  const band = Math.max(1, Math.round(se));

  const raw = predict(targetX);
  const forecast = Math.max(0, Math.round(raw));
  const confidence: ForecastConfidence = n >= 4 && r2 >= 0.7 ? 'HIGH' : n >= 3 && r2 >= 0.4 ? 'MEDIUM' : 'LOW';
  const note =
    confidence === 'HIGH'
      ? `Steady trend over ${n} years (R² ${r2.toFixed(2)}).`
      : confidence === 'MEDIUM'
        ? `Moderate trend over ${n} years (R² ${r2.toFixed(2)}); treat as a rough guide.`
        : `Weak or short history (${n} years${n > 2 ? `, R² ${r2.toFixed(2)}` : ''}); low confidence.`;

  return {
    forecast,
    low: Math.max(0, forecast - band),
    high: forecast + band,
    slope: Math.round(slope * 100) / 100,
    intercept: Math.round(intercept * 100) / 100,
    r2: Math.round(r2 * 1000) / 1000,
    n,
    confidence,
    method: 'linear-trend',
    note,
  };
}

// ── 5. Teacher workload ─────────────────────────────────────────────────────

export interface WorkloadRow {
  teacherId: string;
  periodsPerWeek: number;
  sectionsTaught: number;
  subjectsTaught: number;
  assignmentsCreated: number;
  marksPending: number;
}

export interface WorkloadSummary {
  teacherCount: number;
  avgPeriods: number;
  maxPeriods: number;
  minPeriods: number;
  overloaded: string[];
  underloaded: string[];
  totalMarksPending: number;
}

/**
 * Flags teachers whose weekly periods are well above/below the staff mean
 * (> mean + 1 SD and above `overloadFloor`, or < mean − 1 SD). Teachers with
 * no timetable slots at all are counted as underloaded only when others have slots.
 */
export function summarizeWorkload(rows: WorkloadRow[], overloadFloor = 20): WorkloadSummary {
  const n = rows.length;
  if (n === 0) {
    return { teacherCount: 0, avgPeriods: 0, maxPeriods: 0, minPeriods: 0, overloaded: [], underloaded: [], totalMarksPending: 0 };
  }
  const periods = rows.map((r) => r.periodsPerWeek);
  const mean = periods.reduce((s, p) => s + p, 0) / n;
  const sd = Math.sqrt(periods.reduce((s, p) => s + (p - mean) ** 2, 0) / n);
  const anyScheduled = periods.some((p) => p > 0);
  return {
    teacherCount: n,
    avgPeriods: round1(mean),
    maxPeriods: Math.max(...periods),
    minPeriods: Math.min(...periods),
    overloaded: rows.filter((r) => sd > 0 && r.periodsPerWeek > mean + sd && r.periodsPerWeek >= overloadFloor).map((r) => r.teacherId),
    underloaded: anyScheduled ? rows.filter((r) => sd > 0 && r.periodsPerWeek < mean - sd).map((r) => r.teacherId) : [],
    totalMarksPending: rows.reduce((s, r) => s + r.marksPending, 0),
  };
}

// ── 6. SMS segment maths ────────────────────────────────────────────────────

const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

export interface SmsInfo {
  characters: number;
  encoding: 'GSM-7' | 'UCS-2';
  segments: number;
  perSegment: number;
}

/**
 * GSM-7 fits 160 chars in one SMS (153 per part when split); anything outside
 * GSM-7 — including Bangla — forces UCS-2: 70 chars (67 per part).
 */
export function smsInfo(text: string): SmsInfo {
  const chars = Array.from(text);
  const isGsm = chars.every((c) => GSM7.includes(c) || GSM7_EXT.includes(c));
  if (isGsm) {
    const units = chars.reduce((s, c) => s + (GSM7_EXT.includes(c) ? 2 : 1), 0);
    const segments = units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153);
    return { characters: units, encoding: 'GSM-7', segments, perSegment: segments > 1 ? 153 : 160 };
  }
  // UCS-2 counts UTF-16 code units.
  const units = text.length;
  const segments = units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67);
  return { characters: units, encoding: 'UCS-2', segments, perSegment: segments > 1 ? 67 : 70 };
}

// ── 7. Class recommendation by age (admission assistant) ────────────────────

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export function toLatinDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/** Pulls a child's age out of free text ("my son is 7", "৬ বছর", "age: 5"). */
export function extractAge(text: string): number | null {
  const t = toLatinDigits(text.toLowerCase());
  const patterns = [
    /(\d{1,2})\s*(?:years?|yrs?|y\/o|yo|বছর|বছরের|বয়স)/,
    /(?:age|aged|বয়স)\s*(?:is|of|:)?\s*(\d{1,2})/,
    /(?:is|turns?|turning)\s+(\d{1,2})\b/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const n = Number(m[1]);
      if (n >= 2 && n <= 20) return n;
    }
  }
  return null;
}

/** Age in whole years on `on` (default today). */
export function ageFromDob(dob: Date, on = new Date()): number {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age -= 1;
  return age;
}

/**
 * Typical Bangladesh age guideline at the start of the academic year:
 * 3 → Play, 4 → Nursery, 5 → KG, 6 → Class 1 … 15 → Class 10, 16–17 → Class 11–12.
 * Returns a label plus a class number (0 for pre-primary) used to match the
 * institution's own class names.
 */
export function recommendClassForAge(age: number): { label: string; classNumber: number | null; preKey?: 'play' | 'nursery' | 'kg' } | null {
  if (!Number.isFinite(age) || age < 3 || age > 17) return null;
  if (age === 3) return { label: 'Play Group', classNumber: null, preKey: 'play' };
  if (age === 4) return { label: 'Nursery', classNumber: null, preKey: 'nursery' };
  if (age === 5) return { label: 'KG', classNumber: null, preKey: 'kg' };
  const n = age - 5;
  return { label: `Class ${n}`, classNumber: n };
}

/** Picks the institution class whose name best matches a recommendation. */
export function matchClassName(
  rec: NonNullable<ReturnType<typeof recommendClassForAge>>,
  classNames: string[],
): string | null {
  const norm = (s: string) => toLatinDigits(s.toLowerCase());
  if (rec.preKey) {
    const keys: Record<string, RegExp> = {
      play: /play|প্লে/,
      nursery: /nursery|নার্সারি/,
      kg: /\bkg\b|k\.g|kinder|কেজি/,
    };
    return classNames.find((c) => keys[rec.preKey!].test(norm(c))) ?? null;
  }
  const wanted = rec.classNumber!;
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  return (
    classNames.find((c) => {
      const s = norm(c);
      const num = s.match(/\d+/);
      if (num) return Number(num[0]) === wanted;
      return words[wanted] ? new RegExp(`\\b${words[wanted]}\\b`).test(s) : false;
    }) ?? null
  );
}

// ── 8. Data clean-up: duplicate detection ───────────────────────────────────

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(md|mohammad|mohammed|muhammad|mst|mosammat)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0–1 similarity of two normalised names. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  const max = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / max;
}

export interface CleanupStudent {
  id: string;
  name: string;
  dateOfBirth: Date | null;
  guardianPhones: string[];
}

export interface DuplicateGroup {
  reason: 'SAME_NAME_AND_DOB' | 'SAME_GUARDIAN_PHONE_SIMILAR_NAME';
  confidence: 'HIGH' | 'MEDIUM';
  studentIds: string[];
  detail: string;
}

/**
 * Likely duplicate student records:
 *   - identical normalised name and identical date of birth (HIGH)
 *   - share a guardian phone and names ≥ `similarity` alike (MEDIUM) —
 *     siblings share phones too, so this needs the names to be close.
 * Each unordered pair is reported once; a HIGH match suppresses the MEDIUM one.
 */
export function findDuplicateStudents(students: CleanupStudent[], similarity = 0.85): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const seenPairs = new Set<string>();
  const pairKey = (ids: string[]) => [...ids].sort().join('|');

  const byNameDob = new Map<string, CleanupStudent[]>();
  for (const s of students) {
    if (!s.dateOfBirth) continue;
    const key = `${normalizeName(s.name)}#${s.dateOfBirth.toISOString().slice(0, 10)}`;
    if (!normalizeName(s.name)) continue;
    byNameDob.set(key, [...(byNameDob.get(key) ?? []), s]);
  }
  for (const list of byNameDob.values()) {
    if (list.length < 2) continue;
    const ids = list.map((s) => s.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) seenPairs.add(pairKey([ids[i], ids[j]]));
    groups.push({ reason: 'SAME_NAME_AND_DOB', confidence: 'HIGH', studentIds: ids, detail: 'Same name and date of birth.' });
  }

  const byPhone = new Map<string, CleanupStudent[]>();
  for (const s of students) {
    for (const p of new Set(s.guardianPhones.map((x) => x.replace(/\D/g, '').slice(-10)).filter((x) => x.length >= 10))) {
      byPhone.set(p, [...(byPhone.get(p) ?? []), s]);
    }
  }
  for (const list of byPhone.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.id === b.id) continue;
        const key = pairKey([a.id, b.id]);
        if (seenPairs.has(key)) continue;
        const sim = nameSimilarity(a.name, b.name);
        if (sim >= similarity) {
          seenPairs.add(key);
          groups.push({
            reason: 'SAME_GUARDIAN_PHONE_SIMILAR_NAME',
            confidence: 'MEDIUM',
            studentIds: [a.id, b.id],
            detail: `Share a guardian phone; names ${Math.round(sim * 100)}% similar.`,
          });
        }
      }
    }
  }
  return groups;
}

// ── 9. Guardian chat intent ─────────────────────────────────────────────────

export type GuardianIntent = 'FEES' | 'ATTENDANCE' | 'RESULTS' | 'ROUTINE' | 'HOLIDAYS' | 'NOTICES' | 'OTHER';

const INTENT_KEYWORDS: [GuardianIntent, RegExp][] = [
  ['FEES', /\b(fee|fees|due|dues|invoice|payment|pay|paid|tuition|balance|outstanding)\b|বেতন|ফি|বকেয়া|পেমেন্ট|টাকা/],
  ['ATTENDANCE', /\b(attendance|absent|absence|present|late|missed school)\b|উপস্থিতি|হাজিরা|অনুপস্থিত/],
  ['RESULTS', /\b(result|results|marks?|grade|grades|exam score|report card|gpa)\b|ফলাফল|রেজাল্ট|নম্বর|মার্কস/],
  ['ROUTINE', /\b(routine|timetable|time table|schedule|class time|periods?)\b|রুটিন|সময়সূচি/],
  ['HOLIDAYS', /\b(holiday|holidays|vacation|off day|closed|leave day)\b|ছুটি/],
  ['NOTICES', /\b(notice|notices|announcement|announcements|circular)\b|নোটিশ|বিজ্ঞপ্তি/],
];

/**
 * Rule-based intent: a question is a "direct factual lookup" only when it
 * matches exactly one data category and doesn't read as a policy/opinion
 * question ("why", "can I", "should", "policy", "complain"...). Anything else
 * is OTHER and goes to staff review.
 */
export function classifyGuardianIntent(text: string): GuardianIntent {
  const t = text.toLowerCase();
  if (/\b(why|should|can i|could i|may i|policy|rule|complain|complaint|refund|waive|discount|scholarship|change|transfer|problem|bully|sick)\b|কেন|অভিযোগ|মওকুফ/.test(t)) {
    return 'OTHER';
  }
  const hits = INTENT_KEYWORDS.filter(([, re]) => re.test(t)).map(([k]) => k);
  return hits.length === 1 ? hits[0] : 'OTHER';
}
