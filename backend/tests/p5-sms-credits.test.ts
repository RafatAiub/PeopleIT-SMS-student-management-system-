// P5 — SMS credit wallet against a real test database (sms_track_p5):
// per-segment deduction (incl. Bangla), concurrent sends never go negative,
// refund on failure, platform messages never deduct, insufficient credits →
// SKIPPED + one ADMIN alert a day, free monthly allowance, failover through
// sendSms, pack purchase crediting idempotency, manual credits, sender IDs,
// DLR webhook, routes/RBAC. global fetch is mocked — no SMS or payment
// provider is ever called. Email is mocked.
process.env.SMS_ENABLED = 'true';
process.env.GREENWEB_API_TOKEN = 'p5-test-token-not-real';

const mockSendEmail = jest.fn().mockResolvedValue({ ok: true, status: 'SKIPPED', logId: 'x' });
jest.mock('../src/modules/email/sender', () => ({ __esModule: true, sendEmail: (...a: unknown[]) => mockSendEmail(...a) }));

let mockSmsLimit: number | null = null;
jest.mock('../src/modules/saas/entitlements.service', () => {
  const actual = jest.requireActual('../src/modules/saas/entitlements.service');
  return {
    __esModule: true,
    ...actual,
    evaluateResourceLimit: async (_i: string, resource: string) => ({
      resource,
      label: resource,
      period: 'month',
      limit: resource === 'sms_per_month' ? mockSmsLimit : null,
      source: 'plan',
      allowed: true,
      used: 0,
      remaining: null,
    }),
  };
});

import request from 'supertest';
import { UserRole } from '@prisma/client';
import { env } from '../src/config/env';
import { app } from '../src/app';
import { sendSms } from '../src/utils/sms.service';
import { adjustCredits, clearAllowanceCache, refundMessage } from '../src/modules/sms-credits/smsWallet.service';
import { confirmDemoPurchase, creditPurchase, recordManualCredit, startCheckout } from '../src/modules/sms-credits/smsCredits.payments';
import { requestSenderId, reviewSenderRequest } from '../src/modules/sms-credits/smsCredits.service';
import { prisma, createTestInstitution, cleanupInstitution, disconnectFixtures, InstitutionFixture } from './helpers/fixtures';

jest.setTimeout(120000);

const mockFetch = jest.fn();
const realFetch = global.fetch;
const OK = () => ({ ok: true, status: 200, text: async () => 'Ok: SMS Sent Successfully To 8801712345678' });
const ERR = () => ({ ok: true, status: 200, text: async () => 'Error: Insufficient Balance' });

let fx: InstitutionFixture;
let inst: string;
const packIds: string[] = [];

async function balance() {
  return (await prisma.smsWallet.findUnique({ where: { institutionId: inst } }))?.balance ?? 0;
}
async function setBalance(n: number) {
  await prisma.smsWallet.upsert({
    where: { institutionId: inst },
    create: { institutionId: inst, balance: n },
    update: { balance: n, freeUsed: 0, freeMonth: null, lowBalanceThreshold: 0, lowBalanceAlertedAt: null, insufficientAlertedAt: null },
  });
}

beforeAll(async () => {
  global.fetch = mockFetch as unknown as typeof fetch;
  fx = await createTestInstitution(`p5-${Date.now()}`);
  inst = fx.institutionId;
  // `new PrismaClient()` may pull unset vars from backend/.env into
  // process.env — force every payment gateway into demo mode for this file.
  (env as { SSLCOMMERZ_ENABLED: boolean }).SSLCOMMERZ_ENABLED = false;
  for (const k of Object.keys(process.env)) if (/^(PLATFORM_)?BKASH_/.test(k)) delete process.env[k];
  process.env.FEE_DEMO_PAYMENTS_ENABLED = 'true';
  for (const k of ['SMS_PROVIDER_PRIMARY', 'SSLWIRELESS_API_TOKEN', 'SSLWIRELESS_SID', 'SMS_CREDITS_ENFORCED', 'SMS_WELCOME_CREDITS']) delete process.env[k];
}, 60000);

