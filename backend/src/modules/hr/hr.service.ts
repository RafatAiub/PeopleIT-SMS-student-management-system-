import * as hrRepository from './hr.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';
import { getInvoiceTenantTag } from '../../utils/invoiceNumber';
import {
  computePayrollBreakdown,
  toComponentInput,
  type ComponentInput,
  type PayrollBreakdown,
} from '../payroll-components/payroll.logic';
import {
  aggregatePayrollReport,
  formatPayslipNo,
  parsePayslipCounter,
  payPeriodToYearMonth,
  payslipPrefix,
} from './payslip.logic';
import type {
  CreateStaffDtoType,
  UpdateStaffDtoType,
  ProcessPayrollDtoType,
  StaffQueryDtoType,
  PayrollQueryDtoType,
} from './hr.dto';

// Flattens the joined `user` relation onto the staff profile so callers never
// have to reach into `staff.user.firstName` — the frontend renders `name`,
// `email`, `phone` directly off the top-level object.
function mapStaff(staff: any) {
  const { user, ...rest } = staff;
  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  return {
    ...rest,
    name: name || 'Unnamed Staff',
    email: user?.email ?? null,
    phone: user?.phone ?? null,
  };
}

function mapPayroll(payroll: any) {
  const { staff, ...rest } = payroll;
  return {
    ...rest,
    staffName: staff ? mapStaff(staff).name : 'Unknown Staff',
    designation: staff?.designation ?? null,
  };
}

// --- Staff Services ---

export async function createStaff(institutionId: string, data: CreateStaffDtoType) {
  let targetUserId = data.userId;

  // If userId is omitted, attempt to look up user by email or auto-create User account
  if (!targetUserId && data.email) {
    const existingUser = await prisma.user.findFirst({
      where: { email: data.email.toLowerCase().trim(), institutionId },
    });
    if (existingUser) {
      targetUserId = existingUser.id;
    } else {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('Staff@123', 10);
      const nameParts = (data.name || 'Staff Member').trim().split(' ');
      const firstName = nameParts[0] || 'Staff';
      const lastName = nameParts.slice(1).join(' ') || 'Member';

      let userRole: any = 'TEACHER';
      if (data.role && ['ADMIN', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'TEACHER'].includes(data.role.toUpperCase())) {
        userRole = data.role.toUpperCase();
      }

      const newUser = await prisma.user.create({
        data: {
          institutionId,
          email: data.email.toLowerCase().trim(),
          passwordHash: hashedPassword,
          firstName,
          lastName,
          role: userRole,
          phone: data.phone || null,
        },
      });
      targetUserId = newUser.id;
    }
  }

  if (!targetUserId) {
    throw new NotFoundError('User ID or registered email is required to create a staff profile');
  }

  // Check if target user exists in the same institution
  const user = await prisma.user.findFirst({
    where: { id: targetUserId, institutionId },
  });
  if (!user) {
    throw new NotFoundError(`User with ID '${targetUserId}' not found in this institution`);
  }

  // Check if staff profile already exists for this user
  const existingStaff = await hrRepository.findStaffByUserId(institutionId, targetUserId);
  if (existingStaff) {
    throw new ConflictError(`Staff profile already exists for user ID '${targetUserId}'`);
  }

  const staffData = {
    ...data,
    userId: targetUserId,
  };

  const staff = await hrRepository.createStaff(institutionId, staffData);
  logger.info('Staff profile created', { staffId: staff.id, userId: targetUserId, institutionId });
  return mapStaff(staff);
}

export async function getStaff(institutionId: string, id: string) {
  const staff = await hrRepository.findStaffById(institutionId, id);
  if (!staff) {
    throw new NotFoundError(`Staff profile with ID '${id}' not found`);
  }
  return mapStaff(staff);
}

export async function listStaff(institutionId: string, query: StaffQueryDtoType) {
  const [{ staff, total }, summary] = await Promise.all([
    hrRepository.findAllStaff(institutionId, query),
    hrRepository.getStaffSummary(institutionId),
  ]);
  return { staff: staff.map(mapStaff), total, summary };
}

