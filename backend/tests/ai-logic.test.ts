// DB-free unit tests for the AI module's pure logic: risk scoring, attendance
// pattern detection, fee risk, forecast maths, retrieval ranking, SMS maths,
// age→class rules, duplicate detection and demo-mode templates.
// None of these modules import Prisma; the mocks below are belt-and-braces so
// an accidental import can never reach a real database.

jest.mock('../src/config/prisma', () => ({ prisma: {} }));
jest.mock('../src/config/redis', () => ({ redis: {} }));
jest.mock('../src/utils/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() } }));

import {
  computeRiskScore,
  riskLevelFor,
  findConsecutiveAbsenceRuns,
  detectAttendanceDrop,
  classTrend,
  scoreFeeRisk,
  linearForecast,
  summarizeWorkload,
  smsInfo,
  extractAge,
  recommendClassForAge,
  matchClassName,
  findDuplicateStudents,
  nameSimilarity,
  classifyGuardianIntent,
} from '../src/modules/ai/ai.logic';
import { cosine, rankDocumentsSmart } from '../src/modules/ai/ai.embeddings';
import { rankDocuments, tokenize, bestExcerpt, NO_INFO_ANSWER } from '../src/modules/ai/ai.retrieval';
import {
  templateComment,
  templateDashboardSummary,
  templateFeeReminder,
  templateKnowledgeAnswer,
  templateMessageDraft,
  templateRiskExplanation,
} from '../src/modules/ai/ai.templates';

const d = (s: string) => new Date(`${s}T00:00:00`);

describe('computeRiskScore', () => {
  it('scores a perfect student at 0 / LOW with all factors present', () => {
    const r = computeRiskScore({ attendanceTotal: 40, attendancePresent: 40, lateCount: 0, averagePercent: 90, assignmentsDue: 5, assignmentsSubmitted: 5 });
    expect(r.score).toBe(0);
    expect(r.level).toBe('LOW');
    expect(r.factors.map((f) => f.key)).toEqual(['attendance', 'marks', 'late', 'assignments']);
    expect(r.factors.every((f) => f.hasData)).toBe(true);
  });

  it('maxes out every factor for a struggling student (score 100, HIGH)', () => {
    const r = computeRiskScore({ attendanceTotal: 20, attendancePresent: 10, lateCount: 5, averagePercent: 20, assignmentsDue: 4, assignmentsSubmitted: 0 });
    expect(r.score).toBe(100);
    expect(r.level).toBe('HIGH');
    expect(r.factors.find((f) => f.key === 'attendance')!.contribution).toBe(40);
    expect(r.factors.find((f) => f.key === 'marks')!.contribution).toBe(35);
    expect(r.missedAssignments).toBe(4);
  });

  it('interpolates linearly between the thresholds', () => {
    // attendance 77.5% → halfway between 95 and 60 → 20 of 40
    const r = computeRiskScore({ attendanceTotal: 40, attendancePresent: 31, lateCount: 0, averagePercent: null, assignmentsDue: 0, assignmentsSubmitted: 0 });
    expect(r.attendanceRate).toBe(77.5);
    expect(r.factors[0].contribution).toBe(20);
    expect(r.score).toBe(20);
  });

  it('never invents data: missing factors contribute 0 and are flagged', () => {
    const r = computeRiskScore({ attendanceTotal: 0, attendancePresent: 0, lateCount: 0, averagePercent: null, assignmentsDue: 0, assignmentsSubmitted: 0 });
    expect(r.score).toBe(0);
    expect(r.attendanceRate).toBeNull();
    expect(r.averageMarks).toBeNull();
    expect(r.factors.every((f) => !f.hasData)).toBe(true);
    expect(r.reason).toMatch(/Not enough data/);
  });

  it('factor contributions sum to the score (± rounding)', () => {
    const r = computeRiskScore({ attendanceTotal: 30, attendancePresent: 25, lateCount: 3, averagePercent: 55, assignmentsDue: 6, assignmentsSubmitted: 4 });
    const sum = r.factors.reduce((s, f) => s + f.contribution, 0);
    expect(Math.abs(sum - r.score)).toBeLessThanOrEqual(0.5);
  });

  it('maps score to level at the thresholds', () => {
    expect(riskLevelFor(59)).toBe('MEDIUM');
    expect(riskLevelFor(60)).toBe('HIGH');
    expect(riskLevelFor(29)).toBe('LOW');
    expect(riskLevelFor(30)).toBe('MEDIUM');
  });
});

describe('attendance pattern detection', () => {
  it('finds a run of 3+ consecutive absences, ignoring days with no record', () => {
    const runs = findConsecutiveAbsenceRuns([
      { date: d('2026-09-01'), status: 'PRESENT' },
      { date: d('2026-09-02'), status: 'ABSENT' },
      { date: d('2026-09-03'), status: 'ABSENT' },
      // 4th–6th: weekend/holiday, no rows
      { date: d('2026-09-07'), status: 'ABSENT' },
      { date: d('2026-09-08'), status: 'PRESENT' },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].length).toBe(3);
    expect(runs[0].ongoing).toBe(false);
  });

  it('marks a run that reaches the latest record as ongoing, and ignores short runs', () => {
    const runs = findConsecutiveAbsenceRuns([
      { date: d('2026-09-01'), status: 'ABSENT' },
      { date: d('2026-09-02'), status: 'ABSENT' },
      { date: d('2026-09-03'), status: 'LATE' },
      { date: d('2026-09-06'), status: 'ABSENT' },
      { date: d('2026-09-05'), status: 'ABSENT' }, // unsorted input
      { date: d('2026-09-07'), status: 'ABSENT' },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].ongoing).toBe(true);
    expect(runs[0].start.getDate()).toBe(5);
  });

  it('detects a sudden drop only with enough records on both sides', () => {
    expect(detectAttendanceDrop({ total: 20, present: 19 }, { total: 10, present: 6 }).isDrop).toBe(true);
    expect(detectAttendanceDrop({ total: 20, present: 19 }, { total: 3, present: 0 }).isDrop).toBe(false);
    const small = detectAttendanceDrop({ total: 20, present: 18 }, { total: 10, present: 8 });
    expect(small.isDrop).toBe(false);
    expect(small.delta).toBe(-10);
  });

  it('classifies class trends', () => {
    expect(classTrend({ total: 100, present: 80 }, { total: 50, present: 45 }).direction).toBe('IMPROVING');
    expect(classTrend({ total: 100, present: 90 }, { total: 50, present: 40 }).direction).toBe('DECLINING');
    expect(classTrend({ total: 100, present: 90 }, { total: 50, present: 45 }).direction).toBe('STABLE');
    expect(classTrend({ total: 0, present: 0 }, { total: 50, present: 45 }).direction).toBe('INSUFFICIENT_DATA');
  });
});

describe('scoreFeeRisk', () => {
  const now = d('2026-09-27');
  it('returns LOW with no reminder when everything is paid on time', () => {
    const r = scoreFeeRisk([{ dueDate: d('2026-08-10'), status: 'PAID', totalAmount: 1000, paidAmount: 1000, dueAmount: 0, lastPaidAt: d('2026-08-05') }], now);
    expect(r.level).toBe('LOW');
    expect(r.outstandingAmount).toBe(0);
    expect(r.suggestedReminderDate).toBeNull();
  });

  it('flags long-overdue, habitually late payers as HIGH with a reminder today', () => {
    const r = scoreFeeRisk(
      [
        { dueDate: d('2026-07-10'), status: 'UNPAID', totalAmount: 2000, paidAmount: 0, dueAmount: 2000, lastPaidAt: null },
        { dueDate: d('2026-08-10'), status: 'PARTIAL', totalAmount: 2000, paidAmount: 500, dueAmount: 1500, lastPaidAt: d('2026-08-20') },
        { dueDate: d('2026-09-10'), status: 'OVERDUE', totalAmount: 2000, paidAmount: 0, dueAmount: 2000, lastPaidAt: null },
        { dueDate: d('2026-06-10'), status: 'PAID', totalAmount: 2000, paidAmount: 2000, dueAmount: 0, lastPaidAt: d('2026-06-25') },
      ],
      now,
    );
    expect(r.overdueCount).toBe(3);
    expect(r.overdueAmount).toBe(5500);
    expect(r.oldestOverdueDays).toBe(79);
    expect(r.latePaidCount).toBe(1);
    expect(r.avgDaysLate).toBe(15);
    expect(r.level).toBe('HIGH');
    expect(r.suggestedReminderDate!.getTime()).toBe(now.getTime());
  });

  it('suggests a reminder before an upcoming due date', () => {
    const r = scoreFeeRisk([{ dueDate: d('2026-10-15'), status: 'UNPAID', totalAmount: 1000, paidAmount: 0, dueAmount: 1000, lastPaidAt: null }], now);
    expect(r.overdueCount).toBe(0);
    expect(r.nextDueDate!.getDate()).toBe(15);
    // LOW risk, no late history → 2 days before
    expect(r.suggestedReminderDate!.getDate()).toBe(13);
  });

  it('ignores cancelled invoices', () => {
    const r = scoreFeeRisk([{ dueDate: d('2026-01-01'), status: 'CANCELLED', totalAmount: 1000, paidAmount: 0, dueAmount: 1000, lastPaidAt: null }], now);
    expect(r.outstandingAmount).toBe(0);
    expect(r.score).toBe(0);
  });
});

describe('linearForecast', () => {
  it('fits a perfect line exactly with HIGH confidence', () => {
    const f = linearForecast([{ x: 2022, y: 100 }, { x: 2023, y: 110 }, { x: 2024, y: 120 }, { x: 2025, y: 130 }], 2026);
    expect(f.forecast).toBe(140);
    expect(f.slope).toBe(10);
    expect(f.r2).toBe(1);
    expect(f.confidence).toBe('HIGH');
    expect(f.method).toBe('linear-trend');
    expect(f.low).toBeLessThanOrEqual(140);
    expect(f.high).toBeGreaterThanOrEqual(140);
  });

  it('never forecasts below zero', () => {
    const f = linearForecast([{ x: 2023, y: 30 }, { x: 2024, y: 10 }], 2026);
    expect(f.forecast).toBe(0);
  });

  it('handles 0 and 1 points without inventing a trend', () => {
    expect(linearForecast([], 2026)).toMatchObject({ forecast: 0, method: 'none', confidence: 'LOW' });
    expect(linearForecast([{ x: 2025, y: 42 }], 2026)).toMatchObject({ forecast: 42, method: 'last-value', confidence: 'LOW' });
  });

  it('gives LOW confidence to noisy short histories', () => {
    const f = linearForecast([{ x: 2023, y: 50 }, { x: 2024, y: 10 }, { x: 2025, y: 60 }], 2026);
    expect(f.confidence).toBe('LOW');
  });
});

describe('summarizeWorkload', () => {
  it('flags teachers well above / below the mean', () => {
    const rows = [10, 12, 11, 30, 2].map((p, i) => ({ teacherId: `t${i}`, periodsPerWeek: p, sectionsTaught: 1, subjectsTaught: 1, assignmentsCreated: 0, marksPending: i }));
    const s = summarizeWorkload(rows);
    expect(s.teacherCount).toBe(5);
    expect(s.avgPeriods).toBe(13);
    expect(s.overloaded).toEqual(['t3']);
    expect(s.underloaded).toEqual(['t4']);
    expect(s.totalMarksPending).toBe(10);
  });
});

describe('smsInfo', () => {
  it('counts GSM-7 segments', () => {
    expect(smsInfo('a'.repeat(160))).toMatchObject({ encoding: 'GSM-7', segments: 1 });
    expect(smsInfo('a'.repeat(161))).toMatchObject({ encoding: 'GSM-7', segments: 2, perSegment: 153 });
  });
  it('switches Bangla to UCS-2 (70 per segment)', () => {
    expect(smsInfo('ফি'.repeat(35))).toMatchObject({ encoding: 'UCS-2', segments: 1 });
    expect(smsInfo('ফি'.repeat(36))).toMatchObject({ encoding: 'UCS-2', segments: 2 });
  });
});

describe('admission helpers', () => {
  it('extracts ages from English and Bangla text', () => {
    expect(extractAge('My son is 7 years old')).toBe(7);
    expect(extractAge('age: 5')).toBe(5);
    expect(extractAge('আমার মেয়ের বয়স ৬ বছর')).toBe(6);
    expect(extractAge('What are the fees?')).toBeNull();
  });
  it('recommends classes by the BD age guideline and matches class names', () => {
    expect(recommendClassForAge(4)!.label).toBe('Nursery');
    expect(recommendClassForAge(7)!.label).toBe('Class 2');
    expect(recommendClassForAge(1)).toBeNull();
    expect(matchClassName(recommendClassForAge(7)!, ['Class One', 'Class Two', 'Class 3'])).toBe('Class Two');
    expect(matchClassName(recommendClassForAge(8)!, ['Class 1', 'Class 3'])).toBe('Class 3');
    expect(matchClassName(recommendClassForAge(5)!, ['Play', 'KG', 'Class 1'])).toBe('KG');
  });
});

describe('findDuplicateStudents', () => {
  it('finds same name + DOB (HIGH) and same phone + similar name (MEDIUM), not siblings', () => {
    const groups = findDuplicateStudents([
      { id: 'a', name: 'Rahim Uddin', dateOfBirth: d('2015-01-01'), guardianPhones: ['01711111111'] },
      { id: 'b', name: 'rahim  uddin', dateOfBirth: d('2015-01-01'), guardianPhones: [] },
      { id: 'c', name: 'Karim Hasan', dateOfBirth: null, guardianPhones: ['+8801722222222'] },
      { id: 'd', name: 'Karim Hassan', dateOfBirth: null, guardianPhones: ['01722222222'] },
      { id: 'e', name: 'Fatima Hasan', dateOfBirth: null, guardianPhones: ['01722222222'] }, // sibling
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ reason: 'SAME_NAME_AND_DOB', confidence: 'HIGH', studentIds: ['a', 'b'] });
    expect(groups[1]).toMatchObject({ reason: 'SAME_GUARDIAN_PHONE_SIMILAR_NAME', confidence: 'MEDIUM' });
    expect(groups[1].studentIds.sort()).toEqual(['c', 'd']);
  });
  it('treats honorific prefixes as noise', () => {
    expect(nameSimilarity('Md. Rahim', 'Rahim')).toBe(1);
  });
});

describe('classifyGuardianIntent', () => {
  it('routes single-category factual questions', () => {
    expect(classifyGuardianIntent('How much fee is due?')).toBe('FEES');
    expect(classifyGuardianIntent('What is the attendance this month')).toBe('ATTENDANCE');
    expect(classifyGuardianIntent('আগামীকালের রুটিন')).toBe('ROUTINE');
    expect(classifyGuardianIntent('Any upcoming holidays?')).toBe('HOLIDAYS');
  });
  it('sends policy / open-ended / mixed questions to staff review', () => {
    expect(classifyGuardianIntent('Why was my fee increased?')).toBe('OTHER');
    expect(classifyGuardianIntent('Can I get a discount on fees?')).toBe('OTHER');
    expect(classifyGuardianIntent('Tell me about fees and results')).toBe('OTHER');
    expect(classifyGuardianIntent('My child is being bullied')).toBe('OTHER');
  });
});

describe('retrieval ranking', () => {
  const docs = [
    { id: '1', title: 'Admission Policy', content: 'Admission opens in December. Required documents: birth certificate and two photos. Admission test for Class 1 and above.' },
    { id: '2', title: 'Fee Structure', content: 'Monthly tuition fee is listed by class. Late fee applies after the 10th of each month.' },
    { id: '3', title: 'Uniform', content: 'White shirt and navy trousers. Sports uniform on Thursdays.' },
  ];

  it('tokenizes with stopword removal and light plural stripping', () => {
    expect(tokenize('What are the required documents?')).toEqual(['required', 'document']);
  });

  it('ranks the most relevant document first and cuts off unrelated ones', () => {
    const ranked = rankDocuments('Which documents are required for admission?', docs, 3);
    expect(ranked[0].doc.id).toBe('1');
    expect(ranked.find((r) => r.doc.id === '3')).toBeUndefined();
  });

  it('weights titles and respects k', () => {
    const ranked = rankDocuments('fee', docs, 1);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].doc.id).toBe('2');
  });

  it('returns nothing for unrelated questions', () => {
    expect(rankDocuments('swimming pool timings', docs)).toEqual([]);
  });

  it('picks the excerpt window containing the query terms', () => {
    const long = `${'lorem ipsum '.repeat(60)}The transport fee is 800 taka per month. ${'dolor sit '.repeat(60)}`;
    expect(bestExcerpt(long, ['transport'], 120)).toContain('transport');
  });
});

