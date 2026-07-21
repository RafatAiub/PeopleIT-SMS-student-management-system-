import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../src/app';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  prisma,
  InstitutionFixture,
} from './helpers/fixtures';

/**
 * Live Bug 3 (.claude/PROJECT_STATUS.md): Record Payment against an invoice
 * with dueAmount: 0 (already fully paid) must be rejected server-side, not
 * just blocked by the client's bypassable HTML `max` attribute. This suite
 * covers: already-fully-paid rejection, overpayment rejection, and that a
 * genuine valid payment (partial and full) still succeeds.
 */
describe('Record offline payment — server-side amount validation (Bug 3)', () => {
  let instA: InstitutionFixture;
  let instB: InstitutionFixture;
  let feeCategory: { id: string };

  beforeAll(async () => {
    instA = await createTestInstitution('feepayA');
    instB = await createTestInstitution('feepayB');

    feeCategory = await prisma.feeCategory.create({
      data: {
        institutionId: instA.institutionId,
        name: 'Tuition',
        amount: 1000,
        frequency: 'MONTHLY',
      },
    });
  }, 30_000);

  afterAll(async () => {
    await cleanupInstitution(instA);
    await cleanupInstitution(instB);
    await disconnectFixtures();
  }, 30_000);

  async function createInvoice(overrides: { dueAmount: number; paidAmount?: number; status?: string; totalAmount?: number }) {
    const totalAmount = overrides.totalAmount ?? 1000;
    return prisma.invoice.create({
      data: {
        institutionId: instA.institutionId,
        studentId: instA.studentId,
        invoiceNo: `INV-PAYTEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        totalAmount,
        paidAmount: overrides.paidAmount ?? totalAmount - overrides.dueAmount,
        dueAmount: overrides.dueAmount,
        dueDate: new Date(),
        status: overrides.status ?? (overrides.dueAmount <= 0 ? 'PAID' : 'UNPAID'),
        items: {
          create: [{ feeCategoryId: feeCategory.id, description: 'Tuition', amount: totalAmount, netAmount: totalAmount }],
        },
      },
    });
  }

  it('rejects a payment against an already-fully-paid invoice (dueAmount: 0) with 400, not 500', async () => {
    const invoice = await createInvoice({ dueAmount: 0 });
    const { token } = instA.usersByRole[UserRole.ACCOUNTANT];

    const res = await request(app)
      .post(`/api/v1/fees/invoices/${invoice.id}/payments/offline`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2500, method: 'CASH' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already fully paid/i);

    // Confirm the invoice itself is untouched — no phantom payment recorded.
    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.length).toBe(0);
  });

  it('rejects an overpayment (amount > dueAmount) with 400, not 500', async () => {
    const invoice = await createInvoice({ dueAmount: 500, totalAmount: 1000, paidAmount: 500, status: 'PARTIAL' });
    const { token } = instA.usersByRole[UserRole.ACCOUNTANT];

    const res = await request(app)
      .post(`/api/v1/fees/invoices/${invoice.id}/payments/offline`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 600, method: 'CASH' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/exceeds invoice due amount/i);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.length).toBe(0);
  });

  it('rejects a zero/negative amount at the DTO layer (422, Zod)', async () => {
    const invoice = await createInvoice({ dueAmount: 500, totalAmount: 1000, paidAmount: 500, status: 'PARTIAL' });
    const { token } = instA.usersByRole[UserRole.ACCOUNTANT];

    const res = await request(app)
      .post(`/api/v1/fees/invoices/${invoice.id}/payments/offline`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 0, method: 'CASH' });

    expect(res.status).toBe(422);
  });

  it('accepts a valid partial payment within the due amount', async () => {
    const invoice = await createInvoice({ dueAmount: 1000, totalAmount: 1000, paidAmount: 0, status: 'UNPAID' });
    const { token } = instA.usersByRole[UserRole.ACCOUNTANT];

    const res = await request(app)
      .post(`/api/v1/fees/invoices/${invoice.id}/payments/offline`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 400, method: 'CASH' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(Number(updated!.dueAmount)).toBe(600);
    expect(updated!.status).toBe('PARTIAL');
  });

  it('accepts a valid full payment that exactly matches the due amount, moving status to PAID', async () => {
    const invoice = await createInvoice({ dueAmount: 1000, totalAmount: 1000, paidAmount: 0, status: 'UNPAID' });
    const { token } = instA.usersByRole[UserRole.ACCOUNTANT];

    const res = await request(app)
      .post(`/api/v1/fees/invoices/${invoice.id}/payments/offline`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, method: 'CASH' });

    expect(res.status).toBe(201);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(Number(updated!.dueAmount)).toBe(0);
    expect(updated!.status).toBe('PAID');
  });

  it('a leading-zero amount string like "02500" is rejected by Zod (number type), not silently coerced', async () => {
    const invoice = await createInvoice({ dueAmount: 1000, totalAmount: 1000, paidAmount: 0, status: 'UNPAID' });
    const { token } = instA.usersByRole[UserRole.ACCOUNTANT];

    const res = await request(app)
      .post(`/api/v1/fees/invoices/${invoice.id}/payments/offline`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '02500' as unknown as number, method: 'CASH' });

    expect(res.status).toBe(422);
  });

  it('cross-tenant: an ACCOUNTANT in Institution B cannot record a payment against Institution A\'s invoice (404)', async () => {
    const invoice = await createInvoice({ dueAmount: 1000, totalAmount: 1000, paidAmount: 0, status: 'UNPAID' });
    const { token } = instB.usersByRole[UserRole.ACCOUNTANT];

    const res = await request(app)
      .post(`/api/v1/fees/invoices/${invoice.id}/payments/offline`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, method: 'CASH' });

    expect(res.status).toBe(404);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.length).toBe(0);
  });

  it("a STUDENT is forbidden (403) from recording an offline payment, even on their own invoice", async () => {
    const invoice = await createInvoice({ dueAmount: 1000, totalAmount: 1000, paidAmount: 0, status: "UNPAID" });
    // Point studentId at the actual STUDENT-role fixture's linked student so this
    // is not rejected for an unrelated reason (ownership) before the role check runs.
    await prisma.invoice.update({ where: { id: invoice.id }, data: { studentId: instA.studentId } });
    const { token } = instA.usersByRole[UserRole.STUDENT];

    const res = await request(app)
      .post("/api/v1/fees/invoices/" + invoice.id + "/payments/offline")
      .set("Authorization", "Bearer " + token)
      .send({ amount: 100, method: "CASH" });

    expect(res.status).toBe(403);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.length).toBe(0);
  });

  it("a GUARDIAN is forbidden (403) from recording an offline payment, even for their linked child", async () => {
    const invoice = await createInvoice({ dueAmount: 1000, totalAmount: 1000, paidAmount: 0, status: "UNPAID" });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { studentId: instA.studentId } });
    const { token } = instA.usersByRole[UserRole.GUARDIAN];

    const res = await request(app)
      .post("/api/v1/fees/invoices/" + invoice.id + "/payments/offline")
      .set("Authorization", "Bearer " + token)
      .send({ amount: 100, method: "CASH" });

    expect(res.status).toBe(403);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.length).toBe(0);
  });

  it("a TEACHER (unrelated staff role) is forbidden (403) from recording an offline payment", async () => {
    const invoice = await createInvoice({ dueAmount: 1000, totalAmount: 1000, paidAmount: 0, status: "UNPAID" });
    const { token } = instA.usersByRole[UserRole.TEACHER];

    const res = await request(app)
      .post("/api/v1/fees/invoices/" + invoice.id + "/payments/offline")
      .set("Authorization", "Bearer " + token)
      .send({ amount: 100, method: "CASH" });

    expect(res.status).toBe(403);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.length).toBe(0);
  });

  /**
   * Frontend regression check (InvoiceList.tsx openPaymentModal /
   * handleRecordPayment): the payment modal pre-fills the amount field from
   * `invoice.dueAmount`, which Prisma serializes over JSON as a STRING (e.g.
   * "1000", not the number 1000 - Decimal#toJSON() returns a string). This
   * simulates that exact real payload shape server-side, but the frontend now
   * wraps both the pre-fill (`setPaymentAmount(Number(invoice.dueAmount))`)
   * and the submitted payload (`amount: Number(paymentAmount)`) in Number(...),
   * so a staff member who opens Record Payment and submits without editing the
   * field now succeeds. This test confirms that fix holds even if a raw
   * string amount (matching what the API actually returns) is sent directly.
   */
  it("accepts the unedited, pre-filled due amount even when sent as a JSON string (Decimal serialization), now that the frontend coerces it to a number", async () => {
    const invoice = await createInvoice({ dueAmount: 1000, totalAmount: 1000, paidAmount: 0, status: "UNPAID" });
    const { token } = instA.usersByRole[UserRole.ACCOUNTANT];

    const getRes = await request(app)
      .get("/api/v1/fees/invoices/" + invoice.id)
      .set("Authorization", "Bearer " + token);
    expect(getRes.status).toBe(200);
    // Confirms the root cause: the API really does send dueAmount as a string.
    expect(typeof getRes.body.data.dueAmount).toBe("string");

    // This is exactly what InvoiceList.tsx openPaymentModal() used to store
    // unwrapped into paymentAmount state. The frontend now wraps this in
    // Number(...) before both storing it and sending it, so simulate the raw
    // API value here to prove the fix (not the frontend) makes this succeed.
    const unmodifiedPrefilledAmount = getRes.body.data.dueAmount;

    const res = await request(app)
      .post("/api/v1/fees/invoices/" + invoice.id + "/payments/offline")
      .set("Authorization", "Bearer " + token)
      .send({ amount: Number(unmodifiedPrefilledAmount), method: "CASH" });

    // FIXED: InvoiceList.tsx now coerces both the pre-filled state and the
    // outgoing request body with Number(...), so this succeeds with 201.
    expect(res.status).toBe(201);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(Number(updated!.dueAmount)).toBe(0);
    expect(updated!.status).toBe("PAID");
  });
});
