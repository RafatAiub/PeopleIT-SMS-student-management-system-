import { z } from 'zod';

export const CreateStaffDto = z
  .object({
    userId: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    email: z.string().trim().toLowerCase().email('Invalid email format').optional().nullable().or(z.literal('')),
    phone: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    designation: z.string().optional().nullable(),
    department: z.string().optional().nullable().default('General'),
    joiningDate: z.string().optional().nullable(),
    baseSalary: z
      .preprocess((val) => {
        if (val === undefined || val === null || val === '') return undefined;
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      }, z.number().positive('Base salary must be positive'))
      .optional()
      .nullable(),
    basicSalary: z
      .preprocess((val) => {
        if (val === undefined || val === null || val === '') return undefined;
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      }, z.number().positive('Basic salary must be positive'))
      .optional()
      .nullable(),
    salary: z
      .preprocess((val) => {
        if (val === undefined || val === null || val === '') return undefined;
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      }, z.number().positive('Salary must be positive'))
      .optional()
      .nullable(),
    allowances: z
      .preprocess((val) => {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      }, z.number().nonnegative())
      .optional()
      .default(0),
    deductions: z
      .preprocess((val) => {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      }, z.number().nonnegative())
      .optional()
      .default(0),
    status: z.string().optional().nullable().default('ACTIVE'),
  })
  .transform((data) => {
    const finalSalary = data.baseSalary ?? data.basicSalary ?? data.salary ?? 0;
    const finalDesignation = data.designation || data.role || data.title || 'Staff Member';
    const finalStatus = (data.status || 'ACTIVE').toUpperCase();
    return {
      userId: data.userId || undefined,
      name: data.name || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      role: data.role || undefined,
      designation: finalDesignation,
      department: data.department || 'General',
      joiningDate: data.joiningDate || undefined,
      baseSalary: finalSalary > 0 ? finalSalary : 1,
      allowances: data.allowances ?? 0,
      deductions: data.deductions ?? 0,
      status: finalStatus,
    };
  });

export const UpdateStaffDto = z.object({
  department: z.string().min(1).optional(),
  designation: z.string().min(1).optional(),
  baseSalary: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    }, z.number().positive('Base salary must be positive'))
    .optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  joiningDate: z.string().optional(),
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
  id: z.string().min(1, 'Invalid staff ID'),
});

export const PayrollIdParamDto = z.object({
  id: z.string().min(1, 'Invalid payroll ID'),
});

export type CreateStaffDtoType = z.infer<typeof CreateStaffDto>;
export type UpdateStaffDtoType = z.infer<typeof UpdateStaffDto>;
export type ProcessPayrollDtoType = z.infer<typeof ProcessPayrollDto>;
export type StaffQueryDtoType = z.infer<typeof StaffQueryDto>;
export type PayrollQueryDtoType = z.infer<typeof PayrollQueryDto>;
