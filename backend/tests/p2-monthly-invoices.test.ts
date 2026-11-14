// P2 — student fee profile + monthly auto-invoices against a real Postgres.
jest.mock('../src/modules/notifications/notifications.service', () => ({
  __esModule: true,
  notifySafe: jest.fn(),
  notify: jest.fn(),
  buildDedupeKey: (...p: string[]) => p.join(':'),
}));

import { Prisma } from '@prisma/client';
import { notifySafe } from '../src/modules/notifications/notifications.service';
import { generateMonthly, previewMonthly, runScheduledMonthly } from '../src/modules/fees/student-fees/studentFees.monthly';
import { bulkCreateProfiles, createProfile, endProfile, studentProfiles } from '../src/modules/fees/student-fees/studentFees.profiles';
import { updateSettings } from '../src/modules/fees/student-fees/studentFees.settings';
import { cancelInvoice } from '../src/modules/fees/student-fees/studentFees.adjust';
import { prisma, disconnectFixtures } from './helpers/fixtures';
import { makeStudent, p2Cleanup, p2Setup, type P2Fixture } from './helpers/p2-fees-fixtures';

jest.setTimeout(180000);

const PERIOD = '2026-12';

describe('P2 monthly invoices', () => {
  let p: P2Fixture;
  let kidA: string; // plain class fees
  let kidB: string; // custom overall monthly rate
  let kidC: string; // concession 10%
  let inactive: string;
  let trashed: string;

  beforeAll(async () => {
    p = await p2Setup(`p2-monthly-${Date.now()}`);
    kidA = p.fx.studentId;
    kidB = (await makeStudent(p)).id;
    kidC = (await makeStudent(p)).id;
    inactive = (await makeStudent(p, { status: 'INACTIVE' })).id;
    trashed = (await makeStudent(p, { deletedAt: new Date() })).id;

    // Overall custom rate: 650/month (orphan rate) for kidB.
    await createProfile(p.accountant, { studentId: kidB, kind: 'MONTHLY', monthlyAmount: 650, yearlyMode: 'SPREAD', effectiveFrom: '2026-11', reason: 'Orphan rate' });
    // 10% concession for kidC.
    const conc = await prisma.concession.create({ data: { institutionId: p.fx.institutionId, name: 'Sibling 10%', type: 'PERCENT', value: new Prisma.Decimal(10) } });
    await prisma.studentConcession.create({ data: { institutionId: p.fx.institutionId, studentId: kidC, concessionId: conc.id } });
  }, 120000);

  afterAll(async () => {
    await p2Cleanup(p);
    await disconnectFixtures();
  }, 120000);

  const monthly = (studentId: string) =>
    prisma.invoice.findMany({ where: { studentId, feePeriod: { period: PERIOD, kind: 'MONTHLY' } }, include: { items: true, feePeriod: true } });

  it('preview counts only active, non-trashed students and shows the totals', async () => {
    const pv = await previewMonthly(p.fx.institutionId, PERIOD);
    expect(pv.studentCount).toBe(3);
    expect(pv.invoiceCount).toBe(3);
    // A: 1000 + 300; B: 650; C: 1300 - 130
    expect(pv.totalAmount).toBe(1300 + 650 + 1170);
    expect(pv.concessionAmount).toBe(130);
    expect(pv.customRateCount).toBe(1);
    expect(new Date(pv.dueDate).toISOString()).toBe('2026-12-09T18:00:00.000Z'); // 10 Dec, Dhaka
  });

  it('generates one invoice per student with profile override + concessions; skips inactive/trashed', async () => {
    const res = await generateMonthly(p.fx.institutionId, PERIOD, { userId: p.admin.userId });
    expect(res.createdCount).toBe(3);
    expect(res.failedCount).toBe(0);

    const [a] = await monthly(kidA);
    expect(Number(a.totalAmount)).toBe(1300);
    expect(a.items.map((i) => i.feeCategoryId).sort()).toEqual([p.tuitionId, p.transportId].sort()); // ONE_TIME admission not billed
    expect(a.items[0].description).toContain('December 2026');
    expect(a.items[0].description).toContain('[2026-12]');

    const [b] = await monthly(kidB);
    expect(Number(b.totalAmount)).toBe(650);
    expect(b.items.every((i) => i.description.includes('(custom rate)'))).toBe(true);

    const [c] = await monthly(kidC);
    expect(Number(c.totalAmount)).toBe(1170);
    expect(c.items.reduce((s, i) => s + Number(i.discount), 0)).toBe(130);

    expect(await monthly(inactive)).toHaveLength(0);
    expect(await prisma.invoice.count({ where: { studentId: trashed } })).toBe(0);
    expect((notifySafe as jest.Mock).mock.calls.filter((c) => c[0].type === 'INVOICE_ISSUED')).toHaveLength(3);
  });

  it('is idempotent: running again (and twice at once) creates nothing new', async () => {
    const again = await generateMonthly(p.fx.institutionId, PERIOD, { userId: p.admin.userId });
    expect(again.createdCount).toBe(0);
    const both = await Promise.all([
      generateMonthly(p.fx.institutionId, PERIOD, { userId: p.admin.userId }),
      generateMonthly(p.fx.institutionId, PERIOD, { userId: p.admin.userId }),
    ]);
    expect(both[0].createdCount + both[1].createdCount).toBe(0);
    for (const s of [kidA, kidB, kidC]) expect(await monthly(s)).toHaveLength(1);
  });

  it('two concurrent first runs for a new month still bill each student exactly once', async () => {
    const res = await Promise.all([
      generateMonthly(p.fx.institutionId, '2027-01', { userId: p.admin.userId }),
      generateMonthly(p.fx.institutionId, '2027-01', { userId: p.admin.userId }),
    ]);
    expect(res[0].createdCount + res[1].createdCount).toBe(3);
    const count = await prisma.invoicePeriod.count({ where: { institutionId: p.fx.institutionId, period: '2027-01', activeKey: { not: null } } });
    expect(count).toBe(3);
  });

  it('cancelling a monthly invoice releases the month so it can be generated again', async () => {
    const [a] = await monthly(kidA);
    await cancelInvoice(p.admin, a.id, 'Wrong class fee');
    const cancelled = await prisma.invoice.findUniqueOrThrow({ where: { id: a.id } });
    expect(cancelled.status).toBe('CANCELLED');
    expect(Number(cancelled.dueAmount)).toBe(0);
    const res = await generateMonthly(p.fx.institutionId, PERIOD, { userId: p.admin.userId });
    expect(res.createdCount).toBe(1);
    const rows = await monthly(kidA);
    expect(rows.filter((r) => r.status !== 'CANCELLED')).toHaveLength(1);
  });

  it('a yearly profile is spread monthly; a newer rate closes the old one (history kept)', async () => {
    const kid = (await makeStudent(p)).id;
    await createProfile(p.admin, { studentId: kid, feeCategoryId: p.tuitionId, kind: 'YEARLY', yearlyAmount: 10000, yearlyMode: 'SPREAD', effectiveFrom: '2027-02', reason: 'Scholarship' });
    await generateMonthly(p.fx.institutionId, '2027-02', { userId: p.admin.userId, classId: p.classId });
    const feb = await prisma.invoice.findFirstOrThrow({ where: { studentId: kid, feePeriod: { period: '2027-02' } }, include: { items: true } });
    expect(Number(feb.items.find((i) => i.feeCategoryId === p.tuitionId)!.amount)).toBe(833);
    expect(Number(feb.totalAmount)).toBe(833 + 300);

    await createProfile(p.admin, { studentId: kid, feeCategoryId: p.tuitionId, kind: 'MONTHLY', monthlyAmount: 400, yearlyMode: 'SPREAD', effectiveFrom: '2027-04', reason: 'New rate' });
    const hist = await studentProfiles(p.fx.institutionId, kid);
    expect(hist.items).toHaveLength(2);
    const old = hist.items.find((h) => h.kind === 'YEARLY')!;
    expect(old.effectiveTo).toBe('2027-03');

    const voided = await endProfile(p.admin, hist.items.find((h) => h.kind === 'MONTHLY')!.id, { reason: 'Entered by mistake' });
    expect(voided.status).toBe('VOID');
    const audits = await prisma.auditLog.count({ where: { institutionId: p.fx.institutionId, resource: 'StudentFeeProfile' } });
    expect(audits).toBeGreaterThanOrEqual(3);
  });

  it('bulk set applies one rate to many students', async () => {
    const s1 = (await makeStudent(p)).id;
    const s2 = (await makeStudent(p)).id;
    const r = await bulkCreateProfiles(p.admin, { studentIds: [s1, s2], kind: 'MONTHLY', monthlyAmount: 500, yearlyMode: 'SPREAD', effectiveFrom: '2027-03', reason: 'Section scholarship' });
    expect(r.created).toBe(2);
    const pv = await previewMonthly(p.fx.institutionId, '2027-03');
    expect(pv.customRateCount).toBeGreaterThanOrEqual(2);
  });

  it('scheduled run: only schools with auto on whose day has come; once per month', async () => {
    await updateSettings(p.admin, { autoGenerate: true, generateDay: 3, dueDay: 12 });
    const before = await prisma.invoicePeriod.count({ where: { institutionId: p.fx.institutionId, period: '2027-05' } });
    expect(before).toBe(0);
    // 2 May (Dhaka): not yet.
    let r = await runScheduledMonthly(new Date('2027-05-02T03:00:00Z'));
    expect(r.schools.find((s) => s.institutionId === p.fx.institutionId)).toBeUndefined();
    // 3 May: runs.
    r = await runScheduledMonthly(new Date('2027-05-03T03:00:00Z'));
    const mine = r.schools.find((s) => s.institutionId === p.fx.institutionId);
    expect(mine?.created).toBeGreaterThan(0);
    const settings = await prisma.studentFeeSettings.findUniqueOrThrow({ where: { institutionId: p.fx.institutionId } });
    expect(settings.lastAutoPeriod).toBe('2027-05');
    // 4 May: already done this month.
    r = await runScheduledMonthly(new Date('2027-05-04T03:00:00Z'));
    expect(r.schools.find((s) => s.institutionId === p.fx.institutionId)).toBeUndefined();
    const inv = await prisma.invoice.findFirstOrThrow({ where: { feePeriod: { period: '2027-05' }, institutionId: p.fx.institutionId } });
    expect(inv.dueDate.toISOString()).toBe('2027-05-11T18:00:00.000Z');
  });

  it('ARREARS_LINE carries fully unpaid older months into the new invoice', async () => {
    const kid = (await makeStudent(p)).id;
    await updateSettings(p.admin, { arrearsMode: 'SEPARATE' });
    await generateMonthly(p.fx.institutionId, '2027-06', { userId: p.admin.userId, classId: p.classId });
    await updateSettings(p.admin, { arrearsMode: 'ARREARS_LINE' });
    const res = await generateMonthly(p.fx.institutionId, '2027-07', { userId: p.admin.userId, classId: p.classId });
    expect(res.carriedForward).toBeGreaterThan(0);
    const june = await prisma.invoice.findFirstOrThrow({ where: { studentId: kid, feePeriod: { period: '2027-06' } } });
    expect(june.status).toBe('CANCELLED');
    expect(june.notes).toContain('Carried forward to');
    const july = await prisma.invoice.findFirstOrThrow({ where: { studentId: kid, feePeriod: { period: '2027-07' } }, include: { items: true } });
    expect(Number(july.totalAmount)).toBe(2600);
    expect(july.items.some((i) => i.description.startsWith('Arrears June 2027'))).toBe(true);
    await updateSettings(p.admin, { arrearsMode: 'SEPARATE' });
  });
});