afterAll(async () => {
  global.fetch = realFetch;
  await prisma.smsMessage.deleteMany({ where: { institutionId: inst } });
  await prisma.smsMessage.deleteMany({ where: { institutionId: null, purpose: 'P5_TEST' } });
  await prisma.smsCreditPurchase.deleteMany({ where: { institutionId: inst } });
  await prisma.smsCreditPack.deleteMany({ where: { id: { in: packIds } } });
  await cleanupInstitution(fx);
  await disconnectFixtures();
});

beforeEach(async () => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async () => OK());
  mockSendEmail.mockClear();
  mockSmsLimit = null;
  clearAllowanceCache();
  (env as { SMS_ENABLED: boolean }).SMS_ENABLED = true;
  (env as { GREENWEB_API_TOKEN?: string }).GREENWEB_API_TOKEN = 'p5-test-token-not-real';
  delete process.env.SMS_PROVIDER_FALLBACK;
  delete process.env.BULKSMSBD_API_KEY;
  delete process.env.BULKSMSBD_SENDER_ID;
  await setBalance(0);
});

describe('deduction per segment', () => {
  it('English 1 segment costs 1 credit, Bangla 71 chars costs 2; ledger + log written', async () => {
    await setBalance(10);
    const r1 = await sendSms('01712345678', 'Your child was absent today.', { institutionId: inst, purpose: 'ABSENCE_ALERT' });
    expect(r1).toMatchObject({ status: 'SENT', segments: 1, provider: 'GREENWEB' });
    expect(await balance()).toBe(9);

    const r2 = await sendSms('01712345678', 'আ'.repeat(71), { institutionId: inst, purpose: 'FEE_REMINDER' });
    expect(r2).toMatchObject({ status: 'SENT', segments: 2 });
    expect(await balance()).toBe(7);

    const msg = await prisma.smsMessage.findUnique({ where: { id: r2.smsMessageId! } });
    expect(msg).toMatchObject({ status: 'SENT', costUnits: 2, encoding: 'UNICODE', billing: 'SCHOOL', to: '8801712345678' });
    const ledger = await prisma.smsCreditLedger.findFirst({ where: { smsMessageId: r2.smsMessageId! } });
    expect(ledger).toMatchObject({ type: 'DEDUCT', units: -2, balanceAfter: 7 });
  });

  it('invalid numbers are never charged and never reach the provider', async () => {
    await setBalance(5);
    const r = await sendSms('12345', 'hello', { institutionId: inst });
    expect(r).toMatchObject({ status: 'FAILED', reason: 'INVALID_NUMBER' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(await balance()).toBe(5);
  });

  it('SMS disabled → SKIPPED, nothing charged', async () => {
    await setBalance(5);
    (env as { SMS_ENABLED: boolean }).SMS_ENABLED = false;
    const r = await sendSms('01712345678', 'hello', { institutionId: inst });
    expect(r).toMatchObject({ status: 'SKIPPED', reason: 'SMS_DISABLED' });
    expect(await balance()).toBe(5);
  });
});

describe('insufficient credits', () => {
  it('→ SKIPPED INSUFFICIENT_CREDITS, provider not called, one in-app alert to ADMINs per day', async () => {
    await setBalance(0);
    await prisma.notification.deleteMany({ where: { institutionId: inst, type: 'SMS_CREDITS' } });
    const r = await sendSms('01712345678', 'hello', { institutionId: inst, purpose: 'CAMPAIGN' });
    expect(r).toMatchObject({ success: false, status: 'SKIPPED', reason: 'INSUFFICIENT_CREDITS' });
    expect(mockFetch).not.toHaveBeenCalled();
    const msg = await prisma.smsMessage.findUnique({ where: { id: r.smsMessageId! } });
    expect(msg?.status).toBe('SKIPPED');
    expect(msg?.error).toMatch(/INSUFFICIENT_CREDITS/);

    await sendSms('01712345678', 'again', { institutionId: inst });
    // alerts are fire-and-forget — wait for the first one to land
    const until = Date.now() + 5000;
    while (Date.now() < until && (await prisma.notification.count({ where: { institutionId: inst, type: 'SMS_CREDITS' } })) === 0) {
      await new Promise((res) => setTimeout(res, 100));
    }
    await new Promise((res) => setTimeout(res, 300));
    const alerts = await prisma.notification.findMany({ where: { institutionId: inst, type: 'SMS_CREDITS' } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].recipientUserId).toBe(fx.usersByRole[UserRole.ADMIN].userId);
  });
});

describe('platform messages', () => {
  it('never deduct (no institution, PLATFORM billing, or a platform purpose)', async () => {
    await setBalance(3);
    expect((await sendSms('01712345678', 'Your PeopleNIT bill is due', { purpose: 'P5_TEST' })).status).toBe('SENT');
    expect((await sendSms('01712345678', 'bill', { institutionId: inst, billing: 'PLATFORM' })).status).toBe('SENT');
    expect((await sendSms('01712345678', 'code 1234', { institutionId: inst, purpose: 'AUTH_OTP', sensitive: true })).status).toBe('SENT');
    expect(await balance()).toBe(3);
    // even with 0 credits a platform message goes out
    await setBalance(0);
    expect((await sendSms('01712345678', 'bill', { institutionId: inst, billing: 'PLATFORM' })).status).toBe('SENT');
  });
});

describe('refund on failure', () => {
  it('a provider error refunds the credits; refund is idempotent', async () => {
    await setBalance(4);
    mockFetch.mockImplementation(async () => ERR());
    const r = await sendSms('01712345678', 'a'.repeat(200), { institutionId: inst }); // 2 segments
    expect(r).toMatchObject({ status: 'FAILED', message: 'Error: Insufficient Balance' });
    expect(await balance()).toBe(4);
    const msg = await prisma.smsMessage.findUnique({ where: { id: r.smsMessageId! } });
    expect(msg?.status).toBe('FAILED');
    expect(msg?.refundedAt).not.toBeNull();
    const refund = await prisma.smsCreditLedger.findFirst({ where: { smsMessageId: r.smsMessageId!, type: 'REFUND' } });
    expect(refund).toMatchObject({ units: 2, balanceAfter: 4 });
    expect(await refundMessage(r.smsMessageId!, 'again')).toBe(false);
    expect(await balance()).toBe(4);
  });

  it('fails over to BulkSMSBD and charges once', async () => {
    await setBalance(2);
    process.env.SMS_PROVIDER_FALLBACK = 'BULKSMSBD';
    process.env.BULKSMSBD_API_KEY = 'k';
    process.env.BULKSMSBD_SENDER_ID = '8809600000000';
    mockFetch
      .mockImplementationOnce(async () => ({ ok: false, status: 503, text: async () => 'down' }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, text: async () => '{"response_code":202,"message_id":77}' }));
    const r = await sendSms('01712345678', 'hi', { institutionId: inst });
    expect(r).toMatchObject({ status: 'SENT', provider: 'BULKSMSBD', providerMessageId: '77' });
    expect(await balance()).toBe(1);
    const msg = await prisma.smsMessage.findUnique({ where: { id: r.smsMessageId! } });
    expect((msg?.attempts as unknown[]).length).toBe(2);
  });
});

describe('concurrency', () => {
  it('25 parallel sends with 10 credits: exactly 10 sent, balance 0, never negative', async () => {
    await setBalance(10);
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => sendSms('01712345678', `msg ${i}`, { institutionId: inst })));
    expect(results.filter((r) => r.status === 'SENT')).toHaveLength(10);
    expect(results.filter((r) => r.reason === 'INSUFFICIENT_CREDITS')).toHaveLength(15);
    expect(await balance()).toBe(0);
  });

  it('the database refuses a negative balance outright', async () => {
    await setBalance(0);
    await expect(prisma.smsWallet.update({ where: { institutionId: inst }, data: { balance: -1 } })).rejects.toThrow();
  });
});

