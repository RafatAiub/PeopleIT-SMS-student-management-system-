import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { prisma, disconnectFixtures } from './helpers/fixtures';

/**
 * QA-added regression test for a gap in the existing suite: every fixture
 * from helpers/fixtures.ts always creates a Student row for the STUDENT-role
 * user, so the "STUDENT user exists but has no linked Student profile" path
 * in library.service.ts (`student?.id ?? '__no-match__'`) was never actually
 * exercised. This verifies it degrades to an empty result set (200, []) —
 * not a 500 crash and not a leak of unrelated issues.
 */
describe('GET /library/me/issues — STUDENT with no linked Student record', () => {
  const slug = `test-libedge-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let institutionId: string;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({
      data: { name: `Test Institution libedge`, slug },
    });
    institutionId = institution.id;

    const user = await prisma.user.create({
      data: {
        institutionId,
        email: `student.${slug}@test.local`,
        passwordHash: 'x',
        role: UserRole.STUDENT,
        firstName: 'Orphan',
        lastName: 'Student',
      },
    });
    userId = user.id;
    token = jwt.sign(
      { sub: user.id, institutionId, role: UserRole.STUDENT, email: user.email },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any },
    );

    // Sanity: deliberately NOT creating a Student row linked to this user.
  }, 30_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { institutionId } });
    await prisma.institution.delete({ where: { id: institutionId } });
    await disconnectFixtures();
  }, 30_000);

  it('returns 200 with an empty issue list instead of throwing 500', async () => {
    const res = await request(app)
      .get('/api/v1/library/me/issues')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });
});
