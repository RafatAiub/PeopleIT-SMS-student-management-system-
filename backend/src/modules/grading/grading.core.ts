// Pure grading logic — no prisma / IO imports so it is unit-testable and
// safe to import from anywhere (results, promotion, merit list, ...).
//
// Lookup is THRESHOLD based: the band with the highest `minPercent` that is
// <= the percentage wins. That mirrors utils/grading.ts computeGrade()
// (`if (percentage >= 80) return 'A+' ...`) exactly, so a scale seeded from
// BANGLADESH_STANDARD_BANDS grades every possible mark identically to the
// fixed fallback — including fractional percentages such as 79.995 that
// would fall "between" 2-decimal band edges like 70–79.99.
import { computeGrade } from '../../utils/grading';

export interface GradeBandInput {
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint: number;
  remark?: string | null;
}

/**
 * The fixed scale in utils/grading.ts expressed as bands, with the standard
 * NCTB grade points (same mapping the frontend already uses in
 * frontend/src/pages/results/gradePoints.ts). Used for:
 *   - the "Create from Bangladesh standard" seed button, and
 *   - grade points / GPA when no institution scale is configured.
 * Keep in sync with computeGrade() — the grading-scale unit test asserts the
 * two agree for every percentage.
 */
export const BANGLADESH_STANDARD_BANDS: GradeBandInput[] = [
  { grade: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5, remark: 'Excellent' },
  { grade: 'A', minPercent: 70, maxPercent: 79.99, gradePoint: 4, remark: 'Very Good' },
  { grade: 'A-', minPercent: 60, maxPercent: 69.99, gradePoint: 3.5, remark: 'Good' },
  { grade: 'B', minPercent: 50, maxPercent: 59.99, gradePoint: 3, remark: 'Satisfactory' },
  { grade: 'C', minPercent: 40, maxPercent: 49.99, gradePoint: 2, remark: 'Fair' },
  { grade: 'D', minPercent: 33, maxPercent: 39.99, gradePoint: 1, remark: 'Pass' },
  { grade: 'F', minPercent: 0, maxPercent: 32.99, gradePoint: 0, remark: 'Fail' },
];

/** Largest gap allowed between one band's max and the next band's min (2-decimal storage). */
const MAX_GAP = 0.01;
const EPS = 1e-9;

/**
 * Validates a set of bands: at least one band, unique grade labels, each band
 * inside 0–100 with min <= max, grade points within 0–9.99 (Decimal(3,2)),
 * and — sorted by minPercent — the bands must cover 0 → 100 with no overlap
 * and no gap wider than 0.01 (so 70–79.99 followed by 80–100 is contiguous;
 * a shared edge such as 70–80 / 80–100 is also accepted, the higher band
 * wins at exactly 80). Returns a list of human-readable errors (empty = valid).
 */
export function validateBands(bands: GradeBandInput[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(bands) || bands.length === 0) {
    return ['At least one grade band is required'];
  }

  const seen = new Set<string>();
  for (const b of bands) {
    const label = (b.grade ?? '').trim();
    if (!label) errors.push('Every band needs a grade label');
    const key = label.toUpperCase();
    if (label && seen.has(key)) errors.push(`Grade "${label}" is used more than once`);
    seen.add(key);

    if (!Number.isFinite(b.minPercent) || !Number.isFinite(b.maxPercent)) {
      errors.push(`Grade "${label}": percentages must be numbers`);
      continue;
    }
    if (b.minPercent < 0 || b.maxPercent > 100) errors.push(`Grade "${label}": range must be within 0–100`);
    if (b.minPercent > b.maxPercent) errors.push(`Grade "${label}": minimum is greater than maximum`);
    if (!Number.isFinite(b.gradePoint) || b.gradePoint < 0 || b.gradePoint > 9.99) {
      errors.push(`Grade "${label}": grade point must be between 0 and 9.99`);
    }
  }
  if (errors.length > 0) return errors;

  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (Math.abs(sorted[0].minPercent) > EPS) {
    errors.push(`Bands must start at 0% (lowest band "${sorted[0].grade}" starts at ${sorted[0].minPercent}%)`);
  }
  const last = sorted[sorted.length - 1];
  if (Math.abs(last.maxPercent - 100) > EPS) {
    errors.push(`Bands must end at 100% (highest band "${last.grade}" ends at ${last.maxPercent}%)`);
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = cur.minPercent - prev.maxPercent;
    if (gap < -EPS) {
      errors.push(`Grades "${prev.grade}" and "${cur.grade}" overlap (${prev.minPercent}–${prev.maxPercent} vs ${cur.minPercent}–${cur.maxPercent})`);
    } else if (gap > MAX_GAP + EPS) {
      errors.push(`Gap between "${prev.grade}" (ends ${prev.maxPercent}%) and "${cur.grade}" (starts ${cur.minPercent}%)`);
    }
  }
  return errors;
}

