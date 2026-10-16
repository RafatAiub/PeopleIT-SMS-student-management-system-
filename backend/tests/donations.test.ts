import request from 'supertest';
import app from '../src/app';
import { clearModuleCache } from '../src/modules/institution/modules.service';
import { applyDonationVerification, creditDonation } from '../src/modules/donations/donations.public.service';
import { createTestInstitution, cleanupInstitution, disconnectFixtures, prisma, type InstitutionFixture } from './helpers/fixtures';

// =============================================================================
// T1 donations — API + DB behaviour against a real Postgres copy.
// Run with email/SMS/gateways neutralised, e.g.:
//   DATABASE_URL=…/sms_track_t0 BREVO_API_KEY= EMAIL_ENABLED=false SMS_ENABLED=false \
//   SSLCOMMERZ_STORE_ID= BKASH_APP_KEY= NAGAD_MERCHANT_ID= npx jest tests/donations.test.ts
// =============================================================================

// Force demo checkout regardless of what .env holds (config is read at call time).
for (const k of ['SSLCOMMERZ_STORE_ID', 'SSLCOMMERZ_STORE_PASSWORD', 'BKASH_APP_KEY', 'BKASH_APP_SECRET', 'NAGAD_MERCHANT_ID']) delete process.env[k];
process.env.FEE_DEMO_PAYMENTS_ENABLED = 'true';

const year = new Date().getUTCFullYear();

