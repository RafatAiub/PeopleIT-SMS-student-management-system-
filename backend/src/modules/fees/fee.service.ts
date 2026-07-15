import { FeeRepository } from './fee.repository';
import { generateInvoiceNumber } from '../../utils/invoiceNumber';
import { BkashGateway } from './gateways/bkash.stub';
import { NagadGateway } from './gateways/nagad.stub';
import { SslCommerzGateway } from './gateways/sslcommerz.stub';
import { NotFoundError, BadRequestError } from '../../utils/AppError';
import * as studentRepository from '../students/student.repository';

export class FeeService {
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

    return FeeRepository.createInvoice(
      tenantId,
      {
        studentId: data.studentId,
        invoiceNo,
        totalAmount,
        dueDate: new Date(data.dueDate),
        notes: data.notes,
      },
      data.items
    );
  }

  static async getInvoice(tenantId: string, id: string) {
    const invoice = await FeeRepository.getInvoiceById(tenantId, id);
    if (!invoice) throw new NotFoundError('Invoice not found');
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
    }
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
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
    callbackUrl: string
  ) {
    const invoice = await FeeRepository.getInvoiceById(tenantId, invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');

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

    if (data.amount > Number(invoice.dueAmount)) {
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
