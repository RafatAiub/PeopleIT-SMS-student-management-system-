import request from 'supertest';
import { UserRole, NotificationChannel } from '@prisma/client';

// Same boundary mock as notifications.test.ts: notify() is asserted on WHAT it
// enqueues; deliverNotification() is driven directly to land rows. No Redis.
const mockEnqueueNotification = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/queues/notificationQueue', () => ({
  __esModule: true,
  notificationQueue: { add: jest.fn() },
  enqueueNotification: (...args: unknown[]) => mockEnqueueNotification(...args),
}));

import app from '../src/app';
import {
  prisma,
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  InstitutionFixture,
} from './helpers/fixtures';
import {
  emitSubscriptionNotification,
  notifySubscriptionEvent,
} from '../src/modules/billing/billing.notifications';
import { runSubscriptionLifecycleScan } from '../src/queues/billingWorker';
import { deliverNotification } from '../src/queues/notificationWorker';
import { buildDedupeKey } from '../src/modules/notifications/notifications.service';

jest.setTimeout(120000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const flush = () => new Promise((r) => setTimeout(r, 2500)); // let Neon-bound fire-and-forget emits settle

describe('Subscription billing notifications', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;

  beforeAll(async () => {
    a = await createTestInstitution(`bnotif-a-${Date.now()}`);
    b = await createTestInstitution(`bnotif-b-${Date.now()}`);
  }, 60000);

  afterAll(async () => {
    // subscriptions created in tests below
    await prisma.subscription
      .deleteMany({ where: { institutionId: { in: [a.institutionId, b.institutionId] } } })
      .catch(() => undefined);
    await cleanupInstitution(a);
    await cleanupInstitution(b);
    await disconnectFixtures();
  }, 60000);

  beforeEach(async () => {
    mockEnqueueNotification.mockClear();
    await prisma.notificationDelivery.deleteMany({
      where: { institutionId: { in: [a.institutionId, b.institutionId] } },
    });
    await prisma.notification.deleteMany({
      where: { institutionId: { in: [a.institutionId, b.institutionId] } },
    });
  });

  // ── audience resolution ────────────────────────────────────────────────

  it('institute-admin audience enqueues for the ADMIN only', async () => {
    await notifySubscriptionEvent({
      type: 'SUBSCRIPTION_ADJUSTED',
      institutionId: a.institutionId,
      contextId: 'adj-1',
      vars: { action: 'Extended', reason: 'test', periodEnd: 'soon' },
    });
    await flush();

    const recipients = new Set(mockEnqueueNotification.mock.calls.map((c) => c[0].recipientUserId));
    expect(recipients.has(a.usersByRole[UserRole.ADMIN].userId)).toBe(true);
    expect(recipients.has(a.usersByRole[UserRole.SUPER_ADMIN].userId)).toBe(false);
  });

  it("'both' audience also enqueues for super admins", async () => {
    await notifySubscriptionEvent({
      type: 'SUBSCRIPTION_ACTIVATED',
      institutionId: a.institutionId,
      audience: 'both',
      contextId: 'act-1',
      vars: { planName: 'Pro', billingCycle: 'Monthly', amount: 'BDT 1000.00', periodEnd: 'soon' },
    });
    await flush();

    const recipients = new Set(mockEnqueueNotification.mock.calls.map((c) => c[0].recipientUserId));
    expect(recipients.has(a.usersByRole[UserRole.ADMIN].userId)).toBe(true);
    expect(recipients.has(a.usersByRole[UserRole.SUPER_ADMIN].userId)).toBe(true);
    // every enqueued job carries the SUBJECT institution's id
    expect(mockEnqueueNotification.mock.calls.every((c) => c[0].institutionId === a.institutionId)).toBe(true);
  });

  // ── lifecycle scan ────────────────────────────────────────────────────

  it('ACTIVE -> GRACE emits SUBSCRIPTION_GRACE to the institute admin', async () => {
    await prisma.subscription.deleteMany({ where: { institutionId: a.institutionId } });
    await prisma.subscription.create({
      data: {
        institutionId: a.institutionId,
        planId: 'nonexistent-plan-ok-for-status-only',
        billingCycle: 'MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // lapsed yesterday
      },
    }).catch(async (e) => {
      // Subscription.planId is a required relation in some schemas — fall back
      // to creating a throwaway plan if the bare create is rejected.
      const plan = await prisma.plan.create({
        data: { name: `t-plan-${Date.now()}`, slug: `t-plan-${Date.now()}` },
      });
      await prisma.subscription.create({
        data: {
          institutionId: a.institutionId,
          planId: plan.id,
          billingCycle: 'MONTHLY',
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
    });

    await runSubscriptionLifecycleScan();
    await flush();

    const graceCalls = mockEnqueueNotification.mock.calls.filter(
      (c) => c[0].type === 'SUBSCRIPTION_GRACE' && c[0].institutionId === a.institutionId,
    );
    expect(graceCalls.length).toBeGreaterThan(0);
    expect(graceCalls.some((c) => c[0].recipientUserId === a.usersByRole[UserRole.ADMIN].userId)).toBe(true);

    const sub = await prisma.subscription.findUnique({ where: { institutionId: a.institutionId } });
    expect(sub?.status).toBe('GRACE');
  });

  it('GRACE -> EXPIRED emits SUBSCRIPTION_SUSPENDED to admin + super admin', async () => {
    await prisma.subscription.updateMany({
      where: { institutionId: a.institutionId },
      data: { status: 'GRACE', graceEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    await runSubscriptionLifecycleScan();
    await flush();

    const suspendedCalls = mockEnqueueNotification.mock.calls.filter(
      (c) => c[0].type === 'SUBSCRIPTION_SUSPENDED' && c[0].institutionId === a.institutionId,
    );
    const recipients = new Set(suspendedCalls.map((c) => c[0].recipientUserId));
    expect(recipients.has(a.usersByRole[UserRole.ADMIN].userId)).toBe(true);
    expect(recipients.has(a.usersByRole[UserRole.SUPER_ADMIN].userId)).toBe(true);

    const inst = await prisma.institution.findUnique({ where: { id: a.institutionId } });
    expect(inst?.isActive).toBe(false);
  });

  // ── super-admin read path (the tenant-less notifications read) ─────────

  it('a super admin can read platform notifications addressed to them', async () => {
    // Land a real row for the super admin about institution A, via the worker.
    const superId = a.usersByRole[UserRole.SUPER_ADMIN].userId;
    await deliverNotification({
      institutionId: a.institutionId,
      type: 'SUBSCRIPTION_ACTIVATED',
      recipientUserId: superId,
      channel: NotificationChannel.IN_APP,
      contextId: 'sa-read-1',
      vars: { planName: 'Pro', billingCycle: 'Monthly', amount: 'BDT 1000.00', periodEnd: 'soon' },
      dedupeKey: buildDedupeKey(a.institutionId, 'SUBSCRIPTION_ACTIVATED', superId, 'IN_APP', 'sa-read-1'),
    });

    const res = await request(app)
      .get('/api/v1/notifications')
      .set(auth(a.usersByRole[UserRole.SUPER_ADMIN].token));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].type).toBe('SUBSCRIPTION_ACTIVATED');
    expect(res.body.unreadCount).toBeGreaterThan(0);

    // and it does not leak to an unrelated institution's admin (institution B —
    // institution A may already be suspended by an earlier test in this file).
    const adminRes = await request(app)
      .get('/api/v1/notifications')
      .set(auth(b.usersByRole[UserRole.ADMIN].token));
    expect(adminRes.status).toBe(200);
    const adminData: Array<{ type: string }> = adminRes.body?.data ?? [];
    expect(adminData.some((n) => n.type === 'SUBSCRIPTION_ACTIVATED')).toBe(false);
  });

  it('a super admin can mark a platform notification read', async () => {
    const superId = a.usersByRole[UserRole.SUPER_ADMIN].userId;
    await deliverNotification({
      institutionId: b.institutionId,
      type: 'SUBSCRIPTION_SUSPENDED',
      recipientUserId: superId,
      channel: NotificationChannel.IN_APP,
      contextId: 'sa-read-2',
      vars: {},
      dedupeKey: buildDedupeKey(b.institutionId, 'SUBSCRIPTION_SUSPENDED', superId, 'IN_APP', 'sa-read-2'),
    });
    const row = await prisma.notification.findFirstOrThrow({
      where: { recipientUserId: superId, type: 'SUBSCRIPTION_SUSPENDED' },
    });

    const res = await request(app)
      .post(`/api/v1/notifications/${row.id}/read`)
      .set(auth(a.usersByRole[UserRole.SUPER_ADMIN].token));
    expect(res.status).toBe(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).readAt).not.toBeNull();
  });
});
