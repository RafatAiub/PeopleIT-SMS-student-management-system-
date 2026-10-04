// Pure helpers behind the merit list, class analytics, transcript and
// progress-report endpoints. No prisma imports — unit-tested DB-free.
import {
  BANGLADESH_STANDARD_BANDS,
  gradeFor,
  gradePointFor,
  percentOf,
  summarizeMarks,
  type GradeBandInput,
} from '../grading/grading.core';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Ranking ────────────────────────────────────────────────────────────────

export type RankBy = 'total' | 'percent';

export interface RankableEntry {
  totalObtained: number;
  percent: number;
  /** Secondary display order only — never affects the rank number. */
  sortName?: string;
}

/**
 * Standard competition ranking ("1224"): entries with an equal score share a
 * rank, and the next distinct score skips the tied positions. Scores are
 * compared at 2-decimal precision so float noise never splits a tie.
 */
export function rankEntries<T extends RankableEntry>(entries: T[], rankBy: RankBy = 'total'): Array<T & { rank: number }> {
  const score = (e: T) => round2(rankBy === 'percent' ? e.percent : e.totalObtained);
  const sorted = [...entries].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return (a.sortName ?? '').localeCompare(b.sortName ?? '');
  });
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((e, i) => {
    const s = score(e);
    const rank = lastScore !== null && s === lastScore ? lastRank : i + 1;
    lastScore = s;
    lastRank = rank;
    return { ...e, rank };
  });
}

// ── Grouping ───────────────────────────────────────────────────────────────

export interface ResultRow {
  studentId: string;
  subject: string;
  marksObtained: number;
  maxMarks: number;
}

export function groupByStudent<R extends ResultRow>(rows: R[]): Map<string, R[]> {
  const map = new Map<string, R[]>();
  for (const row of rows) {
    const list = map.get(row.studentId);
    if (list) list.push(row);
    else map.set(row.studentId, [row]);
  }
  return map;
}

// ── Class analytics ────────────────────────────────────────────────────────

export interface SubjectAverage {
  subject: string;
  entries: number;
  averagePercent: number;
  averageMarks: number;
  highestPercent: number;
  lowestPercent: number;
  passRate: number;
}

export interface ClassAnalytics {
  studentsWithResults: number;
  passCount: number;
  failCount: number;
  passRate: number;
  averagePercent: number;
  highestPercent: number;
  lowestPercent: number;
  averageGpa: number;
  /** Per-student overall grade, in scale order (best first); zero-count grades included. */
  gradeDistribution: Array<{ grade: string; count: number }>;
  /** Per subject-result grade counts, same ordering. */
  subjectGradeDistribution: Array<{ grade: string; count: number }>;
  subjectAverages: SubjectAverage[];
}

