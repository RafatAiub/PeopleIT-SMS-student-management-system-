import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../utils/AppError';

export async function listClassFees(institutionId: string) {
  return prisma.classFee.findMany({
    where: { institutionId },
    select: {
      id: true,
      amount: true,
      class: { select: { id: true, name: true } },
      feeCategory: { select: { id: true, name: true, frequency: true } },
    },
    orderBy: [{ class: { level: 'asc' } }, { createdAt: 'asc' }],
  });
}

/**
 * Replaces the fee types assigned to one class with exactly `items` —
 * upserting the listed ones and removing any no longer listed — so the same
 * form serves both first-time assignment and later edits.
 */
export async function setClassFees(
  institutionId: string,
  data: { classId: string; items: { feeCategoryId: string; amount: number }[] },
) {
  const cls = await prisma.class.findFirst({
    where: { id: data.classId, branch: { institutionId } },
    select: { id: true },
  });
  if (!cls) throw new NotFoundError(`Class with ID '${data.classId}' not found`);

  const categoryIds = Array.from(new Set(data.items.map((i) => i.feeCategoryId)));
  if (categoryIds.length !== data.items.length) {
    throw new ValidationError('Each fee type can only be assigned once per class');
  }
  const owned = await prisma.feeCategory.count({ where: { id: { in: categoryIds }, institutionId } });
  if (owned !== categoryIds.length) throw new NotFoundError('One or more fee types were not found');

  await prisma.$transaction([
    prisma.classFee.deleteMany({
      where: { institutionId, classId: data.classId, feeCategoryId: { notIn: categoryIds } },
    }),
    ...data.items.map((item) =>
      prisma.classFee.upsert({
        where: { classId_feeCategoryId: { classId: data.classId, feeCategoryId: item.feeCategoryId } },
        update: { amount: item.amount },
        create: { institutionId, classId: data.classId, feeCategoryId: item.feeCategoryId, amount: item.amount },
      }),
    ),
  ]);

  return listClassFees(institutionId);
}

export async function deleteClassFee(institutionId: string, id: string) {
  const result = await prisma.classFee.deleteMany({ where: { id, institutionId } });
  if (result.count === 0) throw new NotFoundError(`Class fee with ID '${id}' not found`);
}

export async function listPayments(
  institutionId: string,
  query: { page: number; pageSize: number; search?: string; method?: string },
) {
  const { page, pageSize, search, method } = query;
  const where: Prisma.PaymentWhereInput = {
    invoice: {
      institutionId,
      ...(search
        ? {
            OR: [
              { invoiceNo: { contains: search, mode: 'insensitive' } },
              { student: { firstName: { contains: search, mode: 'insensitive' } } },
              { student: { lastName: { contains: search, mode: 'insensitive' } } },
              { student: { studentId: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    ...(method ? { method } : {}),
  };

  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      select: {
        id: true,
        amount: true,
        method: true,
        transactionRef: true,
        status: true,
        paidAt: true,
        invoice: {
          select: {
            invoiceNo: true,
            student: { select: { firstName: true, lastName: true, studentId: true, class: { select: { name: true } } } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total };
}
