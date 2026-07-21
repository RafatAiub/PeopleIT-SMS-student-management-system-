import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../src/app';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  InstitutionFixture,
} from './helpers/fixtures';

/**
 * Bug 5a — System Settings > Institution Profile: GET/PUT /institution/website
 * silently discarded name/phone/email/address/logoUrl because
 * UpdateWebsiteConfigDto didn't list them (Zod strips unknown keys). This
 * suite proves those real Institution columns now round-trip end-to-end,
 * and that tenant isolation still holds on this path.
 */
describe('Institution profile (GET/PUT /institution/website) — Bug 5a', () => {
  let fixtureA: InstitutionFixture;
  let fixtureB: InstitutionFixture;

  beforeAll(async () => {
    [fixtureA, fixtureB] = await Promise.all([
      createTestInstitution('inst-profile-a'),
      createTestInstitution('inst-profile-b'),
    ]);
  }, 30_000);

  afterAll(async () => {
    await cleanupInstitution(fixtureA);
    await cleanupInstitution(fixtureB);
    await disconnectFixtures();
  }, 30_000);

  it('GET returns the real Institution profile fields with correct names', async () => {
    const { token } = fixtureA.usersByRole[UserRole.ADMIN];
    const res = await request(app)
      .get('/api/v1/institution/website')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: fixtureA.institutionId,
      name: `Test Institution inst-profile-a`,
      slug: fixtureA.slug,
    });
    // Real columns must be present in the payload (even if null), using the
    // actual Prisma field names — not the mismatched frontend key
    // `institutionName`.
    expect(res.body.data).toHaveProperty('phone');
    expect(res.body.data).toHaveProperty('email');
    expect(res.body.data).toHaveProperty('address');
    expect(res.body.data).toHaveProperty('logoUrl');
  });

  it('PUT with name/phone/email/address/logoUrl persists and is reflected in a subsequent GET', async () => {
    const { token } = fixtureA.usersByRole[UserRole.ADMIN];
    const payload = {
      name: 'Updated Institution Name',
      phone: '+1-555-0100',
      email: 'contact@updated-institution.test',
      address: '123 Updated Ave, Test City',
      logoUrl: 'https://cdn.example.com/logo.png',
    };

    const putRes = await request(app)
      .put('/api/v1/institution/website')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(putRes.status).toBe(200);
    expect(putRes.body.data).toMatchObject(payload);

    const getRes = await request(app)
      .get('/api/v1/institution/website')
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data).toMatchObject(payload);
  });

  it('PUT also still persists the pre-existing website-config fields alongside the new profile fields', async () => {
    const { token } = fixtureA.usersByRole[UserRole.ADMIN];
    const payload = {
      heroTitle: 'Custom Hero Title',
      contactEmail: 'website-contact@updated-institution.test',
    };

    const putRes = await request(app)
      .put('/api/v1/institution/website')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(putRes.status).toBe(200);
    expect(putRes.body.data).toMatchObject(payload);
    // Fields not sent in this request must not be clobbered.
    expect(putRes.body.data.name).toBe('Updated Institution Name');
  });

  it('cross-tenant isolation: institution B admin cannot see or affect institution A data via this endpoint', async () => {
    const { token: tokenB } = fixtureB.usersByRole[UserRole.ADMIN];

    const getRes = await request(app)
      .get('/api/v1/institution/website')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(fixtureB.institutionId);
    expect(getRes.body.data.id).not.toBe(fixtureA.institutionId);
    expect(getRes.body.data.name).not.toBe('Updated Institution Name');

    const putRes = await request(app)
      .put('/api/v1/institution/website')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Institution B renamed by its own admin' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data.id).toBe(fixtureB.institutionId);

    // Institution A must be completely unaffected by institution B's write.
    const { token: tokenA } = fixtureA.usersByRole[UserRole.ADMIN];
    const getAgainA = await request(app)
      .get('/api/v1/institution/website')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(getAgainA.body.data.name).toBe('Updated Institution Name');
  });

  it('rejects requests with no token (401)', async () => {
    const res = await request(app).get('/api/v1/institution/website');
    expect(res.status).toBe(401);
  });

  /**
   * Privilege-escalation regression — a tester-evaluator proved live that a
   * STUDENT-role JWT could PUT /institution/website and actually overwrite
   * the institution's name (the route had no requireRole at all, only the
   * blanket authenticate/setTenant/auditLog). PUT must now be Admin-only;
   * GET intentionally stays open (see authorization.test.ts) since it only
   * returns non-secret branding/contact fields that role dashboards like
   * GuardianDashboard legitimately read.
   */
  describe('privilege escalation regression — non-admin roles', () => {
    it('STUDENT gets 403 on PUT and cannot change the institution name', async () => {
      const { token } = fixtureA.usersByRole[UserRole.STUDENT];
      const res = await request(app)
        .put('/api/v1/institution/website')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hijacked by student role' });

      expect(res.status).toBe(403);

      const getRes = await request(app)
        .get('/api/v1/institution/website')
        .set('Authorization', `Bearer ${fixtureA.usersByRole[UserRole.ADMIN].token}`);
      expect(getRes.body.data.name).not.toBe('Hijacked by student role');
    });

    it('TEACHER gets 403 on PUT', async () => {
      const { token } = fixtureA.usersByRole[UserRole.TEACHER];
      const res = await request(app)
        .put('/api/v1/institution/website')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hijacked by teacher role' });

      expect(res.status).toBe(403);
    });

    it('STUDENT can still GET the read-only profile (no secrets exposed)', async () => {
      const { token } = fixtureA.usersByRole[UserRole.STUDENT];
      const res = await request(app)
        .get('/api/v1/institution/website')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('name');
      // Never leak credentials/secrets through this endpoint.
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });
  });
});