describe('demo templates', () => {
  it('keeps the legacy comment text for MarksEntry', () => {
    expect(templateComment('Math', 85, 'A+')).toMatch(/^Excellent work in Math!/);
    expect(templateComment('Math', 30, 'F')).toMatch(/struggling in Math/);
    // with maxMarks, percentage is used: 40/50 = 80% → excellent
    expect(templateComment('Science', 40, '', 50)).toMatch(/^Excellent/);
  });

  it('builds the dashboard summary only from the given numbers, in the parseable format', () => {
    const text = templateDashboardSummary({
      studentCount: 321,
      staffCount: 18,
      totalOutstandingDue: 45000,
      unpaidInvoiceCount: 12,
      overdueInvoiceCount: 5,
      noticesCount: 3,
      attendanceAvg: 88.5,
      attendancePrevAvg: 92,
      collectedThisMonth: 120000,
      newAdmissionsThisMonth: 4,
      pendingDrafts: 2,
    });
    expect(text).toContain('Enrolled Active Students: 321');
    expect(text).toContain('BDT 45,000');
    expect(text).toContain('88.5%');
    expect(text.split('\n').some((l) => l.startsWith('- '))).toBe(true);
    expect(text.split('\n').some((l) => /^1\. /.test(l))).toBe(true);
    expect(text).not.toContain('$');
  });

  it('writes fee reminders with the real amount in both languages', () => {
    const en = templateFeeReminder({ institutionName: 'Green School', studentFirstName: 'Rahim', amount: 2500, dueDate: null, overdue: true, language: 'en', tone: 'formal' });
    expect(en).toContain('BDT 2,500');
    expect(en).toContain('Rahim');
    const bn = templateFeeReminder({ institutionName: 'Green School', studentFirstName: 'Rahim', amount: 2500, dueDate: null, overdue: true, language: 'bn', tone: 'formal' });
    expect(bn).toContain('বকেয়া');
  });

  it('drafts messages per channel', () => {
    expect(templateMessageDraft({ channel: 'SMS', purpose: 'school closed tomorrow', audience: 'Guardians', language: 'en', tone: 'urgent', institutionName: 'X' }).subject).toBeNull();
    expect(templateMessageDraft({ channel: 'EMAIL', purpose: 'parent meeting', audience: 'Guardians', language: 'en', tone: 'formal', institutionName: 'X' }).subject).toBe('Parent meeting');
  });

  it('explains risk from the factors only', () => {
    const r = computeRiskScore({ attendanceTotal: 20, attendancePresent: 12, lateCount: 0, averagePercent: 80, assignmentsDue: 0, assignmentsSubmitted: 0 });
    const text = templateRiskExplanation('Rahim', r.score, r.level, r.factors);
    expect(text).toContain(`${r.score}/100`);
    expect(text).toContain('attendance');
  });

  it('knowledge demo answer returns excerpts with titles, or the no-info line', () => {
    expect(templateKnowledgeAnswer([])).toBe(NO_INFO_ANSWER);
    const ranked = rankDocuments('uniform', [{ id: '1', title: 'Uniform', content: 'White shirt.' }]);
    expect(templateKnowledgeAnswer(ranked)).toContain('"Uniform"');
  });
});

describe('semantic ranking (Voyage) fallback', () => {
  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it('uses keyword ranking when VOYAGE_API_KEY is not set', async () => {
    const saved = process.env.VOYAGE_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    const res = await rankDocumentsSmart('uniform colour', [{ id: '1', title: 'Uniform', content: 'White shirt.' }]);
    expect(res.method).toBe('keyword');
    expect(res.ranked[0].doc.id).toBe('1');
    if (saved !== undefined) process.env.VOYAGE_API_KEY = saved;
  });
});
