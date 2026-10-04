// DB-free unit tests for Wave C attendance/QR/payroll logic: salary component
// calculation, payslip numbers, QR token sign/verify + duplicate window,
// monthly summary percentage math, and the teacher section restriction.
// prisma is mocked so nothing here opens a database connection.

jest.mock('../src/config/prisma', () => ({ prisma: {} }));

import {
  addStatus,
  attendancePercentage,
  countStatuses,
  emptyCounts,
  findOutOfScopeStudents,
  isChronicAbsentee,
  isSectionInTeacherScope,
  monthRange,
  newlyAbsentStudentIds,
  absenceAlertContextId,
  sectionKey,
  sumCounts,
  type TeacherSectionScope,
} from '../src/modules/attendance/attendance.logic';
import {
  checkInStatus,
  extractIdCardToken,
  getQrSecret,
  isDuplicateScan,
  localDayAndTime,
  signQrToken,
  verifyQrToken,
  DUPLICATE_SCAN_WINDOW_MS,
} from '../src/modules/qr-checkin/qr.token';
import {
  componentAmount,
  computePayrollBreakdown,
  toComponentInput,
} from '../src/modules/payroll-components/payroll.logic';
import {
  aggregatePayrollReport,
  formatPayslipNo,
  maxPayslipCounter,
  parsePayslipCounter,
  payPeriodToYearMonth,
  payslipPrefix,
} from '../src/modules/hr/payslip.logic';
import {
  addStaffStatus,
  emptyStaffCounts,
  leaveSuggestions,
  staffAttendancePercentage,
} from '../src/modules/staff-attendance/staff-attendance.logic';
import {
  canTeacherMarkSubject,
  numberPeriods,
  summarizeBySubject,
  weekdayOf,
} from '../src/modules/subject-attendance/subject-attendance.logic';

// ── Salary components ────────────────────────────────────────────────────

describe('componentAmount', () => {
  it('returns the fixed value as-is', () => {
    expect(componentAmount(30000, 'FIXED', 1500)).toBe(1500);
  });
  it('computes a percentage of base, rounded to 2 decimals', () => {
    expect(componentAmount(30000, 'PERCENT_OF_BASE', 10)).toBe(3000);
    expect(componentAmount(12345, 'PERCENT_OF_BASE', 7.5)).toBe(925.88);
  });
  it('treats negative or non-finite values as zero', () => {
    expect(componentAmount(1000, 'FIXED', -5)).toBe(0);
    expect(componentAmount(1000, 'PERCENT_OF_BASE', Number.NaN)).toBe(0);
  });
});

describe('computePayrollBreakdown', () => {
  const components = [
    { componentId: 'c1', name: 'House rent', type: 'ALLOWANCE' as const, calcType: 'PERCENT_OF_BASE' as const, value: 50 },
    { componentId: 'c2', name: 'Medical', type: 'ALLOWANCE' as const, calcType: 'FIXED' as const, value: 1500 },
    { componentId: 'c3', name: 'Provident fund', type: 'DEDUCTION' as const, calcType: 'PERCENT_OF_BASE' as const, value: 10 },
  ];

  it('sums allowances and deductions from components', () => {
    const b = computePayrollBreakdown(20000, components);
    expect(b.allowances).toBe(11500);
    expect(b.deductions).toBe(2000);
    expect(b.netAmount).toBe(29500);
    expect(b.items.map((i) => i.amount)).toEqual([10000, 1500, 2000]);
  });

  it('adds manual adjustments as their own lines', () => {
    const b = computePayrollBreakdown(20000, components, { allowances: 500, deductions: 250 });
    expect(b.items).toHaveLength(5);
    expect(b.allowances).toBe(12000);
    expect(b.deductions).toBe(2250);
    expect(b.netAmount).toBe(29750);
  });

  it('with no components equals base + manual allowances - deductions', () => {
    const b = computePayrollBreakdown(15000, [], { allowances: 1000, deductions: 300 });
    expect(b.netAmount).toBe(15700);
  });

  it('toComponentInput prefers the staff override and drops inactive components', () => {
    const component = { id: 'c1', name: 'HRA', type: 'ALLOWANCE' as const, calcType: 'FIXED' as const, value: 1000, isActive: true };
    expect(toComponentInput({ overrideValue: 2500, component })?.value).toBe(2500);
    expect(toComponentInput({ overrideValue: null, component })?.value).toBe(1000);
    expect(toComponentInput({ overrideValue: null, component: { ...component, isActive: false } })).toBeNull();
  });
});

// ── Payslip numbers ──────────────────────────────────────────────────────