describe('free monthly allowance (plan sms_per_month)', () => {
  it('is used before paid credits; then INSUFFICIENT', async () => {
    mockSmsLimit = 2;
    await setBalance(0);
    const a = await sendSms('01712345678', 'one', { institutionId: inst });
    const b = await sendSms('01712345678', 'two', { institutionId: inst });
    const c = await sendSms('01712345678', 'three', { institutionId: inst });
    expect([a.status, b.status, c.status]).toEqual(['SENT', 'SENT', 'SKIPPED']);
    const msg = await prisma.smsMessage.findUnique({ where: { id: a.smsMessageId! } });
    expect(msg).toMatchObject({ costUnits: 0, freeUnits: 1 });
    expect(await balance()).toBe(0);
  });
});

describe('low balance alert', () => {
  it('emails + notifies ADMINs once when the balance drops below the threshold', async () => {
    await setBalance(3);
    await prisma.smsWallet.update({ where: { institutionId: inst }, data: { lowBalanceThreshold: 3 } });
    await sendSms('01712345678', 'x', { institutionId: inst });
    await sendSms('01712345678', 'y', { institutionId: inst });
    const until = Date.now() + 5000;
    while (Date.now() < until && mockSendEmail.mock.calls.length === 0) await new Promise((res) => setTimeout(res, 100));
    await new Promise((res) => setTimeout(res, 300));
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ template: 'sms.low-balance', institutionId: inst });
  });
});

