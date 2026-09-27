export interface StaffProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  employeeId?: string | null;
  joiningDate: string | null;
  baseSalary: number;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

export interface StaffSummary {
  totalStaff: number;
  activeCount: number;
  inactiveCount: number;
  totalMonthlyPayroll: number;
  byDepartment: { department: string; count: number }[];
}

export interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  designation: string | null;
  payPeriod: string;
  baseSalary: number;
  allowances: number;
  deductions: number;
  netAmount: number;
  status: 'PAID' | 'UNPAID' | 'PENDING';
  paidAt?: string | null;
  /** Wave C: PAY-<TAG>-YYYYMM-NNNN; null on records processed before payslip numbers existed. */
  payslipNo?: string | null;
  /** Wave C: component breakdown; null when no salary components applied. */
  breakdown?: PayrollBreakdown | null;
}

export type SalaryComponentType = 'ALLOWANCE' | 'DEDUCTION';
export type SalaryCalcType = 'FIXED' | 'PERCENT_OF_BASE';

export interface SalaryComponent {
  id: string;
  name: string;
  type: SalaryComponentType;
  calcType: SalaryCalcType;
  value: number;
  isActive: boolean;
  assignedCount?: number;
}

export interface BreakdownItem {
  componentId: string | null;
  name: string;
  type: SalaryComponentType;
  calcType: SalaryCalcType;
  value: number;
  amount: number;
}

export interface PayrollBreakdown {
  version: 1;
  baseSalary: number;
  items: BreakdownItem[];
  allowances: number;
  deductions: number;
  netAmount: number;
}

export interface StaffComponents {
  staffId: string;
  staffName: string;
  baseSalary: number;
  assignments: { id: string; componentId: string; overrideValue: number | null; component: SalaryComponent }[];
  preview: PayrollBreakdown;
}

export interface PayrollBatchResult {
  payPeriod: string;
  activeStaff: number;
  processed: number;
  skipped: number;
  failed: number;
  totalNet: number;
  errors: { staffId: string; staffName: string; message: string }[];
}

export interface PayrollReport {
  payPeriod: string;
  totals: { count: number; baseSalary: number; allowances: number; deductions: number; netAmount: number; paidAmount: number; unpaidAmount: number };
  byDepartment: { department: string; count: number; baseSalary: number; allowances: number; deductions: number; netAmount: number }[];
  byComponent: { name: string; type: SalaryComponentType; count: number; total: number }[];
  rows: {
    id: string;
    payslipNo: string | null;
    staffName: string;
    employeeId: string | null;
    department: string;
    designation: string | null;
    baseSalary: number;
    allowances: number;
    deductions: number;
    netAmount: number;
    status: string;
    components: BreakdownItem[] | null;
  }[];
}

export interface PayrollSummary {
  totalStaff: number;
  pendingCount: number;
  paidThisMonthTotal: number;
  currentPeriod: string;
}

export interface NewStaffForm {
  name: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  joiningDate: string;
  basicSalary: number;
}

export interface EditStaffForm {
  department: string;
  designation: string;
  baseSalary: number;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

// The backend derives its "current period" the same way (see
// hr.repository.ts `currentPayPeriod()`): `Intl` long-month name + year,
// e.g. "September 2026". We generate a real, non-fake window of periods
// around today (12 months back through 12 months ahead) in that exact
// string format so it always matches what `/hr/payroll` expects/returns.
export function buildPayPeriodOptions(monthsBack = 12, monthsForward = 12): string[] {
  const periods: string[] = [];
  const now = new Date();
  for (let offset = -monthsBack; offset <= monthsForward; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    periods.push(d.toLocaleString('en-US', { month: 'long', year: 'numeric' }));
  }
  return periods;
}

export const CURRENT_PAY_PERIOD = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
export const PAY_PERIOD_OPTIONS = buildPayPeriodOptions();

export const DEPARTMENT_OPTIONS = ['Science', 'Mathematics', 'English', 'Administration', 'Maintenance'];
export const ROLE_OPTIONS = ['Teacher', 'Senior Teacher', 'IT Administrator', 'Librarian', 'Support Staff'];