export async function updateStaff(institutionId: string, id: string, data: UpdateStaffDtoType) {
  const staff = await hrRepository.findStaffById(institutionId, id);
  if (!staff) {
    throw new NotFoundError(`Staff profile with ID '${id}' not found`);
  }
  const updated = await hrRepository.updateStaff(institutionId, id, data);
  logger.info('Staff profile updated', { staffId: id, institutionId });
  return mapStaff(updated);
}

// --- Payroll Services ---

/**
 * Loads a staff member's active salary components as calculation inputs.
 * Tolerant: if the Wave C tables aren't migrated yet (or the lookup fails for
 * any reason) payroll falls back to today's manual allowances/deductions.
 */
async function loadComponentInputs(institutionId: string, staffId: string): Promise<ComponentInput[]> {
  try {
    const rows = await hrRepository.findStaffComponentAssignments(institutionId, staffId);
    return rows
      .map((a) =>
        toComponentInput({
          overrideValue: a.overrideValue === null ? null : Number(a.overrideValue),
          component: { ...a.component, value: Number(a.component.value) },
        }),
      )
      .filter((x): x is ComponentInput => x !== null);
  } catch (error) {
    logger.warn('Salary components unavailable — processing payroll without them', {
      institutionId,
      staffId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function isPayslipCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('payslipNo');
}

/**
 * Hands out sequential payslip numbers for one tenant + pay period. The
 * counter starts above the DB max; after a unique collision (a concurrent
 * run took the number) it re-reads the DB.
 */
class PayslipAllocator {
  private counter: number | null = null;
  private tag: string | null = null;
  private readonly yearMonth: string;

  constructor(
    private readonly institutionId: string,
    payPeriod: string,
    now = new Date(),
  ) {
    this.yearMonth =
      payPeriodToYearMonth(payPeriod) ?? `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async next(): Promise<string> {
    if (this.tag === null) this.tag = await getInvoiceTenantTag(this.institutionId);
    const prefix = payslipPrefix(this.tag, this.yearMonth);
    if (this.counter === null) {
      this.counter = parsePayslipCounter(await hrRepository.findLatestPayslipNo(this.institutionId, prefix), prefix);
    }
    this.counter += 1;
    return formatPayslipNo(this.tag, this.yearMonth, this.counter);
  }

  reset() {
    this.counter = null;
  }
}

async function createPayrollRecord(
  institutionId: string,
  staff: { id: string; baseSalary: unknown },
  payPeriod: string,
  manual: { allowances: number; deductions: number },
  allocator: PayslipAllocator,
) {
  const baseSalary = Number(staff.baseSalary);
  const components = await loadComponentInputs(institutionId, staff.id);

  // No components configured → identical amounts to the pre-Wave-C behaviour.
  let allowances = manual.allowances;
  let deductions = manual.deductions;
  let netAmount = baseSalary + allowances - deductions;
  let breakdown: PayrollBreakdown | null = null;
  if (components.length > 0) {
    breakdown = computePayrollBreakdown(baseSalary, components, manual);
    allowances = breakdown.allowances;
    deductions = breakdown.deductions;
    netAmount = breakdown.netAmount;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const payslipNo = await allocator.next();
    try {
      return await hrRepository.createPayroll(institutionId, {
        staffId: staff.id,
        payPeriod,
        baseSalary,
        allowances,
        deductions,
        netAmount,
        status: 'UNPAID',
        paidAt: null,
        breakdown: breakdown as unknown as Prisma.InputJsonValue | null,
        payslipNo,
      });
    } catch (error) {
      if (!isPayslipCollision(error)) throw error;
      lastError = error;
      allocator.reset();
    }
  }
  throw lastError;
}

export async function processPayroll(institutionId: string, data: ProcessPayrollDtoType) {
  const staff = await hrRepository.findStaffById(institutionId, data.staffId);
  if (!staff) {
    throw new NotFoundError(`Staff profile with ID '${data.staffId}' not found`);
  }

  // Prevent duplicate payroll processing for the same pay period
  const existingPayroll = await hrRepository.findPayrollByStaffAndPeriod(
    institutionId,
    data.staffId,
    data.payPeriod,
  );
  if (existingPayroll) {
    throw new ConflictError(
      `Payroll already processed for staff ID '${data.staffId}' for period '${data.payPeriod}'`,
    );
  }

  const payroll = await createPayrollRecord(
    institutionId,
    staff,
    data.payPeriod,
    { allowances: data.allowances, deductions: data.deductions },
    new PayslipAllocator(institutionId, data.payPeriod),
  );

  logger.info('Payroll processed successfully', {
    payrollId: payroll.id,
    staffId: data.staffId,
    payPeriod: data.payPeriod,
    netAmount: Number(payroll.netAmount),
    institutionId,
  });

  return mapPayroll(payroll);
}

/**
 * Processes payroll for every ACTIVE staff member who has no record for the
 * period yet. Idempotent: running it twice processes nobody the second time.
 */
export async function processPayrollBatch(institutionId: string, payPeriod: string) {
  const [staffList, processed] = await Promise.all([
    hrRepository.findActiveStaffForBatch(institutionId),
    hrRepository.findProcessedStaffIds(institutionId, payPeriod),
  ]);
  const allocator = new PayslipAllocator(institutionId, payPeriod);
  const errors: { staffId: string; staffName: string; message: string }[] = [];
  let created = 0;
  let totalNet = 0;

  for (const staff of staffList) {
    if (processed.has(staff.id)) continue;
    try {
      const record = await createPayrollRecord(institutionId, staff, payPeriod, { allowances: 0, deductions: 0 }, allocator);
      created++;
      totalNet += Number(record.netAmount);
    } catch (error) {
      errors.push({
        staffId: staff.id,
        staffName: mapStaff(staff).name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const skipped = staffList.filter((s) => processed.has(s.id)).length;
  logger.info('Payroll batch processed', { institutionId, payPeriod, created, skipped, failed: errors.length });
  return {
    payPeriod,
    activeStaff: staffList.length,
    processed: created,
    skipped,
    failed: errors.length,
    totalNet: Math.round(totalNet * 100) / 100,
    errors,
  };
}

export async function getPayrollReport(institutionId: string, payPeriod: string) {
  const records = await hrRepository.findPayrollsForReport(institutionId, payPeriod);
  const normalized = records.map((r) => ({
    department: r.staff?.department ?? null,
    baseSalary: Number(r.baseSalary),
    allowances: Number(r.allowances),
    deductions: Number(r.deductions),
    netAmount: Number(r.netAmount),
    status: r.status,
    breakdown: (r.breakdown as unknown as PayrollBreakdown | null) ?? null,
  }));
  return {
    payPeriod,
    ...aggregatePayrollReport(normalized),
    rows: records.map((r, i) => ({
      id: r.id,
      payslipNo: r.payslipNo,
      staffName: `${r.staff?.user?.firstName ?? ''} ${r.staff?.user?.lastName ?? ''}`.trim() || 'Unknown Staff',
      employeeId: r.staff?.employeeId ?? null,
      department: r.staff?.department || 'Unassigned',
      designation: r.staff?.designation ?? null,
      baseSalary: normalized[i].baseSalary,
      allowances: normalized[i].allowances,
      deductions: normalized[i].deductions,
      netAmount: normalized[i].netAmount,
      status: r.status,
      components: normalized[i].breakdown?.items ?? null,
    })),
  };
}

export async function getPayroll(institutionId: string, id: string) {
  const payroll = await hrRepository.findPayrollById(institutionId, id);
  if (!payroll) {
    throw new NotFoundError(`Payroll record with ID '${id}' not found`);
  }
  return mapPayroll(payroll);
}

export async function listPayrolls(institutionId: string, query: PayrollQueryDtoType) {
  const [{ payrolls, total }, summary] = await Promise.all([
    hrRepository.findAllPayroll(institutionId, query),
    hrRepository.getPayrollSummary(institutionId),
  ]);
  return { payrolls: payrolls.map(mapPayroll), total, summary };
}

export async function payPayroll(institutionId: string, id: string) {
  const payroll = await hrRepository.findPayrollById(institutionId, id);
  if (!payroll) {
    throw new NotFoundError(`Payroll record with ID '${id}' not found`);
  }

  if (payroll.status === 'PAID') {
    throw new ConflictError(`Payroll record with ID '${id}' is already paid`);
  }

  const updated = await hrRepository.updatePayrollStatus(institutionId, id, 'PAID', new Date());
  logger.info('Payroll status updated to PAID', { payrollId: id, institutionId });
  return mapPayroll(updated);
}
