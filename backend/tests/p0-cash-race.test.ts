// P0 — cash payment race + online overpayment cap. Real Postgres (row locks
// are the thing under test); notifications are mocked out.
jest.mock('../src/modules/notifications/notifications.service', () => ({
  __esModule: true,
  notifySafe: jest.fn(),
  notify: jest.fn(),
  buildDedupeKey: (...p: string[]) => p.join(':'),
}));

import { Prisma, UserRole } from '@prisma/client';
import { FeeService } from '../src/modules/fees/fee.service';
import { creditTransaction } from '../src/modules/fees/online/onlinePayment.service';
import { parseOverpayment, reconciliationFlags } from '../src/modules/fees/reconciliation/reconciliation.service';
import { prisma, createTestInstitution, cleanupInstitution, disconnectFixtures, InstitutionFixture } from './helpers/fixtures';

jest.setTimeout(120000);

describe('P0 cash payment race', () => {
  let fx: InstitutionFixture;
  let n = 0;

  beforeAll(async () => {
    fx = await createTestInstitution(`p0-cash-${Date.now()}`);
  }, 60000);

  afterAll(async () => {
    await prisma.feePaymentTransaction.deleteMany({ where: { institutionId: fx.institutionId } }).catch(() => undefined);
    await cleanupInstitution(fx);
    await disconnectFixtures();
  }, 60000);

  async function makeInvoice(total: number, status = 'UNPAID') {
    n++;
    return prisma.invoice.create({
      data: {
        institutionId: fx.institutionId,
        studentId: fx.studentId,
        invoiceNo: `P0-${fx.slug}-${n}`,
        totalAmount: new Prisma.Decimal(total),
        dueAmount: new Prisma.Decimal(total),
        dueDate: new Date(),
        status,
      },
    });
  }

  const pay = (invoiceId: string, amount: number) =>
    FeeService.recordOfflinePayment(fx.institutionId, invoiceId, fx.usersByRole[UserRole.ACCOUNTANT].userId, {
      amount,
      method: 'CASH',
    });

  it('two simultaneous cash payments that together exceed the due: exactly one succeeds', async () => {
    const inv = await makeInvoice(1000);
    const results = await Promise.allSettled([pay(inv.id, 700), pay(inv.id, 700)]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String(failed[0].reason?.message)).toMatch(/exceeds invoice due amount/);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(Number(after.paidAmount)).toBe(700);
    expect(Number(after.dueAmount)).toBe(300);
    expect(after.status).toBe('PARTIAL');
    expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(1);
  });

  it('two simultaneous payments that fit both succeed and settle the invoice', async () => {
    const inv = await makeInvoice(1000);
    const results = await Promise.allSettled([pay(inv.id, 500), pay(inv.id, 500)]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(Number(after.paidAmount)).toBe(1000);
    expect(after.status).toBe('PAID');
  });

  it('rejects payment against a cancelled invoice', async () => {
    const inv = await makeInvoice(1000, 'CANCELLED');
    await expect(pay(inv.id, 100)).rejects.toThrow(/cancelled/i);
  });

  it('online overpayment: credits the money, caps the invoice at PAID and flags the excess', async () => {
    const inv = await makeInvoice(1000);
    await pay(inv.id, 600); // cash landed after the online checkout started
    const txn = await prisma.feePaymentTransaction.create({
      data: {
        institutionId: fx.institutionId,
        invoiceId: inv.id,
        studentId: fx.studentId,
        gateway: 'BKASH',
        amount: new Prisma.Decimal(1000),
        status: 'PENDING',
        gatewayTransactionId: `P0TXN-${fx.slug}`,
        isDemo: true,
      },
    });

    const res = await creditTransaction(txn.id, { gatewayRef: `P0REF-${fx.slug}`, raw: { test: true } });
    expect(res.credited).toBe(true);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe('PAID');
    expect(Number(after.paidAmount)).toBe(1000); // capped: 600 cash + 400 applied
    expect(Number(after.dueAmount)).toBe(0);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: res.paymentId! } });
    expect(Number(payment.amount)).toBe(1000); // the full amount taken is recorded
    expect(parseOverpayment(payment.notes)).toBe(600);
    expect(
      reconciliationFlags({ status: 'SUCCESS', amount: 1000, createdAt: new Date(), payment: { amount: 1000, notes: payment.notes } }),
    ).toContain('OVERPAID');
  });
});
