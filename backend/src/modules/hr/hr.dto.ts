import { z } from 'zod';

export const CreateStaffDto = z.object({
  userId: z.string().min(1, 'User ID is required'),
  baseSalary: z.number().positive('Base salary must be positive'),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
});

export const ProcessPayrollDto = z.object({
  payPeriod: z.string().min(1, 'Pay period is required'),
  staffId: z.string().min(1, 'Staff ID is required'),
  allowances: z.number().nonnegative().default(0),
  deductions: z.number().nonnegative().default(0),
});

export const StaffQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

export const PayrollQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  staffId: z.string().optional(),
  payPeriod: z.string().optional(),
});

export const StaffIdParamDto = z.object({
  id: z.string().cuid('Invalid staff ID'),
});

export const PayrollIdParamDto = z.object({
  id: z.string().cuid('Invalid payroll ID'),
});

export type CreateStaffDtoType = z.infer<typeof CreateStaffDto>;
export type ProcessPayrollDtoType = z.infer<typeof ProcessPayrollDto>;
export type StaffQueryDtoType = z.infer<typeof StaffQueryDto>;
export type PayrollQueryDtoType = z.infer<typeof PayrollQueryDto>;