describe('payslip numbers', () => {
  it('parses both "Month YYYY" and "YYYY-MM" pay periods', () => {
    expect(payPeriodToYearMonth('July 2026')).toBe('202607');
    expect(payPeriodToYearMonth('september 2026')).toBe('202609');
    expect(payPeriodToYearMonth('Jan 2027')).toBe('202701');
    expect(payPeriodToYearMonth('2026-12')).toBe('202612');
    expect(payPeriodToYearMonth('Q3 2026')).toBeNull();
    expect(payPeriodToYearMonth('2026-13')).toBeNull();
  });

  it('formats PAY-<TAG>-YYYYMM-NNNN', () => {
    expect(formatPayslipNo('GREENVALLE', '202607', 1)).toBe('PAY-GREENVALLE-202607-0001');
    expect(formatPayslipNo('X', '202607', 12345)).toBe('PAY-X-202607-12345');
    expect(() => formatPayslipNo('X', '202607', 0)).toThrow();
    expect(() => formatPayslipNo('X', '2026-07', 1)).toThrow();
  });

  it('reads counters only for the matching tenant + month prefix', () => {
    const prefix = payslipPrefix('ABC', '202607');
    expect(parsePayslipCounter('PAY-ABC-202607-0042', prefix)).toBe(42);
    expect(parsePayslipCounter('PAY-ABC-202606-0042', prefix)).toBe(0);
    expect(parsePayslipCounter('PAY-XYZ-202607-0042', prefix)).toBe(0);
    expect(parsePayslipCounter(null, prefix)).toBe(0);
    expect(maxPayslipCounter(['PAY-ABC-202607-0003', null, 'PAY-ABC-202607-0011', 'PAY-ABC-202606-0099'], prefix)).toBe(11);
  });
});

describe('aggregatePayrollReport', () => {
  it('totals by department and component, bucketing records without a breakdown as manual', () => {
    const breakdown = computePayrollBreakdown(10000, [
      { componentId: 'c1', name: 'HRA', type: 'ALLOWANCE', calcType: 'PERCENT_OF_BASE', value: 40 },
    ]);
    const report = aggregatePayrollReport([
      { department: 'Science', baseSalary: 10000, allowances: 4000, deductions: 0, netAmount: 14000, status: 'PAID', breakdown },
      { department: null, baseSalary: 8000, allowances: 500, deductions: 200, netAmount: 8300, status: 'UNPAID', breakdown: null },
    ]);
    expect(report.totals).toMatchObject({ count: 2, baseSalary: 18000, netAmount: 22300, paidAmount: 14000, unpaidAmount: 8300 });
    expect(report.byDepartment.map((d) => d.department)).toEqual(['Science', 'Unassigned']);
    expect(report.byComponent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'HRA', type: 'ALLOWANCE', total: 4000 }),
        expect.objectContaining({ name: 'Manual allowances', total: 500 }),
        expect.objectContaining({ name: 'Manual deductions', total: 200 }),
      ]),
    );
  });
});

// ── QR tokens ────────────────────────────────────────────────────────────

