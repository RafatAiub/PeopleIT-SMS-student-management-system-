import { FeeRepository } from './fee.repository';
import { generateInvoiceNumber } from '../../utils/invoiceNumber';
import { BkashGateway } from './gateways/bkash.stub';
import { NagadGateway } from './gateways/nagad.stub';
import { SslCommerzGateway } from './gateways/sslcommerz.stub';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { feeReminderQueue } from '../../queues/reminderQueue';
import { logger } from '../../utils/logger';
import { UserRole } from '@prisma/client';

export type RequestingUser = { sub: string; role: string };

export class FeeService {
  // STUDENT/GUARDIAN callers may only reach invoices for themselves / their
  // own linked children — never trust a client-supplied studentId/invoice id
  // for these roles. ADMIN/SUPER_ADMIN/ACCOUNTANT remain tenant-scoped only.
  // Throws NotFoundError (not ForbiddenError) to avoid confirming that a
  // given invoice id exists at all for another family.
  private static async assertInvoiceAccess(
    tenantId: string,
    invoice: { studentId: string },
    requester: RequestingUser,
  ) {
    if (requester.role === UserRole.STUDENT) {
      const student = await studentRepository.findByUserId(tenantId, requester.sub);
      if (!student || student.id !== invoice.studentId) {
        throw new NotFoundError('Invoice not found');
      }
    } else if (requester.role === UserRole.GUARDIAN) {
      const linkedStudentIds = await guardianRepository.findLinkedStudentIdsByUserId(tenantId, requester.sub);
      if (!linkedStudentIds.includes(invoice.studentId)) {
        throw new NotFoundError('Invoice not found');
      }
    }
  }

  static async createCategory(tenantId: string, data: {
    name: string;
    description?: string;
    amount: number;
    frequency: string;
  }) {
    return FeeRepository.createCategory(tenantId, data);
  }

  static async updateCategory(tenantId: string, id: string, data: {
    name?: string;
    description?: string;
    amount?: number;
    frequency?: string;
    isActive?: boolean;
  }) {
    const category = await FeeRepository.getCategoryById(tenantId, id);
    if (!category) throw new NotFoundError('Fee category not found');
    return FeeRepository.updateCategory(tenantId, id, data);
  }

  static async listCategories(tenantId: string) {
    return FeeRepository.listCategories(tenantId);
  }

  static async createInvoice(
    tenantId: string,
    data: {
      studentId: string;
      dueDate: string;
      notes?: string;
      items: {
        feeCategoryId: string;
        description: string;
        amount: number;
        discount: number;
      }[];
    }
  ) {
    // Verify the student belongs to the caller's tenant before ever billing
    // them — studentId is client-supplied and must never be trusted across
    // institutions.
    const student = await studentRepository.findById(tenantId, data.studentId);
    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Generate invoice number
    const invoiceNo = await generateInvoiceNumber(tenantId);

    // Sum net total amount
    const totalAmount = data.items.reduce((sum, item) => {
      const net = item.amount - item.discount;
      return sum + net;
    }, 0);

    if (totalAmount <= 0) {
      throw new BadRequestError('Invoice total amount must be greater than zero');
    }

    const invoice = await FeeRepository.createInvoice(
      tenantId,
      {
        studentId: data.studentId,
        invoiceNo,
        totalAmount,
        dueDate: new Date(data.dueDate),
        notes: data.notes,
      },
      data.items,
    );

    // Schedule a fee-due SMS reminder for the due date itself — BullMQ's
    // delay does the scheduling, no cron/scanner needed. Failure to enqueue
    // must never fail invoice creation.
    const delayMs = new Date(data.dueDate).getTime() - Date.now();
    await feeReminderQueue
      .add(
        'fee-due',
        {
          type: 'fee-due',
          institutionId: tenantId,
          studentId: data.studentId,
          invoiceNo,
          dueAmount: totalAmount,
          dueDate: data.dueDate,
        },
        { delay: Math.max(delayMs, 0) },
      )
      .catch((err) => {
        logger.error('Failed to schedule fee-due reminder', { error: err.message, invoiceNo });
      });

    return invoice;
  }

