import request from 'supertest';
import { UserRole, BillingCycle, SubscriptionStatus } from '@prisma/client';

// The billing routes pull in the notification queue transitively; stub the
// Redis-backed enqueue the same way billing-notifications.test.ts does so this
// suite never needs a broker.
jest.mock('../src/queues/notificationQueue', () => ({
  __esModule: true,
  notificationQueue: { add: jest.fn() },
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import app from '../src/app';
import {
  prisma,
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  InstitutionFixture,
} from './helpers/fixtures';

jest.setTimeout(120000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PLANS = '/api/v1/billing/super-admin/plans';

describe('Super-admin plan delete / restore', () => {
  let fixture: InstitutionFixture;
  let superToken: string;
  let adminToken: string;
  const createdPlanIds: string[] = [];

  const makePlan = async (label: string) => {
    const res = await request(app)
      .post(PLANS)
      .set(auth(superToken))
      .send({ name: `Plan ${label}`, slug: `plan-del-${label}-${Date.now()}`, displayOrder: 0 });
    expect(res.status).toBe(201);
    createdPlanIds.push(res.body.data.id);
    return res.body.data as { id: string; name: string; slug: string };
  };

  beforeAll(async () => {
    fixture = await createTestInstitution(`plandel-${Date.now()}`);
    superToken = fixture.usersByRole[UserRole.SUPER_ADMIN].token;
    adminToken = fixture.usersByRole[UserRole.ADMIN].token;
  }, 60000);

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { institutionId: fixture.institutionId } }).catch(() => undefined);
    await prisma.planPrice.deleteMany({ where: { planId: { in: createdPlanIds } } }).catch(() => undefined);
    await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } }).catch(() => undefined);
    await cleanupInstitution(fixture);
    await disconnectFixtures();
  }, 60000);

  it('deletes an unused plan along with its price rows', async () => {
    const plan = await makePlan('unused');
    await request(app)
      .put(`${PLANS}/${plan.id}/price`)
      .set(auth(superToken))
      .send({ billingCycle: BillingCycle.MONTHLY, amount: 1500 })
      .expect(200);

    const res = await request(app).delete(`${PLANS}/${plan.id}`).set(auth(superToken));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(plan.id);

    expect(await prisma.plan.findUnique({ where: { id: plan.id } })).toBeNull();
    expect(await prisma.planPrice.count({ where: { planId: plan.id } })).toBe(0);
  });

  it('refuses to delete a plan an institution is subscribed to, and says to archive it', async () => {
    const plan = await makePlan('inuse');
    await prisma.subscription.create({
      data: {
        institutionId: fixture.institutionId,
        planId: plan.id,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    const res = await request(app).delete(`${PLANS}/${plan.id}`).set(auth(superToken));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/1 institution subscribed/i);
    expect(res.body.message).toMatch(/archive/i);

    // Still there — a rejected delete must not partially destroy the plan.
    expect(await prisma.plan.findUnique({ where: { id: plan.id } })).not.toBeNull();

    await prisma.subscription.deleteMany({ where: { institutionId: fixture.institutionId } });
  });

  it('404s on an unknown plan id', async () => {
    const res = await request(app).delete(`${PLANS}/does-not-exist`).set(auth(superToken));
    expect(res.status).toBe(404);
  });

  it('rejects delete from a non-super-admin', async () => {
    const plan = await makePlan('rbac');
    const res = await request(app).delete(`${PLANS}/${plan.id}`).set(auth(adminToken));
    expect(res.status).toBe(403);
    expect(await prisma.plan.findUnique({ where: { id: plan.id } })).not.toBeNull();
  });

  it('archives then restores a plan', async () => {
    const plan = await makePlan('restore');

    await request(app).post(`${PLANS}/${plan.id}/archive`).set(auth(superToken)).expect(200);
    expect((await prisma.plan.findUnique({ where: { id: plan.id } }))?.isArchived).toBe(true);

    const restored = await request(app).post(`${PLANS}/${plan.id}/restore`).set(auth(superToken));
    expect(restored.status).toBe(200);
    expect(restored.body.data.isArchived).toBe(false);
    expect((await prisma.plan.findUnique({ where: { id: plan.id } }))?.isArchived).toBe(false);
  });

  it('reports the subscriber count on the plan list, for the delete guard in the UI', async () => {
    const plan = await makePlan('count');
    await prisma.subscription.create({
      data: {
        institutionId: fixture.institutionId,
        planId: plan.id,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    const res = await request(app).get(PLANS).set(auth(superToken)).expect(200);
    const row = res.body.data.find((p: { id: string }) => p.id === plan.id);
    expect(row).toBeDefined();
    expect(row._count.subscriptions).toBe(1);

    await prisma.subscription.deleteMany({ where: { institutionId: fixture.institutionId } });
  });
});
