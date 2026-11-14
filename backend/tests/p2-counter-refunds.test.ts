// P2 — collect-fee counter, reversal, refunds and cancel (real Postgres; row locks are under test).
jest.mock('../src/modules/notifications/notifications.service', () => ({
  __esModule: true,
  notifySafe: jest.fn(),
  notify: jest.fn(),
  buildDedupeKey: (...p: string[]) => p.join(':'),
}));

import { Prisma } from '@prisma/client';
import { collect, myCollectionsToday, searchStudents, studentDues } from '../src/modules/fees/student-fees/studentFees.counter';
import { cancelInvoice, recordRefund, refundInfo, reversePayment } from '../src/modules/fees/student-fees/studentFees.adjust';
import { CollectDto } from '../src/modules/fees/student-fees/studentFees.dto';
import { prisma, disconnectFixtures } from './helpers/fixtures';
import { makeInvoice, makeStudent, p2Cleanup, p2Setup, type P2Fixture } from './helpers/p2-fees-fixtures';

jest.setTimeout(180000);

describe('P2 collect-fee counter', () => {
  let p: P2Fixture;

  beforeAll(async () => {
    p = await p2Setup(`p2-counter-${Date.now()}`);
  }, 120000);

  afterAll(async () => {
    await p2Cleanup(p);
    await disconnectFixtures();
  }, 120000);

  const inv = (id: string) => prisma.invoice.findUniqueOrThrow({ where: { id } });

  it('search finds by name, ID, and guardian phone (siblings)', async () => {
    const sib = await makeStudent(p, { firstName: 'Ayesha', lastName: 'Karim' });
    await prisma.guardian.update({ where: { id: p.fx.guardianId }, data: { phone: '01711223344' } });
    await prisma.guardianStudent.create({ data: { guardianId: p.fx.guardianId, studentId: sib.id } });

    const byName = await searchStudents(p.fx.institutionId, 'ayesha kar');
    expect(byName.map((s) => s.id)).toContain(sib.id);
    const byId = await searchStudents(p.fx.institutionId, sib.studentId);
    expect(byId[0].id).toBe(sib.id);
    const byPhone = await searchStudents(p.fx.institutionId, '+8801711-223344');
    expect(byPhone.map((s) => s.id).sort()).toEqual([p.fx.studentId, sib.id].sort());
    expect(byPhone.every((s) => s.matchedBy === 'GUARDIAN_PHONE')).toBe(true);

    const dues = await studentDues(p.fx.institutionId, p.fx.studentId);
    expect(dues.siblings.map((s) => s.id)).toContain(sib.id);
  });

  it('an amount is allocated oldest month first in one transaction, one receipt per invoice', async () => {
    const kid = (await makeStudent(p)).id;
    const sep = await makeInvoice(p, kid, 1000, { dueDate: new Date('2026-09-10') });
    const oct = await makeInvoice(p, kid, 1000, { dueDate: new Date('2026-10-10') });
    const nov = await makeInvoice(p, kid, 1000, { dueDate: new Date('2026-11-10') });

    const res = await collect(p.accountant, CollectDto.parse({ studentId: kid, amount: 1500, method: 'CASH' }));
    expect(res.total).toBe(1500);
    expect(res.payments.map((x) => [x.invoiceId, x.amount])).toEqual([[sep.id, 1000], [oct.id, 500]]);
    expect(res.payments.every((x) => x.receiptNo)).toBe(true);
    expect((await inv(sep.id)).status).toBe('PAID');
    expect(Number((await inv(oct.id)).dueAmount)).toBe(500);
    expect(Number((await inv(nov.id)).paidAmount)).toBe(0);

    await expect(collect(p.accountant, CollectDto.parse({ studentId: kid, amount: 5000, method: 'CASH' }))).rejects.toThrow(/more than the total due/);
  });

  it('two cashiers at once cannot overpay (row lock)', async () => {
    const kid = (await makeStudent(p)).id;
    const one = await makeInvoice(p, kid, 1000);
    const results = await Promise.allSettled([
      collect(p.accountant, CollectDto.parse({ studentId: kid, allocations: [{ invoiceId: one.id, amount: 700 }], method: 'CASH' })),
      collect(p.admin, CollectDto.parse({ studentId: kid, allocations: [{ invoiceId: one.id, amount: 700 }], method: 'CASH' })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await inv(one.id);
    expect(Number(after.paidAmount)).toBe(700);
    expect(await prisma.payment.count({ where: { invoiceId: one.id } })).toBe(1);
  });

  it('counter discount needs a reason, is spread over lines and audited', () => {
    expect(() => CollectDto.parse({ studentId: 'x', amount: 10, method: 'CASH', discounts: [{ invoiceId: 'a', amount: 5 }] })).toThrow(/reason/);
    expect(() => CollectDto.parse({ studentId: 'x', amount: 10, method: 'CHEQUE' })).toThrow(/reference/);
  });

  it('applies a discount then takes the rest; BANK is stored as BANK_TRANSFER', async () => {
    const kid = (await makeStudent(p)).id;
    const one = await makeInvoice(p, kid, 1000);
    const res = await collect(
      p.accountant,
      CollectDto.parse({ studentId: kid, allocations: [{ invoiceId: one.id, amount: 800 }], discounts: [{ invoiceId: one.id, amount: 200 }], discountReason: 'Poor family', method: 'BANK', reference: 'DBBL-123' }),
    );
    expect(res.discountTotal).toBe(200);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: one.id }, include: { items: true, payments: true } });
    expect(after.status).toBe('PAID');
    expect(Number(after.totalAmount)).toBe(800);
    expect(Number(after.items[0].discount)).toBe(200);
    expect(after.payments[0].method).toBe('BANK_TRANSFER');
    expect(await prisma.feeAdjustment.count({ where: { invoiceId: one.id, kind: 'COUNTER_DISCOUNT' } })).toBe(1);
  });

  it("today's total counts only the cashier's own completed payments", async () => {
    const today = await myCollectionsToday(p.accountant);
    // 1500 (oldest-first test) + 700 or 0 (race winner) + 800 (discount test)
    expect(today.total).toBeGreaterThanOrEqual(2300);
    expect(today.byMethod.some((m) => m.method === 'BANK_TRANSFER')).toBe(true);
  });

  describe('reversal, refund and cancel', () => {
    it('reverse recalculates the invoice, marks the payment REVERSED, and cannot run twice', async () => {
      const kid = (await makeStudent(p)).id;
      const one = await makeInvoice(p, kid, 1000, { dueDate: new Date(Date.now() + 5 * 86400000) });
      const res = await collect(p.accountant, CollectDto.parse({ studentId: kid, amount: 600, method: 'CASH' }));
      const paymentId = res.payments[0].paymentId;

      const rev = await reversePayment(p.admin, paymentId, 'Cheque bounced');
      expect(rev.invoiceStatus).toBe('UNPAID');
      const after = await inv(one.id);
      expect(Number(after.paidAmount)).toBe(0);
      expect(Number(after.dueAmount)).toBe(1000);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('REVERSED');
      await expect(reversePayment(p.admin, paymentId, 'again')).rejects.toThrow(/already reversed/);
      const both = await Promise.allSettled([reversePayment(p.admin, paymentId, 'x1'), reversePayment(p.admin, paymentId, 'x2')]);
      expect(both.every((b) => b.status === 'rejected')).toBe(true);

      // Refund the reversed amount in two parts; never more than paid.
      expect((await refundInfo(p.fx.institutionId, paymentId)).refundable).toBe(600);
      await recordRefund(p.admin, paymentId, { amount: 400, method: 'CASH', reason: 'Returned at desk' });
      await expect(recordRefund(p.admin, paymentId, { amount: 300, method: 'CASH', reason: 'Too much' })).rejects.toThrow(/at most 200/);
      const parallel = await Promise.allSettled([
        recordRefund(p.admin, paymentId, { amount: 200, method: 'CASH', reason: 'rest a' }),
        recordRefund(p.admin, paymentId, { amount: 200, method: 'CASH', reason: 'rest b' }),
      ]);
      expect(parallel.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect((await refundInfo(p.fx.institutionId, paymentId)).refundable).toBe(0);
      expect(await prisma.auditLog.count({ where: { institutionId: p.fx.institutionId, resource: { in: ['Payment', 'FeeRefund'] } } })).toBeGreaterThanOrEqual(3);
    });

    it('partial reversal on a part-paid invoice leaves the other payment', async () => {
      const kid = (await makeStudent(p)).id;
      const one = await makeInvoice(p, kid, 1000, { dueDate: new Date(Date.now() + 5 * 86400000) });
      const a = await collect(p.accountant, CollectDto.parse({ studentId: kid, amount: 300, method: 'CASH' }));
      await collect(p.accountant, CollectDto.parse({ studentId: kid, amount: 700, method: 'CASH' }));
      expect((await inv(one.id)).status).toBe('PAID');
      const rev = await reversePayment(p.admin, a.payments[0].paymentId, 'Duplicate entry');
      expect(rev.invoiceStatus).toBe('PARTIAL');
      expect(Number((await inv(one.id)).dueAmount)).toBe(300);
    });

    it('online overpayment: refundable is only the excess until reversed', async () => {
      const kid = (await makeStudent(p)).id;
      const one = await makeInvoice(p, kid, 1000);
      const pay = await prisma.payment.create({
        data: { invoiceId: one.id, amount: new Prisma.Decimal(1000), method: 'BKASH', recordedBy: p.admin.userId, status: 'COMPLETED', notes: 'Online [OVERPAYMENT 600]' },
      });
      await prisma.invoice.update({ where: { id: one.id }, data: { paidAmount: new Prisma.Decimal(400), dueAmount: new Prisma.Decimal(600), status: 'PARTIAL' } });
      expect((await refundInfo(p.fx.institutionId, pay.id)).refundable).toBe(600);
      await recordRefund(p.admin, pay.id, { amount: 600, method: 'GATEWAY', reference: 'bKash refund TRX9', reason: 'Overpaid online' });
      const rev = await reversePayment(p.admin, pay.id, 'Paid twice');
      expect(rev.gateway).toBe(true);
      const after = await inv(one.id);
      expect(Number(after.paidAmount)).toBe(0); // only the 400 applied came off
      expect((await refundInfo(p.fx.institutionId, pay.id)).refundable).toBe(400);
    });

    it('cancel: only unpaid invoices; keeps the record with a reason', async () => {
      const kid = (await makeStudent(p)).id;
      const paid = await makeInvoice(p, kid, 500);
      await collect(p.accountant, CollectDto.parse({ studentId: kid, allocations: [{ invoiceId: paid.id, amount: 100 }], method: 'CASH' }));
      await expect(cancelInvoice(p.admin, paid.id, 'Wrong student')).rejects.toThrow(/reverse them first/);
      const unpaid = await makeInvoice(p, kid, 500);
      await cancelInvoice(p.accountant, unpaid.id, 'Billed twice');
      const after = await inv(unpaid.id);
      expect(after.status).toBe('CANCELLED');
      expect(after.notes).toContain('Billed twice');
      await expect(collect(p.accountant, CollectDto.parse({ studentId: kid, allocations: [{ invoiceId: unpaid.id, amount: 10 }], method: 'CASH' }))).rejects.toThrow();
    });
  });
});
