import request from 'supertest';
import { UserRole, NotificationChannel } from '@prisma/client';

// The queue is mocked at the module boundary: notify() is unit-tested on WHAT
// it enqueues, and the worker is driven directly via deliverNotification().
// Neither needs a live Redis, which this suite deliberately does not depend on.
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
import { notify, buildDedupeKey } from '../src/modules/notifications/notifications.service';
import { deliverNotification } from '../src/queues/notificationWorker';
import { renderTemplate } from '../src/modules/notifications/renderer';
import type { NotificationJobData } from '../src/queues/notificationQueue';
import { toJobId } from '../src/queues/jobId';

// Every case here does several sequential round-trips against the real remote
// Postgres; the 30s default is not enough when the instance is cold.
jest.setTimeout(120000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Notifications', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;

  beforeAll(async () => {
    a = await createTestInstitution(`notif-a-${Date.now()}`);
    b = await createTestInstitution(`notif-b-${Date.now()}`);
  }, 60000);

  afterAll(async () => {
    await cleanupInstitution(a);
    await cleanupInstitution(b);
    await disconnectFixtures();
  }, 60000);

  beforeEach(async () => {
    mockEnqueueNotification.mockClear();
    const ids = { in: [a.institutionId, b.institutionId] };
    await prisma.notificationDelivery.deleteMany({ where: { institutionId: ids } });
    await prisma.notificationPreference.deleteMany({ where: { institutionId: ids } });
    await prisma.notification.deleteMany({ where: { institutionId: ids } });
    await prisma.notificationTemplate.deleteMany({ where: { institutionId: ids } });
  });

  // -- notify(): fan-out, dedupe keys, preferences ---------------------------

  describe('notify()', () => {
    it('enqueues one job per recipient x default channel with a deterministic key', async () => {
      const guardianId = a.usersByRole[UserRole.GUARDIAN].userId;

      await notify({
        institutionId: a.institutionId,
        type: 'INVOICE_ISSUED',
        recipientUserIds: [guardianId],
        contextId: 'inv-1',
        vars: { invoiceNo: 'INV-1', studentName: 'S', amount: '10', dueDate: 'today' },
      });

      // INVOICE_ISSUED defaults to IN_APP + EMAIL
      expect(mockEnqueueNotification).toHaveBeenCalledTimes(2);
      const keys = mockEnqueueNotification.mock.calls.map((c) => c[0].dedupeKey);
      expect(keys).toContain(
        buildDedupeKey(a.institutionId, 'INVOICE_ISSUED', guardianId, 'IN_APP', 'inv-1'),
      );
      expect(keys).toContain(
        buildDedupeKey(a.institutionId, 'INVOICE_ISSUED', guardianId, 'EMAIL', 'inv-1'),
      );
    });

    it('produces a BullMQ-legal job id (no ":" — BullMQ rejects it)', () => {
      const key = buildDedupeKey('inst-1', 'INVOICE_ISSUED', 'usr_abc', 'IN_APP', 'ctx_1');
      expect(key).toContain(':'); // the durable dedupe key is colon-separated...
      const jobId = toJobId(key);
      expect(jobId).not.toContain(':'); // ...but the job id must not be
      expect(jobId).toMatch(/^[A-Za-z0-9_-]+$/);
      // stable + still 1:1 with the source key
      expect(toJobId(key)).toBe(jobId);
      expect(toJobId(buildDedupeKey('inst-1', 'INVOICE_ISSUED', 'usr_abc', 'EMAIL', 'ctx_1'))).not.toBe(jobId);
    });

    it('is stable: the same event for the same object yields the same keys', async () => {
      const guardianId = a.usersByRole[UserRole.GUARDIAN].userId;
      const emit = () =>
        notify({
          institutionId: a.institutionId,
          type: 'PAYMENT_RECEIVED',
          recipientUserIds: [guardianId],
          contextId: 'pay-9',
          vars: { invoiceNo: 'INV-1', studentName: 'S', amount: '10' },
        });

      await emit();
      const first = mockEnqueueNotification.mock.calls.map((c) => c[0].dedupeKey).sort();
      mockEnqueueNotification.mockClear();
      await emit();
      const second = mockEnqueueNotification.mock.calls.map((c) => c[0].dedupeKey).sort();

      expect(second).toEqual(first);
    });

    it('de-duplicates repeated recipients and no-ops on an empty audience', async () => {
      const guardianId = a.usersByRole[UserRole.GUARDIAN].userId;
      await notify({
        institutionId: a.institutionId,
        type: 'ABSENCE_ALERT',
        recipientUserIds: [guardianId, guardianId],
        vars: { studentName: 'S', date: 'today' },
      });
      // ABSENCE_ALERT -> IN_APP + SMS, once (not twice) for the repeated id
      expect(mockEnqueueNotification).toHaveBeenCalledTimes(2);

      mockEnqueueNotification.mockClear();
      await notify({
        institutionId: a.institutionId,
        type: 'ABSENCE_ALERT',
        recipientUserIds: [],
        vars: { studentName: 'S', date: 'today' },
      });
      expect(mockEnqueueNotification).not.toHaveBeenCalled();
    });

    it('records an opted-out channel as SKIPPED instead of enqueuing it', async () => {
      const guardianId = a.usersByRole[UserRole.GUARDIAN].userId;
      await prisma.notificationPreference.create({
        data: {
          institutionId: a.institutionId,
          userId: guardianId,
          type: 'INVOICE_ISSUED',
          channel: NotificationChannel.EMAIL,
          enabled: false,
        },
      });

      await notify({
        institutionId: a.institutionId,
        type: 'INVOICE_ISSUED',
        recipientUserIds: [guardianId],
        contextId: 'inv-opt',
        vars: { invoiceNo: 'INV-1', studentName: 'S', amount: '10', dueDate: 'today' },
      });

      // Only IN_APP was queued; EMAIL was suppressed...
      expect(mockEnqueueNotification).toHaveBeenCalledTimes(1);
      expect(mockEnqueueNotification.mock.calls[0][0].channel).toBe('IN_APP');

      // ...and the suppression is auditable rather than silent.
      const skipped = await prisma.notificationDelivery.findMany({
        where: { institutionId: a.institutionId, status: 'SKIPPED' },
      });
      expect(skipped).toHaveLength(1);
      expect(skipped[0].channel).toBe('EMAIL');
      expect(skipped[0].error).toMatch(/opted out/i);
    });
  });

  // -- worker: delivery, idempotency, skips ----------------------------------

  describe('deliverNotification()', () => {
    const job = (over: Partial<NotificationJobData> = {}): NotificationJobData => {
      const recipientUserId = over.recipientUserId ?? a.usersByRole[UserRole.GUARDIAN].userId;
      const channel = over.channel ?? NotificationChannel.IN_APP;
      const type = over.type ?? 'INVOICE_ISSUED';
      const contextId = over.contextId ?? 'inv-w1';
      return {
        institutionId: a.institutionId,
        type,
        recipientUserId,
        channel,
        contextId,
        data: { link: '/fees' },
        vars: {
          invoiceNo: 'INV-W1',
          studentName: 'Ayesha Rahman',
          amount: '1500.00',
          dueDate: 'today',
        },
        dedupeKey: buildDedupeKey(a.institutionId, type, recipientUserId, channel, contextId),
        ...over,
      };
    };

    it('writes the in-app record and marks the delivery SENT', async () => {
      await deliverNotification(job());

      const notifications = await prisma.notification.findMany({
        where: { institutionId: a.institutionId },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('New invoice INV-W1');
      expect(notifications[0].body).toContain('Ayesha Rahman');
      expect(notifications[0].readAt).toBeNull();

      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: { dedupeKey: job().dedupeKey },
      });
      expect(delivery.status).toBe('SENT');
      expect(delivery.attempts).toBe(1);
      expect(delivery.providerRef).toBe(notifications[0].id);
    });

    it('is idempotent - a replayed job never double-sends', async () => {
      await deliverNotification(job());
      await deliverNotification(job());
      await deliverNotification(job());

      expect(await prisma.notification.count({ where: { institutionId: a.institutionId } })).toBe(1);
      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: { dedupeKey: job().dedupeKey },
      });
      expect(delivery.status).toBe('SENT');
      expect(delivery.attempts).toBe(1);
    });

    it('SKIPs a channel with no adapter registered rather than failing', async () => {
      await deliverNotification(job({ channel: NotificationChannel.SMS, contextId: 'sms-1' }));

      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: {
          dedupeKey: buildDedupeKey(
            a.institutionId,
            'INVOICE_ISSUED',
            a.usersByRole[UserRole.GUARDIAN].userId,
            'SMS',
            'sms-1',
          ),
        },
      });
      expect(delivery.status).toBe('SKIPPED');
      expect(await prisma.notification.count({ where: { institutionId: a.institutionId } })).toBe(0);
    });

    it('SKIPs when the recipient does not belong to the institution', async () => {
      const foreignUserId = b.usersByRole[UserRole.GUARDIAN].userId;
      await deliverNotification(job({ recipientUserId: foreignUserId, contextId: 'x-tenant' }));

      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: {
          dedupeKey: buildDedupeKey(
            a.institutionId,
            'INVOICE_ISSUED',
            foreignUserId,
            'IN_APP',
            'x-tenant',
          ),
        },
      });
      expect(delivery.status).toBe('SKIPPED');
      expect(delivery.error).toMatch(/not found/i);
      // Crucially: nothing was written into either institution.
      expect(await prisma.notification.count({ where: { institutionId: a.institutionId } })).toBe(0);
      expect(await prisma.notification.count({ where: { institutionId: b.institutionId } })).toBe(0);
    });
  });

  // -- API: ownership + tenant boundaries ------------------------------------

  describe('API', () => {
    const seed = async (fixture: InstitutionFixture, role: UserRole, contextId: string) =>
      deliverNotification({
        institutionId: fixture.institutionId,
        type: 'INVOICE_ISSUED',
        recipientUserId: fixture.usersByRole[role].userId,
        channel: NotificationChannel.IN_APP,
        contextId,
        vars: { invoiceNo: contextId, studentName: 'S', amount: '1', dueDate: 'today' },
        dedupeKey: buildDedupeKey(
          fixture.institutionId,
          'INVOICE_ISSUED',
          fixture.usersByRole[role].userId,
          'IN_APP',
          contextId,
        ),
      });

    it('returns only the caller own rows with an unread count', async () => {
      await seed(a, UserRole.GUARDIAN, 'g-1');
      await seed(a, UserRole.TEACHER, 't-1');

      const res = await request(app)
        .get('/api/v1/notifications')
        .set(auth(a.usersByRole[UserRole.GUARDIAN].token));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('New invoice g-1');
      expect(res.body.unreadCount).toBe(1);
    });

    it('never leaks across institutions', async () => {
      await seed(a, UserRole.GUARDIAN, 'a-only');

      const res = await request(app)
        .get('/api/v1/notifications')
        .set(auth(b.usersByRole[UserRole.GUARDIAN].token));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.unreadCount).toBe(0);
    });

    it('marks own as read; another user in the same tenant gets 404, not 403', async () => {
      await seed(a, UserRole.GUARDIAN, 'r-1');
      const row = await prisma.notification.findFirstOrThrow({
        where: {
          institutionId: a.institutionId,
          recipientUserId: a.usersByRole[UserRole.GUARDIAN].userId,
        },
      });

      const foreign = await request(app)
        .post(`/api/v1/notifications/${row.id}/read`)
        .set(auth(a.usersByRole[UserRole.TEACHER].token));
      expect(foreign.status).toBe(404);
      expect(await prisma.notification.findUnique({ where: { id: row.id } })).toMatchObject({
        readAt: null,
      });

      const own = await request(app)
        .post(`/api/v1/notifications/${row.id}/read`)
        .set(auth(a.usersByRole[UserRole.GUARDIAN].token));
      expect(own.status).toBe(200);
      expect(
        (await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).readAt,
      ).not.toBeNull();
    });

    it('read-all clears only the caller rows', async () => {
      await seed(a, UserRole.GUARDIAN, 'all-g');
      await seed(a, UserRole.TEACHER, 'all-t');

      const res = await request(app)
        .post('/api/v1/notifications/read-all')
        .set(auth(a.usersByRole[UserRole.GUARDIAN].token));
      expect(res.status).toBe(200);

      expect(
        await prisma.notification.count({
          where: {
            institutionId: a.institutionId,
            recipientUserId: a.usersByRole[UserRole.GUARDIAN].userId,
            readAt: null,
          },
        }),
      ).toBe(0);
      expect(
        await prisma.notification.count({
          where: {
            institutionId: a.institutionId,
            recipientUserId: a.usersByRole[UserRole.TEACHER].userId,
            readAt: null,
          },
        }),
      ).toBe(1);
    });

    it('round-trips notification preferences for the caller only', async () => {
      const guardian = a.usersByRole[UserRole.GUARDIAN];

      const put = await request(app)
        .put('/api/v1/notifications/preferences')
        .set(auth(guardian.token))
        .send({ preferences: [{ type: 'FEE_REMINDER', channel: 'SMS', enabled: false }] });
      expect(put.status).toBe(200);

      const get = await request(app)
        .get('/api/v1/notifications/preferences')
        .set(auth(guardian.token));
      expect(get.status).toBe(200);
      expect(get.body.data).toEqual([{ type: 'FEE_REMINDER', channel: 'SMS', enabled: false }]);

      // A different user in the same tenant has their own (empty) set.
      const other = await request(app)
        .get('/api/v1/notifications/preferences')
        .set(auth(a.usersByRole[UserRole.TEACHER].token));
      expect(other.body.data).toEqual([]);
    });

    it('rejects an invalid preference payload with 422', async () => {
      const res = await request(app)
        .put('/api/v1/notifications/preferences')
        .set(auth(a.usersByRole[UserRole.GUARDIAN].token))
        .send({ preferences: [{ type: 'NOT_A_TYPE', channel: 'EMAIL', enabled: false }] });
      expect(res.status).toBe(422);
    });

    it('requires authentication', async () => {
      expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
    });
  });

  // -- PR3: channels + templates ---------------------------------------------

  describe('email channel + templates', () => {
    const emailJob = (contextId: string, type = 'INVOICE_ISSUED') => ({
      institutionId: a.institutionId,
      type,
      recipientUserId: a.usersByRole[UserRole.GUARDIAN].userId,
      channel: NotificationChannel.EMAIL,
      contextId,
      vars: {
        invoiceNo: contextId,
        studentName: 'Ayesha Rahman',
        amount: '1500.00',
        dueAmount: '0.00',
        dueDate: 'today',
        date: 'today',
      },
      dedupeKey: buildDedupeKey(
        a.institutionId,
        type,
        a.usersByRole[UserRole.GUARDIAN].userId,
        NotificationChannel.EMAIL,
        contextId,
      ),
    });

    it('delivers email through jsonTransport while EMAIL_ENABLED is false', async () => {
      await deliverNotification(emailJob('email-1'));

      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: { dedupeKey: emailJob('email-1').dedupeKey },
      });
      expect(delivery.status).toBe('SENT');
      expect(delivery.providerRef).toBeTruthy();
      // Addressed to the real mailbox, not the user id.
      expect(delivery.recipient).toContain('@');
      // Email delivery must not create an in-app row.
      expect(await prisma.notification.count({ where: { institutionId: a.institutionId } })).toBe(0);
    });

    it('reports no address for a recipient without an email', async () => {
      const { emailChannel } = await import('../src/modules/notifications/channels/email.channel');
      expect(
        emailChannel.addressFor({ userId: 'u', name: 'n', email: null, phone: null }),
      ).toBeNull();
    });

    it('renders the bundled default when the tenant has no override', async () => {
      const rendered = await renderTemplate(a.institutionId, 'INVOICE_ISSUED', 'EMAIL', {
        invoiceNo: 'X-1',
        studentName: 'S',
        amount: '1',
        dueDate: 'today',
        institutionName: 'Inst',
      });
      expect(rendered.subject).toBe('Invoice X-1 from Inst');
    });

    it('prefers a tenant override over the bundled default', async () => {
      await prisma.notificationTemplate.create({
        data: {
          institutionId: a.institutionId,
          key: 'INVOICE_ISSUED',
          channel: NotificationChannel.EMAIL,
          subject: 'Custom: bill {{invoiceNo}}',
          body: 'Custom body for {{studentName}}',
        },
      });

      const rendered = await renderTemplate(a.institutionId, 'INVOICE_ISSUED', 'EMAIL', {
        invoiceNo: 'X-2',
        studentName: 'Rahim',
      });
      expect(rendered.subject).toBe('Custom: bill X-2');
      expect(rendered.body).toBe('Custom body for Rahim');

      // The override belongs to institution A only.
      const otherRendered = await renderTemplate(b.institutionId, 'INVOICE_ISSUED', 'EMAIL', {
        invoiceNo: 'X-3',
        studentName: 'S',
        institutionName: 'B School',
      });
      expect(otherRendered.subject).toBe('Invoice X-3 from B School');
    });

    it('strips control characters from interpolated values', async () => {
      const rendered = await renderTemplate(b.institutionId, 'INVOICE_ISSUED', 'EMAIL', {
        invoiceNo: 'X\r\nBcc: attacker@evil.com',
        studentName: 'S',
        institutionName: 'B',
      });
      expect(rendered.subject).not.toContain('\n');
      expect(rendered.subject).not.toContain('\r');
    });

    it('gates template management on role, not just tenancy', async () => {
      const forbidden = await request(app)
        .get('/api/v1/notifications/templates')
        .set(auth(a.usersByRole[UserRole.TEACHER].token));
      expect(forbidden.status).toBe(403);

      const allowed = await request(app)
        .get('/api/v1/notifications/templates')
        .set(auth(a.usersByRole[UserRole.ADMIN].token));
      expect(allowed.status).toBe(200);
      // Full surface: every (type, channel) pair, flagged by source.
      expect(allowed.body.data.length).toBeGreaterThanOrEqual(12);
      expect(
        allowed.body.data.every((t: { source: string }) =>
          ['tenant', 'default'].includes(t.source),
        ),
      ).toBe(true);
    });

    it('saves a tenant template override through the API', async () => {
      const put = await request(app)
        .put('/api/v1/notifications/templates/FEE_REMINDER/SMS')
        .set(auth(a.usersByRole[UserRole.ADMIN].token))
        .send({ body: 'Due: {{invoiceNo}} Tk {{amount}}' });
      expect(put.status).toBe(200);

      const rendered = await renderTemplate(a.institutionId, 'FEE_REMINDER', 'SMS', {
        invoiceNo: 'F-1',
        amount: '99',
      });
      expect(rendered.body).toBe('Due: F-1 Tk 99');

      const teacherAttempt = await request(app)
        .put('/api/v1/notifications/templates/FEE_REMINDER/SMS')
        .set(auth(a.usersByRole[UserRole.TEACHER].token))
        .send({ body: 'nope' });
      expect(teacherAttempt.status).toBe(403);
    });

    it('rejects an unknown template key with 422', async () => {
      const res = await request(app)
        .put('/api/v1/notifications/templates/NOT_A_TYPE/EMAIL')
        .set(auth(a.usersByRole[UserRole.ADMIN].token))
        .send({ body: 'x' });
      expect(res.status).toBe(422);
    });
  });
});
