import { prisma } from '../../config/prisma';
import type {
  CreateStaffDtoType,
  StaffQueryDtoType,
  PayrollQueryDtoType,
} from './hr.dto';

// --- Staff Profile Repository Functions ---

export async function createStaff(institutionId: string, data: CreateStaffDtoType) {
  return prisma.staffProfile.create({
    data: {
      institutionId,
      userId: data.userId,
      baseSalary: data.baseSalary,
      department: data.department,
      designation: data.designation,
      status: 'ACTIVE',
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  });
}

export async function findStaffById(institutionId: string, id: string) {
  return prisma.staffProfile.findFirst({
    where: { id, institutionId },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  });
}

export async function findStaffByUserId(institutionId: string, userId: string) {
  return prisma.staffProfile.findFirst({
    where: { userId, institutionId },
  });
}

export async function findAllStaff(institutionId: string, query: StaffQueryDtoType) {
  const { page, pageSize, search } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(search
      ? {
          OR: [
            { department: { contains: search, mode: 'insensitive' as const } },
            { designation: { contains: search, mode: 'insensitive' as const } },
            {
              user: {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' as const } },
                  { lastName: { contains: search, mode: 'insensitive' as const } },
                  { email: { contains: search, mode: 'insensitive' as const } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [staff, total] = await prisma.$transaction([
    prisma.staffProfile.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.staffProfile.count({ where }),
  ]);

  return { staff, total };
}

// --- Payroll Repository Functions ---

export async function createPayroll(
  institutionId: string,
  data: {
    staffId: string;
    payPeriod: string;
    baseSalary: number;
    allowances: number;
    deductions: number;
    netAmount: number;
    status: 'PAID' | 'UNPAID' | 'PENDING';
    paidAt?: Date | null;
  },
) {
  return prisma.payrollRecord.create({
    data: {
      institutionId,
      staffId: data.staffId,
      payPeriod: data.payPeriod,
      baseSalary: data.baseSalary,
      allowances: data.allowances,
      deductions: data.deductions,
      netAmount: data.netAmount,
      status: data.status,
      paidAt: data.paidAt,
    },
    include: {
      staff: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

export async function findPayrollById(institutionId: string, id: string) {
  return prisma.payrollRecord.findFirst({
    where: { id, institutionId },
    include: {
      staff: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

export async function findPayrollByStaffAndPeriod(
  institutionId: string,
  staffId: string,
  payPeriod: string,
) {
  return prisma.payrollRecord.findFirst({
    where: { staffId, payPeriod, institutionId },
  });
}

export async function findAllPayroll(institutionId: string, query: PayrollQueryDtoType) {
  const { page, pageSize, staffId, payPeriod } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(staffId ? { staffId } : {}),
    ...(payPeriod ? { payPeriod } : {}),
  };

  const [payrolls, total] = await prisma.$transaction([
    prisma.payrollRecord.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        staff: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payrollRecord.count({ where }),
  ]);

  return { payrolls, total };
}

export async function updatePayrollStatus(
  institutionId: string,
  id: string,
  status: 'PAID' | 'UNPAID' | 'PENDING',
  paidAt?: Date | null,
) {
  return prisma.payrollRecord.update({
    where: { id },
    data: {
      status,
      ...(paidAt !== undefined ? { paidAt } : {}),
    },
  });
}