describe('T1 donations', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;
  let siteId: string;

  const auth = (f: InstitutionFixture, role: keyof InstitutionFixture['usersByRole'] = 'ADMIN') => ({
    Authorization: `Bearer ${f.usersByRole[role].token}`,
  });
  const api = {
    get: (f: InstitutionFixture, path: string, role: keyof InstitutionFixture['usersByRole'] = 'ADMIN') =>
      request(app).get(`/api/v1/donations${path}`).set(auth(f, role)),
    post: (f: InstitutionFixture, path: string, body: object, role: keyof InstitutionFixture['usersByRole'] = 'ADMIN') =>
      request(app).post(`/api/v1/donations${path}`).set(auth(f, role)).send(body),
    put: (f: InstitutionFixture, path: string, body: object) => request(app).put(`/api/v1/donations${path}`).set(auth(f)).send(body),
  };
  const enable = async (f: InstitutionFixture, on: boolean) => {
    const res = await request(app).put('/api/v1/institution/modules').set(auth(f)).send({ modules: { 'islamic.donations': on } });
    expect(res.status).toBe(200);
  };

  beforeAll(async () => {
    a = await createTestInstitution('don-a');
    b = await createTestInstitution('don-b');
    const site = await prisma.site.create({
      data: { institutionId: a.institutionId, subdomain: `don-${Date.now()}`, theme: {}, navigation: {}, settings: {}, status: 'PUBLISHED', publishedAt: new Date() },
    });
    siteId = site.id;
  }, 60_000);

  afterAll(async () => {
    for (const f of [a, b]) {
      const where = { institutionId: f.institutionId };
      await prisma.donation.deleteMany({ where }).catch(() => undefined);
      await prisma.recurringDonation.deleteMany({ where }).catch(() => undefined);
      await prisma.donationDisbursement.deleteMany({ where }).catch(() => undefined);
      await prisma.donationCampaign.deleteMany({ where }).catch(() => undefined);
      await prisma.donor.deleteMany({ where }).catch(() => undefined);
      await prisma.donationFund.deleteMany({ where }).catch(() => undefined);
    }
    await prisma.site.deleteMany({ where: { id: siteId } }).catch(() => undefined);
    await cleanupInstitution(a);
    await cleanupInstitution(b);
    await disconnectFixtures();
  });

  // ── Gating ─────────────────────────────────────────────────────────────────

  it('module off (the default) → 403 MODULE_DISABLED on admin and guardian routes, 404 publicly', async () => {
    const res = await api.get(a, '/funds');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_DISABLED');
    expect((await api.get(a, '/mine', 'GUARDIAN')).body.code).toBe('MODULE_DISABLED');
    const pub = await request(app).get(`/api/v1/public/sites/${siteId}/donations/options`);
    expect(pub.status).toBe(404);
  });

  let zakatA: string;
  let sadaqahA: string;
  let fundB: string;

  it('after switching on, ADMIN and ACCOUNTANT manage funds; TEACHER/GUARDIAN cannot', async () => {
    await enable(a, true);
    await enable(b, true);

    const z = await api.post(a, '/funds', { name: 'Zakat Fund', nameBn: 'যাকাত ফান্ড', type: 'ZAKAT', showOnWebsite: true, goalAmount: 100000 });
    expect(z.status).toBe(201);
    zakatA = z.body.data.id;
    const s = await api.post(a, '/funds', { name: 'Sadaqah', type: 'SADAQAH', showOnWebsite: true }, 'ACCOUNTANT');
    expect(s.status).toBe(201);
    sadaqahA = s.body.data.id;
    fundB = (await api.post(b, '/funds', { name: 'B General', type: 'GENERAL' })).body.data.id;

    expect((await api.get(a, '/funds', 'TEACHER')).status).toBe(403);
    expect((await api.post(a, '/funds', { name: 'x' }, 'GUARDIAN')).status).toBe(403);
  });

  it('is tenant-isolated: B cannot see or touch A’s funds, donors or donations', async () => {
    const listB = await api.get(b, '/funds');
    expect(listB.body.data.map((f: { id: string }) => f.id)).toEqual([fundB]);
    expect((await api.put(b, `/funds/${zakatA}`, { name: 'hijack' })).status).toBe(404);
    // Recording into another school's fund is refused.
    const cross = await api.post(b, '/records', { fundId: zakatA, donorName: 'X', amount: 10, method: 'CASH' });
    expect(cross.status).toBe(404);
  });

  // ── Receipts ───────────────────────────────────────────────────────────────

  it('numbers receipts DON-<year>-000001… per school, gap-free even when recorded concurrently', async () => {
    const first = await api.post(a, '/records', { fundId: zakatA, donorName: 'Walk-in', amount: 10000, method: 'CASH' });
    expect(first.status).toBe(201);
    expect(first.body.data.receiptNo).toBe(`DON-${year}-000001`);
    expect(first.body.data.status).toBe('PAID');

    const burst = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => api.post(a, '/records', { fundId: sadaqahA, donorName: `Donor ${i}`, amount: 100 * i, method: 'BKASH' })),
    );
    for (const r of burst) expect(r.status).toBe(201);
    const nos = burst.map((r) => r.body.data.receiptNo).sort();
    expect(nos).toEqual([2, 3, 4, 5, 6].map((n) => `DON-${year}-${String(n).padStart(6, '0')}`));

    // School B starts its own sequence.
    const bFirst = await api.post(b, '/records', { fundId: fundB, donorName: 'B donor', amount: 50, method: 'CASH' });
    expect(bFirst.body.data.receiptNo).toBe(`DON-${year}-000001`);
  });

  it('printable receipt carries words in English and Bangla', async () => {
    const list = await api.get(a, `/records?fundId=${zakatA}`);
    const id = list.body.data[0].id;
    const r = await api.get(a, `/records/${id}/receipt`);
    expect(r.status).toBe(200);
    expect(r.body.data.amountInWords).toEqual({ en: 'Ten Thousand Taka Only', bn: 'দশ হাজার টাকা মাত্র' });
    expect(r.body.data.fund.nameBn).toBe('যাকাত ফান্ড');
    // B can't print A's receipt.
    expect((await api.get(b, `/records/${id}/receipt`)).status).toBe(404);
  });

  // ── Zakat balance ──────────────────────────────────────────────────────────

  it('Zakat balance = collected − distributed; payouts can’t exceed it; refunds drop out', async () => {
    await api.post(a, '/records', { fundId: zakatA, donorName: 'Second', amount: 2500.5, method: 'BANK' });
    const toRefund = await api.post(a, '/records', { fundId: zakatA, donorName: 'Refund me', amount: 999, method: 'CASH' });
    const refunded = await api.post(a, `/records/${toRefund.body.data.id}/refund`, { reason: 'Given by mistake' });
    expect(refunded.body.data.status).toBe('REFUNDED');
    expect((await api.post(a, `/records/${toRefund.body.data.id}/refund`, { reason: 'again' })).status).toBe(400);

    const payout = await api.post(a, '/disbursements', { fundId: zakatA, amount: 3000, paidTo: 'Needy family', purpose: 'Food' });
    expect(payout.status).toBe(201);
    const tooMuch = await api.post(a, '/disbursements', { fundId: zakatA, amount: 9500.51, paidTo: 'X' });
    expect(tooMuch.status).toBe(400);

    const rep = await api.get(a, '/reports/summary');
    expect(rep.status).toBe(200);
    // 10000 + 2500.50 collected (999 refunded), 3000 distributed.
    expect(rep.body.data.zakat).toMatchObject({ allTimeCollected: 12500.5, allTimeDistributed: 3000, balance: 9500.5 });
    expect(rep.body.data.byMethod.find((m: { method: string }) => m.method === 'BKASH').total).toBe(1500);
    expect(rep.body.data.byMonth.length).toBeGreaterThan(0);

    const widget = await api.get(a, '/summary', 'ACCOUNTANT');
    expect(widget.body.data.zakat.balance).toBe(9500.5);
  });

  it('exports CSV for the school only', async () => {
    const res = await api.get(a, '/records/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Walk-in');
    expect(res.text).not.toContain('B donor');
  });

  // ── Recurring ──────────────────────────────────────────────────────────────

  it('monthly pledge: due this month → paying it moves the due date a month on', async () => {
    const donor = await api.post(a, '/donors', { name: 'Monthly Giver', phone: '01700000001' });
    expect(donor.status).toBe(201);
    const today = new Date();
    const day = Math.min(28, today.getUTCDate());
    // Start at the beginning of this month so the first due date is this month.
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString();
    const pledge = await api.post(a, '/recurring', { donorId: donor.body.data.id, fundId: sadaqahA, amount: 500, dayOfMonth: day, startDate: start });
    expect(pledge.status).toBe(201);
    const dueBefore = new Date(pledge.body.data.nextDueDate);
    expect(dueBefore.getUTCMonth()).toBe(today.getUTCMonth());

    const due = await api.get(a, '/recurring?dueThisMonth=true');
    expect(due.body.data.map((p: { id: string }) => p.id)).toContain(pledge.body.data.id);

    const paid = await api.post(a, '/records', { fundId: sadaqahA, recurringId: pledge.body.data.id, amount: 500, method: 'CASH' });
    expect(paid.status).toBe(201);
    expect(paid.body.data.donorId).toBe(donor.body.data.id);

    const after = await api.get(a, '/recurring?dueThisMonth=true');
    expect(after.body.data.map((p: { id: string }) => p.id)).not.toContain(pledge.body.data.id);
    const row = await prisma.recurringDonation.findUnique({ where: { id: pledge.body.data.id } });
    expect(row!.nextDueDate.getUTCMonth()).toBe((dueBefore.getUTCMonth() + 1) % 12);

    // A pledge from another school is not usable here.
    const bDonor = await api.post(b, '/donors', { name: 'B giver' });
    const bPledge = await api.post(b, '/recurring', { donorId: bDonor.body.data.id, fundId: fundB, amount: 10, dayOfMonth: 1 });
    expect((await api.post(a, '/records', { fundId: sadaqahA, recurringId: bPledge.body.data.id, amount: 10, method: 'CASH' })).status).toBe(404);
  });

  it('reminders: at most once per pledge per month', async () => {
    const donor = await api.post(a, '/donors', { name: 'Reminder Target', phone: '01700000002' });
    const pledge = await api.post(a, '/recurring', {
      donorId: donor.body.data.id, fundId: sadaqahA, amount: 300, dayOfMonth: 1,
      startDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
      remindEmail: false, remindSms: true,
    });
    const first = await api.post(a, '/recurring/remind', { ids: [pledge.body.data.id] });
    expect(first.status).toBe(200);
    expect(first.body.data.reminded).toBe(1);
    const second = await api.post(a, '/recurring/remind', { ids: [pledge.body.data.id] });
    expect(second.body.data.reminded).toBe(0);
    expect(second.body.data.skipped).toBe(1);
  });

  // ── Guardian portal ────────────────────────────────────────────────────────

  it('guardian sees only donations from their own linked donor profile', async () => {
    const donor = await api.post(a, '/donors', { name: 'Parent Donor', userId: a.usersByRole.GUARDIAN.userId });
    expect(donor.status).toBe(201);
    const d = await api.post(a, '/records', { fundId: sadaqahA, donorId: donor.body.data.id, amount: 750, method: 'CASH' });
    const mine = await api.get(a, '/mine', 'GUARDIAN');
    expect(mine.status).toBe(200);
    expect(mine.body.data.donations.map((x: { id: string }) => x.id)).toEqual([d.body.data.id]);
    expect(mine.body.data.total).toBe(750);
    expect((await api.get(a, `/mine/${d.body.data.id}/receipt`, 'GUARDIAN')).status).toBe(200);
    // Someone else's donation is not theirs to print.
    const other = (await api.get(a, `/records?fundId=${zakatA}`)).body.data[0].id;
    expect((await api.get(a, `/mine/${other}/receipt`, 'GUARDIAN')).status).toBe(404);
    // Linking a user from another school is refused.
    expect((await api.post(a, '/donors', { name: 'x', userId: b.usersByRole.GUARDIAN.userId })).status).toBe(422);
  });

  // ── Public website giving + gateway idempotency ────────────────────────────

  it('public: lists website funds, creates a pending demo donation, demo-pays it once', async () => {
    const opts = await request(app).get(`/api/v1/public/sites/${siteId}/donations/options`);
    expect(opts.status).toBe(200);
    expect(opts.body.data.funds.map((f: { id: string }) => f.id).sort()).toEqual([zakatA, sadaqahA].sort());
    expect(opts.body.data.gateways.length).toBeGreaterThan(0);

    // B's fund is not donatable through A's site.
    const cross = await request(app).post(`/api/v1/public/sites/${siteId}/donations`).send({ fundId: fundB, amount: 100, paymentMethod: 'BKASH' });
    expect(cross.status).toBe(404);

    const created = await request(app)
      .post(`/api/v1/public/sites/${siteId}/donations`)
      .send({ fundId: zakatA, amount: 1234, name: 'Online Donor', phone: '01800000000', paymentMethod: 'BKASH' });
    expect(created.status).toBe(201);
    expect(created.body.data.demo).toBe(true);
    const ref = created.body.data.donation.reference;
    expect(created.body.data.donation.status).toBe('PENDING');
    expect(created.body.data.donation.receiptNo).toBeNull();

    const pay = (outcome: string) => request(app).post(`/api/v1/public/sites/${siteId}/donations/${ref}/demo-pay`).send({ outcome });
    const [p1, p2] = await Promise.all([pay('success'), pay('success')]);
    expect(p1.body.data.donation.status).toBe('PAID');
    expect(p2.body.data.donation.status).toBe('PAID');
    const rows = await prisma.donation.findMany({ where: { reference: ref } });
    expect(rows).toHaveLength(1);
    expect(rows[0].receiptNo).toMatch(new RegExp(`^DON-${year}-\\d{6}$`));
    // A later "fail" can't downgrade it.
    expect((await pay('fail')).body.data.donation.status).toBe('PAID');
    // The online donor became a donor profile.
    expect(await prisma.donor.count({ where: { institutionId: a.institutionId, phone: '01800000000' } })).toBe(1);
  });

  it('gateway crediting is idempotent and rejects a replayed gateway reference', async () => {
    const mk = (tran: string, amount = 500) =>
      prisma.donation.create({
        data: {
          institutionId: a.institutionId, fundId: zakatA, reference: `DN-TEST-${tran}`, amount, method: 'SSLCOMMERZ',
          status: 'PENDING', source: 'ONLINE', gatewayTranId: tran, isDemo: false,
        },
      });
    const d1 = await mk(`T1${Date.now()}`);
    const results = await Promise.all([1, 2, 3].map(() => creditDonation(d1.id, { gatewayRef: `VAL-${d1.id}` })));
    expect(results.filter((r) => r.credited)).toHaveLength(1);
    const paid = await prisma.donation.findUniqueOrThrow({ where: { id: d1.id } });
    expect(paid.status).toBe('PAID');
    expect(paid.receiptNo).toBeTruthy();

    // Same gateway reference presented for a different pending donation → refused.
    const d2 = await mk(`T2${Date.now()}`);
    expect((await creditDonation(d2.id, { gatewayRef: `VAL-${d1.id}` })).credited).toBe(false);
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: d2.id } })).status).toBe('PENDING');

    // Amount tampering → FAILED, never PAID.
    await applyDonationVerification(d2, { reachable: true, success: true, tranId: d2.gatewayTranId!, amount: 5, currency: 'BDT', gatewayRef: 'VAL-x', raw: {} });
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: d2.id } })).status).toBe('FAILED');

    // A verification for someone else's tran id is ignored.
    const d3 = await mk(`T3${Date.now()}`);
    await applyDonationVerification(d3, { reachable: true, success: true, tranId: 'NOT-OURS', amount: 500, currency: 'BDT', gatewayRef: 'VAL-y', raw: {} });
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: d3.id } })).status).toBe('PENDING');
  });

  it('switching the module off again closes the API and the public page', async () => {
    await enable(a, false);
    clearModuleCache();
    expect((await api.get(a, '/funds')).body.code).toBe('MODULE_DISABLED');
    expect((await request(app).get(`/api/v1/public/sites/${siteId}/donations/options`)).status).toBe(404);
    const resolve = await request(app).get(`/api/v1/public/sites/resolve?slug=${(await prisma.site.findUniqueOrThrow({ where: { id: siteId } })).subdomain}`);
    expect(resolve.body.data.site.modules).not.toContain('islamic.donations');
  });
});
