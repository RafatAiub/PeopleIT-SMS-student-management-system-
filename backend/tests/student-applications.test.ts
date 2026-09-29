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
 * Online Registrations: a public, unauthenticated Online Registration form
 * (POST /student-applications/apply) creates a PENDING Student + Guardian;
 * admins review them via the existing GET /students?status=PENDING list and
 * either POST /students/:id/approve (provisions a login) or DELETE /:id
 * (reject). Nothing here existed before this feature.
 */
describe('Online Registrations (Student Applications)', () => {
  let inst: InstitutionFixture;
  let adminToken: string;
  let branchId: string;
  let classA: { id: string };

  beforeAll(async () => {
    inst = await createTestInstitution('student-applications');
    adminToken = inst.usersByRole[UserRole.ADMIN].token;

    const branch = await prisma.branch.create({ data: { institutionId: inst.institutionId, name: 'Main Branch' } });
    branchId = branch.id;
    classA = await prisma.class.create({ data: { branchId, name: 'App Class 9', level: 9 } });
  });

  afterAll(async () => {
    await prisma.class.deleteMany({ where: { id: classA.id } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await cleanupInstitution(inst);
    await disconnectFixtures();
  });

  describe('GET /student-applications/classes', () => {
    it('returns classes for a valid institution slug without auth', async () => {
      const res = await request(app).get('/api/v1/student-applications/classes').query({ institutionSlug: inst.slug });
      expect(res.status).toBe(200);
      expect(res.body.data.some((c: any) => c.id === classA.id)).toBe(true);
    });

    it('returns 404 for an unknown institution slug', async () => {
      const res = await request(app).get('/api/v1/student-applications/classes').query({ institutionSlug: 'no-such-slug' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /student-applications/apply', () => {
    afterEach(async () => {
      await prisma.guardianStudent.deleteMany({ where: { student: { institutionId: inst.institutionId, status: 'PENDING' } } });
      await prisma.student.deleteMany({ where: { institutionId: inst.institutionId, status: 'PENDING' } });
    });

    it('creates a PENDING student with a linked guardian, no login yet', async () => {
      const res = await request(app)
        .post('/api/v1/student-applications/apply')
        .send({
          institutionSlug: inst.slug,
          firstName: 'Applicant',
          lastName: 'One',
          dateOfBirth: '2015-01-01',
          gender: 'male',
          classId: classA.id,
          guardianFirstName: 'Guardian',
          guardianLastName: 'One',
          guardianEmail: `guardian-one-${Date.now()}@example.com`,
          guardianPhone: '01700000000',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.studentId).toMatch(/^\d{4}-\d{4}$/);

      const student = await prisma.student.findUnique({
        where: { id: res.body.data.id },
        include: { guardians: { include: { guardian: true } } },
      });
      expect(student?.status).toBe('PENDING');
      expect(student?.userId).toBeNull();
      expect(student?.guardians).toHaveLength(1);
      expect(student?.guardians[0].guardian.firstName).toBe('Guardian');
    });

    it('rejects an unknown institution slug with 404', async () => {
      const res = await request(app)
        .post('/api/v1/student-applications/apply')
        .send({
          institutionSlug: 'no-such-slug',
          firstName: 'Applicant',
          lastName: 'Two',
          guardianFirstName: 'Guardian',
          guardianLastName: 'Two',
          guardianEmail: `guardian-two-${Date.now()}@example.com`,
          guardianPhone: '01700000000',
        });
      expect(res.status).toBe(404);
    });

    it('rejects a missing guardian email with 422', async () => {
      const res = await request(app)
        .post('/api/v1/student-applications/apply')
        .send({
          institutionSlug: inst.slug,
          firstName: 'Applicant',
          lastName: 'Three',
          guardianFirstName: 'Guardian',
          guardianLastName: 'Three',
          guardianPhone: '01700000000',
        });
      expect(res.status).toBe(422);
    });
  });

  describe('GET /students?status=PENDING and POST /students/:id/approve', () => {
    let pendingId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/student-applications/apply')
        .send({
          institutionSlug: inst.slug,
          firstName: 'Pending',
          lastName: 'Student',
          classId: classA.id,
          guardianFirstName: 'Guardian',
          guardianLastName: 'Approve',
          guardianEmail: `guardian-approve-${Date.now()}@example.com`,
          guardianPhone: '01700000000',
        });
      pendingId = res.body.data.id;
    });

    afterEach(async () => {
      await prisma.guardianStudent.deleteMany({ where: { studentId: pendingId } });
      await prisma.student.deleteMany({ where: { id: pendingId } });
    });

    it('lists the pending application for an admin', async () => {
      const res = await request(app)
        .get('/api/v1/students')
        .query({ status: 'PENDING' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((s: any) => s.id === pendingId)).toBe(true);
      const row = res.body.data.find((s: any) => s.id === pendingId);
      expect(row.guardians[0].guardian.firstName).toBe('Guardian');
    });

    it('approves the application, provisioning a login', async () => {
      const email = `approved-${Date.now()}@example.com`;
      const res = await request(app)
        .post(`/api/v1/students/${pendingId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email });
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(email);
      expect(res.body.data.password).toBeTruthy();

      const student = await prisma.student.findUnique({ where: { id: pendingId } });
      expect(student?.status).toBe('ACTIVE');
      expect(student?.userId).toBeTruthy();
      expect(student?.email).toBe(email);
    });

    it('rejects approving a non-pending student with 409', async () => {
      const email = `approved-twice-${Date.now()}@example.com`;
      await request(app)
        .post(`/api/v1/students/${pendingId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email });

      const res = await request(app)
        .post(`/api/v1/students/${pendingId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `another-${Date.now()}@example.com` });
      expect(res.status).toBe(409);
    });

    it('rejects (deletes) the application, including its guardian link, without error', async () => {
      const res = await request(app)
        .delete(`/api/v1/students/${pendingId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const student = await prisma.student.findUnique({ where: { id: pendingId } });
      expect(student).toBeNull();
    });
  });
});
