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

describe('Timetable branch resolution (Bug 4 regression)', () => {
  let fixtureA: InstitutionFixture;
  let fixtureB: InstitutionFixture;
  let teacherIdA: string;
  let teacherIdB: string;

  beforeAll(async () => {
    fixtureA = await createTestInstitution('tt-branch-a');
    fixtureB = await createTestInstitution('tt-branch-b');

    const teacherA = await prisma.teacher.create({
      data: { userId: fixtureA.usersByRole[UserRole.TEACHER].userId },
    });
    teacherIdA = teacherA.id;

    const teacherB = await prisma.teacher.create({
      data: { userId: fixtureB.usersByRole[UserRole.TEACHER].userId },
    });
    teacherIdB = teacherB.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.teacher.delete({ where: { id: teacherIdA } }).catch(() => {});
    await prisma.teacher.delete({ where: { id: teacherIdB } }).catch(() => {});
    await cleanupInstitution(fixtureA);
    await cleanupInstitution(fixtureB);
    await disconnectFixtures();
  }, 30_000);

  it('meta classes self-heals a real Branch and returns a real branchId not the placeholder on each class row', async () => {
    const branchesBefore = await prisma.branch.findMany({ where: { institutionId: fixtureA.institutionId } });
    expect(branchesBefore.length).toBe(0);

    const res = await request(app)
      .get('/api/v1/students/meta/classes')
      .set('Authorization', `Bearer ${fixtureA.usersByRole[UserRole.ADMIN].token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const cls of res.body.data) {
      expect(typeof cls.branchId).toBe('string');
      expect(cls.branchId).not.toBe('clbranch00000000000000000');
      expect(cls.branchId).toMatch(/^c[a-z0-9]{20,}$/);
    }

    const branchesAfter = await prisma.branch.findMany({ where: { institutionId: fixtureA.institutionId } });
    expect(branchesAfter.length).toBe(1);
    expect(branchesAfter[0].name).toBe('Main Branch');
    expect(res.body.data[0].branchId).toBe(branchesAfter[0].id);
  }, 20_000);

  it('happy path: POST timetables succeeds end-to-end using the branchId resolved from meta classes', async () => {
    const metaRes = await request(app)
      .get('/api/v1/students/meta/classes')
      .set('Authorization', `Bearer ${fixtureA.usersByRole[UserRole.ADMIN].token}`);
    const resolvedBranchId = metaRes.body.data[0]?.branchId;
    const resolvedClassName = metaRes.body.data[0]?.name;
    expect(resolvedBranchId).toBeTruthy();

    const createRes = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixtureA.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId: resolvedBranchId,
        className: resolvedClassName,
        sectionName: 'A',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '09:45',
        subject: 'Mathematics',
        teacherUserId: fixtureA.usersByRole[UserRole.TEACHER].userId,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.branchId).toBe(resolvedBranchId);

    await prisma.timetableSlot.delete({ where: { id: createRes.body.data.id } });
  }, 20_000);

  it('regression guard: the original hardcoded placeholder branchId is still correctly rejected, backend behavior intentionally unchanged', async () => {
    const res = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixtureA.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId: 'clbranch00000000000000000',
        className: 'Class 8',
        sectionName: 'A',
        dayOfWeek: 'TUESDAY',
        startTime: '09:00',
        endTime: '09:45',
        subject: 'Mathematics',
        teacherUserId: fixtureA.usersByRole[UserRole.TEACHER].userId,
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("Branch with ID clbranch00000000000000000 not found under this institution".replace("ID clbranch", "ID 'clbranch").replace("00000000000000000 not", "00000000000000000' not"));
  }, 20_000);

  it('tenant isolation: institution B cannot create a timetable slot using institution A real branchId', async () => {
    const metaResA = await request(app)
      .get('/api/v1/students/meta/classes')
      .set('Authorization', `Bearer ${fixtureA.usersByRole[UserRole.ADMIN].token}`);
    const branchIdA = metaResA.body.data[0]?.branchId;
    expect(branchIdA).toBeTruthy();

    const crossTenantRes = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixtureB.usersByRole[UserRole.ADMIN].token}`)
      .send({
        branchId: branchIdA,
        className: 'Class 8',
        sectionName: 'A',
        dayOfWeek: 'WEDNESDAY',
        startTime: '09:00',
        endTime: '09:45',
        subject: 'Mathematics',
        teacherUserId: fixtureB.usersByRole[UserRole.TEACHER].userId,
      });

    expect(crossTenantRes.status).toBe(404);
    expect(crossTenantRes.body.message).toContain(branchIdA);
    expect(crossTenantRes.body.message).toContain('not found under this institution');
  }, 20_000);

  it('role boundary: STUDENT and GUARDIAN cannot call meta classes, the endpoint TimetableGrid now reuses', async () => {
    for (const role of [UserRole.STUDENT, UserRole.GUARDIAN]) {
      const res = await request(app)
        .get('/api/v1/students/meta/classes')
        .set('Authorization', `Bearer ${fixtureA.usersByRole[role].token}`);
      expect(res.status).toBe(403);
    }
  }, 20_000);

  it('role boundary: TEACHER read-allowed on meta classes still cannot POST timetables write-restricted to ADMIN and SUPER_ADMIN', async () => {
    const metaRes = await request(app)
      .get('/api/v1/students/meta/classes')
      .set('Authorization', `Bearer ${fixtureA.usersByRole[UserRole.TEACHER].token}`);
    expect(metaRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/timetables')
      .set('Authorization', `Bearer ${fixtureA.usersByRole[UserRole.TEACHER].token}`)
      .send({
        branchId: metaRes.body.data[0]?.branchId,
        className: 'Class 8',
        sectionName: 'B',
        dayOfWeek: 'THURSDAY',
        startTime: '09:00',
        endTime: '09:45',
        subject: 'Science',
        teacherUserId: fixtureA.usersByRole[UserRole.TEACHER].userId,
      });
    expect(createRes.status).toBe(403);
  }, 20_000);
});
