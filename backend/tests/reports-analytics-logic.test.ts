// DB-free unit tests for the analytics / scheduled-report pure logic:
// aging buckets, attendance and collection rates, fee-head allocation,
// chronic absentees, date ranges, cron next-run calculation and CSV output.

import {
  agingBucketFor,
  allocatePaymentsByHead,
  attendanceRate,
  absenceRate,
  addStatus,
  buildAging,
  bucketKey,
  collectionRate,
  csvCell,
  emptyCounts,
  findChronicAbsentees,
  isScheduleDue,
  isValidCron,
  nextRunAfter,
  nextRuns,
  paginate,
  presetRange,
  rangeInstants,
  resolveGranularity,
  resolveRange,
  sectionsToCsv,
  seriesKeys,
  tzOffsetMinutes,
  weekdayPattern,
} from '../src/modules/reports/analytics.logic';
import { allowedReportKeys, canAccessReport } from '../src/modules/reports/analytics.access';

const counts = (present: number, absent: number, late = 0, halfDay = 0) => {
  const c = emptyCounts();
  addStatus(c, 'PRESENT', present);
  addStatus(c, 'ABSENT', absent);
  addStatus(c, 'LATE', late);
  addStatus(c, 'HALF_DAY', halfDay);
  return c;
};

describe('aging buckets', () => {
  it('maps days overdue to buckets at the boundaries', () => {
    expect(agingBucketFor(-5)).toBe('current');
    expect(agingBucketFor(0)).toBe('current');
    expect(agingBucketFor(1)).toBe('0-30');
    expect(agingBucketFor(30)).toBe('0-30');
    expect(agingBucketFor(31)).toBe('31-60');
    expect(agingBucketFor(60)).toBe('31-60');
    expect(agingBucketFor(61)).toBe('61-90');
    expect(agingBucketFor(90)).toBe('61-90');
    expect(agingBucketFor(91)).toBe('90+');
  });

  it('sums amounts per bucket and separates overdue from not-yet-due', () => {
    const d = (k: string) => new Date(`${k}T00:00:00.000Z`);
    const aging = buildAging(
      [
        { dueAmount: 100, dueDate: d('2026-09-30') }, // current
        { dueAmount: 200, dueDate: d('2026-09-27') }, // due today → current
        { dueAmount: 50.5, dueDate: d('2026-09-20') }, // 7 days
        { dueAmount: 300, dueDate: d('2026-07-01') }, // 88 days
        { dueAmount: 400, dueDate: d('2026-01-01') }, // 90+
        { dueAmount: 0, dueDate: d('2026-01-01') }, // ignored
      ],
      '2026-09-27',
    );
    const by = Object.fromEntries(aging.buckets.map((b) => [b.bucket, b]));
    expect(by.current).toMatchObject({ amount: 300, count: 2 });
    expect(by['0-30']).toMatchObject({ amount: 50.5, count: 1 });
    expect(by['31-60']).toMatchObject({ amount: 0, count: 0 });
    expect(by['61-90']).toMatchObject({ amount: 300, count: 1 });
    expect(by['90+']).toMatchObject({ amount: 400, count: 1 });
    expect(aging.totalOutstanding).toBe(1050.5);
    expect(aging.totalOverdue).toBe(750.5);
  });
});

describe('rates', () => {
  it('counts LATE as attended and HALF_DAY as half', () => {
    expect(attendanceRate(counts(8, 2))).toBe(80);
    expect(attendanceRate(counts(6, 2, 1, 1))).toBe(75);
    expect(absenceRate(counts(6, 2, 1, 1))).toBe(25);
    expect(attendanceRate(emptyCounts())).toBeNull();
  });

  it('ignores unknown statuses', () => {
    const c = emptyCounts();
    addStatus(c, 'EXCUSED', 3);
    expect(c.total).toBe(0);
  });

  it('computes collection rate safely', () => {
    expect(collectionRate(750, 1000)).toBe(75);
    expect(collectionRate(1, 3)).toBe(33.33);
    expect(collectionRate(100, 0)).toBe(0);
    expect(collectionRate(1200, 1000)).toBe(100);
  });
});

