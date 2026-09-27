// DB-free unit tests for Wave C academics logic: grading-scale validation and
// lookup (scale vs fixed fallback equality), merit-list ranking with ties,
// exam-timetable conflict detection and promotion idempotency / undo.
// Every module under test is pure (no prisma import), so nothing here can
// reach a database.
import { computeGrade } from '../src/utils/grading';
import {
  BANGLADESH_STANDARD_BANDS,
  gradeFor,
  gradePointFor,
  lookupBand,
  summarizeMarks,
  validateBands,
  type GradeBandInput,
} from '../src/modules/grading/grading.core';
import { buildClassAnalytics, rankEntries } from '../src/modules/results/results.insights.logic';
import { findConflicts, timesOverlap, type SlotLike } from '../src/modules/exam-timetable/examTimetable.logic';
import {
  decodeBatchId,
  encodeBatchId,
  isWithinUndoWindow,
  planPromotion,
  planUndo,
  type CandidateStudent,
} from '../src/modules/promotion/promotion.logic';

// ── Band validation ─────────────────────────────────────────────────────────

describe('validateBands', () => {
  it('accepts the Bangladesh standard bands', () => {
    expect(validateBands(BANGLADESH_STANDARD_BANDS)).toEqual([]);
  });

  it('accepts shared edges (70–80 / 80–100)', () => {
    const bands: GradeBandInput[] = [
      { grade: 'P', minPercent: 0, maxPercent: 80, gradePoint: 1 },
      { grade: 'D', minPercent: 80, maxPercent: 100, gradePoint: 2 },
    ];
    expect(validateBands(bands)).toEqual([]);
  });

  it('rejects an empty list', () => {
    expect(validateBands([])).toHaveLength(1);
  });

  it('rejects overlaps', () => {
    const errors = validateBands([
      { grade: 'A', minPercent: 50, maxPercent: 100, gradePoint: 4 },
      { grade: 'B', minPercent: 0, maxPercent: 60, gradePoint: 0 },
    ]);
    expect(errors.some((e) => /overlap/i.test(e))).toBe(true);
  });

  it('rejects gaps wider than 0.01', () => {
    const errors = validateBands([
      { grade: 'A', minPercent: 51, maxPercent: 100, gradePoint: 4 },
      { grade: 'B', minPercent: 0, maxPercent: 50, gradePoint: 0 },
    ]);
    expect(errors.some((e) => /gap/i.test(e))).toBe(true);
  });

  it('rejects bands that do not start at 0 or end at 100', () => {
    expect(validateBands([{ grade: 'A', minPercent: 10, maxPercent: 100, gradePoint: 1 }]).some((e) => /start at 0/.test(e))).toBe(true);
    expect(validateBands([{ grade: 'A', minPercent: 0, maxPercent: 90, gradePoint: 1 }]).some((e) => /end at 100/.test(e))).toBe(true);
  });

  it('rejects duplicate grades, inverted ranges and bad grade points', () => {
    expect(validateBands([
      { grade: 'A', minPercent: 50, maxPercent: 100, gradePoint: 4 },
      { grade: 'a', minPercent: 0, maxPercent: 49.99, gradePoint: 0 },
    ]).some((e) => /more than once/.test(e))).toBe(true);
    expect(validateBands([{ grade: 'A', minPercent: 100, maxPercent: 0, gradePoint: 1 }]).some((e) => /greater than maximum/.test(e))).toBe(true);
    expect(validateBands([{ grade: 'A', minPercent: 0, maxPercent: 100, gradePoint: 12 }]).some((e) => /grade point/.test(e))).toBe(true);
  });
});

// ── Grade lookup: scale vs fallback ─────────────────────────────────────────

