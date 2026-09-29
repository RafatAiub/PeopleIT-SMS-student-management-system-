import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type {
  CreateStaffDtoType,
  UpdateStaffDtoType,
  StaffQueryDtoType,
  PayrollQueryDtoType,
} from './hr.dto';

const STAFF_USER_SELECT = {
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
} as const;

// --- Staff Profile Repository Functions ---

export async function createStaff(institutionId: string, data: CreateStaffDtoType) {
  return prisma.staffProfile.create({
    data: {
      institutionId,
      userId: data.userId!,
      baseSalary: data.baseSalary,
      department: data.department,
      designation: data.designation,
      status: data.status || 'ACTIVE',
      joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
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

export async function updateStaff(institutionId: string, id: string, data: UpdateStaffDtoType) {
  return prisma.staffProfile.update({
    where: { id, institutionId },
    data: {
      ...(data.department !== undefined ? { department: data.department } : {}),
      ...(data.designation !== undefined ? { designation: data.designation } : {}),
      ...(data.baseSalary !== undefined ? { baseSalary: data.baseSalary } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.joiningDate !== undefined ? { joiningDate: new Date(data.joiningDate) } : {}),
    },
    include: { user: { select: STAFF_USER_SELECT } },
  });
}

export async function getStaffSummary(institutionId: string) {
  const [totalStaff, activeCount, payrollAgg, byDepartmentRaw] = await Promise.all([
    prisma.staffProfile.count({ where: { institutionId } }),
    prisma.staffProfile.count({ where: { institutionId, status: 'ACTIVE' } }),
    prisma.staffProfile.aggregate({
      where: { institutionId, status: 'ACTIVE' },
      _sum: { baseSalary: true },
    }),
    prisma.staffProfile.groupBy({
      by: ['department'],
      where: { institutionId },
      _count: { _all: true },
    }),
  ]);

  return {
    totalStaff,
    activeCount,
    inactiveCount: totalStaff - activeCount,
    totalMonthlyPayroll: Number(payrollAgg._sum.baseSalary ?? 0),
    byDepartment: byDepartmentRaw.map((d) => ({
      department: d.department || 'Unassigned',
      count: d._count._all,
    })),
  };
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
    breakdown?: Prisma.InputJsonValue | null;
    payslipNo?: string | null;
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
      ...(data.breakdown ? { breakdown: data.breakdown } : {}),
      ...(data.payslipNo ? { payslipNo: data.payslipNo } : {}),
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
    where: { id, institutionId },
    data: {
      status,
      ...(paidAt !== undefined ? { paidAt } : {}),
    },
    include: {
      staff: {
        include: {
          user: { select: STAFF_USER_SELECT },
        },
      },
    },
  });
}

// current pay period label, matching the "Month YYYY" format used across the
// staff/payroll UI (e.g. "July 2026")
function currentPayPeriod() {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export async function getPayrollSummary(institutionId: string) {
  const payPeriod = currentPayPeriod();
  const [totalStaff, pendingCount, paidThisMonthAgg] = await Promise.all([
    prisma.staffProfile.count({ where: { institutionId } }),
    prisma.payrollRecord.count({ where: { institutionId, status: 'UNPAID' } }),
    prisma.payrollRecord.aggregate({
      where: { institutionId, status: 'PAID', payPeriod },
      _sum: { netAmount: true },
    }),
  ]);

  return {
    totalStaff,
    pendingCount,
    paidThisMonthTotal: Number(paidThisMonthAgg._sum.netAmount ?? 0),
    currentPeriod: payPeriod,
  };
}

// --- Payroll components / batch / report (Wave C) ---

export async function findStaffComponentAssignments(institutionId: string, staffId: string) {
  return prisma.staffSalaryComponent.findMany({
    where: { institutionId, staffId },
    include: { component: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findLatestPayslipNo(institutionId: string, prefix: string) {
  const latest = await prisma.payrollRecord.findFirst({
    where: { institutionId, payslipNo: { startsWith: prefix } },
    orderBy: { payslipNo: 'desc' },
    select: { payslipNo: true },
  });
  return latest?.payslipNo ?? null;
}

export async function findActiveStaffForBatch(institutionId: string) {
  return prisma.staffProfile.findMany({
    where: { institutionId, status: 'ACTIVE' },
    include: { user: { select: STAFF_USER_SELECT } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findProcessedStaffIds(institutionId: string, payPeriod: string) {
  const rows = await prisma.payrollRecord.findMany({
    where: { institutionId, payPeriod },
    select: { staffId: true },
  });
  return new Set(rows.map((r) => r.staffId));
}

export async function findPayrollsForReport(institutionId: string, payPeriod: string) {
  return prisma.payrollRecord.findMany({
    where: { institutionId, payPeriod },
    include: {
      staff: {
        select: {
          department: true,
          designation: true,
          employeeId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}
