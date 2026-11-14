// P1 platform billing — integration tests on the real test database.
// Every provider is mocked or off: SMS disabled (SKIPPED), email in demo mode
// (SKIPPED), gateways mocked with jest.spyOn, global fetch blocked.
import request from 'supertest';
import { UserRole } from '@prisma/client';

jest.mock('../src/queues/notificationQueue', () => ({
  __esModule: true,
  notificationQueue: { add: jest.fn() },
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import app from '../src/app';
import { env } from '../src/config/env';
import { SslCommerzClient } from '../src/modules/billing/gateways/sslcommerz.client';
import * as billingService from '../src/modules/billing/billing.service';
import { md5 } from '../src/modules/fees/gateways/verify';
import * as service from '../src/modules/platformBilling/platformBilling.service';
import * as payments from '../src/modules/platformBilling/platformBilling.payments';
import { runDailyReminders } from '../src/modules/platformBilling/platformBilling.reminders';
import { runBillingCycle } from '../src/modules/platformBilling/platformBilling.scheduler';
import { invalidatePlatformAccess } from '../src/modules/platformBilling/platformBilling.access';
import { payLinkFor } from '../src/modules/platformBilling/platformBilling.shared';
import { addMonths, dhakaMidnight, parsePeriod, periodBounds, periodOf } from '../src/modules/platformBilling/platformBilling.logic';
import { prisma, createTestInstitution, cleanupInstitution, disconnectFixtures, InstitutionFixture } from './helpers/fixtures';

jest.setTimeout(180000);

const DAY = 24 * 60 * 60 * 1000;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const NOW = new Date();
const P0 = periodOf(NOW); // this month
const P1 = addMonths(P0, -1); // last month
const P2 = addMonths(P0, -2); // two months ago
const startOf = (period: string) => new Date(periodBounds(period).start.getTime() + 3 * 60 * 60 * 1000); // 09:00 Dhaka on the 1st

const mockFetch = jest.fn(async () => {
  throw new Error('network is blocked in tests');
});
const realFetch = global.fetch;

let fx: InstitutionFixture;
let fx2: InstitutionFixture;
let fx3: InstitutionFixture;
let planId: string;

const sa = () => auth(fx.usersByRole[UserRole.SUPER_ADMIN].token);
const admin = (f: InstitutionFixture = fx) => auth(f.usersByRole[UserRole.ADMIN].token);

async function putProfile(institutionId: string, body: Record<string, unknown>) {
  return request(app).put(`/api/v1/billing/platform-admin/profiles/${institutionId}`).set(sa()).send(body);
}

async function invoiceOf(institutionId: string, period: string) {
  return prisma.platformInvoice.findUniqueOrThrow({ where: { institutionId_period: { institutionId, period } } });
}

const writeProbe = (token: string) => request(app).post('/api/v1/notifications/read-all').set(auth(token));

beforeAll(async () => {
  global.fetch = mockFetch as unknown as typeof fetch;
  fx = await createTestInstitution(`p1a-${Date.now()}`);
  fx2 = await createTestInstitution(`p1b-${Date.now()}`);
  fx3 = await createTestInstitution(`p1c-${Date.now()}`);
  // fx: 1 fixture student + 2 more active, 1 inactive, 1 trashed → 3 billable.
  for (const [i, extra] of [{}, {}, { status: 'INACTIVE' }, { deletedAt: new Date() }].entries()) {
    await prisma.student.create({
      data: { institutionId: fx.institutionId, studentId: `P1-${fx.slug}-${i}`, firstName: 'S', lastName: String(i), ...extra },
    });
  }
  const plan = await prisma.plan.create({ data: { name: `p1-plan-${fx.slug}`, slug: `p1-plan-${fx.slug}` } });
  planId = plan.id;
}, 120000);

afterAll(async () => {
  global.fetch = realFetch;
  // fx's super admin acts on all three schools — drop those audit rows first
  // so each fixture's user cleanup is not blocked by the FK.
  await prisma.auditLog
    .deleteMany({ where: { institutionId: { in: [fx, fx2, fx3].filter(Boolean).map((f) => f.institutionId) } } })
    .catch(() => undefined);
  for (const f of [fx, fx2, fx3]) {
    if (!f) continue;
    await prisma.subscription.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
    await prisma.institution.update({ where: { id: f.institutionId }, data: { isActive: true } }).catch(() => undefined);
    await cleanupInstitution(f);
  }
  await prisma.plan.deleteMany({ where: { id: planId } }).catch(() => undefined);
  await disconnectFixtures();
}, 120000);

describe('billing profile + monthly invoice', () => {
  it('only SUPER_ADMIN may set a profile; validation is enforced', async () => {
    const asAdmin = await request(app)
      .put(`/api/v1/billing/platform-admin/profiles/${fx.institutionId}`)
      .set(admin())
      .send({ pricingModel: 'FLAT', flatAmount: 3000, billingStartMonth: P0 });
    expect(asAdmin.status).toBe(403);

    const bad = await putProfile(fx.institutionId, { pricingModel: 'FLAT', billingStartMonth: P0 });
    expect(bad.status).toBe(422);
  });

  it('creates a PER_STUDENT profile (audit-logged)', async () => {
    const res = await putProfile(fx.institutionId, {
      pricingModel: 'PER_STUDENT',
      perStudentRate: 30,
      minimumCharge: 500,
      billingStartMonth: P2,
      firstMonthMode: 'FULL',
      dueDay: 10,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.pricingModel).toBe('PER_STUDENT');
    const audit = await prisma.auditLog.findFirst({ where: { institutionId: fx.institutionId, action: 'PLATFORM_BILLING_PROFILE_CREATE' } });
    expect(audit).not.toBeNull();

    const view = await request(app).get(`/api/v1/billing/platform-admin/profiles/${fx.institutionId}`).set(sa());
    expect(view.status).toBe(200);
    expect(view.body.data.activeStudents).toBe(3);
  });

  it('generates one invoice per school per month (idempotent, even concurrently)', async () => {
    const [a, b] = await Promise.all([
      service.generateInvoice(fx.institutionId, P2, { now: startOf(P2) }),
      service.generateInvoice(fx.institutionId, P2, { now: startOf(P2) }),
    ]);
    expect([a.status, b.status].sort()).toEqual(['created', 'existing']);
    expect(a.invoiceId).toBe(b.invoiceId);

    const inv = await invoiceOf(fx.institutionId, P2);
    expect(inv.studentCount).toBe(3); // inactive + trashed excluded
    expect(Number(inv.total)).toBe(500); // 3 × 30 = 90 → minimum 500
    expect(inv.invoiceNumber).toMatch(/^PNB-\d{6}-\d{4}$/);
    expect(inv.status).toBe('DUE');

    const again = await service.generateInvoice(fx.institutionId, P2, { now: startOf(P2) });
    expect(again.status).toBe('existing');
    const skipped = await service.generateInvoice(fx.institutionId, addMonths(P2, -1));
    expect(skipped.status).toBe('skipped');
  });

  it('"Generate now" via the API and the daily cycle mark old invoices OVERDUE', async () => {
    const res = await request(app).post('/api/v1/billing/platform-admin/invoices/generate').set(sa()).send({ institutionId: fx.institutionId, period: P0 });
    expect(res.status).toBe(200);
    expect(['created', 'existing']).toContain(res.body.data.status);
    await runBillingCycle(new Date());
    expect((await invoiceOf(fx.institutionId, P2)).status).toBe('OVERDUE');
  });
});

describe('school billing page API', () => {
  it('status: ADMIN sees amounts, other roles only the level', async () => {
    const a = await request(app).get('/api/v1/billing/platform/status').set(admin());
    expect(a.status).toBe(200);
    expect(a.body.data.hasProfile).toBe(true);
    expect(a.body.data.summary.unpaidCount).toBe(2);
    expect(a.body.data.summary.overdueCount).toBe(1);
    const t = await request(app).get('/api/v1/billing/platform/status').set(auth(fx.usersByRole[UserRole.TEACHER].token));
    expect(t.status).toBe(200);
    expect(t.body.data.summary).toBeNull();
  });

  it('invoices are ADMIN-only and tenant-scoped; PDF renders', async () => {
    const list = await request(app).get('/api/v1/billing/platform/invoices').set(admin());
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(2);
    expect((await request(app).get('/api/v1/billing/platform/invoices').set(auth(fx.usersByRole[UserRole.TEACHER].token))).status).toBe(403);

    const inv = await invoiceOf(fx.institutionId, P2);
    const other = await request(app).get(`/api/v1/billing/platform/invoices/${inv.id}`).set(admin(fx2));
    expect(other.status).toBe(404);

    const pdf = await request(app).get(`/api/v1/billing/platform/invoices/${inv.id}/pdf`).set(admin()).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('pay links open only for the school they were sent to', async () => {
    const inv = await invoiceOf(fx.institutionId, P2);
    const token = payLinkFor(fx.institutionId, inv.id).split('/billing/pay/')[1];
    const ok = await request(app).get(`/api/v1/billing/platform/pay-link/${token}`).set(admin());
    expect(ok.status).toBe(200);
    expect(ok.body.data.invoiceId).toBe(inv.id);
    const foreign = await request(app).get(`/api/v1/billing/platform/pay-link/${token}`).set(admin(fx2));
    expect(foreign.status).toBe(400);
  });
});

describe('access levels', () => {
  it('overdue alone does not restrict (auto-restrict is off by default)', async () => {
    invalidatePlatformAccess();
    expect((await writeProbe(fx.usersByRole[UserRole.ADMIN].token)).status).toBe(200);
  });

  it('auto-restricts after N days overdue; paying the overdue bill lifts it', async () => {
    const p = await putProfile(fx.institutionId, {
      pricingModel: 'PER_STUDENT',
      perStudentRate: 30,
      minimumCharge: 500,
      billingStartMonth: P2,
      firstMonthMode: 'FULL',
      autoRestrictAfterDays: 5,
    });
    expect(p.status).toBe(200);
    const blocked = await writeProbe(fx.usersByRole[UserRole.TEACHER].token);
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('SUBSCRIPTION_INACTIVE');
    expect(blocked.body.reason).toBe('PLATFORM_BILLING');
    // Reads still work at RESTRICTED.
    expect((await request(app).get('/api/v1/notifications').set(admin())).status).toBe(200);

    const inv = await invoiceOf(fx.institutionId, P2);
    const url = `/api/v1/billing/platform-admin/invoices/${inv.id}/payments`;
    const tooMuch = await request(app).post(url).set(sa()).send({ method: 'CASH', amount: 600 });
    expect(tooMuch.status).toBe(400);
    const part = await request(app).post(url).set(sa()).send({ method: 'BANK_TRANSFER', amount: 200, reference: 'DBBL-123', notify: false });
    expect(part.status).toBe(201);
    expect(part.body.data.receiptNumber).toMatch(/^PNR-/);
    expect((await writeProbe(fx.usersByRole[UserRole.ADMIN].token)).status).toBe(402); // still overdue

    const rest = await request(app).post(url).set(sa()).send({ method: 'CASH', amount: 300, notify: false });
    expect(rest.status).toBe(201);
    const paid = await invoiceOf(fx.institutionId, P2);
    expect(paid.status).toBe('PAID');
    expect(Number(paid.paidAmount)).toBe(500);
    expect((await writeProbe(fx.usersByRole[UserRole.ADMIN].token)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { institutionId: fx.institutionId, action: 'PLATFORM_PAYMENT_MANUAL' } })).toBe(2);
  });

  it('two manual payments at the same moment can never overpay', async () => {
    await service.generateInvoice(fx3.institutionId, P0).catch(() => undefined);
    await putProfile(fx3.institutionId, { pricingModel: 'FLAT', flatAmount: 1000, billingStartMonth: P0, firstMonthMode: 'FULL' });
    const g = await service.generateInvoice(fx3.institutionId, P0);
    const url = `/api/v1/billing/platform-admin/invoices/${g.invoiceId}/payments`;
    const [a, b] = await Promise.all([
      request(app).post(url).set(sa()).send({ method: 'CASH', amount: 700, notify: false }),
      request(app).post(url).set(sa()).send({ method: 'CASH', amount: 700, notify: false }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(Number((await invoiceOf(fx3.institutionId, P0)).paidAmount)).toBe(700);
  });

  it('owner override: reason required; RESTRICTED lifts after payment unless "keep"', async () => {
    const noReason = await request(app).put(`/api/v1/billing/platform-admin/profiles/${fx.institutionId}/override`).set(sa()).send({ level: 'RESTRICTED' });
    expect(noReason.status).toBe(422);

    const set = await request(app)
      .put(`/api/v1/billing/platform-admin/profiles/${fx.institutionId}/override`)
      .set(sa())
      .send({ level: 'RESTRICTED', reason: 'Not answering calls', keep: false });
    expect(set.status).toBe(200);
    expect((await writeProbe(fx.usersByRole[UserRole.ADMIN].token)).status).toBe(402);
    // Billing writes stay open while restricted.
    const checkout = await request(app).post('/api/v1/billing/platform/checkout').set(admin()).send({});
    expect(checkout.status).toBe(422);

    // Pay this month's bill through the demo checkout → override lifts.
    const current = await invoiceOf(fx.institutionId, P0);
    const start = await request(app).post('/api/v1/billing/platform/checkout').set(admin()).send({ gateway: 'BKASH', invoiceId: current.id });
    expect(start.status).toBe(200);
    expect(start.body.data.demo).toBe(true);
    const confirm = await request(app)
      .post(`/api/v1/billing/platform/payments/${start.body.data.paymentId}/demo-confirm`)
      .set(admin())
      .send({ outcome: 'success' });
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.status).toBe('SUCCESS');
    expect((await invoiceOf(fx.institutionId, P0)).status).toBe('PAID');
    expect((await prisma.institutionBillingProfile.findUniqueOrThrow({ where: { institutionId: fx.institutionId } })).accessOverride).toBeNull();
    expect((await writeProbe(fx.usersByRole[UserRole.ADMIN].token)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { institutionId: fx.institutionId, action: 'PLATFORM_ACCESS_OVERRIDE_LIFTED' } })).toBe(1);
  });

  it('DISABLED: everything blocked except billing + auth; "keep" survives payment; SUPER_ADMIN never blocked', async () => {
    await service.generateInvoice(fx.institutionId, P1, { now: startOf(P1) });
    const set = await request(app)
      .put(`/api/v1/billing/platform-admin/profiles/${fx.institutionId}/override`)
      .set(sa())
      .send({ level: 'DISABLED', reason: 'Refused to pay', keep: true });
    expect(set.status).toBe(200);

    for (const role of [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT]) {
      const r = await request(app).get('/api/v1/notifications').set(auth(fx.usersByRole[role].token));
      expect(r.status).toBe(402);
      expect(r.body.code).toBe('ACCOUNT_DISABLED');
    }
    const status = await request(app).get('/api/v1/billing/platform/status').set(auth(fx.usersByRole[UserRole.TEACHER].token));
    expect(status.status).toBe(200);
    expect(status.body.data.accessLevel).toBe('DISABLED');
    expect((await request(app).get('/api/v1/billing/platform/invoices').set(admin())).status).toBe(200);
    const asSa = await request(app).get('/api/v1/notifications').set(sa()).set('x-institution-id', fx.institutionId);
    expect(asSa.status).not.toBe(402);

    const inv = await invoiceOf(fx.institutionId, P1);
    const pay = await request(app).post(`/api/v1/billing/platform-admin/invoices/${inv.id}/payments`).set(sa()).send({ method: 'BKASH_PERSONAL', amount: Number(inv.total), reference: 'TRX9', notify: false });
    expect(pay.status).toBe(201);
    expect((await request(app).get('/api/v1/notifications').set(admin())).status).toBe(402); // kept

    const clear = await request(app).put(`/api/v1/billing/platform-admin/profiles/${fx.institutionId}/override`).set(sa()).send({ level: null });
    expect(clear.status).toBe(200);
    expect((await request(app).get('/api/v1/notifications').set(admin())).status).toBe(200);
  });

  it('precedence: a billing profile replaces the legacy subscription status', async () => {
    await prisma.subscription.create({ data: { institutionId: fx.institutionId, planId, billingCycle: 'MONTHLY', status: 'EXPIRED' } });
    invalidatePlatformAccess();
    expect((await writeProbe(fx.usersByRole[UserRole.ADMIN].token)).status).toBe(200);
    // fx2 has no profile yet → legacy EXPIRED still restricts it.
    await prisma.subscription.create({ data: { institutionId: fx2.institutionId, planId, billingCycle: 'MONTHLY', status: 'EXPIRED' } });
    expect((await writeProbe(fx2.usersByRole[UserRole.ADMIN].token)).status).toBe(402);
    await prisma.subscription.deleteMany({ where: { institutionId: { in: [fx.institutionId, fx2.institutionId] } } });
  });

  it('a switched-off (hard-suspended) school can still reach billing', async () => {
    await prisma.institution.update({ where: { id: fx2.institutionId }, data: { isActive: false } });
    invalidatePlatformAccess();
    const st = await request(app).get('/api/v1/billing/platform/status').set(admin(fx2));
    expect(st.status).toBe(200);
    expect(st.body.data.accessLevel).toBe('DISABLED');
    expect(st.body.data.reason).toBe('SUSPENDED');
    const other = await request(app).get('/api/v1/notifications').set(admin(fx2));
    expect(other.status).toBe(402);
    expect(other.body.code).toBe('ACCOUNT_DISABLED');
    await prisma.institution.update({ where: { id: fx2.institutionId }, data: { isActive: true } });
  });
});

describe('online payments', () => {
  let invId: string;
  beforeAll(async () => {
    await putProfile(fx2.institutionId, { pricingModel: 'FLAT', flatAmount: 3000, billingStartMonth: P1, firstMonthMode: 'FULL', billingPhone: '01712345678' });
    await service.generateInvoice(fx2.institutionId, P1, { now: startOf(P1) });
    invId = (await service.generateInvoice(fx2.institutionId, P0)).invoiceId!;
  });

  it('demo checkout pays one invoice; a second confirm is a no-op; receipt PDF + notice', async () => {
    const start = await request(app).post('/api/v1/billing/platform/checkout').set(admin(fx2)).send({ gateway: 'SSLCOMMERZ', invoiceId: invId });
    expect(start.status).toBe(200);
    expect(start.body.data.demo).toBe(true);
    expect(start.body.data.amount).toBe(3000);
    const pid = start.body.data.paymentId as string;
    const view = await request(app).get(`/api/v1/billing/platform/payments/${pid}`).set(admin(fx2));
    expect(view.body.data.demoAllowed).toBe(true);

    const c1 = await request(app).post(`/api/v1/billing/platform/payments/${pid}/demo-confirm`).set(admin(fx2)).send({ outcome: 'success' });
    expect(c1.body.data.status).toBe('SUCCESS');
    const c2 = await request(app).post(`/api/v1/billing/platform/payments/${pid}/demo-confirm`).set(admin(fx2)).send({ outcome: 'success' });
    expect(c2.body.data.alreadyProcessed).toBe(true);
    expect(Number((await prisma.platformInvoice.findUniqueOrThrow({ where: { id: invId } })).paidAmount)).toBe(3000);

    const pdf = await request(app).get(`/api/v1/billing/platform/payments/${pid}/receipt.pdf`).set(admin(fx2));
    expect(pdf.status).toBe(200);

    // Confirmation notice is recorded honestly (SMS off → SKIPPED; email demo → SKIPPED).
    let logs: Array<{ channel: string; result: string }> = [];
    for (let i = 0; i < 20 && logs.length < 2; i += 1) {
      await new Promise((r) => setTimeout(r, 150));
      logs = await prisma.platformReminderLog.findMany({ where: { institutionId: fx2.institutionId, kind: 'RECEIPT' } });
    }
    expect(logs.map((l) => l.channel).sort()).toEqual(['EMAIL', 'SMS']);
    expect(logs.every((l) => l.result === 'SKIPPED')).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('"pay all" covers every unpaid invoice; crediting is idempotent and replay-safe', async () => {
    const start = await request(app).post('/api/v1/billing/platform/checkout').set(admin(fx2)).send({ gateway: 'BKASH', payAll: true });
    expect(start.status).toBe(200);
    expect(start.body.data.amount).toBe(3000); // only last month's is still unpaid
    const pid = start.body.data.paymentId as string;
    const ref = `TRX-${Date.now()}`;
    const [a, b] = await Promise.all([
      payments.creditPlatformPayment(pid, { gatewayRef: ref, raw: { test: 1 } }),
      payments.creditPlatformPayment(pid, { gatewayRef: ref, raw: { test: 2 } }),
    ]);
    expect([a.credited, b.credited].filter(Boolean)).toHaveLength(1);
    expect((await invoiceOf(fx2.institutionId, P1)).status).toBe('PAID');

    // The same gateway reference can never credit a second payment.
    const other = await prisma.platformPayment.create({
      data: { institutionId: fx2.institutionId, method: 'BKASH', amount: '10.00', status: 'PENDING', gatewayTransactionId: `T${Date.now()}` },
    });
    const replay = await payments.creditPlatformPayment(other.id, { gatewayRef: ref, raw: {} });
    expect(replay.credited).toBe(false);
    expect((await prisma.platformPayment.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('PENDING');

    const nothing = await request(app).post('/api/v1/billing/platform/checkout').set(admin(fx2)).send({ gateway: 'BKASH', payAll: true });
    expect(nothing.status).toBe(400);
  });

  describe('live SSLCommerz callbacks (gateway mocked)', () => {
    const e = env as unknown as Record<string, unknown>;
    const saved = { enabled: e.SSLCOMMERZ_ENABLED, id: e.SSLCOMMERZ_STORE_ID, pass: e.SSLCOMMERZ_STORE_PASSWORD };
    let initSpy: jest.SpyInstance;
    let validateSpy: jest.SpyInstance;

    beforeAll(() => {
      e.SSLCOMMERZ_ENABLED = true;
      e.SSLCOMMERZ_STORE_ID = 'teststore';
      e.SSLCOMMERZ_STORE_PASSWORD = 'storepass';
      initSpy = jest.spyOn(SslCommerzClient, 'initiateSession').mockResolvedValue({ success: true, paymentUrl: 'https://sandbox.example/pay', message: 'OK' });
      validateSpy = jest.spyOn(SslCommerzClient, 'validateTransaction');
    });
    afterAll(() => {
      e.SSLCOMMERZ_ENABLED = saved.enabled;
      e.SSLCOMMERZ_STORE_ID = saved.id;
      e.SSLCOMMERZ_STORE_PASSWORD = saved.pass;
      initSpy.mockRestore();
      validateSpy.mockRestore();
    });

    function signed(payload: Record<string, string>) {
      const keys = Object.keys(payload);
      const fields: Record<string, string> = { ...payload, store_passwd: md5('storepass') };
      const str = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('&');
      return { ...payload, verify_key: keys.join(','), verify_sign: md5(str) };
    }

    it('rejects a bad verify_sign, credits a valid IPN, fails an amount mismatch', async () => {
      const inv = await service.generateInvoice(fx3.institutionId, P1, { now: startOf(P1) });
      // fx3 profile starts at P0 — make it start earlier so P1 can be billed.
      await putProfile(fx3.institutionId, { pricingModel: 'FLAT', flatAmount: 1000, billingStartMonth: P1, firstMonthMode: 'FULL' });
      const g = inv.status === 'skipped' ? await service.generateInvoice(fx3.institutionId, P1, { now: startOf(P1) }) : inv;
      const start = await request(app).post('/api/v1/billing/platform/checkout').set(admin(fx3)).send({ gateway: 'SSLCOMMERZ', invoiceId: g.invoiceId });
      expect(start.status).toBe(200);
      expect(start.body.data.demo).toBe(false);
      const pay = await prisma.platformPayment.findUniqueOrThrow({ where: { id: start.body.data.paymentId } });
      const tranId = pay.gatewayTransactionId!;
      validateSpy.mockClear();

      const forged = await request(app)
        .post('/api/v1/billing/platform-gateway/sslcommerz/ipn')
        .type('form')
        .send({ tran_id: tranId, val_id: 'VAL1', status: 'VALID', verify_key: 'tran_id,val_id', verify_sign: 'deadbeef' });
      expect(forged.status).toBe(200);
      expect(validateSpy).not.toHaveBeenCalled();
      expect((await prisma.platformPayment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe('PENDING');

      validateSpy.mockResolvedValueOnce({ valid: true, amount: 1000, currency: 'BDT', tranId, raw: { val_id: `VAL-${tranId}`, status: 'VALID' } });
      const good = await request(app).post('/api/v1/billing/platform-gateway/sslcommerz/ipn').type('form').send(signed({ tran_id: tranId, val_id: `VAL-${tranId}`, status: 'VALID' }));
      expect(good.status).toBe(200);
      const credited = await prisma.platformPayment.findUniqueOrThrow({ where: { id: pay.id } });
      expect(credited.status).toBe('SUCCESS');
      expect(credited.gatewayValId).toBe(`VAL-${tranId}`);

      // Mismatch: a tampered amount marks the attempt FAILED, money not credited.
      await prisma.platformInvoice.update({ where: { id: g.invoiceId! }, data: { status: 'DUE', paidAmount: '0', paidAt: null } });
      const s2 = await request(app).post('/api/v1/billing/platform/checkout').set(admin(fx3)).send({ gateway: 'SSLCOMMERZ', invoiceId: g.invoiceId });
      const p2 = await prisma.platformPayment.findUniqueOrThrow({ where: { id: s2.body.data.paymentId } });
      validateSpy.mockResolvedValueOnce({ valid: true, amount: 1.0, currency: 'BDT', tranId: p2.gatewayTransactionId!, raw: { val_id: 'VAL-X2' } });
      const redirect = await request(app).post('/api/v1/billing/platform-gateway/sslcommerz/success').type('form').send({ tran_id: p2.gatewayTransactionId!, val_id: 'VAL-X2' });
      expect(redirect.status).toBe(303);
      expect(redirect.headers.location).toContain('payment=failed');
      expect((await prisma.platformPayment.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe('FAILED');
    });

    it('legacy subscription IPN with a bad verify_sign is ignored before validation', async () => {
      validateSpy.mockClear();
      await billingService.handleIpn({ tran_id: 'SUB-x', val_id: 'v', verify_key: 'tran_id,val_id', verify_sign: 'bad' });
      expect(validateSpy).not.toHaveBeenCalled();
    });
  });
});

describe('invoice admin actions, list, export, dashboard', () => {
  let invId: string;
  beforeAll(async () => {
    await prisma.platformInvoice.deleteMany({ where: { institutionId: fx3.institutionId } });
    invId = (await service.generateInvoice(fx3.institutionId, P0)).invoiceId!;
  });

  it('edit lines needs a reason, is audit-logged, and only works on unpaid invoices', async () => {
    const url = `/api/v1/billing/platform-admin/invoices/${invId}/lines`;
    expect((await request(app).patch(url).set(sa()).send({ lines: [{ description: 'Fee', quantity: 1, unitPrice: 900 }] })).status).toBe(422);
    const ok = await request(app)
      .patch(url)
      .set(sa())
      .send({ reason: 'Agreed discount', lines: [{ description: 'Monthly fee', quantity: 1, unitPrice: 1000 }, { description: 'Goodwill', quantity: 1, unitPrice: -100 }] });
    expect(ok.status).toBe(200);
    expect(Number(ok.body.data.total)).toBe(900);
    expect(await prisma.auditLog.count({ where: { action: 'PLATFORM_INVOICE_EDIT', resourceId: invId } })).toBe(1);
  });

  it('waive and cancel need reasons; cancel refuses an invoice with payments', async () => {
    await request(app).post(`/api/v1/billing/platform-admin/invoices/${invId}/payments`).set(sa()).send({ method: 'CASH', amount: 100, notify: false });
    const cancel = await request(app).post(`/api/v1/billing/platform-admin/invoices/${invId}/cancel`).set(sa()).send({ reason: 'Duplicate' });
    expect(cancel.status).toBe(400);
    expect((await request(app).post(`/api/v1/billing/platform-admin/invoices/${invId}/waive`).set(sa()).send({})).status).toBe(422);
    const waive = await request(app).post(`/api/v1/billing/platform-admin/invoices/${invId}/waive`).set(sa()).send({ reason: 'Flood relief' });
    expect(waive.status).toBe(200);
    expect(waive.body.data.status).toBe('WAIVED');
    expect(Number(waive.body.data.waivedAmount)).toBe(800);
    expect(await prisma.auditLog.count({ where: { action: 'PLATFORM_INVOICE_WAIVE', resourceId: invId } })).toBe(1);
  });

  it('lists, exports and summarises across schools (SUPER_ADMIN only)', async () => {
    const list = await request(app).get(`/api/v1/billing/platform-admin/invoices?institutionId=${fx.institutionId}`).set(sa());
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(3);
    const csv = await request(app).get(`/api/v1/billing/platform-admin/invoices/export?institutionId=${fx.institutionId}&format=csv`).set(sa());
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain((await invoiceOf(fx.institutionId, P2)).invoiceNumber);
    const dash = await request(app).get('/api/v1/billing/platform-admin/dashboard').set(sa());
    expect(dash.status).toBe(200);
    expect(dash.body.data.months).toHaveLength(12);
    expect(typeof dash.body.data.outstanding).toBe('number');
    expect((await request(app).get('/api/v1/billing/platform-admin/dashboard').set(admin())).status).toBe(403);
  });
});

describe('reminders', () => {
  let inv: { id: string; dueDate: Date };
  const at = (base: Date, days: number) => new Date(base.getTime() + days * DAY + 4 * 60 * 60 * 1000); // ~10:00 Dhaka

  beforeAll(async () => {
    // A future month so nothing else in this file interferes.
    const P = addMonths(P0, 2);
    await putProfile(fx3.institutionId, { pricingModel: 'FLAT', flatAmount: 1000, billingStartMonth: P1, firstMonthMode: 'FULL', billingPhone: '01812345678' });
    const { year, month } = parsePeriod(P);
    const g = await service.generateInvoice(fx3.institutionId, P, { now: dhakaMidnight(year, month, 1) });
    inv = await prisma.platformInvoice.findUniqueOrThrow({ where: { id: g.invoiceId! } });
  });

  const logsFor = () => prisma.platformReminderLog.findMany({ where: { invoiceId: inv.id }, orderBy: { createdAt: 'asc' } });

  it('daily before the due day — honest SKIPPED results, once per day', async () => {
    const s1 = await runDailyReminders(at(inv.dueDate, -3), { onlyInvoiceId: inv.id });
    expect(s1.invoices).toBe(1);
    const logs = await logsFor();
    expect(logs.map((l) => `${l.kind}:${l.channel}`).sort()).toEqual(['UPCOMING:EMAIL', 'UPCOMING:SMS']);
    const sms = logs.find((l) => l.channel === 'SMS')!;
    expect(sms.result).toBe('SKIPPED');
    expect(sms.providerResponse).toMatch(/disabled/i);
    expect(sms.recipient).not.toContain('1812345678'); // masked
    const s2 = await runDailyReminders(at(inv.dueDate, -3), { onlyInvoiceId: inv.id });
    expect(s2.duplicates).toBe(2);
    expect(await logsFor()).toHaveLength(2);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('final notice on the due day, nothing the day after next, overdue every 3 days', async () => {
    await runDailyReminders(at(inv.dueDate, 0), { onlyInvoiceId: inv.id });
    await runDailyReminders(at(inv.dueDate, 2), { onlyInvoiceId: inv.id });
    await runDailyReminders(at(inv.dueDate, 4), { onlyInvoiceId: inv.id });
    const kinds = (await logsFor()).filter((l) => l.channel === 'SMS').map((l) => l.kind);
    expect(kinds).toEqual(['UPCOMING', 'FINAL', 'OVERDUE']);
  });

  it('a paid invoice gets no reminder; SMS off sends no SMS', async () => {
    await prisma.institutionBillingProfile.update({ where: { institutionId: fx3.institutionId }, data: { remindSms: false } });
    await runDailyReminders(at(inv.dueDate, 7), { onlyInvoiceId: inv.id });
    const overdue = (await logsFor()).filter((l) => l.kind === 'OVERDUE');
    expect(overdue.filter((l) => l.channel === 'SMS')).toHaveLength(1); // only the day-4 SMS
    expect(overdue.filter((l) => l.channel === 'EMAIL')).toHaveLength(2); // day 4 + day 7
    await prisma.platformInvoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAmount: '1000' } });
    const s = await runDailyReminders(at(inv.dueDate, 10), { onlyInvoiceId: inv.id });
    expect(s.invoices).toBe(0);
  });
});

describe('collections board', () => {
  it('logs calls with outcome, follow-up and assignee; board + timeline show them', async () => {
    const url = `/api/v1/billing/platform-admin/collections/${fx2.institutionId}/activities`;
    expect((await request(app).post(url).set(sa()).send({ type: 'CALL' })).status).toBe(422);
    // Make fx2 owe something again.
    const P = addMonths(P0, 1);
    await service.generateInvoice(fx2.institutionId, P, { now: startOf(P) });
    const saId = fx.usersByRole[UserRole.SUPER_ADMIN].userId;
    const followUp = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
    const call = await request(app)
      .post(url)
      .set(sa())
      .send({ type: 'CALL', callOutcome: 'NO_ANSWER', body: 'Rang twice', nextFollowUpAt: followUp, assigneeUserId: saId });
    expect(call.status).toBe(201);
    const promise = await request(app).post(url).set(sa()).send({ type: 'PROMISE_TO_PAY', promiseDate: followUp, body: 'Will pay by bKash' });
    expect(promise.status).toBe(201);

    const board = await request(app).get('/api/v1/billing/platform-admin/collections?assignee=me').set(sa());
    expect(board.status).toBe(200);
    const row = board.body.data.rows.find((r: { institutionId: string }) => r.institutionId === fx2.institutionId);
    expect(row).toBeDefined();
    expect(row.amountDue).toBe(3000);
    expect(row.nextFollowUpAt).not.toBeNull();
    expect(row.promiseDate).not.toBeNull();
    expect(row.lastContactAt).not.toBeNull();

    const tl = await request(app).get(`/api/v1/billing/platform-admin/collections/${fx2.institutionId}`).set(sa());
    expect(tl.status).toBe(200);
    const kinds = new Set(tl.body.data.timeline.map((t: { kind: string }) => t.kind));
    expect(kinds.has('ACTIVITY')).toBe(true);
    expect(kinds.has('REMINDER')).toBe(true); // the payment confirmations from earlier
    expect((await request(app).get('/api/v1/billing/platform-admin/collections').set(admin(fx2))).status).toBe(403);
  });
});