  static async getInvoice(tenantId: string, id: string, requester: RequestingUser) {
    const invoice = await FeeRepository.getInvoiceById(tenantId, id);
    if (!invoice) throw new NotFoundError('Invoice not found');
    await FeeService.assertInvoiceAccess(tenantId, invoice, requester);
    return invoice;
  }

  static async listInvoices(
    tenantId: string,
    filters: {
      studentId?: string;
      status?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
    requester: RequestingUser,
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;

    // STUDENT/GUARDIAN: force the studentId scope server-side, ignoring
    // whatever the client supplied in the query string.
    if (requester.role === UserRole.STUDENT) {
      const student = await studentRepository.findByUserId(tenantId, requester.sub);
      return FeeRepository.listInvoices(tenantId, {
        status: filters.status,
        search: filters.search,
        studentId: student?.id ?? '__no-match__',
        page,
        pageSize,
      });
    }
    if (requester.role === UserRole.GUARDIAN) {
      const linkedStudentIds = await guardianRepository.findLinkedStudentIdsByUserId(tenantId, requester.sub);
      return FeeRepository.listInvoices(tenantId, {
        status: filters.status,
        search: filters.search,
        studentIdIn: linkedStudentIds.length > 0 ? linkedStudentIds : ['__no-match__'],
        page,
        pageSize,
      });
    }

    return FeeRepository.listInvoices(tenantId, {
      ...filters,
      page,
      pageSize,
    });
  }

  static async initiateOnlinePayment(
    tenantId: string,
    invoiceId: string,
    method: 'BKASH' | 'NAGAD' | 'SSLCOMMERZ',
    callbackUrl: string,
    requester: RequestingUser,
  ) {
    const invoice = await FeeRepository.getInvoiceById(tenantId, invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');
    await FeeService.assertInvoiceAccess(tenantId, invoice, requester);

    const amount = Number(invoice.dueAmount);
    if (amount <= 0 || invoice.status === 'PAID') {
      throw new BadRequestError('Invoice is already fully paid');
    }

    let gatewayResult;
    switch (method) {
      case 'BKASH':
        gatewayResult = await BkashGateway.initiatePayment(invoiceId, amount, callbackUrl);
        break;
      case 'NAGAD':
        gatewayResult = await NagadGateway.initiatePayment(invoiceId, amount, callbackUrl);
        break;
      case 'SSLCOMMERZ':
        gatewayResult = await SslCommerzGateway.initiatePayment(invoiceId, amount, callbackUrl);
        break;
      default:
        throw new BadRequestError('Invalid online payment method');
    }

    if (!gatewayResult.success) {
      throw new BadRequestError(gatewayResult.message);
    }

    return gatewayResult;
  }

  static async recordOfflinePayment(
    tenantId: string,
    invoiceId: string,
    userId: string,
    data: {
      amount: number;
      method: 'CASH' | 'BANK_TRANSFER';
      transactionRef?: string;
      notes?: string;
    }
  ) {
    const invoice = await FeeRepository.getInvoiceById(tenantId, invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');

    const dueAmount = Number(invoice.dueAmount);

    // Server-side is the real guard here — the client's HTML `max` attribute
    // is bypassable, and this is money. Reject payments against an invoice
    // that's already fully settled before even looking at the submitted
    // amount, so the client gets an unambiguous "already paid" message
    // instead of a confusing "amount exceeds due" error on a $0 due amount.
    if (dueAmount <= 0 || invoice.status === 'PAID') {
      throw new BadRequestError('Invoice is already fully paid');
    }

    // Defense-in-depth: the Zod DTO already requires amount > 0, but the
    // service layer must never rely solely on request-layer validation for
    // a money-handling path.
    if (data.amount <= 0) {
      throw new BadRequestError('Payment amount must be greater than zero');
    }

    if (data.amount > dueAmount) {
      throw new BadRequestError('Payment amount exceeds invoice due amount');
    }

    return FeeRepository.recordPayment(tenantId, invoiceId, {
      amount: data.amount,
      method: data.method,
      transactionRef: data.transactionRef,
      notes: data.notes,
      recordedBy: userId,
    });
  }
}
