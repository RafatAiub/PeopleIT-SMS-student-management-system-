import * as hrRepository from './hr.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
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

  return mapPayroll(payroll);
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