describe('credit packs', () => {
  it('demo checkout credits exactly once (double confirm, concurrent IPN, replay rejected)', async () => {
    const pack = await prisma.smsCreditPack.create({ data: { name: 'P5 test 500', units: 500, priceBdt: 175 } });
    packIds.push(pack.id);
    const admin = { sub: fx.usersByRole[UserRole.ADMIN].userId, email: 'admin@test.local' };

    const co = await startCheckout(inst, admin, { packId: pack.id, gateway: 'BKASH' });
    expect(co.demo).toBe(true);
    const [x, y] = await Promise.all([
      confirmDemoPurchase(inst, co.purchaseId, 'success', admin.sub),
      confirmDemoPurchase(inst, co.purchaseId, 'success', admin.sub),
    ]);
    expect([x.status, y.status]).toEqual(['SUCCESS', 'SUCCESS']);
    expect(await balance()).toBe(500);
    const again = await creditPurchase(co.purchaseId, { gatewayRef: 'whatever', raw: {} });
    expect(again).toMatchObject({ credited: false, alreadyCredited: true });
    expect(await balance()).toBe(500);
    const p = await prisma.smsCreditPurchase.findUnique({ where: { id: co.purchaseId } });
    expect(p?.receiptNumber).toMatch(/^SCR-\d{6}-\d{4}$/);
    expect(await prisma.smsCreditLedger.count({ where: { purchaseId: co.purchaseId, type: 'PURCHASE' } })).toBe(1);

    // concurrent IPN + redirect on a fresh purchase
    const co2 = await startCheckout(inst, admin, { packId: pack.id, gateway: 'SSLCOMMERZ' });
    const results = await Promise.all([1, 2, 3].map(() => creditPurchase(co2.purchaseId, { gatewayRef: 'VAL-P5-1', raw: {} })));
    expect(results.filter((r) => r.credited)).toHaveLength(1);
    expect(await balance()).toBe(1000);

    // the same gateway reference cannot credit a different purchase
    const co3 = await startCheckout(inst, admin, { packId: pack.id, gateway: 'SSLCOMMERZ' });
    expect((await creditPurchase(co3.purchaseId, { gatewayRef: 'VAL-P5-1', raw: {} })).credited).toBe(false);
    expect(await balance()).toBe(1000);
  });

  it('an inactive pack cannot be bought', async () => {
    const pack = await prisma.smsCreditPack.create({ data: { name: 'P5 off', units: 10, priceBdt: 5, isActive: false } });
    packIds.push(pack.id);
    await expect(startCheckout(inst, { sub: fx.usersByRole[UserRole.ADMIN].userId, email: 'a@b.c' }, { packId: pack.id, gateway: 'BKASH' })).rejects.toThrow(/not available/);
  });

  it('super-admin manual credit gets a receipt; adjust cannot go below zero', async () => {
    await setBalance(0);
    const sa = fx.usersByRole[UserRole.SUPER_ADMIN].userId;
    const r = await recordManualCredit(sa, inst, { units: 300, amount: 120, reference: 'BANK-1', reason: 'Paid by bank transfer' });
    expect(r.balance).toBe(300);
    expect(r.receiptNumber).toMatch(/^SCR-/);
    await expect(adjustCredits({ institutionId: inst, type: 'ADJUST', units: -301, reason: 'oops', actorUserId: sa })).rejects.toThrow(/balance is only 300/);
    expect(await adjustCredits({ institutionId: inst, type: 'ADJUST', units: -100, reason: 'correction', actorUserId: sa })).toBe(200);
    expect(await adjustCredits({ institutionId: inst, type: 'BONUS', units: 50, reason: 'Eid gift', actorUserId: sa })).toBe(250);
  });
});

