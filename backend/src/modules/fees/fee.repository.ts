import { prisma } from '../../config/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export class FeeRepository {
  static async createCategory(tenantId: string, data: {
    name: string;
    description?: string;
    amount: number;
    frequency: string;
  }) {
    return prisma.feeCategory.create({
      data: {
        ...data,
        amount: new Decimal(data.amount),
        institutionId: tenantId,
      },
    });
  }

  static async updateCategory(tenantId: string, id: string, data: {
    name?: string;
    description?: string;
    amount?: number;
    frequency?: string;
    isActive?: boolean;
  }) {
    return prisma.feeCategory.update({
      where: {
        id,
        institutionId: tenantId,
      },
      data: {
        ...data,
        amount: data.amount ? new Decimal(data.amount) : undefined,
      },
    });
  }

  static async getCategoryById(tenantId: string, id: string) {
    return prisma.feeCategory.findFirst({
      where: {
        id,
        institutionId: tenantId,
      },
    });
  }

  static async listCategories(tenantId: string) {
    return prisma.feeCategory.findMany({
      where: {
        institutionId: tenantId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  static async createInvoice(
    tenantId: string,
    data: {
      studentId: string;
      invoiceNo: string;
      totalAmount: number;
      dueDate: Date;
      notes?: string;
    },
    items: {
      feeCategoryId: string;
      description: string;
      amount: number;
      discount: number;
    }[]
  ) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          institutionId: tenantId,
          studentId: data.studentId,
          invoiceNo: data.invoiceNo,
          totalAmount: new Decimal(data.totalAmount),
          dueAmount: new Decimal(data.totalAmount),
          paidAmount: new Decimal(0),
          dueDate: data.dueDate,
          status: 'UNPAID',
          notes: data.notes,
        },
      });

      const invoiceItemsData = items.map((item) => {
        const net = item.amount - item.discount;
        return {
          invoiceId: invoice.id,
          feeCategoryId: item.feeCategoryId,
          description: item.description,
          amount: new Decimal(item.amount),
          discount: new Decimal(item.discount),
          netAmount: new Decimal(net),
        };
      });

      await tx.invoiceItem.createMany({
        data: invoiceItemsData,
      });

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: { items: true },
      });
    });
  }

  static async getInvoiceById(tenantId: string, id: string) {
    return prisma.invoice.findFirst({
      where: {
        id,
        institutionId: tenantId,
      },
      include: {
        items: true,
        payments: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentId: true,
            rollNumber: true,
          },
        },
      },
    });
  }

  static async getInvoiceByNo(tenantId: string, invoiceNo: string) {
    return prisma.invoice.findFirst({
      where: {
        invoiceNo,
        institutionId: tenantId,
      },
    });
  }

  static async listInvoices(
    tenantId: string,
    filters: {
      studentId?: string;
      status?: string;
      page: number;
      pageSize: number;
    }
  ) {
    const where: any = { institutionId: tenantId };
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.status) where.status = filters.status;

    const [total, invoices] = await prisma.$transaction([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        select: {
          id: true,
          invoiceNo: true,
          totalAmount: true,
          paidAmount: true,
          dueAmount: true,
          dueDate: true,
          status: true,
          createdAt: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              studentId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
    ]);

    return { total, invoices };
  }

  static async recordPayment(
    tenantId: string,
    invoiceId: string,
    paymentData: {
      amount: number;
      method: string;
      transactionRef?: string;
      notes?: string;
      recordedBy: string;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, institutionId: tenantId },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: new Decimal(paymentData.amount),
          method: paymentData.method,
          transactionRef: paymentData.transactionRef,
          notes: paymentData.notes,
          recordedBy: paymentData.recordedBy,
          status: 'COMPLETED',
        },
      });

      const newPaidAmount = Decimal.add(invoice.paidAmount, paymentData.amount);
      const newDueAmount = Decimal.sub(invoice.totalAmount, newPaidAmount);

      let newStatus = 'UNPAID';
      if (newDueAmount.lte(0)) {
        newStatus = 'PAID';
      } else if (newPaidAmount.gt(0)) {
        newStatus = 'PARTIAL';
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount.lt(0) ? new Decimal(0) : newDueAmount,
          status: newStatus,
        },
      });

      return payment;
    });
  }
}