describe('QR tokens', () => {
  const secret = 'test-secret-value-1234567890';

  it('round-trips a signed token for the same institution', () => {
    const token = signQrToken('S', 'stu123', 'inst-1', secret);
    expect(token.startsWith('PQ1.S.stu123.')).toBe(true);
    expect(verifyQrToken(token, 'inst-1', secret)).toEqual({ kind: 'S', id: 'stu123' });
  });

  it('rejects the token at another institution, with another secret, or when tampered', () => {
    const token = signQrToken('T', 'user9', 'inst-1', secret);
    expect(verifyQrToken(token, 'inst-2', secret)).toBeNull();
    expect(verifyQrToken(token, 'inst-1', 'other-secret-abcdefghijk')).toBeNull();
    expect(verifyQrToken(token.replace('.user9.', '.user8.'), 'inst-1', secret)).toBeNull();
    expect(verifyQrToken(token.replace('PQ1.T.', 'PQ1.S.'), 'inst-1', secret)).toBeNull();
    expect(verifyQrToken('garbage', 'inst-1', secret)).toBeNull();
  });

  it('refuses ids containing the separator', () => {
    expect(() => signQrToken('S', 'a.b', 'inst-1', secret)).toThrow();
  });

  it('uses QR_SECRET when set, else derives one from JWT_ACCESS_SECRET', () => {
    expect(getQrSecret({ QR_SECRET: 'a-long-enough-qr-secret' } as NodeJS.ProcessEnv)).toBe('a-long-enough-qr-secret');
    const derived = getQrSecret({ JWT_ACCESS_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv);
    expect(derived).toHaveLength(64);
    expect(derived).not.toContain('x'.repeat(10));
    expect(() => getQrSecret({} as NodeJS.ProcessEnv)).toThrow();
  });

  it('extracts ID-card verify tokens from the printed URL', () => {
    expect(extractIdCardToken('https://app.example.com/verify/ckabc123def456ghi789jkl')).toBe('ckabc123def456ghi789jkl');
    expect(extractIdCardToken('ckabc123def456ghi789jkl')).toBe('ckabc123def456ghi789jkl');
    expect(extractIdCardToken('hello')).toBeNull();
  });

  it('ignores a repeat scan inside the 5-minute window only', () => {
    const now = new Date('2026-09-27T03:10:00Z');
    expect(DUPLICATE_SCAN_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(isDuplicateScan(new Date(now.getTime() - 60_000), now)).toBe(true);
    expect(isDuplicateScan(new Date(now.getTime() - 5 * 60_000), now)).toBe(false);
    expect(isDuplicateScan(null, now)).toBe(false);
  });

  it('marks PRESENT up to the cutoff and LATE after it (default 09:00)', () => {
    expect(checkInStatus('08:59')).toBe('PRESENT');
    expect(checkInStatus('09:00')).toBe('PRESENT');
    expect(checkInStatus('09:01')).toBe('LATE');
    expect(checkInStatus('09:30', '10:00')).toBe('PRESENT');
    expect(checkInStatus('09:30', 'bogus')).toBe('LATE');
  });

  it('computes the local day/time in the institution zone', () => {
    // 20:30 UTC on the 26th is 02:30 on the 27th in Dhaka (UTC+6).
    expect(localDayAndTime(new Date('2026-09-26T20:30:00Z'), 'Asia/Dhaka')).toEqual({ day: '2026-09-27', hhmm: '02:30' });
    expect(localDayAndTime(new Date('2026-09-26T20:30:00Z'), 'Not/AZone').day).toBe('2026-09-27');
  });
});

// ── Monthly summary math ─────────────────────────────────────────────────

describe('attendance summary math', () => {
  it('counts statuses and ignores unknown values', () => {
    expect(countStatuses(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'WHAT'])).toEqual({
      present: 1, absent: 1, late: 1, halfDay: 1, total: 4,
    });
  });

  it('counts LATE as attended and HALF_DAY as half, one decimal', () => {
    expect(attendancePercentage({ present: 18, late: 1, halfDay: 2, total: 22 })).toBe(90.9);
    expect(attendancePercentage({ present: 3, late: 0, halfDay: 0, total: 4 })).toBe(75);
  });

  it('returns null (not 0 or 100) when nothing is marked', () => {
    expect(attendancePercentage(emptyCounts())).toBeNull();
    expect(isChronicAbsentee(null)).toBe(false);
  });

  it('flags chronic absentees strictly below 75%', () => {
    expect(isChronicAbsentee(74.9)).toBe(true);
    expect(isChronicAbsentee(75)).toBe(false);
  });

  it('sums class totals', () => {
    const a = addStatus(addStatus(emptyCounts(), 'PRESENT'), 'ABSENT');
    const b = addStatus(emptyCounts(), 'LATE');
    expect(sumCounts([a, b])).toEqual({ present: 1, absent: 1, late: 1, halfDay: 0, total: 3 });
  });

  it('builds month ranges', () => {
    const feb = monthRange('2028-02')!;
    expect(feb.daysInMonth).toBe(29);
    expect(feb.start.toISOString()).toBe('2028-02-01T00:00:00.000Z');
    expect(feb.end.toISOString()).toBe('2028-02-29T23:59:59.999Z');
    expect(monthRange('2026-13')).toBeNull();
    expect(monthRange('bad')).toBeNull();
  });

  it('staff % excludes approved leave days from the denominator', () => {
    const c = emptyStaffCounts();
    ['PRESENT', 'PRESENT', 'LEAVE', 'ABSENT', 'HALF_DAY'].forEach((s) => addStaffStatus(c, s));
    expect(staffAttendancePercentage(c)).toBe(62.5);
    const onlyLeave = addStaffStatus(emptyStaffCounts(), 'LEAVE');
    expect(staffAttendancePercentage(onlyLeave)).toBeNull();
  });

  it('suggests LEAVE for approved leaves covering the day', () => {
    const m = leaveSuggestions(
      [{ applicantUserId: 'u1', startDate: new Date('2026-09-25'), endDate: new Date('2026-09-28'), leaveTypeName: 'Casual' }],
      '2026-09-27',
    );
    expect(m.get('u1')).toBe('Casual');
    expect(leaveSuggestions([{ applicantUserId: 'u1', startDate: new Date('2026-09-25'), endDate: new Date('2026-09-26') }], '2026-09-27').size).toBe(0);
  });
});

// ── Teacher section restriction ──────────────────────────────────────────

describe('teacher section restriction', () => {
  const scope: TeacherSectionScope = {
    sectionIds: new Set(['sec-a']),
    classSectionKeys: new Set([sectionKey('Class 8', 'A'), sectionKey('Class 9', 'B')]),
  };

  it('allows class-teacher sections by id and timetable sections by name', () => {
    const students = [
      { id: 's1', sectionId: 'sec-a', className: 'Class 8', sectionName: 'A' },
      { id: 's2', sectionId: 'sec-x', className: 'class 9 ', sectionName: 'b' },
    ];
    expect(findOutOfScopeStudents(students, scope)).toEqual([]);
  });

  it('rejects students in any other section, or with no section', () => {
    const students = [
      { id: 's1', sectionId: 'sec-a', className: 'Class 8', sectionName: 'A' },
      { id: 's3', sectionId: 'sec-z', className: 'Class 10', sectionName: 'A' },
      { id: 's4', sectionId: null, className: null, sectionName: null },
    ];
    expect(findOutOfScopeStudents(students, scope)).toEqual(['s3', 's4']);
  });

  it('an empty scope (no assignments) rejects everyone', () => {
    const empty: TeacherSectionScope = { sectionIds: new Set(), classSectionKeys: new Set() };
    expect(findOutOfScopeStudents([{ id: 's1', sectionId: 'sec-a', className: 'Class 8', sectionName: 'A' }], empty)).toEqual(['s1']);
  });

  it('checks a class/section pair for the summary endpoint', () => {
    expect(isSectionInTeacherScope(scope, 'Class 9', 'B')).toBe(true);
    expect(isSectionInTeacherScope(scope, 'Class 9', 'C')).toBe(false);
  });

  it('subject marking: class teacher marks all subjects, others only those they teach', () => {
    expect(canTeacherMarkSubject({ isClassTeacher: true, taughtSubjects: new Set() }, 'Physics')).toBe(true);
    expect(canTeacherMarkSubject({ isClassTeacher: false, taughtSubjects: new Set(['physics']) }, ' Physics ')).toBe(true);
    expect(canTeacherMarkSubject({ isClassTeacher: false, taughtSubjects: new Set(['physics']) }, 'Chemistry')).toBe(false);
  });
});

// ── Absence alert dedupe ─────────────────────────────────────────────────

describe('absence alert dedupe', () => {
  it('alerts only students who were not already ABSENT that day', () => {
    const records = [
      { studentId: 's1', status: 'ABSENT' },
      { studentId: 's2', status: 'ABSENT' },
      { studentId: 's3', status: 'PRESENT' },
      { studentId: 's1', status: 'ABSENT' },
    ];
    const previous = new Map([['s2', 'ABSENT'], ['s3', 'ABSENT']]);
    expect(newlyAbsentStudentIds(records, previous)).toEqual(['s1']);
  });

  it('uses a deterministic per-student, per-day context id', () => {
    const d = new Date('2026-09-27T00:00:00.000Z');
    expect(absenceAlertContextId('s1', d)).toBe('s1:2026-09-27T00:00:00.000Z');
  });
});

// ── Subject attendance helpers ───────────────────────────────────────────

describe('subject attendance helpers', () => {
  it('numbers periods per day by start time', () => {
    const out = numberPeriods([
      { dayOfWeek: 'SUNDAY', startTime: '10:00', endTime: '10:45', subject: 'Math' },
      { dayOfWeek: 'SUNDAY', startTime: '09:00', endTime: '09:45', subject: 'Bangla' },
      { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '09:45', subject: 'English' },
    ]);
    expect(out.find((s) => s.subject === 'Bangla')?.period).toBe(1);
    expect(out.find((s) => s.subject === 'Math')?.period).toBe(2);
    expect(out.find((s) => s.subject === 'English')?.period).toBe(1);
  });

  it('summarises per subject', () => {
    const d = new Date('2026-09-27');
    const rows = summarizeBySubject([
      { studentId: 's1', subjectName: 'Math', status: 'PRESENT', date: d, period: 1 },
      { studentId: 's1', subjectName: 'Math', status: 'ABSENT', date: d, period: 2 },
      { studentId: 's1', subjectName: 'Bangla', status: 'LATE', date: d, period: 3 },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ subjectName: 'Bangla', total: 1, percentage: 100 }),
      expect.objectContaining({ subjectName: 'Math', total: 2, percentage: 50 }),
    ]);
  });

  it('resolves weekday names', () => {
    expect(weekdayOf('2026-09-27')).toBe('SUNDAY');
  });
});
