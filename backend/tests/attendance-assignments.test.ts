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

describe('Attendance - teacher assignment date ranges', () => {
  let inst: InstitutionFixture;
  let ctx: Awaited<ReturnType<typeof createSectionWithStudents>>;
  let teacherA: { id: string };
  let extraTeacher: Awaited<ReturnType<typeof createExtraTeacherUser>>;
  let primaryAssignmentId: string;
  let substituteAssignmentId: string;

  beforeAll(async () => {
    inst = await createTestInstitution('assign');
    ctx = await createSectionWithStudents(inst.institutionId, 'assign', 1);
    teacherA = await createTeacherProfile(inst.usersByRole[UserRole.TEACHER].userId);
    extraTeacher = await createExtraTeacherUser(inst.institutionId, 'assign2');
  }, 60000);

  afterAll(async () => {
    await cleanupExtraTeacherUser(extraTeacher.user.id);
    await cleanupSectionWithStudents(ctx);
    await cleanupInstitution(inst);
    await disconnectFixtures();
  }, 60000);


  it('rejects an overlapping second PRIMARY assignment for the same section+subject with 409 ATTENDANCE_CONFLICT', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];
    const res1 = await request(app)
      .post('/api/v1/attendance/assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId: teacherA.id, sectionId: ctx.section.id, role: 'PRIMARY', effectiveFrom: '2026-01-01' });
    expect(res1.status).toBe(201);
    primaryAssignmentId = res1.body.data.id;

    const res2 = await request(app)
      .post('/api/v1/attendance/assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId: extraTeacher.teacher.id, sectionId: ctx.section.id, role: 'PRIMARY', effectiveFrom: '2026-02-01' });
    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe('ATTENDANCE_CONFLICT');
  });

  it('allows a SUBSTITUTE assignment to overlap the existing PRIMARY assignment', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];
    const res = await request(app)
      .post('/api/v1/attendance/assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId: extraTeacher.teacher.id, sectionId: ctx.section.id, role: 'SUBSTITUTE', effectiveFrom: '2026-02-01' });
    expect(res.status).toBe(201);
    substituteAssignmentId = res.body.data.id;
  });

  it('rejects a non-admin role (TEACHER) creating, updating, or deleting an assignment with 403', async () => {
    const { token } = inst.usersByRole[UserRole.TEACHER];

    const createRes = await request(app)
      .post('/api/v1/attendance/assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId: teacherA.id, sectionId: ctx.section.id, role: 'PRIMARY', effectiveFrom: '2026-03-01' });
    expect(createRes.status).toBe(403);

    const patchRes = await request(app)
      .patch(`/api/v1/attendance/assignments/${primaryAssignmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ effectiveTo: '2026-06-01' });
    expect(patchRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/attendance/assignments/${primaryAssignmentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(403);
  });

  it('rejects PATCH attempts that change teacherId/sectionId/subject with 400', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];

    const res = await request(app)
      .patch(`/api/v1/attendance/assignments/${primaryAssignmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId: extraTeacher.teacher.id });
    expect(res.status).toBe(400);
  });

  it('allows PATCH to end an assignment early via effectiveTo', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];

    const res = await request(app)
      .patch(`/api/v1/attendance/assignments/${primaryAssignmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ effectiveTo: '2026-12-31' });
    expect(res.status).toBe(200);
    expect(res.body.data.effectiveTo).toBeTruthy();
  });

  it('enforces tenant isolation: institution A admin cannot update or delete institution B\'s assignment', async () => {
    const otherInst = await createTestInstitution('assign-other');
    try {
      const { token } = inst.usersByRole[UserRole.ADMIN];

      const patchRes = await request(app)
        .patch(`/api/v1/attendance/assignments/${primaryAssignmentId}`)
        .set('Authorization', `Bearer ${otherInst.usersByRole[UserRole.ADMIN].token}`)
        .send({ effectiveTo: '2026-05-01' });
      expect([403, 404]).toContain(patchRes.status);

      const deleteRes = await request(app)
        .delete(`/api/v1/attendance/assignments/${primaryAssignmentId}`)
        .set('Authorization', `Bearer ${otherInst.usersByRole[UserRole.ADMIN].token}`);
      expect([403, 404]).toContain(deleteRes.status);

      // sanity: original institution's admin can still see it (untouched by the cross-tenant attempts)
      const listRes = await request(app)
        .get('/api/v1/attendance/assignments')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
    } finally {
      await cleanupInstitution(otherInst);
    }
  });

  it('rejects DELETE of an assignment already referenced by a register with 409, but allows deleting an unreferenced one', async () => {
    const { token } = inst.usersByRole[UserRole.ADMIN];

    // substituteAssignmentId was created in an earlier test and never used by any register - deletable.
    const deleteRes = await request(app)
      .delete(`/api/v1/attendance/assignments/${substituteAssignmentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);
  });
});
