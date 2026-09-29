import request from 'supertest';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../src/app';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  prisma,
  InstitutionFixture,
} from './helpers/fixtures';

/**
 * Three new Students-module endpoints added alongside the Students-page
 * restructure: PATCH /students/roll-numbers, POST /students/:id/reset-password,
 * POST /students/bulk-assign-class. Nothing here existed before this feature.
 */
describe('Students Phase 2 endpoints', () => {
  let inst: InstitutionFixture;
  let otherInst: InstitutionFixture;
  let adminToken: string;
  let branchId: string;
  let classA: { id: string };
  let classB: { id: string };
  let sectionA: { id: string };
  let sectionB: { id: string };

  beforeAll(async () => {
    inst = await createTestInstitution('students-phase2');
    otherInst = await createTestInstitution('students-phase2-other');
    adminToken = inst.usersByRole[UserRole.ADMIN].token;

    const branch = await prisma.branch.create({ data: { institutionId: inst.institutionId, name: 'Main Branch' } });
    branchId = branch.id;
    classA = await prisma.class.create({ data: { branchId, name: 'P2 Class A', level: 1 } });
    classB = await prisma.class.create({ data: { branchId, name: 'P2 Class B', level: 2 } });
    sectionA = await prisma.section.create({ data: { classId: classA.id, name: 'A' } });
    sectionB = await prisma.section.create({ data: { classId: classB.id, name: 'A' } });
  });

  afterAll(async () => {
    await prisma.section.deleteMany({ where: { id: { in: [sectionA.id, sectionB.id] } } });
    await prisma.class.deleteMany({ where: { id: { in: [classA.id, classB.id] } } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await cleanupInstitution(inst);
    await cleanupInstitution(otherInst);
    await disconnectFixtures();
  });

  describe('PATCH /students/roll-numbers', () => {
    let studentOne: { id: string };
    let studentTwo: { id: string };

    beforeAll(async () => {
      studentOne = await prisma.student.create({
        data: { institutionId: inst.institutionId, branchId, classId: classA.id, sectionId: sectionA.id, studentId: `RN-1-${Date.now()}`, firstName: 'Roll', lastName: 'One' },
      });
      studentTwo = await prisma.student.create({
        data: { institutionId: inst.institutionId, branchId, classId: classA.id, sectionId: sectionA.id, studentId: `RN-2-${Date.now()}`, firstName: 'Roll', lastName: 'Two' },
      });
    });

    afterAll(async () => {
      await prisma.student.deleteMany({ where: { id: { in: [studentOne.id, studentTwo.id] } } });
    });

    it('bulk-updates roll numbers for students in the section', async () => {
      const res = await request(app)
        .patch('/api/v1/students/roll-numbers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sectionId: sectionA.id,
          assignments: [
            { studentId: studentOne.id, rollNumber: '1' },
            { studentId: studentTwo.id, rollNumber: '2' },
          ],
        });
      expect(res.status).toBe(200);

      const updated1 = await prisma.student.findUnique({ where: { id: studentOne.id } });
      const updated2 = await prisma.student.findUnique({ where: { id: studentTwo.id } });
      expect(updated1?.rollNumber).toBe('1');
      expect(updated2?.rollNumber).toBe('2');
    });

    it('rejects a studentId that does not belong to the given section', async () => {
      const outsider = await prisma.student.create({
        data: { institutionId: inst.institutionId, branchId, classId: classB.id, sectionId: sectionB.id, studentId: `RN-OUT-${Date.now()}`, firstName: 'Out', lastName: 'Sider' },
      });
      const res = await request(app)
        .patch('/api/v1/students/roll-numbers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sectionId: sectionA.id, assignments: [{ studentId: outsider.id, rollNumber: '99' }] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      const stillUnset = await prisma.student.findUnique({ where: { id: outsider.id } });
      expect(stillUnset?.rollNumber).toBeNull();
      await prisma.student.delete({ where: { id: outsider.id } });
    });

    it('rejects a request with no matching sectionId in this institution', async () => {
      const res = await request(app)
        .patch('/api/v1/students/roll-numbers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sectionId: 'not-a-real-section-id', assignments: [{ studentId: studentOne.id, rollNumber: '1' }] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('POST /students/:id/reset-password', () => {
    it("resets the linked user's password and returns it once, plaintext", async () => {
      const res = await request(app)
        .post(`/api/v1/students/${inst.studentId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(typeof res.body.data.password).toBe('string');
      expect(res.body.data.password.length).toBeGreaterThanOrEqual(8);

      // Confirm the returned plaintext actually matches the stored hash
      // (rather than round-tripping a full /auth/login call here).
      const user = await prisma.user.findUnique({ where: { id: inst.studentUserId } });
      const matches = await bcrypt.compare(res.body.data.password, user!.passwordHash);
      expect(matches).toBe(true);
    });

    it('accepts an explicit password instead of generating one', async () => {
      const res = await request(app)
        .post(`/api/v1/students/${inst.studentId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'MyChosenPass1' });
      expect(res.status).toBe(200);
      expect(res.body.data.password).toBe('MyChosenPass1');
    });

    it('404s for a student with no linked login account', async () => {
      const noLoginStudent = await prisma.student.create({
        data: { institutionId: inst.institutionId, branchId, studentId: `NOLOGIN-${Date.now()}`, firstName: 'No', lastName: 'Login' },
      });
      const res = await request(app)
        .post(`/api/v1/students/${noLoginStudent.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(404);
      await prisma.student.delete({ where: { id: noLoginStudent.id } });
    });

    it('404s for a student belonging to another institution', async () => {
      const res = await request(app)
        .post(`/api/v1/students/${otherInst.studentId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('never writes the plaintext password into the audit log', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { institutionId: inst.institutionId, resource: 'students', action: 'UPDATE' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const serialized = JSON.stringify(logs.map((l) => l.metadata));
      expect(serialized).not.toContain('MyChosenPass1');
    });
  });

  describe('POST /students/bulk-assign-class', () => {
    let studentA: { id: string };
    let studentB: { id: string };

    beforeAll(async () => {
      studentA = await prisma.student.create({
        data: { institutionId: inst.institutionId, branchId, classId: classA.id, sectionId: sectionA.id, studentId: `BAC-1-${Date.now()}`, firstName: 'Bulk', lastName: 'A' },
      });
      studentB = await prisma.student.create({
        data: { institutionId: inst.institutionId, branchId, classId: classA.id, sectionId: sectionA.id, studentId: `BAC-2-${Date.now()}`, firstName: 'Bulk', lastName: 'B' },
      });
    });

    afterAll(async () => {
      await prisma.student.deleteMany({ where: { id: { in: [studentA.id, studentB.id] } } });
    });

    it('moves multiple students to a new class/section', async () => {
      const res = await request(app)
        .post('/api/v1/students/bulk-assign-class')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentIds: [studentA.id, studentB.id], classId: classB.id, sectionId: sectionB.id });
      expect(res.status).toBe(200);

      const a = await prisma.student.findUnique({ where: { id: studentA.id } });
      const b = await prisma.student.findUnique({ where: { id: studentB.id } });
      expect(a?.classId).toBe(classB.id);
      expect(a?.sectionId).toBe(sectionB.id);
      expect(b?.classId).toBe(classB.id);
      expect(b?.sectionId).toBe(sectionB.id);
    });

    it('rejects a classId belonging to another institution', async () => {
      const otherBranch = await prisma.branch.create({ data: { institutionId: otherInst.institutionId, name: 'Other Branch' } });
      const otherClass = await prisma.class.create({ data: { branchId: otherBranch.id, name: 'Other Class', level: 1 } });

      const res = await request(app)
        .post('/api/v1/students/bulk-assign-class')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentIds: [studentA.id], classId: otherClass.id });
      expect(res.status).toBe(404);

      await prisma.class.delete({ where: { id: otherClass.id } });
      await prisma.branch.delete({ where: { id: otherBranch.id } });
    });

    it('rejects a studentId belonging to another institution', async () => {
      const res = await request(app)
        .post('/api/v1/students/bulk-assign-class')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentIds: [otherInst.studentId], classId: classA.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      const untouched = await prisma.student.findUnique({ where: { id: otherInst.studentId } });
      expect(untouched?.classId).not.toBe(classA.id);
    });
  });
});
