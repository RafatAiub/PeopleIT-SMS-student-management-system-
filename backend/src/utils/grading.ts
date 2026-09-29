// Standard grading bands. Server-computed so every report card is
// consistent — grade is never trusted as client input (see results.service.ts).
// An institution can override these via Exam > Exam Grade (ExamGrade rows);
// callers pass those in as `bands`, and this built-in scale is the fallback.
export type GradeBand = { minPercent: number; maxPercent: number; grade: string };

export const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { minPercent: 80, maxPercent: 100, grade: 'A+' },
  { minPercent: 70, maxPercent: 79.99, grade: 'A' },
  { minPercent: 60, maxPercent: 69.99, grade: 'A-' },
  { minPercent: 50, maxPercent: 59.99, grade: 'B' },
  { minPercent: 40, maxPercent: 49.99, grade: 'C' },
  { minPercent: 33, maxPercent: 39.99, grade: 'D' },
  { minPercent: 0, maxPercent: 32.99, grade: 'F' },
];

export function computeGrade(marksObtained: number, maxMarks: number, bands?: GradeBand[]): string {
  const percentage = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
  return gradeForPercentage(percentage, bands);
}

// Highest band whose lower bound the percentage reaches — so a fractional
// percentage falling in a gap between integer-configured bands (e.g. 33.5
// between 0-33 and 34-50) resolves to the lower band rather than no grade.
export function gradeForPercentage(percentage: number, bands?: GradeBand[]): string {
  const scale = bands && bands.length > 0 ? bands : DEFAULT_GRADE_BANDS;
  const sorted = [...scale].sort((a, b) => b.minPercent - a.minPercent);
  const match = sorted.find((band) => percentage >= band.minPercent);
  return match ? match.grade : sorted[sorted.length - 1].grade;
}