describe('gradeFor', () => {
  it('falls back to computeGrade when no scale is configured', () => {
    for (let m = 0; m <= 100; m += 0.25) {
      expect(gradeFor(m, 100, null)).toBe(computeGrade(m, 100));
      expect(gradeFor(m, 100, [])).toBe(computeGrade(m, 100));
    }
  });

  it('a scale seeded from the Bangladesh standard grades every mark exactly like the fixed scale', () => {
    // Fine-grained percentages, including values between 2-decimal band edges.
    for (let i = 0; i <= 100000; i++) {
      const pct = i / 1000;
      expect(gradeFor(pct, 100, BANGLADESH_STANDARD_BANDS)).toBe(computeGrade(pct, 100));
    }
    // Arbitrary max marks.
    for (const max of [25, 30, 50, 75, 150]) {
      for (let m = 0; m <= max; m += 0.5) {
        expect(gradeFor(m, max, BANGLADESH_STANDARD_BANDS)).toBe(computeGrade(m, max));
      }
    }
    expect(gradeFor(0, 0, BANGLADESH_STANDARD_BANDS)).toBe(computeGrade(0, 0));
  });

  it('uses a custom scale when one is configured', () => {
    const passFail: GradeBandInput[] = [
      { grade: 'PASS', minPercent: 50, maxPercent: 100, gradePoint: 1 },
      { grade: 'FAIL', minPercent: 0, maxPercent: 49.99, gradePoint: 0 },
    ];
    expect(gradeFor(49.995, 100, passFail)).toBe('FAIL');
    expect(gradeFor(50, 100, passFail)).toBe('PASS');
    expect(lookupBand(75, passFail)?.gradePoint).toBe(1);
  });

  it('grade points default to the NCTB scale', () => {
    expect(gradePointFor(85, 100, null)).toBe(5);
    expect(gradePointFor(65, 100, null)).toBe(3.5);
    expect(gradePointFor(20, 100, null)).toBe(0);
  });

  it('summarizeMarks: any failed subject fails the exam and zeroes GPA', () => {
    const s = summarizeMarks(
      [
        { subject: 'Math', marksObtained: 90, maxMarks: 100 },
        { subject: 'English', marksObtained: 20, maxMarks: 100 },
      ],
      null,
    );
    expect(s.passed).toBe(false);
    expect(s.gpa).toBe(0);
    expect(s.failedSubjects).toEqual(['English']);
    expect(s.percent).toBe(55);
    const ok = summarizeMarks(
      [
        { subject: 'Math', marksObtained: 90, maxMarks: 100 },
        { subject: 'English', marksObtained: 65, maxMarks: 100 },
      ],
      null,
    );
    expect(ok.passed).toBe(true);
    expect(ok.gpa).toBe(4.25);
  });
});

// ── Ranking ─────────────────────────────────────────────────────────────────

