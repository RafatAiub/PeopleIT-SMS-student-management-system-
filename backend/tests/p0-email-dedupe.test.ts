// P0 — email dedupe + honest outcomes. No real email is ever sent: the
// transport module is mocked (dispatch is a jest.fn), and the Redis-backed
// budget/deferred stores are mocked so the suite needs no Redis.
import { EmailPriority, NotificationChannel, UserRole } from '@prisma/client';

const mockDispatch = jest.fn();
let mockMode: 'brevo-api' | 'smtp' | 'demo' = 'brevo-api';
jest.mock('../src/modules/email/transport', () => ({
  __esModule: true,
  currentTransportMode: () => mockMode,
  dispatch: (...args: unknown[]) => mockDispatch(...args),
  getTransport: jest.fn(),
  resetTransport: jest.fn(),
}));
jest.mock('../src/modules/email/budget', () => ({
  __esModule: true,
  reserveBudgetSlot: jest.fn().mockResolvedValue({ allowed: true, source: 'redis' }),
}));
jest.mock('../src/modules/email/deferredStore', () => ({
  __esModule: true,
  stashDeferred: jest.fn().mockResolvedValue(undefined),
  clearDeferred: jest.fn().mockResolvedValue(undefined),
  loadDeferred: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/queues/notificationQueue', () => ({
  __esModule: true,
  notificationQueue: { add: jest.fn() },
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import { sendEmail } from '../src/modules/email/sender';
import { sendDirectMail } from '../src/utils/mailer';
import { emailChannel, emailIdempotencyKey, toSendResult } from '../src/modules/notifications/channels/email.channel';
import { deliverNotification } from '../src/queues/notificationWorker';
import { buildDedupeKey } from '../src/modules/notifications/notifications.service';
import { prisma, createTestInstitution, cleanupInstitution, disconnectFixtures, InstitutionFixture } from './helpers/fixtures';

jest.setTimeout(120000);

const TO = `p0-dedupe-${Date.now()}@test.local`;
const logIds: string[] = [];

describe('P0 email dedupe', () => {
  let fx: InstitutionFixture;

  beforeAll(async () => {
    fx = await createTestInstitution(`p0-email-${Date.now()}`);
  }, 60000);

  afterAll(async () => {
    await prisma.emailLog.deleteMany({ where: { OR: [{ id: { in: logIds } }, { template: { startsWith: 'p0test.' } }] } }).catch(() => undefined);
    await prisma.emailLog.deleteMany({ where: { institutionId: fx.institutionId } }).catch(() => undefined);
    await cleanupInstitution(fx);
    await disconnectFixtures();
  }, 60000);

  beforeEach(() => {
    mockMode = 'brevo-api';
    mockDispatch.mockReset();
    mockDispatch.mockResolvedValue({ ok: true, provider: 'brevo-api', messageId: `m-${Math.random()}` });
  });

  it('sends a second password-reset style direct mail to the same address (no silent dedupe)', async () => {
    const mail = { to: TO, subject: 'Reset your password', text: 'code 1', template: 'p0test.auth.password-reset' };
    await sendDirectMail(mail);
    await sendDirectMail({ ...mail, text: 'code 2' });
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const rows = await prisma.emailLog.findMany({ where: { template: 'p0test.auth.password-reset' } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'SENT')).toBe(true);
    expect(new Set(rows.map((r) => r.idempotencyKey)).size).toBe(2);
  });

  it('sendEmail without a key always sends; with the SAME key only once (retry-safe)', async () => {
    const base = { to: TO, subject: 'Test email', html: '<p>x</p>', text: 'x', priority: EmailPriority.P1_TRANSACTIONAL };
    const a = await sendEmail({ ...base, template: 'p0test.admin.test-send' });
    const b = await sendEmail({ ...base, template: 'p0test.admin.test-send' });
    expect(a.status).toBe('SENT');
    expect(b.status).toBe('SENT');
    expect(a.logId).not.toBe(b.logId);
    expect(mockDispatch).toHaveBeenCalledTimes(2);

    const key = `p0test-key-${Date.now()}`;
    const c = await sendEmail({ ...base, template: 'p0test.keyed', idempotencyKey: key });
    const d = await sendEmail({ ...base, template: 'p0test.keyed', idempotencyKey: key });
    expect(c.logId).toBe(d.logId);
    expect(mockDispatch).toHaveBeenCalledTimes(3);
  });

  it('notification email key is per event (contextId), stable across retries of the same job', () => {
    const k1 = buildDedupeKey('inst', 'INVOICE_ISSUED', 'user1', 'EMAIL', 'inv-1');
    const k2 = buildDedupeKey('inst', 'INVOICE_ISSUED', 'user1', 'EMAIL', 'inv-2');
    const ctx = (dedupeKey: string) => ({ institutionId: 'inst', templateKey: 'INVOICE_ISSUED', dedupeKey });
    expect(emailIdempotencyKey(ctx(k1), 'A@x.com')).toBe(emailIdempotencyKey(ctx(k1), 'a@x.com'));
    expect(emailIdempotencyKey(ctx(k1), 'a@x.com')).not.toBe(emailIdempotencyKey(ctx(k2), 'a@x.com'));
    // No dedupe key: never collapse two sends.
    const noKey = { institutionId: 'inst', templateKey: 'INVOICE_ISSUED' };
    expect(emailIdempotencyKey(noKey, 'a@x.com')).not.toBe(emailIdempotencyKey(noKey, 'a@x.com'));
  });

  it('a second invoice email to the same user is delivered; a retry of the same job is not', async () => {
    const user = { userId: fx.usersByRole[UserRole.GUARDIAN].userId, name: 'G', email: TO };
    const msg = { subject: 'Invoice', body: 'Invoice body' };
    const ctxFor = (contextId: string) => ({
      institutionId: fx.institutionId,
      templateKey: 'INVOICE_ISSUED',
      dedupeKey: buildDedupeKey(fx.institutionId, 'INVOICE_ISSUED', user.userId, 'EMAIL', contextId),
    });
    const r1 = await emailChannel.send(user, msg, ctxFor('inv-A'));
    const r1retry = await emailChannel.send(user, msg, ctxFor('inv-A'));
    const r2 = await emailChannel.send(user, msg, ctxFor('inv-B'));
    expect(r1.ok && r2.ok && r1retry.ok).toBe(true);
    expect(r1.providerRef).toBe(r1retry.providerRef);
    expect(r1.providerRef).not.toBe(r2.providerRef);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it('maps SKIPPED / SUPPRESSED / DEFERRED to a skipped (not sent) result', () => {
    expect(toSendResult({ ok: true, status: 'SENT', logId: 'l' })).toEqual({ ok: true, providerRef: 'l' });
    for (const status of ['SKIPPED', 'SUPPRESSED', 'DEFERRED'] as const) {
      const r = toSendResult({ ok: false, status, logId: 'l', error: 'why' });
      expect(r.ok).toBe(true);
      expect(r.skipped).toMatch(new RegExp(status));
    }
    expect(toSendResult({ ok: false, status: 'FAILED', logId: 'l', error: 'boom' })).toEqual({ ok: false, error: 'boom' });
  });

  it('the notification log records demo-mode email as SKIPPED, never SENT', async () => {
    mockMode = 'demo';
    const recipientUserId = fx.usersByRole[UserRole.GUARDIAN].userId;
    const dedupeKey = buildDedupeKey(fx.institutionId, 'INVOICE_ISSUED', recipientUserId, NotificationChannel.EMAIL, 'p0-demo-1');
    await deliverNotification({
      institutionId: fx.institutionId,
      type: 'INVOICE_ISSUED',
      recipientUserId,
      channel: NotificationChannel.EMAIL,
      contextId: 'p0-demo-1',
      vars: { invoiceNo: 'INV-P0', studentName: 'S', amount: '1', dueDate: 'today' },
      dedupeKey,
    });
    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { dedupeKey } });
    expect(delivery.status).toBe('SKIPPED');
    expect(delivery.error).toMatch(/demo/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe('P0 env: Brevo API key makes SMTP_* optional', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const loadEnv = () => {
    let loaded: { env: { EMAIL_ENABLED: boolean } } | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('../src/config/env');
    });
    return loaded!;
  };

  it('boots with EMAIL_ENABLED=true + BREVO_API_KEY and no SMTP settings', () => {
    process.env.EMAIL_ENABLED = 'true';
    process.env.BREVO_API_KEY = 'xkeysib-test-not-real';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    expect(loadEnv().env.EMAIL_ENABLED).toBe(true);
  });

  it('still fails fast with EMAIL_ENABLED=true and neither Brevo nor SMTP', () => {
    process.env.EMAIL_ENABLED = 'true';
    delete process.env.BREVO_API_KEY;
    delete process.env.SMTP_HOST;
    const exit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => loadEnv()).toThrow('exit 1');
    exit.mockRestore();
    err.mockRestore();
  });
});
