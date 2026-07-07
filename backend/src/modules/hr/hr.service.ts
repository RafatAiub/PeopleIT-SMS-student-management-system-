import * as hrRepository from './hr.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
  CreateStaffDtoType,
  ProcessPayrollDtoType,
  StaffQueryDtoType,
  PayrollQueryDtoType,
} from './hr.dto';

// --- Staff Services ---

export async function createStaff(institutionId: string, data: CreateStaffDtoType) {
  // Check if target user exists in the same institution
  const user = await prisma.user.findFirst({
    where: { id: data.userId, institutionId },
  });
  if (!user) {
    throw new NotFoundError(`User with ID '${data.userId}' not found in this institution`);
  }

  // Check if staff profile already exists for this user
  const existingStaff = await hrRepository.findStaffByUserId(institutionId, data.userId);
  if (existingStaff) {
    throw new ConflictError(`Staff profile already exists for user ID '${data.userId}'`);
  }

  const staff = await hrRepository.createStaff(institutionId, data);
  logger.info('Staff profile created', { staffId: staff.id, userId: data.userId, institutionId });
  return staff;
}

export async function getStaff(institutionId: string, id: string) {
  const staff = await hrRepository.findStaffById(institutionId, id);
  if (!staff) {
    throw new NotFoundError(`Staff profile with ID '${id}' not found`);
  }
  return staff;
}

export async function listStaff(institutionId: string, query: StaffQueryDtoType) {
  return hrRepository.findAllStaff(institutionId, query);
}

// --- Payroll Services ---

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

  const baseSalary = Number(staff.baseSalary);
  const allowances = data.allowances;
  const deductions = data.deductions;
  const netAmount = baseSalary + allowances - deductions;

  const payroll = await hrRepository.createPayroll(institutionId, {
    staffId: data.staffId,
    payPeriod: data.payPeriod,
    baseSalary,
    allowances,
    deductions,
    netAmount,
    status: 'UNPAID',
    paidAt: null,
  });

  logger.info('Payroll processed successfully', {
    payrollId: payroll.id,
    staffId: data.staffId,
    payPeriod: data.payPeriod,
    netAmount,
    institutionId,
  });

  return payroll;
}

export async function getPayroll(institutionId: string, id: string) {
  const payroll = await hrRepository.findPayrollById(institutionId, id);
  if (!payroll) {
    throw new NotFoundError(`Payroll record with ID '${id}' not found`);
  }
  return payroll;
}

export async function listPayrolls(institutionId: string, query: PayrollQueryDtoType) {
  return hrRepository.findAllPayroll(institutionId, query);
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
  return updated;
}
