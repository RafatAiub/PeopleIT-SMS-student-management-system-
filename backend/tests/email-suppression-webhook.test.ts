import { prisma } from '../src/config/prisma';
import { checkSuppressed, suppress, unsuppress } from '../src/modules/email/suppression';
import * as repo from '../src/modules/email/repository';
import { handleBrevoEvent } from '../src/modules/email/webhook/brevo';
import { EmailPriority } from '@prisma/client';

const ALL_EMAIL = `all-suppressed-${Date.now()}@example.com`;
const BULK_EMAIL = `bulk-suppressed-${Date.now()}@example.com`;
const WEBHOOK_EMAIL = `webhook-${Date.now()}@example.com`;

describe('email suppression', () => {
  afterAll(async () => {
    await prisma.emailSuppression.deleteMany({ where: { email: { in: [ALL_EMAIL, BULK_EMAIL, WEBHOOK_EMAIL] } } });
    await prisma.$disconnect();
  });

  it('ALL scope blocks every send, including transactional', async () => {
    await suppress({ email: ALL_EMAIL, scope: 'ALL', reason: 'HARD_BOUNCE', source: 'test' });
    expect((await checkSuppressed(ALL_EMAIL, { isBulk: false })).suppressed).toBe(true);
    expect((await checkSuppressed(ALL_EMAIL, { isBulk: true })).suppressed).toBe(true);
  });

  it('BULK scope only blocks bulk sends, never transactional/security mail', async () => {
    await suppress({ email: BULK_EMAIL, scope: 'BULK', reason: 'UNSUBSCRIBED', source: 'test' });
    expect((await checkSuppressed(BULK_EMAIL, { isBulk: false })).suppressed).toBe(false);
    expect((await checkSuppressed(BULK_EMAIL, { isBulk: true })).suppressed).toBe(true);
  });

  it('an address with no suppression rows is never suppressed', async () => {
    expect((await checkSuppressed(`clean-${Date.now()}@example.com`, { isBulk: true })).suppressed).toBe(false);
  });

  it('is idempotent — suppressing the same (email, scope) twice does not error or duplicate', async () => {
    await suppress({ email: ALL_EMAIL, scope: 'ALL', reason: 'SPAM', source: 'test-again' });
    const rows = await prisma.emailSuppression.findMany({ where: { email: ALL_EMAIL, scope: 'ALL' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('SPAM'); // upsert updates the reason
  });

  it('unsuppress() removes the row', async () => {
    await unsuppress(BULK_EMAIL, 'BULK');
    expect((await checkSuppressed(BULK_EMAIL, { isBulk: true })).suppressed).toBe(false);
  });
});

describe('Brevo webhook — suppression + idempotency', () => {
  let logId: string;

  beforeAll(async () => {
    const log = await repo.createQueuedLog({
      template: 'test.webhook',
      priority: EmailPriority.P1_TRANSACTIONAL,
      toHash: 'x'.repeat(64),
      toMasked: 'we***@example.com',
      subject: 'test',
      tags: [],
    });
    logId = log.id;
  });

  afterAll(async () => {
    await prisma.emailSuppression.deleteMany({ where: { email: WEBHOOK_EMAIL } });
    await prisma.emailLog.deleteMany({ where: { id: logId } });
  });

  it('a hardBounce event suppresses the address (ALL scope) and records lastEvent on the correlated EmailLog', async () => {
    await handleBrevoEvent({ event: 'hardBounce', email: WEBHOOK_EMAIL, 'X-Mailin-custom': logId });

    const suppressed = await checkSuppressed(WEBHOOK_EMAIL, { isBulk: false });
    expect(suppressed.suppressed).toBe(true);
    expect(suppressed.reason).toBe('HARD_BOUNCE');

    const log = await repo.findById(logId);
    expect(log?.lastEvent).toBe('hardBounce');
    expect(log?.lastEventAt).toBeTruthy();
  });

  it('re-delivering the identical event is a no-op (idempotent) — still exactly one suppression row', async () => {
    await handleBrevoEvent({ event: 'hardBounce', email: WEBHOOK_EMAIL, 'X-Mailin-custom': logId });
    const rows = await prisma.emailSuppression.findMany({ where: { email: WEBHOOK_EMAIL } });
    expect(rows).toHaveLength(1);
  });

  it('an unsubscribed event uses BULK scope, not ALL', async () => {
    const email = `webhook-unsub-${Date.now()}@example.com`;
    await handleBrevoEvent({ event: 'unsubscribed', email });
    const rows = await prisma.emailSuppression.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('BULK');
    await prisma.emailSuppression.deleteMany({ where: { email } });
  });

  it('ignores events with no email and events that are not suppression-relevant', async () => {
    await expect(handleBrevoEvent({ event: 'delivered', email: WEBHOOK_EMAIL })).resolves.toEqual({ handled: true });
    await expect(handleBrevoEvent({ event: 'hardBounce' })).resolves.toEqual({ handled: true });
  });
});
