// =============================================================================
// P4 dues dashboard, defaulters, reminders, reports/export and non-payment
// restrictions — API + DB on a real Postgres copy. Run with:
//   SKIP_DOTENV=true DOTENV_CONFIG_PATH=<empty file> BACKGROUND_JOBS=false \
//   DATABASE_URL=…/sms_track_p4 npx jest tests/p4-dues.test.ts
// SMS / email providers are never called: SMS is off (honest SKIPPED) unless
// a test swaps in the mock below.
// =============================================================================
const mockSendSms = jest.fn();
jest.mock('../src/utils/sms.service', () => {
  const actual = jest.requireActual('../src/utils/sms.service');
  return { __esModule: true, ...actual, sendSms: (...a: unknown[]) => mockSendSms(...a) };
});
jest.mock('../src/queues/notificationQueue', () => ({
  __esModule: true,
  notificationQueue: { add: jest.fn() },
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import ExcelJS from 'exceljs';
import request from 'supertest';
import app from '../src/app';
import { sendReminders } from '../src/modules/fee-dues/reminders.service';
import { prisma, createTestInstitution, cleanupInstitution, disconnectFixtures, type InstitutionFixture } from './helpers/fixtures';

jest.setTimeout(180_000);

type Role = keyof InstitutionFixture['usersByRole'];

describe('P4 dues & restrictions', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;
  let s1: string; // fixture student (STUDENT login, GUARDIAN-linked)
  let s2: string;
  let s3: string;
  let s4: string; // trashed
  let classId: string;
  let sectionId: string;
  let tuition: string;
  let transport: string;
  const inv: Record<string, string> = {};

  const auth = (f: InstitutionFixture, role: Role) => ({ Authorization: `Bearer ${f.usersByRole[role].token}` });
  const get = (f: InstitutionFixture, path: string, role: Role = 'ADMIN') => request(app).get(`/api/v1${path}`).set(auth(f, role));
  const put = (f: InstitutionFixture, path: string, body: object, role: Role = 'ADMIN') => request(app).put(`/api/v1${path}`).set(auth(f, role)).send(body);
  const post = (f: InstitutionFixture, path: string, body: object, role: Role = 'ADMIN') => request(app).post(`/api/v1${path}`).set(auth(f, role)).send(body);

  const mkInvoice = async (key: string, studentId: string, total: number, paid: number, dueDate: string, status: string, items?: Array<[string, number]>) => {
    const i = await prisma.invoice.create({
      data: {
        institutionId: a.institutionId, studentId, invoiceNo: `P4-${key}-${a.slug}`.slice(0, 60),
        totalAmount: total, paidAmount: paid, dueAmount: status === 'CANCELLED' ? 0 : total - paid, dueDate: new Date(dueDate), status,
        items: { create: (items ?? [[tuition, total]]).map(([cat, amt]) => ({ feeCategoryId: cat, description: 'Monthly fee', amount: amt, netAmount: amt })) },
      },
    });
    inv[key] = i.id;
    return i.id;
  };

  beforeAll(async () => {
    a = await createTestInstitution('p4-a');
    b = await createTestInstitution('p4-b');
    s1 = a.studentId;
    const branch = await prisma.branch.create({ data: { institutionId: a.institutionId, name: 'Main' } });
    classId = (await prisma.class.create({ data: { branchId: branch.id, name: 'Class 5', level: 5 } })).id;
    sectionId = (await prisma.section.create({ data: { classId, name: 'A' } })).id;
    await prisma.student.update({ where: { id: s1 }, data: { firstName: 'Ayesha', lastName: 'Karim', classId, sectionId, rollNumber: '1' } });
    s2 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `S2-${a.slug}`, firstName: 'Bilal', lastName: 'Hasan', classId, sectionId, rollNumber: '2' } })).id;
    s3 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `S3-${a.slug}`, firstName: 'Chand', lastName: 'Mia', classId, sectionId, rollNumber: '10' } })).id;
    s4 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `S4-${a.slug}`, firstName: 'Trashed', lastName: 'Kid', classId, sectionId, deletedAt: new Date() } })).id;
    await prisma.guardian.update({ where: { id: a.guardianId }, data: { firstName: 'Abdul', lastName: 'Karim', phone: '01711000001', email: 'abdul.p4@test.local' } });
    tuition = (await prisma.feeCategory.create({ data: { institutionId: a.institutionId, name: 'Tuition', amount: 800, frequency: 'MONTHLY' } })).id;
    transport = (await prisma.feeCategory.create({ data: { institutionId: a.institutionId, name: 'Transport', amount: 200, frequency: 'MONTHLY' } })).id;

    await mkInvoice('s1-jan', s1, 1000, 1000, '2026-01-10T00:00:00Z', 'PAID');
    await mkInvoice('s1-feb', s1, 1000, 400, '2026-02-10T00:00:00Z', 'PARTIAL', [[tuition, 800], [transport, 200]]);
    await mkInvoice('s1-mar', s1, 1000, 0, '2026-03-10T00:00:00Z', 'UNPAID');
    await mkInvoice('s1-apr', s1, 1000, 0, '2026-04-10T00:00:00Z', 'CANCELLED');
    await mkInvoice('s2-jan', s2, 500, 0, '2026-01-10T00:00:00Z', 'OVERDUE');
    await mkInvoice('s2-feb', s2, 500, 0, '2026-02-10T00:00:00Z', 'UNPAID');
    const trashedInv = await mkInvoice('s2-mar', s2, 500, 0, '2026-03-10T00:00:00Z', 'UNPAID');
    await prisma.invoice.update({ where: { id: trashedInv }, data: { deletedAt: new Date() } });
    await mkInvoice('s4-jan', s4, 700, 0, '2026-01-10T00:00:00Z', 'UNPAID');

    const admin = a.usersByRole.ADMIN.userId;
    await prisma.payment.createMany({
      data: [
        { invoiceId: inv['s1-jan'], amount: 1000, method: 'CASH', recordedBy: admin, paidAt: new Date('2026-01-05T04:00:00Z'), receiptNo: `RCP-P4-1-${a.slug}`.slice(0, 60) },
        { invoiceId: inv['s1-feb'], amount: 400, method: 'BKASH', recordedBy: admin, paidAt: new Date('2026-02-06T04:00:00Z'), receiptNo: `RCP-P4-2-${a.slug}`.slice(0, 60) },
      ],
    });
    // Login needs a verified email.
    await prisma.user.updateMany({ where: { institutionId: a.institutionId }, data: { emailVerifiedAt: new Date() } });
  }, 120_000);

  afterAll(async () => {
    for (const f of [a, b]) {
      await prisma.studentFeeStatus.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
      await prisma.feeDuesReminderLog.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
      await prisma.feeDuesSettings.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
      await prisma.refreshToken.deleteMany({ where: { user: { institutionId: f.institutionId } } }).catch(() => undefined);
      await prisma.guardianStudent.deleteMany({ where: { student: { institutionId: f.institutionId } } }).catch(() => undefined);
    }
    await cleanupInstitution(a);
    await cleanupInstitution(b);
    await disconnectFixtures();
  });

  beforeEach(() => {
    mockSendSms.mockReset();
    mockSendSms.mockImplementation(jest.requireActual('../src/utils/sms.service').sendSms);
  });

  // ── Grid ────────────────────────────────────────────────────────────────

  it('grid: cells, row totals, column totals and summary (partial / cancelled / trashed handled)', async () => {
    const res = await get(a, `/fee-dues/grid?from=2026-01&to=2026-12&classId=${classId}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.months).toHaveLength(12);
    expect(d.total).toBe(3); // trashed student s4 excluded
    expect(d.rows.map((r: { id: string }) => r.id)).toEqual([s1, s2, s3]); // roll order 1, 2, 10
    const r1 = d.rows[0];
    expect(r1.cells.slice(0, 5).map((c: { status: string }) => c.status)).toEqual(['PAID', 'PARTIAL', 'UNPAID', 'WAIVED', 'NO_INVOICE']);
    expect(r1.cells[1]).toMatchObject({ billed: 1000, paid: 400, due: 600, overdue: true });
    expect(r1.totals).toMatchObject({ billed: 3000, paid: 1400, due: 1600 });
    const r2 = d.rows[1];
    expect(r2.cells[2].status).toBe('NO_INVOICE'); // trashed March invoice hidden
    expect(r2.totals).toMatchObject({ billed: 1000, paid: 0, due: 1000 });
    expect(d.columns[0]).toMatchObject({ month: '2026-01', billed: 1500, paid: 1000, due: 500, studentsWithDues: 1 });
    expect(d.summary).toMatchObject({ students: 3, billed: 4000, collected: 1400, outstanding: 2600, collectionRate: 35, studentsWithDues: 2 });
  });

  it('grid: category filter pro-rates paid; status filter; pagination', async () => {
    const cat = await get(a, `/fee-dues/grid?from=2026-01&to=2026-12&classId=${classId}&feeCategoryId=${transport}`);
    expect(cat.body.data.rows[0].cells[1]).toMatchObject({ billed: 200, paid: 80, due: 120, status: 'PARTIAL' });
    expect(cat.body.data.summary.billed).toBe(200);

    const due = await get(a, `/fee-dues/grid?from=2026-01&to=2026-12&status=DUE&sectionId=${sectionId}`);
    expect(due.body.data.rows.map((r: { id: string }) => r.id)).toEqual([s1, s2]);
    const none = await get(a, `/fee-dues/grid?from=2026-01&to=2026-12&status=NO_INVOICE&classId=${classId}`);
    expect(none.body.data.rows.map((r: { id: string }) => r.id)).toEqual([s3]);
    const search = await get(a, `/fee-dues/grid?from=2026-01&to=2026-12&search=bilal`);
    expect(search.body.data.rows.map((r: { id: string }) => r.id)).toEqual([s2]);

    const p2 = await get(a, `/fee-dues/grid?from=2026-01&to=2026-12&classId=${classId}&pageSize=1&page=2`);
    expect(p2.body.data.rows).toHaveLength(1);
    expect(p2.body.data.rows[0].id).toBe(s2);
    expect(p2.body.data.total).toBe(3);
    expect(p2.body.data.summary.billed).toBe(4000); // summary covers every page
  });

  it('ledger drill-down and widget', async () => {
    const l = await get(a, `/fee-dues/students/${s1}/ledger?from=2026-01&to=2026-12`);
    expect(l.status).toBe(200);
    expect(l.body.data.student.guardians[0]).toMatchObject({ name: 'Abdul Karim', phone: '01711000001' });
    expect(l.body.data.invoices).toHaveLength(4);
    expect(l.body.data.totals.due).toBe(1600);
    expect(l.body.data.restriction).toMatchObject({ restricted: false, monthsDue: 2, amountDue: 1600 });

    const w = await get(a, '/fee-dues/widget', 'ACCOUNTANT');
    expect(w.status).toBe(200);
    expect(w.body.data.topDefaulterClasses[0]).toMatchObject({ className: 'Class 5', due: 2600, students: 2 });
  });

  it('roles + tenant isolation', async () => {
    expect((await get(a, '/fee-dues/grid?from=2026-01&to=2026-02', 'TEACHER')).status).toBe(403);
    expect((await get(a, '/fee-dues/grid?from=2026-01&to=2026-02', 'GUARDIAN')).status).toBe(403);
    expect((await get(a, '/fee-dues/defaulters', 'STUDENT')).status).toBe(403);
    expect((await put(a, '/fee-dues/settings', { restrictionsEnabled: true }, 'ACCOUNTANT')).status).toBe(403);
    const other = await get(b, '/fee-dues/grid?from=2026-01&to=2026-12');
    expect(other.body.data.rows.map((r: { id: string }) => r.id)).not.toContain(s1);
    expect(other.body.data.summary.billed).toBe(0);
    expect((await get(b, `/fee-dues/students/${s1}/ledger?from=2026-01&to=2026-12`)).status).toBe(404);
    expect((await put(b, `/fee-dues/students/${s1}/block`, { state: 'BLOCKED', reason: 'cross tenant' })).status).toBe(404);
  });

  // ── Defaulters + reminders ──────────────────────────────────────────────

  it('defaulters: months / amount thresholds with guardian contact and last payment', async () => {
    const m2 = await get(a, '/fee-dues/defaulters?minMonths=2');
    expect(m2.status).toBe(200);
    expect(m2.body.data.items.map((r: { id: string }) => r.id)).toEqual([s1, s2]); // by amount desc
    const row = m2.body.data.items[0];
    expect(row).toMatchObject({ monthsDue: 2, months: ['2026-02', '2026-03'], amountDue: 1600, guardianName: 'Abdul Karim', guardianPhone: '01711000001' });
    expect(new Date(row.lastPaymentAt).toISOString()).toBe('2026-02-06T04:00:00.000Z');
    expect(m2.body.data.totalAmount).toBe(2600);
    expect((await get(a, '/fee-dues/defaulters?minMonths=3')).body.data.items).toHaveLength(0);
    expect((await get(a, '/fee-dues/defaulters?minAmount=1500')).body.data.items.map((r: { id: string }) => r.id)).toEqual([s1]);
    expect((await get(a, '/fee-dues/defaulters?minMonths=3&minAmount=1500')).body.data.items.map((r: { id: string }) => r.id)).toEqual([s1]);
  });

  it('reminder preview: segments + totals, no send', async () => {
    const res = await post(a, '/fee-dues/reminders/preview', { studentIds: [s1, s2, s3], channels: ['SMS', 'EMAIL'] });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.students).toBe(2); // s3 has no dues
    expect(d.sms).toMatchObject({ messages: 1, noPhone: 1, encoding: 'GSM' });
    expect(d.sms.segments).toBeGreaterThanOrEqual(1);
    expect(d.email).toMatchObject({ messages: 1, noEmail: 1 });
    expect(d.samples[0].sms).toContain('Ayesha Karim');
    expect(d.samples[0].sms).toContain('1,600');
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it('send in demo mode logs SKIPPED honestly; "last reminded" shows; a real SENT is logged too', async () => {
    const res = await post(a, '/fee-dues/reminders/send', { studentIds: [s1, s2], channels: ['SMS', 'EMAIL'], smsTemplate: 'Due {amount} for {student} - {school}' }, 'ACCOUNTANT');
    expect(res.status).toBe(200);
    expect(res.body.data.done).toBe(true);
    expect(res.body.data.sms).toEqual({ sent: 0, skipped: 2, failed: 0 });
    expect(res.body.data.email.sent).toBe(0);
    const logs = await prisma.feeDuesReminderLog.findMany({ where: { institutionId: a.institutionId, studentId: s1 } });
    expect(logs).toHaveLength(2);
    const sms = logs.find((l) => l.channel === 'SMS')!;
    expect(sms.status).toBe('SKIPPED');
    expect(sms.detail).toMatch(/SKIPPED/);
    expect(sms.message).toBe(`Due 1,600 for Ayesha Karim - Test Institution p4-a`);
    expect(sms.recipient).toMatch(/\*+001$/);
    const s2log = await prisma.feeDuesReminderLog.findFirst({ where: { studentId: s2, channel: 'SMS' } });
    expect(s2log?.detail).toMatch(/no valid BD mobile/);
    const list = await get(a, '/fee-dues/defaulters?minMonths=2');
    expect(list.body.data.items[0].lastRemindedAt).toBeTruthy();

    mockSendSms.mockResolvedValue({ success: true, status: 'SENT', message: 'Ok: sent', to: '8801711000001' });
    const sent = await sendReminders(a.institutionId, a.usersByRole.ADMIN.userId, { studentIds: [s1], channels: ['SMS'] });
    expect(sent.sms.sent).toBe(1);
    expect(mockSendSms.mock.calls[0][0]).toBe('8801711000001');
    expect(mockSendSms.mock.calls[0][1]).toContain('Ayesha Karim');
    const batch = await get(a, `/fee-dues/reminders/batches/${sent.batchId}`, 'ACCOUNTANT');
    expect(batch.body.data.sms.sent).toBe(1);
  });

  // ── Reports / export ────────────────────────────────────────────────────

  it('cash book exports a valid xlsx with the expected headers, plus csv and pdf', async () => {
    const json = await get(a, '/fee-dues/reports/cash-book?from=2026-01-01&to=2026-02-28');
    expect(json.status).toBe(200);
    expect(json.body.data.tables[0].rows).toHaveLength(2);
    expect(json.body.data.tables[0].totals.amount).toBe(1400);
    expect(json.body.data.tables[2].rows.map((r: { key: string }) => r.key).sort()).toEqual(['BKASH', 'CASH']);

    const x = await get(a, '/fee-dues/reports/cash-book?from=2026-01-01&to=2026-02-28&format=xlsx')
      .buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(x.status).toBe(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(x.body as any);
    const ws = wb.worksheets[0];
    let header: string[] = [];
    ws.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map(String);
      if (vals[0] === 'Date' && vals.includes('Receipt')) header = vals;
    });
    expect(header).toEqual(['Date', 'Receipt', 'Student', 'Student ID', 'Class', 'Invoice', 'Method', 'Collected by', 'Amount']);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Payments', 'By day', 'By method', 'By collector']);

    const csv = await get(a, '/fee-dues/reports/cash-book?from=2026-01-01&to=2026-02-28&format=csv');
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    expect(csv.text).toContain('Date,Receipt,Student,Student ID,Class,Invoice,Method,Collected by,Amount');
    const pdf = await get(a, '/fee-dues/reports/outstanding?format=pdf')
      .buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('other reports build: monthly summary, outstanding, concessions, statement, fines, refunds', async () => {
    const ms = await get(a, '/fee-dues/reports/monthly-summary?from=2026-01&to=2026-03');
    expect(ms.body.data.tables[0].totals).toMatchObject({ collected: 1400, billed: 4000 });
    const cat = ms.body.data.tables[2].rows;
    expect(cat.find((r: { label: string }) => r.label === 'Transport').total).toBe(80);
    const out = await get(a, `/fee-dues/reports/outstanding?classId=${classId}`);
    expect(out.body.data.tables[0].totals).toMatchObject({ overdue: 2600, students: 3, withDues: 2 });
    const st = await get(a, `/fee-dues/reports/student-statement?studentId=${s1}&from=2026-01&to=2026-12`);
    expect(st.body.data.tables[0].rows).toHaveLength(4);
    expect(st.body.data.tables[0].totals).toMatchObject({ billed: 3000, paid: 1400, due: 1600 });
    expect(st.body.data.tables[1].totals.amount).toBe(1400);
    for (const key of ['concessions', 'late-fines', 'refunds']) {
      const r = await get(a, `/fee-dues/reports/${key}?from=2026-01-01&to=2026-12-31`);
      expect(r.status).toBe(200);
      expect(r.body.data.tables.length).toBeGreaterThan(0);
    }
    expect((await get(a, '/fee-dues/reports/student-statement')).status).toBe(400);
    expect((await get(a, '/fee-dues/reports/nope')).status).toBe(422);
  });

  // ── Restrictions ────────────────────────────────────────────────────────

  it('restriction off: nobody is blocked', async () => {
    expect((await get(a, '/results/me', 'STUDENT')).status).toBe(200);
  });

  it('enforces FEE_RESTRICTED for student and guardian, never for staff', async () => {
    const s = await put(a, '/fee-dues/settings', { restrictionsEnabled: true, minMonthsDue: 2, blockResults: true, blockIdCard: true, blockPortalLogin: true });
    expect(s.status).toBe(200);
    expect(s.body.data).toMatchObject({ restrictionsEnabled: true, minMonthsDue: 2 });

    const me = await get(a, '/results/me', 'STUDENT');
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('FEE_RESTRICTED');
    expect(me.headers['x-fee-restricted']).toBe('RESULTS');
    expect((await get(a, `/results/me?studentId=${s1}`, 'GUARDIAN')).body.code).toBe('FEE_RESTRICTED');
    expect((await get(a, '/results/me', 'GUARDIAN')).status).toBe(403);
    expect((await get(a, `/results/${s1}/report-card?examId=x`, 'STUDENT')).body.code).toBe('FEE_RESTRICTED');
    expect((await get(a, `/results/transcript/me`, 'STUDENT')).body.code).toBe('FEE_RESTRICTED');
    expect((await get(a, '/id-cards/me', 'STUDENT')).body.code).toBe('FEE_RESTRICTED');
    // Guardians' own ID card is not the child's — not restricted.
    expect((await get(a, '/id-cards/me', 'GUARDIAN')).body.code).toBeUndefined();

    for (const role of ['ADMIN', 'TEACHER'] as Role[]) {
      const r = await get(a, `/results/transcript/${s1}`, role);
      expect(r.body.code).not.toBe('FEE_RESTRICTED');
      expect(r.status).not.toBe(403);
    }

    const studentLogin = await request(app).post('/api/v1/auth/login').send({ identifier: `student.${a.slug}@test.local`, password: 'Test1234!' });
    expect(studentLogin.status).toBe(403);
    expect(studentLogin.body.errors.code).toBe('FEE_RESTRICTED');
    const guardianLogin = await request(app).post('/api/v1/auth/login').send({ identifier: `guardian.${a.slug}@test.local`, password: 'Test1234!' });
    expect(guardianLogin.body.errors?.code).toBe('FEE_RESTRICTED'); // only child is restricted
    const adminLogin = await request(app).post('/api/v1/auth/login').send({ identifier: `admin.${a.slug}@test.local`, password: 'Test1234!' });
    expect(adminLogin.status).toBe(200);

    const my = await get(a, '/fee-dues/me/status', 'STUDENT');
    expect(my.body.data.features.RESULTS.blocked).toBe(true);
    expect(my.body.data.features.ADMIT_CARD.blocked).toBe(true);

    const list = await get(a, '/fee-dues/restricted');
    expect(list.body.data.items.map((r: { id: string }) => r.id)).toEqual([s1, s2]); // s2: Jan + Feb unpaid
    expect(list.body.data.items[0]).toMatchObject({ restricted: true, source: 'AUTO', reasons: ['MONTHS'] });
  });

  it('exempt and manual unblock lift the restriction; AUTO restores it; both are audited', async () => {
    expect((await put(a, `/fee-dues/students/${s1}/exempt`, { exempt: true })).status).toBe(422); // reason required
    expect((await put(a, `/fee-dues/students/${s1}/exempt`, { exempt: true, reason: 'Orphan scholarship' }, 'ACCOUNTANT')).status).toBe(200);
    expect((await get(a, '/results/me', 'STUDENT')).status).toBe(200);
    expect((await put(a, `/fee-dues/students/${s1}/exempt`, { exempt: false })).status).toBe(200);
    expect((await get(a, '/results/me', 'STUDENT')).status).toBe(403);

    expect((await put(a, `/fee-dues/students/${s1}/block`, { state: 'UNBLOCKED', reason: 'Promised to pay Friday' })).body.data).toMatchObject({ restricted: false, source: 'MANUAL_UNBLOCK' });
    expect((await get(a, '/results/me', 'STUDENT')).status).toBe(200);
    const overrides = await get(a, '/fee-dues/restricted?view=OVERRIDES');
    expect(overrides.body.data.items[0]).toMatchObject({ id: s1, manualState: 'UNBLOCKED', manualReason: 'Promised to pay Friday' });
    expect((await put(a, `/fee-dues/students/${s1}/block`, { state: 'AUTO', reason: 'Back to the rules' })).body.data.restricted).toBe(true);

    const audits = await prisma.auditLog.findMany({ where: { institutionId: a.institutionId, resourceId: s1, action: { in: ['FEE_EXEMPT', 'FEE_UNBLOCK', 'FEE_BLOCK_CLEAR'] } } });
    expect(audits.map((x) => x.action).sort()).toEqual(['FEE_BLOCK_CLEAR', 'FEE_EXEMPT', 'FEE_UNBLOCK']);
  });

  it('paying the dues refreshes the cached status on the next check', async () => {
    await prisma.invoice.update({ where: { id: inv['s1-mar'] }, data: { paidAmount: 1000, dueAmount: 0, status: 'PAID' } });
    const r = await get(a, '/results/me', 'STUDENT');
    expect(r.status).toBe(200);
    const row = await prisma.studentFeeStatus.findUnique({ where: { studentId: s1 } });
    expect(row?.monthsDue).toBe(1);
    expect(Number(row?.amountDue)).toBe(600);
  });

  it('manual block works with automatic rules switched off; staff stay unaffected', async () => {
    await put(a, '/fee-dues/settings', { restrictionsEnabled: false });
    expect((await get(a, '/results/me', 'STUDENT')).status).toBe(200);
    await put(a, `/fee-dues/students/${s1}/block`, { state: 'BLOCKED', reason: 'Cheque bounced' }, 'ACCOUNTANT');
    expect((await get(a, '/results/me', 'STUDENT')).body.code).toBe('FEE_RESTRICTED');
    expect((await get(a, `/results/transcript/${s1}`, 'ADMIN')).body.code).toBeUndefined();
    // Feature switched off in settings → not blocked even when restricted.
    await put(a, '/fee-dues/settings', { blockResults: false });
    expect((await get(a, '/results/me', 'STUDENT')).status).toBe(200);
    expect((await get(a, '/id-cards/me', 'STUDENT')).body.code).toBe('FEE_RESTRICTED');
  });
});
