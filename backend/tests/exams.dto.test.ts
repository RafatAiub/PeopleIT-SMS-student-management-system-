import { computeGrade, gradeForPercentage } from '../src/utils/grading';
import { CreateExamDto, CreateTimetableDto, SaveGradesDto } from '../src/modules/exams/exams.dto';

describe('grading', () => {
  it('uses the built-in scale when no bands are configured', () => {
    expect(computeGrade(85, 100)).toBe('A+');
    expect(computeGrade(33, 100)).toBe('D');
    expect(computeGrade(32, 100)).toBe('F');
    expect(computeGrade(0, 0)).toBe('F');
  });

  it('uses configured bands, resolving gaps between integer ranges to the lower band', () => {
    const bands = [
      { minPercent: 0, maxPercent: 33, grade: 'F' },
      { minPercent: 34, maxPercent: 50, grade: 'D' },
      { minPercent: 96, maxPercent: 100, grade: 'A+' },
    ];
    expect(gradeForPercentage(33.5, bands)).toBe('F');
    expect(gradeForPercentage(34, bands)).toBe('D');
    expect(gradeForPercentage(100, bands)).toBe('A+');
    expect(computeGrade(48, 50, bands)).toBe('A+');
  });
});

describe('CreateExamDto', () => {
  it('turns an empty semester selection into null', () => {
    const parsed = CreateExamDto.parse({ name: 'Weekly', academicYearId: 'y1', semesterId: '', classIds: ['c1'] });
    expect(parsed.semesterId).toBeNull();
  });

  it('requires at least one class', () => {
    expect(CreateExamDto.safeParse({ name: 'Weekly', academicYearId: 'y1', classIds: [] }).success).toBe(false);
  });
});

describe('CreateTimetableDto', () => {
  const entry = { subjectId: 's1', totalMarks: 100, passingMarks: 36, date: '2026-06-27', startTime: '09:00', endTime: '11:00' };

  it('accepts a valid entry', () => {
    expect(CreateTimetableDto.safeParse({ examId: 'e1', classId: 'c1', entries: [entry] }).success).toBe(true);
  });

  it('rejects passing marks above total marks', () => {
    const res = CreateTimetableDto.safeParse({ examId: 'e1', classId: 'c1', entries: [{ ...entry, passingMarks: 120 }] });
    expect(res.success).toBe(false);
  });

  it('rejects an end time that is not after the start time', () => {
    const res = CreateTimetableDto.safeParse({ examId: 'e1', classId: 'c1', entries: [{ ...entry, endTime: '09:00' }] });
    expect(res.success).toBe(false);
  });
});

describe('SaveGradesDto', () => {
  it('rejects a band whose ending range is below its starting range', () => {
    expect(SaveGradesDto.safeParse({ grades: [{ minPercent: 50, maxPercent: 40, grade: 'B' }] }).success).toBe(false);
  });

  it('rejects ranges outside 0-100', () => {
    expect(SaveGradesDto.safeParse({ grades: [{ minPercent: 90, maxPercent: 110, grade: 'A+' }] }).success).toBe(false);
  });
});
