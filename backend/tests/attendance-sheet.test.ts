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
 * Live Bug 1 (.claude/PROJECT_STATUS.md): "Attendance register shows 'No
 * students found under Class 8 Section A' despite students existing."
 *
 * Triage hypothesis was an academicYearId mismatch — students enrolled under
 * one academic year while the attendance-register query resolves/filters by
 * a different one. Tracing `attendance.repository.ts#getAttendanceSheet`
 * (the function backing `GET /attendance/sheet`, which is what the frontend
 * "Attendance Register" screen actually calls) shows its student query is:
 *
 *   where: { institutionId, class: { name }, section: { name }, status: 'ACTIVE' }
 *
 * There is no `academicYearId` (or any date-derived) filter anywhere in that
 * query — confirmed by reading the function in full, not just guessed. The
 * `Institution` model also has no academic-year field at all (the "2023-2024"
 * the tester saw traces to an unrelated hardcoded frontend default on the
 * Settings page, not a real stored value anything reads). The two demo seed
 * scripts (`prisma/seed.ts`, `prisma/seed_demo_data.ts`) both create the seed
 * AcademicYear with label "2026"/isCurrent:true, not "2023-2024" either.
 *
 * This suite proves the query is academic-year-agnostic by design: a student
 * correctly enrolled (matching classId/sectionId) under a class/section shows
 * up in the register regardless of what AcademicYear they're linked to —
 * including one that is NOT marked `isCurrent` and is deliberately labelled
 * "2023-2024" to mirror the tester's exact scenario. If "No students found"
 * is happening on the live deployment, it is not this code path filtering on
 * academic year; it's a genuine data-configuration gap (no matching
 * class/section/status="ACTIVE" student rows for that institution), not a
 * code bug — see PROJECT_STATUS.md Bug 1 entry for the full writeup.
 */
describe('GET /attendance/sheet — academic-year-mismatch hypothesis (Bug 1)', () => {
  let inst: InstitutionFixture;
  let branchId: string;
  let classRow: { id: string; name: string };
  let sectionRow: { id: string; name: string };
  let staleAcademicYear: { id: string; label: string; isCurrent: boolean };

  beforeAll(async () => {
    inst = await createTestInstitution('attsheet');

    const branch = await prisma.branch.create({
      data: { institutionId: inst.institutionId, name: 'Main Branch' },
    });
    branchId = branch.id;

    classRow = await prisma.class.create({
      data: { branchId: branch.id, name: 'Class 8', level: 8 },
    });
    sectionRow = await prisma.section.create({
      data: { classId: classRow.id, name: 'A' },
    });

    // Deliberately stale/non-current academic year, labelled to mirror the
    // tester's exact "2023-2024" report — and explicitly isCurrent: false,
    // so if the query DID (incorrectly) filter on "current" academic year,
    // this student would wrongly disappear.
    staleAcademicYear = await prisma.academicYear.create({
      data: {
        institutionId: inst.institutionId,
        label: '2023-2024',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2024-12-31'),
        isCurrent: false,
      },
    });

    // Re-point the fixture's pre-made STUDENT-role student at Class 8 / Section A,
    // linked to the stale, non-current academic year.
    await prisma.student.update({
      where: { id: inst.studentId },
      data: {
        classId: classRow.id,
        sectionId: sectionRow.id,
        academicYearId: staleAcademicYear.id,
        rollNumber: '101',
        status: 'ACTIVE',
      },
    });
  }, 30_000);

  afterAll(async () => {
    // cleanupInstitution() doesn't know about Branch/Class/Section/AcademicYear
    // (not part of the base fixture) — remove them first so the institution
    // FK-delete inside cleanupInstitution() doesn't fail/leak.
    await prisma.section.deleteMany({ where: { classId: classRow.id } });
    await prisma.class.deleteMany({ where: { id: classRow.id } });
    await prisma.academicYear.deleteMany({ where: { institutionId: inst.institutionId } });
    await prisma.student.updateMany({
      where: { id: inst.studentId },
      data: { classId: null, sectionId: null, academicYearId: null, branchId: null },
    });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await cleanupInstitution(inst);
    await disconnectFixtures();
  }, 30_000);

  it('returns the student under Class 8 / Section A even though they are linked to a stale, non-current academic year', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];

    const res = await request(app)
      .get('/api/v1/attendance/sheet')
      .query({ className: 'Class 8', sectionName: 'A', date: '2026-07-21' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toContain(inst.studentId);
  });

  it('still returns the student even if the institution has an academic year marked isCurrent for a completely different period (2026)', async () => {
    // Simulate the institution also having a genuinely "current" academic
    // year on file (as real seed data does) — the query still must not care.
    const currentYear = await prisma.academicYear.create({
      data: {
        institutionId: inst.institutionId,
        label: '2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        isCurrent: true,
      },
    });

    const { token } = inst.usersByRole[UserRole.ADMIN];
    const res = await request(app)
      .get('/api/v1/attendance/sheet')
      .query({ className: 'Class 8', sectionName: 'A', date: '2026-07-21' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toContain(inst.studentId);

    await prisma.academicYear.delete({ where: { id: currentYear.id } });
  });

  it('correctly returns nothing for a class/section that genuinely has no matching students (proves it is not a false-positive query)', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];

    const res = await request(app)
      .get('/api/v1/attendance/sheet')
      .query({ className: 'Class 8', sectionName: 'B', date: '2026-07-21' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
