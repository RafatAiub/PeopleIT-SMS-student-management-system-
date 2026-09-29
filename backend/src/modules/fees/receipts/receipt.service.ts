import { prisma } from '../../../config/prisma';
import { NotFoundError } from '../../../utils/AppError';
import type { AccessCheck, RequestingUser } from '../online/onlinePayment.service';

/**
 * Everything needed to print a money receipt for one payment. Tenant-scoped
 * through the payment's invoice; STUDENT/GUARDIAN callers are additionally
 * restricted to their own / their children's invoices by `assertAccess`
 * (which throws NotFound, not Forbidden, to avoid confirming the id exists).
 */
export async function getPaymentReceipt(
  tenantId: string,
  paymentId: string,
  requester: RequestingUser,
  assertAccess: AccessCheck,
) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { institutionId: tenantId } },
    include: {
      invoice: {
        include: {
          items: { select: { id: true, description: true, amount: true, discount: true, netAmount: true, feeCategoryId: true } },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentId: true,
              rollNumber: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
          institution: {
            select: { name: true, address: true, phone: true, email: true, logoUrl: true, contactEmail: true, contactPhone: true },
          },
        },
      },
      feePaymentTransaction: { select: { gateway: true, gatewayTransactionId: true, isDemo: true } },
    },
  });
  if (!payment) throw new NotFoundError('Payment not found');
  await assertAccess(tenantId, payment.invoice, requester);

  const recorder = await prisma.user.findFirst({
    where: { id: payment.recordedBy },
    select: { firstName: true, lastName: true },
  });

  const inv = payment.invoice;
  return {
    payment: {
      id: payment.id,
      receiptNo: payment.receiptNo,
      amount: Number(payment.amount),
      method: payment.method,
      transactionRef: payment.transactionRef,
      paidAt: payment.paidAt,
      status: payment.status,
      notes: payment.notes,
      recordedBy: recorder ? `${recorder.firstName} ${recorder.lastName}`.trim() : null,
    },
    invoice: {
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      dueAmount: Number(inv.dueAmount),
      status: inv.status,
      dueDate: inv.dueDate,
      createdAt: inv.createdAt,
      items: inv.items.map((i) => ({
        ...i,
        amount: Number(i.amount),
        discount: Number(i.discount),
        netAmount: Number(i.netAmount),
      })),
    },
    student: inv.student
      ? {
          id: inv.student.id,
          name: `${inv.student.firstName} ${inv.student.lastName}`.trim(),
          studentId: inv.student.studentId,
          rollNumber: inv.student.rollNumber,
          className: inv.student.class?.name ?? null,
          sectionName: inv.student.section?.name ?? null,
        }
      : null,
    institution: {
      name: inv.institution.name,
      address: inv.institution.address,
      phone: inv.institution.contactPhone ?? inv.institution.phone,
      email: inv.institution.contactEmail ?? inv.institution.email,
      logoUrl: inv.institution.logoUrl,
    },
    online: payment.feePaymentTransaction
      ? {
          gateway: payment.feePaymentTransaction.gateway,
          transactionId: payment.feePaymentTransaction.gatewayTransactionId,
          isDemo: payment.feePaymentTransaction.isDemo,
        }
      : null,
    demo: payment.feePaymentTransaction?.isDemo ?? false,
  };
}