describe('fee-head allocation', () => {
  it('splits payments pro-rata over invoice lines and keeps unmatched as Unallocated', () => {
    const lines = new Map([
      ['inv1', [
        { headId: 'tuition', headName: 'Tuition', netAmount: 750 },
        { headId: 'lab', headName: 'Lab', netAmount: 250 },
      ]],
    ]);
    const out = allocatePaymentsByHead(
      [
        { invoiceId: 'inv1', amount: 400 },
        { invoiceId: 'inv2', amount: 50 },
      ],
      lines,
    );
    expect(out).toEqual([
      { id: 'tuition', name: 'Tuition', amount: 300 },
      { id: 'lab', name: 'Lab', amount: 100 },
      { id: 'unallocated', name: 'Unallocated', amount: 50 },
    ]);
  });
});

describe('chronic absentees and patterns', () => {
  it('flags students at/above the threshold with enough marked days', () => {
    const out = findChronicAbsentees(
      [
        { studentId: 'a', counts: counts(7, 3) }, // 30%
        { studentId: 'b', counts: counts(9, 1) }, // 10%
        { studentId: 'c', counts: counts(1, 1) }, // 50% but only 2 days
        { studentId: 'd', counts: counts(4, 1) }, // 20% exactly
      ],
      20,
      5,
    );
    expect(out.map((o) => o.studentId)).toEqual(['a', 'd']);
  });

  it('groups by weekday', () => {
    // 2026-09-27 is a Sunday.
    const w = weekdayPattern([
      { date: '2026-09-27', counts: counts(9, 1) },
      { date: '2026-10-04', counts: counts(7, 3) },
      { date: '2026-09-28', counts: counts(5, 5) },
    ]);
    expect(w[0]).toMatchObject({ label: 'Sunday', days: 2, total: 20, rate: 80 });
    expect(w[1]).toMatchObject({ label: 'Monday', days: 1, rate: 50 });
    expect(w[2].rate).toBeNull();
  });

  it('paginates', () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], meta: { total: 5, page: 2, pageSize: 2 } });
  });
});

describe('date ranges', () => {
  it('defaults to the last 30 days and honours presets', () => {
    expect(resolveRange({}, '2026-09-27')).toEqual({ from: '2026-08-29', to: '2026-09-27', days: 30 });
    expect(presetRange('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('thisMonth', '2026-09-27')).toEqual({ from: '2026-09-01', to: '2026-09-27' });
    expect(resolveRange({ preset: 'last7', from: '2020-01-01' }, '2026-09-27').from).toBe('2026-09-21');
    expect(() => resolveRange({ from: '2026-09-10', to: '2026-09-01' }, '2026-09-27')).toThrow();
  });

  it('builds local-time instants and buckets', () => {
    const r = resolveRange({ from: '2026-09-01', to: '2026-09-02' }, '2026-09-27');
    const i = rangeInstants(r, 360);
    expect(i.gte.toISOString()).toBe('2026-08-31T18:00:00.000Z');
    expect(i.lt.toISOString()).toBe('2026-09-02T18:00:00.000Z');
    // 20:00 UTC on the 1st is 02:00 on the 2nd in Dhaka.
    expect(bucketKey(new Date('2026-09-01T20:00:00Z'), 'day', 360)).toBe('2026-09-02');
    expect(resolveGranularity(r)).toBe('day');
    expect(seriesKeys(resolveRange({ from: '2025-11-15', to: '2026-02-01' }, '2026-09-27'), 'month')).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02',
    ]);
  });

  it('resolves timezone offsets with a Dhaka fallback', () => {
    expect(tzOffsetMinutes('Asia/Dhaka', new Date('2026-09-27T00:00:00Z'))).toBe(360);
    expect(tzOffsetMinutes('UTC', new Date('2026-09-27T00:00:00Z'))).toBe(0);
    expect(tzOffsetMinutes('Not/AZone')).toBe(360);
  });
});

