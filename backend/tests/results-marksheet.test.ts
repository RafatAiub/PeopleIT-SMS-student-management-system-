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
 * Live Bug 2 (.claude/PROJECT_STATUS.md): "Results page needs a real
 * marksheet table" — STAFF-facing GET /results/marksheet, one row per
 * student x subject for a given exam+class(+section), plus a
 * highestMarkInSubject aggregate computed across ALL students in that
 * class/section/exam (not just the row's own student).
 *
 * Distinct from the STUDENT/GUARDIAN self-service GET /results/me built
 * earlier — this suite only exercises the new staff marksheet endpoint.
 */
describe('GET /results/marksheet — staff class/section marksheet (Bug 2)', () => {
  let inst: InstitutionFixture;
  let branchId: string;
  let classRow: { id: string };
  let sectionA: { id: string };
  let sectionB: { id: string };
  let examId: string;
  let emptyExamId: string;
  let studentAlphaId: string;
  let studentBetaId: string;
  let studentGammaId: string; // Section B — must never leak into Section A's marksheet

  let otherInst: InstitutionFixture;

  beforeAll(async () => {
    inst = await createTestInstitution('marksheet');
    otherInst = await createTestInstitution('marksheet-other');

    const branch = await prisma.branch.create({
      data: { institutionId: inst.institutionId, name: 'Main Branch' },
    });
    branchId = branch.id;

    classRow = await prisma.class.create({
      data: { branchId: branch.id, name: 'Class 9', level: 9 },
    });
    sectionA = await prisma.section.create({ data: { classId: classRow.id, name: 'A' } });
    sectionB = await prisma.section.create({ data: { classId: classRow.id, name: 'B' } });

    const studentAlpha = await prisma.student.create({
      data: {
        institutionId: inst.institutionId,
        classId: classRow.id,
        sectionId: sectionA.id,
        studentId: 'STU-ALPHA',
        rollNumber: '1',
        firstName: 'Alpha',
        lastName: 'Student',
      },
    });
    studentAlphaId = studentAlpha.id;

    const studentBeta = await prisma.student.create({
      data: {
        institutionId: inst.institutionId,
        classId: classRow.id,
        sectionId: sectionA.id,
        studentId: 'STU-BETA',
        rollNumber: '2',
        firstName: 'Beta',
        lastName: 'Student',
      },
    });
    studentBetaId = studentBeta.id;

    // Different section — should never contribute to Section A's
    // highestMarkInSubject or appear in Section A's rows.
    const studentGamma = await prisma.student.create({
      data: {
        institutionId: inst.institutionId,
        classId: classRow.id,
        sectionId: sectionB.id,
        studentId: 'STU-GAMMA',
        rollNumber: '1',
        firstName: 'Gamma',
        lastName: 'Student',
      },
    });
    studentGammaId = studentGamma.id;

    const exam = await prisma.exam.create({
      data: {
        institutionId: inst.institutionId,
        name: 'Marksheet Test Exam',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-05'),
        isActive: true,
      },
    });
    examId = exam.id;

    // A second exam with zero submitted results — proves the empty case is
    // handled gracefully (200 + empty rows), not an error.
    const emptyExam = await prisma.exam.create({
      data: {
        institutionId: inst.institutionId,
        name: 'No Results Yet Exam',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        isActive: true,
      },
    });
    emptyExamId = emptyExam.id;

    await prisma.examResult.createMany({
      data: [
        // Section A — Math: Alpha 80, Beta 95 (highest)
        {
          institutionId: inst.institutionId,
          examId,
          studentId: studentAlphaId,
          subject: 'Math',
          marksObtained: 80,
          maxMarks: 100,
          grade: 'B',
        },
        {
          institutionId: inst.institutionId,
          examId,
          studentId: studentBetaId,
          subject: 'Math',
          marksObtained: 95,
          maxMarks: 100,
          grade: 'A+',
        },
        // Section A — Science: Alpha 70 (highest), Beta 60
        {
          institutionId: inst.institutionId,
          examId,
          studentId: studentAlphaId,
          subject: 'Science',
          marksObtained: 70,
          maxMarks: 100,
          grade: 'B-',
        },
        {
          institutionId: inst.institutionId,
          examId,
          studentId: studentBetaId,
          subject: 'Science',
          marksObtained: 60,
          maxMarks: 100,
          grade: 'C',
        },
        // Section B — Math: Gamma 100. Must NOT leak into Section A's
        // highestMarkInSubject (which should stay 95, not 100).
        {
          institutionId: inst.institutionId,
          examId,
          studentId: studentGammaId,
          subject: 'Math',
          marksObtained: 100,
          maxMarks: 100,
          grade: 'A+',
        },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.examResult.deleteMany({ where: { institutionId: inst.institutionId } });
    await prisma.exam.deleteMany({ where: { institutionId: inst.institutionId } });
    await prisma.student.deleteMany({
      where: { id: { in: [studentAlphaId, studentBetaId, studentGammaId] } },
    });
    await prisma.section.deleteMany({ where: { classId: classRow.id } });
    await prisma.class.deleteMany({ where: { id: classRow.id } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await cleanupInstitution(inst);
    await cleanupInstitution(otherInst);
    await disconnectFixtures();
  }, 30_000);

  it('returns one row per student x subject with a correct highestMarkInSubject computed across the whole section (not just one student)', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];

    const res = await request(app)
      .get('/api/v1/results/marksheet')
      .query({ examId, classId: classRow.id, sectionId: sectionA.id })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rows).toHaveLength(4); // 2 students x 2 subjects

    const mathRows = res.body.data.rows.filter((r: any) => r.subject === 'Math');
    expect(mathRows).toHaveLength(2);
    for (const row of mathRows) {
      expect(row.highestMarkInSubject).toBe(95); // Beta's 95, not Gamma's 100 from Section B
    }

    const betaMath = mathRows.find((r: any) => r.studentId === studentBetaId);
    expect(betaMath.marksObtained).toBe(95);
    expect(betaMath.maxMarks).toBe(100);
    expect(betaMath.grade).toBe('A+');

    const scienceRows = res.body.data.rows.filter((r: any) => r.subject === 'Science');
    expect(scienceRows).toHaveLength(2);
    for (const row of scienceRows) {
      expect(row.highestMarkInSubject).toBe(70); // Alpha's 70
    }

    // Gamma (Section B) must not appear anywhere in Section A's marksheet.
    const studentIds = res.body.data.rows.map((r: any) => r.studentId);
    expect(studentIds).not.toContain(studentGammaId);
  });

  it("does not leak Section B's marks into Section B's own highestMarkInSubject being affected by Section A (proves the aggregate is section-scoped, not class-wide)", async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];

    const res = await request(app)
      .get('/api/v1/results/marksheet')
      .query({ examId, classId: classRow.id, sectionId: sectionB.id })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0].studentId).toBe(studentGammaId);
    expect(res.body.data.rows[0].highestMarkInSubject).toBe(100);
  });

  it('returns an empty rows array (not an error) when the exam exists but no results have been submitted yet', async () => {
    const { token } = inst.usersByRole[UserRole.TEACHER];

    const res = await request(app)
      .get('/api/v1/results/marksheet')
      .query({ examId: emptyExamId, classId: classRow.id, sectionId: sectionA.id })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rows).toEqual([]);
  });

  it('rejects STUDENT/GUARDIAN roles (staff-only endpoint)', async () => {
    const studentToken = inst.usersByRole[UserRole.STUDENT].token;
    const guardianToken = inst.usersByRole[UserRole.GUARDIAN].token;

    for (const token of [studentToken, guardianToken]) {
      const res = await request(app)
        .get('/api/v1/results/marksheet')
        .query({ examId, classId: classRow.id, sectionId: sectionA.id })
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('does not allow a different tenant to read this marksheet (cross-tenant isolation)', async () => {
    const otherAdminToken = otherInst.usersByRole[UserRole.ADMIN].token;

    const res = await request(app)
      .get('/api/v1/results/marksheet')
      .query({ examId, classId: classRow.id, sectionId: sectionA.id })
      .set('Authorization', `Bearer ${otherAdminToken}`);

    // examId is scoped to `inst`, so from `otherInst`'s tenant context it
    // simply doesn't exist — same not-found handling as every other
    // exam-scoped route in this module (getExam/updateExam/etc).
    expect(res.status).toBe(404);
  });
});
