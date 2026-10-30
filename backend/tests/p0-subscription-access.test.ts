// P0 — server-side subscription enforcement: getAccessLevel() + the 402
// SUBSCRIPTION_INACTIVE write block in tenant.middleware.ts.
import request from 'supertest';
import { UserRole } from '@prisma/client';

jest.mock('../src/queues/notificationQueue', () => ({
  __esModule: true,
  notificationQueue: { add: jest.fn() },
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import app from '../src/app';
import { getAccessLevel, isWriteAllowedWhileRestricted } from '../src/modules/billing/accessLevel';
import { prisma, createTestInstitution, cleanupInstitution, disconnectFixtures, InstitutionFixture } from './helpers/fixtures';

jest.setTimeout(120000);

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-31T12:00:00Z');
const past = (d: number) => new Date(now.getTime() - d * DAY);
const future = (d: number) => new Date(now.getTime() + d * DAY);
const sub = (over: Partial<Parameters<typeof getAccessLevel>[1] & object>) => ({
  status: 'ACTIVE' as const,
  trialEndsAt: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  ...over,
});

describe('getAccessLevel()', () => {
  const on = { isActive: true };

  it('ACTIVE for a running trial, a paid period, and the whole GRACE window', () => {
    expect(getAccessLevel(on, sub({ status: 'TRIALING', trialEndsAt: future(3) }), now)).toBe('ACTIVE');
    expect(getAccessLevel(on, sub({ status: 'ACTIVE', currentPeriodEnd: future(10) }), now)).toBe('ACTIVE');
    // Paid period lapsed 2 days ago — still inside the 7-day grace window.
    expect(getAccessLevel(on, sub({ status: 'ACTIVE', currentPeriodEnd: past(2) }), now)).toBe('ACTIVE');
    expect(getAccessLevel(on, sub({ status: 'GRACE', graceEndsAt: future(1) }), now)).toBe('ACTIVE');
  });

  it('RESTRICTED for a lapsed trial, a lapsed grace, EXPIRED and CANCELLED', () => {
    expect(getAccessLevel(on, sub({ status: 'TRIALING', trialEndsAt: past(1) }), now)).toBe('RESTRICTED');
    expect(getAccessLevel(on, sub({ status: 'GRACE', graceEndsAt: past(1) }), now)).toBe('RESTRICTED');
    expect(getAccessLevel(on, sub({ status: 'EXPIRED' }), now)).toBe('RESTRICTED');
    expect(getAccessLevel(on, sub({ status: 'CANCELLED' }), now)).toBe('RESTRICTED');
  });

  it('DISABLED when the institution is switched off; ACTIVE with no subscription row', () => {
    expect(getAccessLevel({ isActive: false }, sub({ status: 'ACTIVE', currentPeriodEnd: future(10) }), now)).toBe('DISABLED');
    expect(getAccessLevel(null, null, now)).toBe('DISABLED');
    expect(getAccessLevel(on, null, now)).toBe('ACTIVE');
  });

  it('exempts reads, billing/checkout/callbacks and auth from the write block', () => {
    expect(isWriteAllowedWhileRestricted('GET', '/api/v1/students')).toBe(true);
    expect(isWriteAllowedWhileRestricted('POST', '/api/v1/billing/checkout')).toBe(true);
    expect(isWriteAllowedWhileRestricted('POST', '/api/v1/billing/gateway/ipn')).toBe(true);
    expect(isWriteAllowedWhileRestricted('POST', '/api/v1/auth/logout')).toBe(true);
    expect(isWriteAllowedWhileRestricted('POST', '/api/v1/students')).toBe(false);
    expect(isWriteAllowedWhileRestricted('DELETE', '/api/v1/fees/invoices/x')).toBe(false);
    expect(isWriteAllowedWhileRestricted('POST', '/api/v1/billingX')).toBe(false);
  });
});

describe('tenant middleware: 402 SUBSCRIPTION_INACTIVE', () => {
  let fx: InstitutionFixture;
  let planId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    fx = await createTestInstitution(`p0-sub-${Date.now()}`);
    const plan = await prisma.plan.create({ data: { name: `p0-plan-${fx.slug}`, slug: `p0-plan-${fx.slug}` } });
    planId = plan.id;
  }, 60000);

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { institutionId: fx.institutionId } }).catch(() => undefined);
    await prisma.plan.deleteMany({ where: { id: planId } }).catch(() => undefined);
    await cleanupInstitution(fx);
    await disconnectFixtures();
  }, 60000);

  async function setSubscription(data: { status: 'TRIALING' | 'ACTIVE' | 'GRACE' | 'EXPIRED'; trialEndsAt?: Date; currentPeriodEnd?: Date; graceEndsAt?: Date }) {
    await prisma.subscription.deleteMany({ where: { institutionId: fx.institutionId } });
    await prisma.subscription.create({ data: { institutionId: fx.institutionId, planId, billingCycle: 'MONTHLY', ...data } });
    await prisma.institution.update({ where: { id: fx.institutionId }, data: { isActive: true } });
  }

  it('expired trial: GET still works, writes get 402 for staff and students', async () => {
    await setSubscription({ status: 'TRIALING', trialEndsAt: new Date(Date.now() - DAY) });

    const read = await request(app).get('/api/v1/notifications').set(auth(fx.usersByRole[UserRole.ADMIN].token));
    expect(read.status).toBe(200);

    for (const role of [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT, UserRole.GUARDIAN]) {
      const write = await request(app).post('/api/v1/notifications/read-all').set(auth(fx.usersByRole[role].token));
      expect(write.status).toBe(402);
      expect(write.body.code).toBe('SUBSCRIPTION_INACTIVE');
      expect(write.body.success).toBe(false);
    }

    // The lapsed trial is NOT hard-suspended — the school can still log in and pay.
    const inst = await prisma.institution.findUniqueOrThrow({ where: { id: fx.institutionId } });
    expect(inst.isActive).toBe(true);
  });

  it('billing checkout is never blocked by the paywall (validation runs instead)', async () => {
    await setSubscription({ status: 'EXPIRED' });
    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(fx.usersByRole[UserRole.ADMIN].token))
      .send({});
    expect(res.status).not.toBe(402);
    expect(res.status).toBe(422);
  });

  it('SUPER_ADMIN is never blocked', async () => {
    await setSubscription({ status: 'EXPIRED' });
    const res = await request(app)
      .post('/api/v1/notifications/read-all')
      .set(auth(fx.usersByRole[UserRole.SUPER_ADMIN].token))
      .set('x-institution-id', fx.institutionId);
    expect(res.status).not.toBe(402);
  });

  it('GRACE keeps full write access', async () => {
    await setSubscription({ status: 'GRACE', currentPeriodEnd: new Date(Date.now() - 2 * DAY), graceEndsAt: new Date(Date.now() + 5 * DAY) });
    const res = await request(app).post('/api/v1/notifications/read-all').set(auth(fx.usersByRole[UserRole.ADMIN].token));
    expect(res.status).toBe(200);
  });

  it('an active trial keeps full write access', async () => {
    await setSubscription({ status: 'TRIALING', trialEndsAt: new Date(Date.now() + 5 * DAY) });
    const res = await request(app).post('/api/v1/notifications/read-all').set(auth(fx.usersByRole[UserRole.TEACHER].token));
    expect(res.status).toBe(200);
  });

  it('GET /billing/subscription reports the access level', async () => {
    await setSubscription({ status: 'TRIALING', trialEndsAt: new Date(Date.now() - DAY) });
    const res = await request(app).get('/api/v1/billing/subscription').set(auth(fx.usersByRole[UserRole.ADMIN].token));
    expect(res.status).toBe(200);
    expect(res.body.data.accessLevel).toBe('RESTRICTED');
  });
});