describe('cron next-run', () => {
  it('validates expressions', () => {
    expect(isValidCron('0 8 * * *')).toBe(true);
    expect(isValidCron('*/15 9-17 * * 1-5')).toBe(true);
    expect(isValidCron('0 8 * *')).toBe(false);
    expect(isValidCron('60 8 * * *')).toBe(false);
    expect(isValidCron('0 8 * * 8')).toBe(false);
  });

  it('finds the next daily run in Dhaka time', () => {
    // 08:00 Dhaka = 02:00 UTC.
    expect(nextRunAfter('0 8 * * *', new Date('2026-09-27T01:00:00Z'), 360).toISOString()).toBe('2026-09-27T02:00:00.000Z');
    expect(nextRunAfter('0 8 * * *', new Date('2026-09-27T02:00:00Z'), 360).toISOString()).toBe('2026-09-28T02:00:00.000Z');
  });

  it('handles weekly, monthly and either-day semantics', () => {
    // Sunday 2026-09-27; next Monday 07:30 Dhaka.
    expect(nextRunAfter('30 7 * * 1', new Date('2026-09-27T06:00:00Z'), 360).toISOString()).toBe('2026-09-28T01:30:00.000Z');
    // 1st of the month at 06:00 Dhaka.
    expect(nextRunAfter('0 6 1 * *', new Date('2026-09-27T00:00:00Z'), 360).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    // Day 15 OR Friday: the next Friday (Oct 2) comes first.
    expect(nextRunAfter('0 9 15 * 5', new Date('2026-09-27T00:00:00Z'), 0).toISOString()).toBe('2026-10-02T09:00:00.000Z');
    // Sunday as 7.
    expect(nextRunAfter('0 9 * * 7', new Date('2026-09-28T00:00:00Z'), 0).toISOString()).toBe('2026-10-04T09:00:00.000Z');
  });

  it('lists successive runs and rejects impossible dates', () => {
    const runs = nextRuns('0 */6 * * *', new Date('2026-09-27T00:30:00Z'), 3, 0).map((d) => d.toISOString());
    expect(runs).toEqual(['2026-09-27T06:00:00.000Z', '2026-09-27T12:00:00.000Z', '2026-09-27T18:00:00.000Z']);
    expect(() => nextRunAfter('0 0 31 2 *', new Date('2026-01-01T00:00:00Z'))).toThrow();
  });

  it('decides whether a schedule is due', () => {
    const created = new Date('2026-09-26T00:00:00Z');
    expect(isScheduleDue('0 8 * * *', null, created, new Date('2026-09-26T02:05:00Z'), 360)).toBe(true);
    expect(isScheduleDue('0 8 * * *', new Date('2026-09-26T02:05:00Z'), created, new Date('2026-09-26T10:00:00Z'), 360)).toBe(false);
    expect(isScheduleDue('bad cron', null, created, new Date(), 360)).toBe(false);
  });
});

describe('csv', () => {
  it('escapes and neutralises formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
    expect(sectionsToCsv([{ title: 'T', headers: ['A', 'B'], rows: [[1, 'x']] }])).toBe('T\r\nA,B\r\n1,x');
  });
});

describe('report access', () => {
  it('limits accountants to finance and teachers to attendance/academic', () => {
    expect(allowedReportKeys('ACCOUNTANT')).toEqual(['finance']);
    expect(allowedReportKeys('TEACHER')).toEqual(['attendance', 'academic']);
    expect(allowedReportKeys('ADMIN')).toEqual(['finance', 'attendance', 'academic', 'admissions']);
    expect(canAccessReport('STUDENT', 'finance')).toBe(false);
    expect(canAccessReport('MANAGEMENT', 'admissions')).toBe(false);
  });
});
