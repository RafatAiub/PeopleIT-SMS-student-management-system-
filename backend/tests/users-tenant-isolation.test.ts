import request from 'supertest';
import app from '../src/app';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  InstitutionFixture,
} from './helpers/fixtures';

/**
 * Regression: GET /users?institutionId=<other tenant> used to return the other
 * tenant's users to any ADMIN. Only SUPER_ADMIN may target another tenant.
 */
describe('GET /api/v1/users — tenant isolation', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;

  beforeAll(async () => {
    a = await createTestInstitution('usersiso-a');
    b = await createTestInstitution('usersiso-b');
  }, 60_000);

  afterAll(async () => {
    await cleanupInstitution(a);
    await cleanupInstitution(b);
    await disconnectFixtures();
  });

  const idsOf = (res: request.Response): string[] => (res.body.data as Array<{ id: string }>).map((u) => u.id);

  it("ignores ?institutionId for a tenant ADMIN and returns only the admin's own users", async () => {
    const res = await request(app)
      .get(`/api/v1/users?institutionId=${b.institutionId}&pageSize=100`)
      .set('Authorization', `Bearer ${a.usersByRole.ADMIN.token}`);

    expect(res.status).toBe(200);
    const ids = idsOf(res);
    expect(ids).toContain(a.usersByRole.ADMIN.userId);
    expect(ids).not.toContain(b.usersByRole.ADMIN.userId);
  });

  it('lets SUPER_ADMIN list another institution with ?institutionId', async () => {
    const res = await request(app)
      .get(`/api/v1/users?institutionId=${b.institutionId}&pageSize=100`)
      .set('Authorization', `Bearer ${a.usersByRole.SUPER_ADMIN.token}`);

    expect(res.status).toBe(200);
    const ids = idsOf(res);
    expect(ids).toContain(b.usersByRole.ADMIN.userId);
    expect(ids).not.toContain(a.usersByRole.ADMIN.userId);
  });
});
