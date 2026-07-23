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
 * Replaces the obsolete tests/attendance-sheet.test.ts, which tested
 * `GET /attendance/sheet` (className/sectionName query params) — that
 * endpoint no longer exists. It has been replaced by
 * `GET /attendance/registers/roster?sectionId&date&subject`, which takes a
 * real sectionId, not a name string.
 *
 * Re-verified against the ACTUAL roster-fetching code
 * (attendance.repository.ts#getActiveRoster): it queries
 * `prisma.student.findMany({ where: { institutionId, sectionId, status:
 * 'ACTIVE' } })` — there is no academicYearId (or any date-derived) filter
 * anywhere in that query, so the original "students disappear due to a stale
 * academicYearId" concern from Bug 1 is structurally moot for the new
 * endpoint: it never looks at academicYearId at all. This test re-confirms
 * that by the same technique as the old suite — a student linked to a
 * deliberately stale, non-current AcademicYear still appears on the roster.
 */
describe('GET /attendance/registers/roster — academic-year-mismatch concern (moot for new endpoint)', () => {
  let inst: InstitutionFixture;
  let ctx: Awaited<ReturnType<typeof createSectionWithStudents>>;
  let staleYear: { id: string };

  beforeAll(async () => {
    inst = await createTestInstitution('rosterAY');
    ctx = await createSectionWithStudents(inst.institutionId, 'rosterAY', 1);

    staleYear = await prisma.academicYear.create({
      data: {
        institutionId: inst.institutionId,
        label: '2023-2024',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2024-12-31'),
        isCurrent: false,
      },
    });
    await prisma.student.update({
      where: { id: ctx.students[0].id },
      data: { academicYearId: staleYear.id },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.academicYear.deleteMany({ where: { id: staleYear.id } });
    await cleanupSectionWithStudents(ctx);
    await cleanupInstitution(inst);
    await disconnectFixtures();
  }, 30_000);

  it('returns the student on the roster even though they are linked to a stale, non-current academic year', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];
    const res = await request(app)
      .get('/api/v1/attendance/registers/roster')
      .query({ sectionId: ctx.section.id, date: '2026-07-20' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: any) => s.studentId);
    expect(ids).toContain(ctx.students[0].id);
  });
});