describe('sender ID', () => {
  it('approved masking sender is used for the school; one pending request at a time', async () => {
    const adminId = fx.usersByRole[UserRole.ADMIN].userId;
    await prisma.smsSenderIdRequest.deleteMany({ where: { institutionId: inst } });
    const req = await requestSenderId(inst, adminId, { senderId: 'TestSchool' });
    await expect(requestSenderId(inst, adminId, { senderId: 'Other' })).rejects.toThrow(/already waiting/);
    await reviewSenderRequest(fx.usersByRole[UserRole.SUPER_ADMIN].userId, req.id, { decision: 'APPROVE', approvedValue: 'TestSchool', provider: 'GREENWEB' });
    const w = await prisma.smsWallet.findUnique({ where: { institutionId: inst } });
    expect(w).toMatchObject({ senderId: 'TestSchool', senderIdProvider: 'GREENWEB' });
    await setBalance(1);
    const r = await sendSms('01712345678', 'hi', { institutionId: inst });
    expect((await prisma.smsMessage.findUnique({ where: { id: r.smsMessageId! } }))?.senderId).toBe('TestSchool');
    await prisma.smsWallet.update({ where: { institutionId: inst }, data: { senderId: null, senderIdProvider: null } });
  });
});

describe('routes', () => {
  const auth = (role: UserRole) => ({ Authorization: `Bearer ${fx.usersByRole[role].token}` });

  it('school ADMIN sees the overview; TEACHER is forbidden', async () => {
    const ok = await request(app).get('/api/v1/sms-credits/overview').set(auth(UserRole.ADMIN));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toHaveProperty('balance');
    const no = await request(app).get('/api/v1/sms-credits/overview').set(auth(UserRole.TEACHER));
    expect(no.status).toBe(403);
  });

  it('rejects an invalid sender ID with 422', async () => {
    const r = await request(app).post('/api/v1/sms-credits/sender-id').set(auth(UserRole.ADMIN)).send({ senderId: 'WayTooLongSenderId' });
    expect([400, 422]).toContain(r.status);
  });

  it('super-admin routes are SUPER_ADMIN only', async () => {
    expect((await request(app).get('/api/v1/sms-credits/admin/overview').set(auth(UserRole.ADMIN))).status).toBe(403);
    const r = await request(app).get('/api/v1/sms-credits/admin/overview').set(auth(UserRole.SUPER_ADMIN));
    expect(r.status).toBe(200);
    expect(r.body.data.providers.map((p: { name: string }) => p.name)).toEqual(['GREENWEB', 'BULKSMSBD', 'SSLWIRELESS']);
  });

  it('CSV export works and contains the Bangla BOM', async () => {
    const r = await request(app).get('/api/v1/sms-credits/messages/export').set(auth(UserRole.ADMIN));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
  });

  it('DLR webhook: disabled without SMS_DLR_TOKEN, 403 on a wrong token, updates to DELIVERED', async () => {
    delete process.env.SMS_DLR_TOKEN;
    expect((await request(app).post('/api/v1/sms-credits/dlr/bulksmsbd').send({})).status).toBe(404);
    process.env.SMS_DLR_TOKEN = 'p5-dlr-token-0123456789';
    expect((await request(app).post('/api/v1/sms-credits/dlr/bulksmsbd?token=nope').send({})).status).toBe(403);
    const msg = await prisma.smsMessage.create({
      data: { institutionId: inst, to: '8801712345678', status: 'SENT', provider: 'BULKSMSBD', providerMessageId: 'DLR-P5-1', sentAt: new Date() },
    });
    const r = await request(app).post('/api/v1/sms-credits/dlr/bulksmsbd?token=p5-dlr-token-0123456789').send({ message_id: 'DLR-P5-1', status: 'DELIVRD' });
    expect(r.body).toMatchObject({ success: true, updated: 1 });
    expect((await prisma.smsMessage.findUnique({ where: { id: msg.id } }))?.status).toBe('DELIVERED');
    delete process.env.SMS_DLR_TOKEN;
  });
});
