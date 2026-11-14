// P2 — late fines: idempotency, cap, category rule, waiver (real Postgres).
jest.mock('../src/modules/notifications/notifications.service', () => ({
  __esModule: true,
  notifySafe: jest.fn(),
  notify: jest.fn(),
  buildDedupeKey: (...p: string[]) => p.join(':'),
}));

import { applyLateFinesForTenant } from '../src/modules/fees/student-fees/studentFees.fines';
import { createFineRule, updateFineRule } from '../src/modules/fees/student-fees/studentFees.settings';
import { waiveFine } from '../src/modules/fees/student-fees/studentFees.adjust';
import { dhakaDate } from '../src/modules/fees/student-fees/studentFees.logic';
import { prisma, disconnectFixtures } from './helpers/fixtures';
import { makeInvoice, makeStudent, p2Cleanup, p2Setup, type P2Fixture } from './helpers/p2-fees-fixtures';

jest.setTimeout(180000);

describe('P2 late fines', () => {
  let p: P2Fixture;
  const due = dhakaDate('2026-10', 10);

  beforeAll(async () => {
    p = await p2Setup(`p2-fine-${Date.now()}`);
  }, 120000);

  afterAll(async () => {
    await p2Cleanup(p);
    await disconnectFixtures();
  }, 120000);

  const fines = (invoiceId: string) => prisma.invoiceFine.findMany({ where: { invoiceId }, orderBy: { fineKey: 'asc' } });
  const inv = (id: string) => prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });

  it('flat ONCE fine after the grace days, added once however often the job runs', async () => {
    const rule = await createFineRule(p.admin, { type: 'FLAT', value: 50, graceDays: 5, recurrence: 'ONCE' });
    const kid = (await makeStudent(p)).id;
    const one = await makeInvoice(p, kid, 1000, { dueDate: due, status: 'OVERDUE' });

    await applyLateFinesForTenant(p.fx.institutionId, dhakaDate('2026-10', 15)); // 5 days: not yet
    expect(await fines(one.id)).toHaveLength(0);

    const now = dhakaDate('2026-10', 16);
    await Promise.all([applyLateFinesForTenant(p.fx.institutionId, now), applyLateFinesForTenant(p.fx.institutionId, now)]);
    await applyLateFinesForTenant(p.fx.institutionId, dhakaDate('2026-12', 1));
    expect((await fines(one.id)).map((f) => [f.fineKey, Number(f.amount)])).toEqual([['ONCE', 50]]);
    const after = await inv(one.id);
    expect(Number(after.totalAmount)).toBe(1050);
    expect(Number(after.dueAmount)).toBe(1050);
    expect(after.items.some((i) => i.description === 'Late fine')).toBe(true);
    await updateFineRule(p.admin, rule.id, { isActive: false });
  });

  it('monthly % fine per month, capped', async () => {
    await createFineRule(p.admin, { type: 'PERCENT', value: 10, graceDays: 0, recurrence: 'MONTHLY', maxAmount: 250 });
    const kid = (await makeStudent(p)).id;
    const one = await makeInvoice(p, kid, 1000, { dueDate: due, status: 'OVERDUE' });
    await applyLateFinesForTenant(p.fx.institutionId, dhakaDate('2026-10', 11)); // M1 = 100
    await applyLateFinesForTenant(p.fx.institutionId, dhakaDate('2026-10', 20)); // still M1
    expect((await fines(one.id)).map((f) => f.fineKey)).toEqual(['M1']);
    await applyLateFinesForTenant(p.fx.institutionId, dhakaDate('2027-02', 15)); // M2..M5, capped at 250 total
    const all = await fines(one.id);
    expect(all.reduce((s, f) => s + Number(f.amount), 0)).toBe(250);
    expect(all.map((f) => Number(f.amount))).toEqual([100, 100, 50]); // % of the fee due, not of earlier fines
    expect(Number((await inv(one.id)).totalAmount)).toBe(1250);
  });

  it('waiver (ADMIN, reason) reduces the invoice and STOP blocks future fines', async () => {
    const kid = (await makeStudent(p)).id;
    const one = await makeInvoice(p, kid, 500, { dueDate: due, status: 'OVERDUE' });
    await applyLateFinesForTenant(p.fx.institutionId, dhakaDate('2026-10', 11));
    const [m1] = await fines(one.id);
    expect(Number(m1.amount)).toBe(50);

    const res = await waiveFine(p.admin, one.id, m1.id, { reason: 'Guardian was ill', stopFuture: true });
    expect(res.waived).toBe(50);
    const after = await inv(one.id);
    expect(Number(after.totalAmount)).toBe(500);
    expect(Number(after.dueAmount)).toBe(500);
    await applyLateFinesForTenant(p.fx.institutionId, dhakaDate('2027-01', 20));
    expect((await fines(one.id)).filter((f) => f.fineKey !== 'STOP')).toHaveLength(1);
    expect(await prisma.feeAdjustment.count({ where: { invoiceId: one.id, kind: 'FINE_WAIVER' } })).toBe(1);
  });

  it('category rule wins for invoices that bill that category; paid invoices are never fined', async () => {
    await prisma.lateFineRule.updateMany({ where: { institutionId: p.fx.institutionId }, data: { isActive: false } });
    await createFineRule(p.admin, { type: 'FLAT', value: 20, graceDays: 0, recurrence: 'ONCE' });
    await createFineRule(p.admin, { feeCategoryId: p.transportId, type: 'FLAT', value: 75, graceDays: 0, recurrence: 'ONCE' });
    const kid = (await makeStudent(p)).id;
    const transport = await makeInvoice(p, kid, 300, { dueDate: due, status: 'OVERDUE', categoryId: p.transportId });
    const tuition = await makeInvoice(p, kid, 300, { dueDate: due, status: 'OVERDUE' });
    const paid = await makeInvoice(p, kid, 300, { dueDate: due, status: 'PAID' });
    await prisma.invoice.update({ where: { id: paid.id }, data: { paidAmount: 300, dueAmount: 0 } });
    await applyLateFinesForTenant(p.fx.institutionId, dhakaDate('2026-11', 1));
    expect(Number((await fines(transport.id))[0].amount)).toBe(75);
    expect(Number((await fines(tuition.id))[0].amount)).toBe(20);
    expect(await fines(paid.id)).toHaveLength(0);
  });
});
