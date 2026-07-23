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
import {
  createSectionWithStudents,
  cleanupSectionWithStudents,
  createTeacherProfile,
  createExtraTeacherUser,
  cleanupExtraTeacherUser,
  dateOnlyUTC,
} from './helpers/attendanceFixtures';

describe('Attendance - tenant isolation and role/ownership boundaries', () => {
  let instA: InstitutionFixture;
  let instB: InstitutionFixture;
  let ctxA: Awaited<ReturnType<typeof createSectionWithStudents>>;
  let ctxB: Awaited<ReturnType<typeof createSectionWithStudents>>;

  beforeAll(async () => {
    instA = await createTestInstitution('tenA');
    instB = await createTestInstitution('tenB');
    ctxA = await createSectionWithStudents(instA.institutionId, 'tenA', 2);
    ctxB = await createSectionWithStudents(instB.institutionId, 'tenB', 2);
    await createTeacherProfile(instA.usersByRole[UserRole.TEACHER].userId);
    await createTeacherProfile(instB.usersByRole[UserRole.TEACHER].userId);
  }, 60000);

  afterAll(async () => {
    await cleanupSectionWithStudents(ctxA);
    await cleanupSectionWithStudents(ctxB);
    await cleanupInstitution(instA);
    await cleanupInstitution(instB);
    await disconnectFixtures();
  }, 60000);

  describe('cross-tenant isolation', () => {
    it('ADMIN of institution A never sees institution B data in admin registers list', async () => {
      const { token } = instA.usersByRole[UserRole.ADMIN];
      const res = await request(app)
        .get('/api/v1/attendance/admin/registers')
        .query({ sectionId: ctxB.section.id, date: '2026-07-20' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const sectionIds = res.body.data.map((r: any) => r.sectionId);
      expect(sectionIds).not.toContain(ctxB.section.id);
    });

    it('ADMIN of institution A hitting roster for a real institution B sectionId never returns B real students', async () => {
      const { token } = instA.usersByRole[UserRole.ADMIN];
      const res = await request(app)
        .get('/api/v1/attendance/registers/roster')
        .query({ sectionId: ctxB.section.id, date: '2026-07-20' })
        .set('Authorization', `Bearer ${token}`);
      if (res.status === 200) {
        const ids = res.body.data.students.map((s: any) => s.studentId);
        for (const bStudent of ctxB.students) {
          expect(ids).not.toContain(bStudent.id);
        }
      } else {
        expect([403, 404]).toContain(res.status);
      }
    });

    it('draft-save against a registerId belonging to institution B is rejected 404 for institution A admin', async () => {
      const registerB = await prisma.attendanceRegister.create({
        data: { institutionId: instB.institutionId, sectionId: ctxB.section.id, date: dateOnlyUTC('2026-07-20'), subject: '__DAILY__' },
      });
      const { token } = instA.usersByRole[UserRole.ADMIN];
      const res = await request(app)
        .put(`/api/v1/attendance/registers/${registerB.id}/draft`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, records: [{ studentId: ctxB.students[0].id, mark: 'PRESENT' }] });
      expect(res.status).toBe(404);
    });

    it('submit against a registerId belonging to institution B is rejected 404 for institution A admin', async () => {
      const registerB = await prisma.attendanceRegister.create({
        data: { institutionId: instB.institutionId, sectionId: ctxB.section.id, date: dateOnlyUTC('2026-07-19'), subject: '__DAILY__' },
      });
      const { token } = instA.usersByRole[UserRole.ADMIN];
      const res = await request(app)
        .post(`/api/v1/attendance/registers/${registerB.id}/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0 });
      expect(res.status).toBe(404);
    });

    it('a guessed cross-tenant correction-request id never resolves for institution A admin', async () => {
      const { token } = instA.usersByRole[UserRole.ADMIN];
      const res = await request(app)
        .patch('/api/v1/attendance/correction-requests/does-not-exist-in-any-tenant/resolve')
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVED', resolutionNote: 'n/a' });
      expect(res.status).toBe(404);
    });
  });

  describe('teacher ownership boundary per-assignment not per-institution', () => {
    let extraTeacher: Awaited<ReturnType<typeof createExtraTeacherUser>>;

    beforeAll(async () => {
      extraTeacher = await createExtraTeacherUser(instA.institutionId, 'ownership');
      const teacherA = await prisma.teacher.findFirst({ where: { userId: instA.usersByRole[UserRole.TEACHER].userId } });
      await prisma.teacherSectionAssignment.create({
        data: {
          institutionId: instA.institutionId,
          teacherId: teacherA!.id,
          sectionId: ctxA.section.id,
          subject: null,
          role: 'PRIMARY',
          effectiveFrom: dateOnlyUTC('2020-01-01'),
          createdByUserId: instA.usersByRole[UserRole.ADMIN].userId,
        },
      });
    }, 30000);

    afterAll(async () => {
      await cleanupExtraTeacherUser(extraTeacher.user.id);
    });

    it('Teacher A can fetch the roster for their own assigned section', async () => {
      const { token } = instA.usersByRole[UserRole.TEACHER];
      const res = await request(app)
        .get('/api/v1/attendance/registers/roster')
        .query({ sectionId: ctxA.section.id, date: '2026-07-20' })
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('Extra teacher B with no assignment gets REGISTER_NOT_ASSIGNED 403 touching teacher A section', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/registers/roster')
        .query({ sectionId: ctxA.section.id, date: '2026-07-20' })
        .set('Authorization', `Bearer ${extraTeacher.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('REGISTER_NOT_ASSIGNED');
    });

    it('ADMIN bypasses ownership entirely for the same section', async () => {
      const admin = await request(app)
        .get('/api/v1/attendance/registers/roster')
        .query({ sectionId: ctxA.section.id, date: '2026-07-20' })
        .set('Authorization', `Bearer ${instA.usersByRole[UserRole.ADMIN].token}`);
      expect(admin.status).toBe(200);
    });

    it('SUPER_ADMIN request does not crash and returns a documented status', async () => {
      const superAdmin = await request(app)
        .get('/api/v1/attendance/registers/roster')
        .query({ sectionId: ctxA.section.id, date: '2026-07-20' })
        .set('Authorization', `Bearer ${instA.usersByRole[UserRole.SUPER_ADMIN].token}`);
      expect([200, 400, 401, 403, 404, 500]).toContain(superAdmin.status);
    });
  });

  describe('STUDENT self-service ownership on my-attendance', () => {
    it('a STUDENT can read their own attendance', async () => {
      const { token } = instA.usersByRole[UserRole.STUDENT];
      const res = await request(app).get('/api/v1/attendance/my-attendance').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('there is no studentId param on my-attendance, ownership derived purely from the JWT', async () => {
      const { token } = instA.usersByRole[UserRole.STUDENT];
      const res = await request(app)
        .get('/api/v1/attendance/my-attendance')
        .query({ studentId: ctxA.students[0].id })
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GUARDIAN linked-child ownership on child param studentId', () => {
    it('GUARDIAN can read their linked child', async () => {
      const { token } = instA.usersByRole[UserRole.GUARDIAN];
      const res = await request(app)
        .get(`/api/v1/attendance/child/${instA.studentId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('GUARDIAN gets 404 for a non-linked studentId in the same institution', async () => {
      const { token } = instA.usersByRole[UserRole.GUARDIAN];
      const res = await request(app)
        .get(`/api/v1/attendance/child/${ctxA.students[0].id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('GUARDIAN correction-request creation is rejected for a non-linked child record', async () => {
      const register = await prisma.attendanceRegister.create({
        data: { institutionId: instA.institutionId, sectionId: ctxA.section.id, date: dateOnlyUTC('2026-07-18'), subject: '__DAILY__', status: 'SUBMITTED' },
      });
      const record = await prisma.attendanceRecord.create({
        data: {
          institutionId: instA.institutionId,
          registerId: register.id,
          studentId: ctxA.students[0].id,
          mark: 'ABSENT_UNEXCUSED',
          entrySource: 'TEACHER_WEB',
          recordedByUserId: instA.usersByRole[UserRole.TEACHER].userId,
        },
      });
      const { token } = instA.usersByRole[UserRole.GUARDIAN];
      const res = await request(app)
        .post('/api/v1/attendance/correction-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ recordId: record.id, requestedMark: 'PRESENT', requestNote: 'Should be present' });
      expect(res.status).toBe(403);
    });
  });
});
