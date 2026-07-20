import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../src/app';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  prisma,
  InstitutionFixture,
} from './helpers/fixtures';

/**
 * Regression test for the reports.repository.ts attendance-rate perf fix:
 * the unbounded `findMany` + in-memory reduce was replaced with two
 * `prisma.attendance.count()` calls. This asserts the DB-side aggregate
 * produces the exact same mathematically-correct rate a naive
 * present/total count over ALL attendance rows (no date bound) would —
 * i.e. the refactor is behavior-identical, not just "doesn't crash".
 *
 * Records are deliberately spread across several years (including dates
 * far in the past) to prove the "all-time, no date bound" semantics were
 * preserved — a regression that added a date filter would silently drop
 * the old rows and produce a different rate here.
 */
describe('GET /reports/dashboard — attendanceRate', () => {
  let inst: InstitutionFixture;
  let otherStudentId: string;

  beforeAll(async () => {
    inst = await createTestInstitution('attrate');

    const otherStudent = await prisma.student.create({
      data: {
        institutionId: inst.institutionId,
        studentId: `STU-ATTRATE-OTHER-${inst.slug}`,
        firstName: 'Other',
        lastName: 'Student',
      },
    });
    otherStudentId = otherStudent.id;

    // Known dataset: 5 PRESENT, 1 ABSENT, 1 LATE, 1 HALF_DAY across the two
    // students in this institution, spread across several years. Only
    // "PRESENT" counts toward the numerator; every row (regardless of
    // status) counts toward the denominator — matching the original
    // findMany + filter logic.
    const rows: Array<{ studentId: string; date: Date; status: string }> = [
      { studentId: inst.studentId, date: new Date('2021-01-05'), status: 'PRESENT' },
      { studentId: inst.studentId, date: new Date('2022-03-11'), status: 'PRESENT' },
      { studentId: inst.studentId, date: new Date('2023-06-20'), status: 'ABSENT' },
      { studentId: inst.studentId, date: new Date('2024-09-02'), status: 'PRESENT' },
      { studentId: otherStudentId, date: new Date('2021-11-15'), status: 'PRESENT' },
      { studentId: otherStudentId, date: new Date('2022-12-01'), status: 'LATE' },
      { studentId: otherStudentId, date: new Date('2023-02-14'), status: 'HALF_DAY' },
      { studentId: otherStudentId, date: new Date(), status: 'PRESENT' },
    ];

    for (const row of rows) {
      await prisma.attendance.create({
        data: {
          institutionId: inst.institutionId,
          studentId: row.studentId,
          date: row.date,
          status: row.status,
        },
      });
    }
  }, 60_000);

  afterAll(async () => {
    await prisma.attendance.deleteMany({ where: { institutionId: inst.institutionId } });
    await prisma.student.deleteMany({ where: { id: otherStudentId } });
    await cleanupInstitution(inst);
    await disconnectFixtures();
  }, 120_000);

  it('computes the correct all-time present/total rate via DB-side counts, not an in-memory reduce', async () => {
    // Independently re-derive the expected rate straight from the DB with a
    // naive approach equivalent to the OLD findMany-based logic, so this
    // test doesn't just hardcode a number that could silently drift from
    // the seeded data above.
    const all = await prisma.attendance.findMany({ where: { institutionId: inst.institutionId } });
    const expectedPresent = all.filter((a) => a.status === 'PRESENT').length;
    const expectedRate = Math.round((expectedPresent / all.length) * 100 * 100) / 100;

    // Sanity on the fixture itself: 5 PRESENT out of 8 total rows.
    expect(all.length).toBe(8);
    expect(expectedPresent).toBe(5);

    const { token } = inst.usersByRole[UserRole.ADMIN];
    const res = await request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.attendanceRate).toBe(expectedRate);
  });

  it('returns 0 (not NaN/500) when an institution has zero attendance rows', async () => {
    const empty = await createTestInstitution('attrate-empty');
    try {
      const { token } = empty.usersByRole[UserRole.ADMIN];
      const res = await request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.attendanceRate).toBe(0);
    } finally {
      await cleanupInstitution(empty);
    }
  }, 60_000);
});