export function percentOf(marksObtained: number, maxMarks: number): number {
  return maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
}

/** Threshold lookup — highest band whose minPercent <= percent (lowest band as a floor). */
export function lookupBand<T extends GradeBandInput>(percent: number, bands: T[]): T | null {
  if (!bands || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  for (const band of sorted) {
    if (percent >= band.minPercent) return band;
  }
  return sorted[sorted.length - 1];
}

/**
 * Grade for a mark. `bands` = the institution's default scale, or null when
 * none is configured → falls back to the fixed computeGrade() so existing
 * output is byte-for-byte identical.
 */
export function gradeFor(marksObtained: number, maxMarks: number, bands: GradeBandInput[] | null | undefined): string {
  if (!bands || bands.length === 0) return computeGrade(marksObtained, maxMarks);
  return lookupBand(percentOf(marksObtained, maxMarks), bands)?.grade ?? computeGrade(marksObtained, maxMarks);
}

/** Grade point for a mark, using the scale or the standard NCTB points as fallback. */
export function gradePointFor(marksObtained: number, maxMarks: number, bands: GradeBandInput[] | null | undefined): number {
  const effective = bands && bands.length > 0 ? bands : BANGLADESH_STANDARD_BANDS;
  return lookupBand(percentOf(marksObtained, maxMarks), effective)?.gradePoint ?? 0;
}

/** A band is a failing band when it carries no grade point. */
export function isFailing(marksObtained: number, maxMarks: number, bands: GradeBandInput[] | null | undefined): boolean {
  return gradePointFor(marksObtained, maxMarks, bands) <= 0;
}

export interface SubjectMark {
  subject: string;
  marksObtained: number;
  maxMarks: number;
}

export interface ResultSummary {
  subjects: number;
  totalObtained: number;
  totalMax: number;
  percent: number;
  /** Average grade point; 0 when any subject is failed (Bangladesh GPA convention). */
  gpa: number;
  failedSubjects: string[];
  passed: boolean;
  /** Overall letter grade from the overall percentage. */
  grade: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Summarises one student's marks in one exam: totals, percentage, GPA and
 * pass/fail. A student passes when no subject lands in a failing band.
 */
export function summarizeMarks(marks: SubjectMark[], bands: GradeBandInput[] | null | undefined): ResultSummary {
  const totalObtained = round2(marks.reduce((s, m) => s + m.marksObtained, 0));
  const totalMax = round2(marks.reduce((s, m) => s + m.maxMarks, 0));
  const percent = totalMax > 0 ? round2((totalObtained / totalMax) * 100) : 0;
  const failedSubjects = marks.filter((m) => isFailing(m.marksObtained, m.maxMarks, bands)).map((m) => m.subject);
  const points = marks.map((m) => gradePointFor(m.marksObtained, m.maxMarks, bands));
  const gpa = marks.length === 0 || failedSubjects.length > 0 ? 0 : round2(points.reduce((s, p) => s + p, 0) / points.length);
  return {
    subjects: marks.length,
    totalObtained,
    totalMax,
    percent,
    gpa,
    failedSubjects,
    passed: marks.length > 0 && failedSubjects.length === 0,
    grade: gradeFor(percent, 100, bands),
  };
}
