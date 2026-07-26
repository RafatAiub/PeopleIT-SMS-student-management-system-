import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  InstitutionFixture,
} from './helpers/fixtures';

describe('Super Admin Support Access & Security Controls', () => {
  let fixture: InstitutionFixture;
  let superAdminToken: string;

  beforeAll(async () => {
    fixture = await createTestInstitution('supadmin-test');
    superAdminToken = fixture.usersByRole[UserRole.SUPER_ADMIN].token;
  }, 30_000);

  afterAll(async () => {
    await cleanupInstitution(fixture);
    await disconnectFixtures();
  }, 30_000);

  describe('Super Admin Endpoint Authorization', () => {
    it('allows SUPER_ADMIN to fetch global platform metrics', async () => {
      const res = await request(app)
        .get('/api/v1/institution/super-admin/metrics')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalInstitutions');
      expect(res.body.data).toHaveProperty('activeInstitutions');
    });

    it('blocks regular ADMIN and TEACHER from accessing Super Admin metrics with 403', async () => {
      const adminToken = fixture.usersByRole[UserRole.ADMIN].token;
      const teacherToken = fixture.usersByRole[UserRole.TEACHER].token;

      const resAdmin = await request(app)
        .get('/api/v1/institution/super-admin/metrics')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(403);

      const resTeacher = await request(app)
        .get('/api/v1/institution/super-admin/metrics')
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(resTeacher.status).toBe(403);
    });

    it('allows SUPER_ADMIN to fetch paginated institutions list', async () => {
      const res = await request(app)
        .get('/api/v1/institution/super-admin/paginated')
        .query({ page: 1, pageSize: 10, status: 'ALL' })
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
    });
  });

  describe('Support Access Session Lifecycle & Read-Only Enforcement', () => {
    let supportToken: string;
    let targetAdminId: string;

    beforeAll(async () => {
      targetAdminId = fixture.usersByRole[UserRole.ADMIN].userId;
    });

    it('allows SUPER_ADMIN to start a short-lived support access session', async () => {
      const res = await request(app)
        .post('/api/v1/institution/super-admin/support-session/start')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          institutionId: fixture.institutionId,
          targetUserId: targetAdminId,
          reason: 'Testing customer support issue investigation #9910',
          ticketId: 'SUP-9910',
          isReadOnly: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data.isReadOnly).toBe(true);
      expect(res.body.data.targetUser.id).toBe(targetAdminId);

      supportToken = res.body.data.accessToken;
    });

    it('allows support access token to perform GET operations under target institution context', async () => {
      const res = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${supportToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('enforces Read-Only protection and BLOCKS mutating requests (POST/PUT/DELETE) with 403', async () => {
      // POST attempt
      const postRes = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          studentId: 'ST-TEST-READONLY',
          firstName: 'Illegal',
          lastName: 'Mutation',
        });
      expect(postRes.status).toBe(403);
      expect(postRes.body.message).toContain('Read-Only mode');

      // DELETE attempt
      const deleteRes = await request(app)
        .delete(`/api/v1/students/${fixture.studentId}`)
        .set('Authorization', `Bearer ${supportToken}`);
      expect(deleteRes.status).toBe(403);

      // PUT attempt
      const putRes = await request(app)
        .put('/api/v1/institution/website')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({ name: 'Renamed In Support Session' });
      expect(putRes.status).toBe(403);
    });

    it('writes explicit SUPPORT_SESSION_START and SUPPORT_SESSION_END audit logs', async () => {
      // Revoke support session
      const revokeRes = await request(app)
        .post('/api/v1/institution/super-admin/support-session/revoke')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetUserId: targetAdminId,
          institutionId: fixture.institutionId,
        });

      expect(revokeRes.status).toBe(200);

      // Verify audit logs in database
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          institutionId: fixture.institutionId,
          action: { in: ['SUPPORT_SESSION_START', 'SUPPORT_SESSION_END'] },
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(2);
      const startLog = auditLogs.find((l) => l.action === 'SUPPORT_SESSION_START');
      expect(startLog).toBeDefined();
      expect(startLog?.resourceId).toBe(targetAdminId);
    });
  });

  describe('Administrator Security Actions', () => {
    it('allows SUPER_ADMIN to perform security action (REVOKE_SESSIONS)', async () => {
      const adminId = fixture.usersByRole[UserRole.ADMIN].userId;
      const res = await request(app)
        .post('/api/v1/institution/super-admin/admin-actions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          userId: adminId,
          action: 'REVOKE_SESSIONS',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('revoked');
    });
  });
});
