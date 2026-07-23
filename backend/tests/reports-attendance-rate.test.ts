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
import { createSectionWithStudents, cleanupSectionWithStudents, dateOnlyUTC } from './helpers/attendanceFixtures';

/**
 * Regression test for reportsRepository.getDashboardStats' attendance-rate
 * calculation, updated for the new register-lifecycle model
 * (AttendanceRegister + AttendanceRecord, `mark` enum) after the old
 * free-string `Attendance` model was removed entirely.
 *
 * Per src/modules/reports/reports.repository.ts:
 *   totalAttendance   = count of records with mark in [PRESENT, LATE, ABSENT_UNEXCUSED]
 *   presentAttendance = count of records with mark in [PRESENT, LATE]
 *   attendanceRate    = round(presentAttendance / totalAttendance * 100, 2)
 * ABSENT_EXCUSED / LEAVE / NOT_REQUIRED are excluded from both counts.
 */
describe('GET /reports/dashboard — attendanceRate (new AttendanceRegister/AttendanceRecord model)', () => {
  let inst: InstitutionFixture;
  let ctx: Awaited<ReturnType<typeof createSectionWithStudents>>;

  beforeAll(async () => {
    inst = await createTestInstitution('attrate');
    ctx = await createSectionWithStudents(inst.institutionId, 'attrate', 2);

    // One register per date, one record per student per register. Mix of
    // marks: 3 PRESENT, 1 LATE, 1 ABSENT_UNEXCUSED (all counted), plus 1
    // ABSENT_EXCUSED and 1 NOT_REQUIRED (excluded from both numerator and
    // denominator) to prove those don't leak into the rate.
    const rows: Array<{ studentIdx: number; date: string; mark: string }> = [
      { studentIdx: 0, date: '2021-01-05', mark: 'PRESENT' },
      { studentIdx: 0, date: '2022-03-11', mark: 'PRESENT' },
      { studentIdx: 0, date: '2023-06-20', mark: 'ABSENT_UNEXCUSED' },
      { studentIdx: 1, date: '2021-11-15', mark: 'PRESENT' },
      { studentIdx: 1, date: '2022-12-01', mark: 'LATE' },
      { studentIdx: 1, date: '2023-02-14', mark: 'ABSENT_EXCUSED' },
      { studentIdx: 1, date: '2020-05-01', mark: 'NOT_REQUIRED' },
    ];

    for (const row of rows) {
      const date = dateOnlyUTC(row.date);
      const register = await prisma.attendanceRegister.create({
        data: {
          institutionId: inst.institutionId,
          sectionId: ctx.section.id,
          date,
          subject: '__DAILY__',
          status: 'SUBMITTED',
        },
      });
      await prisma.attendanceRecord.create({
        data: {
          institutionId: inst.institutionId,
          registerId: register.id,
          studentId: ctx.students[row.studentIdx].id,
          mark: row.mark as any,
          entrySource: 'TEACHER_WEB',
          recordedByUserId: inst.usersByRole[UserRole.TEACHER].userId,
        },
      });
    }
  }, 60_000);

  afterAll(async () => {
    await cleanupSectionWithStudents(ctx);
    await cleanupInstitution(inst);
    await disconnectFixtures();
  }, 120_000);

  it('computes the correct DB-side attendance rate, excluding ABSENT_EXCUSED/LEAVE/NOT_REQUIRED from both counts', async () => {
    const totalAttendance = await prisma.attendanceRecord.count({
      where: { institutionId: inst.institutionId, mark: { in: ['PRESENT', 'LATE', 'ABSENT_UNEXCUSED'] } },
    });
    const presentAttendance = await prisma.attendanceRecord.count({
      where: { institutionId: inst.institutionId, mark: { in: ['PRESENT', 'LATE'] } },
    });

    // Sanity on the fixture: 5 counted (3 PRESENT + 1 LATE + 1 ABSENT_UNEXCUSED), 4 present-equivalent.
    expect(totalAttendance).toBe(5);
    expect(presentAttendance).toBe(4);

    const expectedRate = Math.round((presentAttendance / totalAttendance) * 100 * 100) / 100;

    const { token } = inst.usersByRole[UserRole.ADMIN];
    const res = await request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.attendanceRate).toBe(expectedRate);
  });

  it('returns 0 (not NaN/500) when an institution has zero attendance records', async () => {
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
