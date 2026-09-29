// GPA is not a field the backend returns anywhere in the results module
// (checked backend/src/modules/results and backend/src/utils/grading.ts —
// there is no `gpa`/`gradePoint` concept server-side today). This maps the
// same letter grades the backend already computes and returns
// (backend/src/utils/grading.ts computeGrade, A+/A/A-/B/C/D/F) to the
// standard NCTB grade-point scale purely for an on-screen summary — it is
// never sent anywhere, and is recomputed fresh from each real, server-graded
// `grade` value shown on the page, never persisted or treated as an
// authoritative record.
const GRADE_POINTS: Record<string, number> = {
  'A+': 5,
  A: 4,
  'A-': 3.5,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};

export const gradeToPoint = (grade: string | null | undefined): number | null =>
  grade && grade in GRADE_POINTS ? GRADE_POINTS[grade] : null;

/** Average grade point across a set of graded records; null if none are graded yet. */
export const computeGpa = (grades: (string | null | undefined)[]): number | null => {
  const points = grades.map(gradeToPoint).filter((p): p is number => p !== null);
  if (points.length === 0) return null;
  const avg = points.reduce((sum, p) => sum + p, 0) / points.length;
  return Math.round(avg * 100) / 100;
};