export function buildClassAnalytics(rows: ResultRow[], bands: GradeBandInput[] | null): ClassAnalytics {
  const orderedGrades = [...(bands && bands.length > 0 ? bands : BANGLADESH_STANDARD_BANDS)]
    .sort((a, b) => b.minPercent - a.minPercent)
    .map((b) => b.grade);

  const byStudent = groupByStudent(rows);
  const summaries = Array.from(byStudent.values()).map((list) => summarizeMarks(list, bands));
  const passCount = summaries.filter((s) => s.passed).length;
  const n = summaries.length;

  const overallCounts = new Map<string, number>(orderedGrades.map((g) => [g, 0]));
  for (const s of summaries) overallCounts.set(s.grade, (overallCounts.get(s.grade) ?? 0) + 1);

  const subjectCounts = new Map<string, number>(orderedGrades.map((g) => [g, 0]));
  for (const r of rows) {
    const g = gradeFor(r.marksObtained, r.maxMarks, bands);
    subjectCounts.set(g, (subjectCounts.get(g) ?? 0) + 1);
  }

  const bySubject = new Map<string, ResultRow[]>();
  for (const r of rows) {
    const list = bySubject.get(r.subject);
    if (list) list.push(r);
    else bySubject.set(r.subject, [r]);
  }
  const subjectAverages: SubjectAverage[] = Array.from(bySubject.entries())
    .map(([subject, list]) => {
      const percents = list.map((r) => percentOf(r.marksObtained, r.maxMarks));
      const passed = list.filter((r) => gradePointFor(r.marksObtained, r.maxMarks, bands) > 0).length;
      return {
        subject,
        entries: list.length,
        averagePercent: round2(percents.reduce((a, b) => a + b, 0) / list.length),
        averageMarks: round2(list.reduce((a, r) => a + r.marksObtained, 0) / list.length),
        highestPercent: round2(Math.max(...percents)),
        lowestPercent: round2(Math.min(...percents)),
        passRate: round2((passed / list.length) * 100),
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const toList = (m: Map<string, number>) => Array.from(m.entries()).map(([grade, count]) => ({ grade, count }));
  const percents = summaries.map((s) => s.percent);

  return {
    studentsWithResults: n,
    passCount,
    failCount: n - passCount,
    passRate: n > 0 ? round2((passCount / n) * 100) : 0,
    averagePercent: n > 0 ? round2(percents.reduce((a, b) => a + b, 0) / n) : 0,
    highestPercent: n > 0 ? Math.max(...percents) : 0,
    lowestPercent: n > 0 ? Math.min(...percents) : 0,
    averageGpa: n > 0 ? round2(summaries.reduce((a, s) => a + s.gpa, 0) / n) : 0,
    gradeDistribution: toList(overallCounts),
    subjectGradeDistribution: toList(subjectCounts),
    subjectAverages,
  };
}

// ── Transcript / progress ──────────────────────────────────────────────────

export interface ExamMeta {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface SessionMeta {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
}

export interface StudentResultRow {
  examId: string;
  subject: string;
  marksObtained: number;
  maxMarks: number;
  /** Grade stored at submission time (used verbatim when no scale is configured). */
  storedGrade: string | null;
  remarks: string | null;
}

/** Session whose window contains the exam's start date (null when none does). */
export function sessionForExam(exam: ExamMeta, sessions: SessionMeta[]): SessionMeta | null {
  const t = exam.startDate.getTime();
  return sessions.find((s) => s.startDate.getTime() <= t && t <= s.endDate.getTime()) ?? null;
}

/**
 * Grade shown for one subject result: with a configured scale, regraded from
 * the marks; without one, the stored grade (identical to what every existing
 * endpoint returns), falling back to the fixed scale if nothing was stored.
 */
export function displayGrade(row: { marksObtained: number; maxMarks: number; storedGrade: string | null }, bands: GradeBandInput[] | null): string {
  if (bands && bands.length > 0) return gradeFor(row.marksObtained, row.maxMarks, bands);
  return row.storedGrade ?? gradeFor(row.marksObtained, row.maxMarks, null);
}

export function buildTranscript(
  rows: StudentResultRow[],
  exams: ExamMeta[],
  sessions: SessionMeta[],
  bands: GradeBandInput[] | null,
) {
  const examById = new Map(exams.map((e) => [e.id, e]));
  const byExam = new Map<string, StudentResultRow[]>();
  for (const r of rows) {
    if (!examById.has(r.examId)) continue;
    const list = byExam.get(r.examId);
    if (list) list.push(r);
    else byExam.set(r.examId, [r]);
  }

  const examEntries = Array.from(byExam.entries())
    .map(([examId, list]) => {
      const exam = examById.get(examId)!;
      const session = sessionForExam(exam, sessions);
      const subjects = [...list]
        .sort((a, b) => a.subject.localeCompare(b.subject))
        .map((r) => ({
          subject: r.subject,
          marksObtained: r.marksObtained,
          maxMarks: r.maxMarks,
          percent: round2(percentOf(r.marksObtained, r.maxMarks)),
          grade: displayGrade(r, bands),
          gradePoint: gradePointFor(r.marksObtained, r.maxMarks, bands),
          remarks: r.remarks,
        }));
      return {
        exam: { id: exam.id, name: exam.name, startDate: exam.startDate, endDate: exam.endDate },
        session: session ? { id: session.id, label: session.label } : null,
        subjects,
        summary: summarizeMarks(list, bands),
      };
    })
    .sort((a, b) => a.exam.startDate.getTime() - b.exam.startDate.getTime());

  // Group by session, chronological; exams outside any session go last.
  const sessionsOut: Array<{ session: { id: string; label: string } | null; exams: typeof examEntries }> = [];
  for (const entry of examEntries) {
    const key = entry.session?.id ?? null;
    let bucket = sessionsOut.find((s) => (s.session?.id ?? null) === key);
    if (!bucket) {
      bucket = { session: entry.session, exams: [] };
      sessionsOut.push(bucket);
    }
    bucket.exams.push(entry);
  }
  sessionsOut.sort((a, b) => (a.session === null ? 1 : 0) - (b.session === null ? 1 : 0));

  const totalObtained = round2(examEntries.reduce((s, e) => s + e.summary.totalObtained, 0));
  const totalMax = round2(examEntries.reduce((s, e) => s + e.summary.totalMax, 0));
  return {
    sessions: sessionsOut,
    overall: {
      exams: examEntries.length,
      totalObtained,
      totalMax,
      percent: totalMax > 0 ? round2((totalObtained / totalMax) * 100) : 0,
      averageGpa: examEntries.length > 0 ? round2(examEntries.reduce((s, e) => s + e.summary.gpa, 0) / examEntries.length) : 0,
      passedExams: examEntries.filter((e) => e.summary.passed).length,
    },
  };
}

export function buildProgress(rows: StudentResultRow[], exams: ExamMeta[], bands: GradeBandInput[] | null) {
  const examIdsWithResults = new Set(rows.map((r) => r.examId));
  const orderedExams = exams
    .filter((e) => examIdsWithResults.has(e.id))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const bySubject = new Map<string, StudentResultRow[]>();
  for (const r of rows) {
    const list = bySubject.get(r.subject);
    if (list) list.push(r);
    else bySubject.set(r.subject, [r]);
  }

  const subjects = Array.from(bySubject.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, list]) => {
      const byExam = new Map(list.map((r) => [r.examId, r]));
      return {
        subject,
        points: orderedExams.map((e) => {
          const r = byExam.get(e.id);
          return r
            ? {
                examId: e.id,
                marksObtained: r.marksObtained,
                maxMarks: r.maxMarks,
                percent: round2(percentOf(r.marksObtained, r.maxMarks)),
                grade: displayGrade(r, bands),
              }
            : { examId: e.id, marksObtained: null, maxMarks: null, percent: null, grade: null };
        }),
      };
    });

  const examsOut = orderedExams.map((e) => {
    const summary = summarizeMarks(rows.filter((r) => r.examId === e.id), bands);
    return {
      id: e.id,
      name: e.name,
      startDate: e.startDate,
      percent: summary.percent,
      gpa: summary.gpa,
      passed: summary.passed,
    };
  });

  return { exams: examsOut, subjects };
}
