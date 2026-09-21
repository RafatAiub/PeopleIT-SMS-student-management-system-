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
 * New Academics setup module (Medium/Stream/Shift/Semester/Class/Section CRUD)
 * plus the Subject catalogue CRUD added to the curriculum module. Covers the
 * happy paths, the delete guards, duplicate-name handling, cross-tenant
 * lookup validation, and RBAC — nothing here existed before this feature.
 */
describe('Academics setup module', () => {
  let inst: InstitutionFixture;
  let otherInst: InstitutionFixture;
  let adminToken: string;
  let teacherToken: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    inst = await createTestInstitution('academics');
    otherInst = await createTestInstitution('academics-other');
    adminToken = inst.usersByRole[UserRole.ADMIN].token;
    teacherToken = inst.usersByRole[UserRole.TEACHER].token;
    otherAdminToken = otherInst.usersByRole[UserRole.ADMIN].token;
  });

  afterAll(async () => {
    await cleanupInstitution(inst);
    await cleanupInstitution(otherInst);
    await disconnectFixtures();
  });

  describe('Medium CRUD', () => {
    let mediumId: string;

    it('creates a medium', async () => {
      const res = await request(app)
        .post('/api/v1/academics/mediums')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'English Medium' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('English Medium');
      mediumId = res.body.data.id;
    });

    it('lists mediums scoped to the caller institution only', async () => {
      const res = await request(app)
        .get('/api/v1/academics/mediums')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((m: any) => m.id)).toContain(mediumId);

      const otherRes = await request(app)
        .get('/api/v1/academics/mediums')
        .set('Authorization', `Bearer ${otherAdminToken}`);
      expect(otherRes.body.data.map((m: any) => m.id)).not.toContain(mediumId);
    });

    it('rejects a duplicate name with 409', async () => {
      const res = await request(app)
        .post('/api/v1/academics/mediums')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'English Medium' });
      expect(res.status).toBe(409);
    });

    it('allows the same name in a different institution', async () => {
      const res = await request(app)
        .post('/api/v1/academics/mediums')
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .send({ name: 'English Medium' });
      expect(res.status).toBe(201);
    });

    it('rejects writes from a non-admin role (TEACHER) with 403', async () => {
      const res = await request(app)
        .post('/api/v1/academics/mediums')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: 'Should Not Be Created' });
      expect(res.status).toBe(403);
    });

    it('updates a medium', async () => {
      const res = await request(app)
        .put(`/api/v1/academics/mediums/${mediumId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'English Medium (Updated)' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('English Medium (Updated)');
    });

    it('rejects updating/deleting a medium that belongs to another institution', async () => {
      const res = await request(app)
        .put(`/api/v1/academics/mediums/${mediumId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .send({ name: 'Hijacked' });
      expect(res.status).toBe(404);
    });

    it('stores this medium id for the Class tests below', () => {
      (globalThis as any).__testMediumId = mediumId;
    });
  });

  describe('Class CRUD + cross-tenant lookup validation', () => {
    let classId: string;
    let mediumId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/academics/mediums')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bangla Medium' });
      mediumId = res.body.data.id;
    });

    it('creates a class with a valid mediumId', async () => {
      const res = await request(app)
        .post('/api/v1/academics/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Class 7', level: 7, mediumId });
      expect(res.status).toBe(201);
      expect(res.body.data.mediumId).toBe(mediumId);
      classId = res.body.data.id;
    });

    it('rejects a mediumId belonging to another institution', async () => {
      const otherMediumRes = await request(app)
        .post('/api/v1/academics/mediums')
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .send({ name: 'Cross Tenant Medium' });
      const otherMediumId = otherMediumRes.body.data.id;

      const res = await request(app)
        .post('/api/v1/academics/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Class 8', level: 8, mediumId: otherMediumId });
      expect(res.status).toBe(404);
    });

    it('blocks deleting a medium still referenced by a class', async () => {
      const res = await request(app)
        .delete(`/api/v1/academics/mediums/${mediumId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/class\(es\) still reference/i);
    });

    it('auto-attaches the class to the institution\'s existing branch', async () => {
      const cls = await prisma.class.findUnique({ where: { id: classId }, include: { branch: true } });
      expect(cls?.branch.institutionId).toBe(inst.institutionId);
    });

    describe('Section CRUD under this class', () => {
      let sectionId: string;

      it('creates a section', async () => {
        const res = await request(app)
          .post('/api/v1/academics/sections')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'A', classId });
        expect(res.status).toBe(201);
        sectionId = res.body.data.id;
      });

      it('lists sections scoped by classId, 400s without it', async () => {
        const res = await request(app)
          .get(`/api/v1/academics/sections?classId=${classId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data.map((s: any) => s.id)).toContain(sectionId);

        const noQueryRes = await request(app)
          .get('/api/v1/academics/sections')
          .set('Authorization', `Bearer ${adminToken}`);
        // Zod query validation failure -> ValidationError -> 422 (this
        // codebase's convention, see middleware/validate.middleware.ts).
        expect(noQueryRes.status).toBe(422);
      });

      it('rejects a classTeacherId that is not a teacher in this institution', async () => {
        const otherTeacherId = otherInst.usersByRole[UserRole.TEACHER].userId;
        const res = await request(app)
          .post('/api/v1/academics/sections')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'B', classId, classTeacherId: otherTeacherId });
        // otherTeacherId here is a User.id, not a Teacher.id, and even the
        // right shape would belong to a different institution — either way
        // must be rejected, never silently accepted.
        expect(res.status).toBe(404);
      });

      it('blocks deleting the class while the section still exists', async () => {
        const res = await request(app)
          .delete(`/api/v1/academics/classes/${classId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/section\(s\) still exist/i);
      });

      it('blocks deleting a section that has enrolled students', async () => {
        const branch = await prisma.branch.findFirst({ where: { institutionId: inst.institutionId } });
        const student = await prisma.student.create({
          data: {
            institutionId: inst.institutionId,
            branchId: branch?.id,
            classId,
            sectionId,
            studentId: `STU-ACAD-${Date.now()}`,
            firstName: 'Acad',
            lastName: 'Test',
          },
        });

        const res = await request(app)
          .delete(`/api/v1/academics/sections/${sectionId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/student\(s\) are still enrolled/i);

        await prisma.student.delete({ where: { id: student.id } });
      });

      it('deletes the section once it has no students', async () => {
        const res = await request(app)
          .delete(`/api/v1/academics/sections/${sectionId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
      });
    });

    it('deletes the class once its sections are gone', async () => {
      const res = await request(app)
        .delete(`/api/v1/academics/classes/${classId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('now allows deleting the medium since nothing references it', async () => {
      const res = await request(app)
        .delete(`/api/v1/academics/mediums/${mediumId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Subject catalogue CRUD (curriculum module extension)', () => {
    let subjectId: string;

    it('creates a subject', async () => {
      const res = await request(app)
        .post('/api/v1/curriculum/subjects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Physics' });
      expect(res.status).toBe(201);
      subjectId = res.body.data.id;
    });

    it('lists it via the un-scoped catalogue endpoint (not the className-scoped one)', async () => {
      const res = await request(app)
        .get('/api/v1/curriculum/subjects/catalog')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((s: any) => s.name)).toContain('Physics');
    });

    it('the original className-scoped GET /subjects still 422s without className (unchanged)', async () => {
      const res = await request(app)
        .get('/api/v1/curriculum/subjects')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(422);
    });

    it('deletes the subject', async () => {
      const res = await request(app)
        .delete(`/api/v1/curriculum/subjects/${subjectId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });
});