describe('rankEntries', () => {
  it('gives tied scores the same rank and skips the following positions (1224)', () => {
    const ranked = rankEntries(
      [
        { id: 'a', totalObtained: 450, percent: 90, sortName: 'a' },
        { id: 'b', totalObtained: 480, percent: 96, sortName: 'b' },
        { id: 'c', totalObtained: 450, percent: 90, sortName: 'c' },
        { id: 'd', totalObtained: 300, percent: 60, sortName: 'd' },
      ],
      'total',
    );
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ]);
  });

  it('ignores float noise when comparing scores', () => {
    const ranked = rankEntries([
      { totalObtained: 0.1 + 0.2, percent: 0 },
      { totalObtained: 0.3, percent: 0 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('can rank by percent', () => {
    const ranked = rankEntries(
      [
        { id: 'x', totalObtained: 500, percent: 50 },
        { id: 'y', totalObtained: 200, percent: 100 },
      ],
      'percent',
    );
    expect(ranked[0].id).toBe('y');
  });
});

describe('buildClassAnalytics', () => {
  it('computes pass rate, grade distribution and subject averages', () => {
    const a = buildClassAnalytics(
      [
        { studentId: 's1', subject: 'Math', marksObtained: 90, maxMarks: 100 },
        { studentId: 's1', subject: 'Eng', marksObtained: 80, maxMarks: 100 },
        { studentId: 's2', subject: 'Math', marksObtained: 20, maxMarks: 100 },
        { studentId: 's2', subject: 'Eng', marksObtained: 60, maxMarks: 100 },
      ],
      null,
    );
    expect(a.studentsWithResults).toBe(2);
    expect(a.passRate).toBe(50);
    expect(a.subjectAverages.find((s) => s.subject === 'Math')?.averagePercent).toBe(55);
    expect(a.gradeDistribution.map((g) => g.grade)).toEqual(['A+', 'A', 'A-', 'B', 'C', 'D', 'F']);
    expect(a.gradeDistribution.reduce((s, g) => s + g.count, 0)).toBe(2);
  });
});

// ── Timetable conflicts ─────────────────────────────────────────────────────

describe('exam timetable conflicts', () => {
  const base: SlotLike = {
    id: 'existing',
    className: 'Class 8',
    sectionName: 'A',
    subjectName: 'Math',
    date: '2026-11-02',
    startTime: '10:00',
    endTime: '12:00',
    room: '101',
  };

  it('treats intervals as half-open', () => {
    expect(timesOverlap('10:00', '12:00', '12:00', '13:00')).toBe(false);
    expect(timesOverlap('10:00', '12:00', '11:59', '13:00')).toBe(true);
  });

  it('flags the same class+section at an overlapping time', () => {
    const c = findConflicts({ ...base, id: undefined, subjectName: 'English', room: '202', startTime: '11:00', endTime: '13:00' }, [base]);
    expect(c.map((x) => x.type)).toEqual(['CLASS']);
  });

  it('a whole-class slot collides with any section', () => {
    const c = findConflicts({ ...base, id: undefined, sectionName: null, room: null }, [base]);
    expect(c.map((x) => x.type)).toEqual(['CLASS']);
  });

  it('different sections do not collide, but a shared room does', () => {
    const c = findConflicts({ ...base, id: undefined, sectionName: 'B', room: ' 101 ' }, [base]);
    expect(c.map((x) => x.type)).toEqual(['ROOM']);
  });

  it('ignores other dates, non-overlapping times and the slot itself', () => {
    expect(findConflicts({ ...base, id: undefined, date: '2026-11-03' }, [base])).toEqual([]);
    expect(findConflicts({ ...base, id: undefined, startTime: '12:00', endTime: '13:00' }, [base])).toEqual([]);
    expect(findConflicts({ ...base }, [base])).toEqual([]);
  });
});

// ── Promotion ───────────────────────────────────────────────────────────────

describe('planPromotion', () => {
  const student = (id: string, over: Partial<CandidateStudent> = {}): CandidateStudent => ({
    id,
    status: 'ACTIVE',
    classId: 'c6',
    sectionId: 's6a',
    academicYearId: 'y2025',
    ...over,
  });
  const target = { toAcademicYearId: 'y2026', toClassId: 'c7', toSectionId: 's7a' };

  it('moves promoted students and keeps retained ones in class for the new session', () => {
    const plan = planPromotion({
      eligible: [student('a'), student('b')],
      alreadyProcessed: new Set(),
      decisions: [
        { studentId: 'a', status: 'PROMOTED' },
        { studentId: 'b', status: 'RETAINED' },
      ],
      target,
    });
    expect(plan.skipped).toEqual([]);
    expect(plan.actions[0].studentUpdate).toEqual({ classId: 'c7', sectionId: 's7a', academicYearId: 'y2026' });
    expect(plan.actions[1].studentUpdate).toEqual({ classId: 'c6', sectionId: 's6a', academicYearId: 'y2026' });
  });

  it('is idempotent: students already processed for the target session are skipped', () => {
    const decisions = [{ studentId: 'a', status: 'PROMOTED' as const }];
    const first = planPromotion({ eligible: [student('a')], alreadyProcessed: new Set(), decisions, target });
    expect(first.actions).toHaveLength(1);
    const second = planPromotion({ eligible: [student('a')], alreadyProcessed: new Set(['a']), decisions, target });
    expect(second.actions).toHaveLength(0);
    expect(second.skipped[0].reason).toMatch(/already processed/i);
  });

  it('skips duplicates, ineligible students and promotions without a class', () => {
    const plan = planPromotion({
      eligible: [student('a'), student('x', { status: 'GRADUATED' })],
      alreadyProcessed: new Set(),
      decisions: [
        { studentId: 'a', status: 'PROMOTED' },
        { studentId: 'a', status: 'RETAINED' },
        { studentId: 'x', status: 'PROMOTED' },
        { studentId: 'ghost', status: 'PROMOTED' },
      ],
      target,
    });
    expect(plan.actions.map((a) => a.studentId)).toEqual(['a']);
    expect(plan.skipped).toHaveLength(3);

    const noClass = planPromotion({
      eligible: [student('a')],
      alreadyProcessed: new Set(),
      decisions: [{ studentId: 'a', status: 'PROMOTED' }],
      target: { toAcademicYearId: 'y2026' },
    });
    expect(noClass.actions).toHaveLength(0);
  });

  it('a per-student class override does not inherit the batch section', () => {
    const plan = planPromotion({
      eligible: [student('a')],
      alreadyProcessed: new Set(),
      decisions: [{ studentId: 'a', status: 'PROMOTED', toClassId: 'c8' }],
      target,
    });
    expect(plan.actions[0].to).toEqual({ classId: 'c8', sectionId: null, academicYearId: 'y2026' });
  });

  it('graduation only changes status', () => {
    const plan = planPromotion({
      eligible: [student('a')],
      alreadyProcessed: new Set(),
      decisions: [{ studentId: 'a', status: 'GRADUATED' }],
      target,
    });
    expect(plan.actions[0].studentUpdate).toEqual({ classId: 'c6', sectionId: 's6a', academicYearId: 'y2025', status: 'GRADUATED' });
  });
});

describe('promotion undo', () => {
  const record = {
    id: 'r1',
    studentId: 'a',
    status: 'PROMOTED' as const,
    fromAcademicYearId: 'y2025',
    toAcademicYearId: 'y2026',
    fromClassId: 'c6',
    toClassId: 'c7',
    fromSectionId: 's6a',
    toSectionId: 's7a',
  };

  it('restores the stored placement when the student is unchanged', () => {
    const plan = planUndo([record], [{ id: 'a', status: 'ACTIVE', classId: 'c7', sectionId: 's7a', academicYearId: 'y2026' }]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.reverts[0].restore).toEqual({ classId: 'c6', sectionId: 's6a', academicYearId: 'y2025', status: 'ACTIVE' });
  });

  it('reports a conflict when the student was changed afterwards', () => {
    const plan = planUndo([record], [{ id: 'a', status: 'ACTIVE', classId: 'c8', sectionId: null, academicYearId: 'y2026' }]);
    expect(plan.reverts).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
  });

  it('reverts a graduation back to ACTIVE', () => {
    const grad = { ...record, status: 'GRADUATED' as const, toClassId: 'c6', toSectionId: 's6a' };
    const plan = planUndo([grad], [{ id: 'a', status: 'GRADUATED', classId: 'c6', sectionId: 's6a', academicYearId: 'y2025' }]);
    expect(plan.reverts[0].restore.status).toBe('ACTIVE');
  });

  it('batch ids round-trip and the undo window is 24h', () => {
    const at = new Date('2026-09-27T10:00:00.123Z');
    expect(decodeBatchId(encodeBatchId(at, 'user1'))).toEqual({ createdAt: at, userId: 'user1' });
    expect(decodeBatchId('garbage')).toBeNull();
    expect(isWithinUndoWindow(at, new Date('2026-09-28T09:59:00Z'))).toBe(true);
    expect(isWithinUndoWindow(at, new Date('2026-09-28T10:01:00Z'))).toBe(false);
  });
});
