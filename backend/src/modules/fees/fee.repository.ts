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

  static async listCategories(tenantId: string, includeInactive: boolean) {
    const [categories, usage] = await Promise.all([
      prisma.feeCategory.findMany({
        where: {
          institutionId: tenantId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: { _count: { select: { invoiceItems: true } } },
        orderBy: { name: 'asc' },
      }),
      // Revenue actually collected per category — counts only fully-paid
      // invoices, since partially-paid invoices can't be unambiguously
      // attributed across their line items.
      prisma.invoiceItem.groupBy({
        by: ['feeCategoryId'],
        where: { invoice: { institutionId: tenantId, status: 'PAID' } },
        _sum: { netAmount: true },
      }),
    ]);

    const revenueByCategory = new Map(usage.map((u) => [u.feeCategoryId, Number(u._sum.netAmount ?? 0)]));

    return categories.map(({ _count, ...cat }) => ({
      ...cat,
      linkedInvoiceCount: _count.invoiceItems,
      revenueCollected: revenueByCategory.get(cat.id) ?? 0,
    }));
  }

  static async countInvoiceItemsForCategory(tenantId: string, feeCategoryId: string) {
    return prisma.invoiceItem.count({
      where: { feeCategoryId, invoice: { institutionId: tenantId } },
    });
  }

  static async deleteCategory(tenantId: string, id: string) {
    return prisma.feeCategory.delete({
      where: { id, institutionId: tenantId },
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

  private static buildInvoiceWhere(tenantId: string, filters: {
    studentId?: string;
    studentIdIn?: string[];
    status?: string;
    search?: string;
  }) {
    const where: any = { institutionId: tenantId };
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.studentIdIn) where.studentId = { in: filters.studentIdIn };
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { invoiceNo: { contains: filters.search, mode: 'insensitive' } },
        {
          student: {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { studentId: { contains: filters.search, mode: 'insensitive' } }
            ]
          }
        }
      ];
    }
    return where;
  }

  static async getInvoiceSummary(tenantId: string, filters: {
    studentId?: string;
    studentIdIn?: string[];
    search?: string;
  }) {
    const where = FeeRepository.buildInvoiceWhere(tenantId, filters);

    const [totals, overdueCount] = await prisma.$transaction([
      prisma.invoice.aggregate({
        where,
        _sum: { totalAmount: true, paidAmount: true, dueAmount: true },
      }),
      prisma.invoice.count({ where: { ...where, status: 'OVERDUE' } }),
    ]);

    return {
      totalInvoiced: Number(totals._sum.totalAmount ?? 0),
      totalCollected: Number(totals._sum.paidAmount ?? 0),
      totalOutstanding: Number(totals._sum.dueAmount ?? 0),
      overdueCount,
    };
  }

  static async listInvoices(
    tenantId: string,
    filters: {
      studentId?: string;
      studentIdIn?: string[];
      status?: string;
      search?: string;
      page: number;
      pageSize: number;
    }
  ) {
    const where = FeeRepository.buildInvoiceWhere(tenantId, filters);

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
