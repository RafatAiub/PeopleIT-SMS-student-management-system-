// Pure payroll component calculation (no prisma) — unit-testable.

export type ComponentType = 'ALLOWANCE' | 'DEDUCTION';
export type CalcType = 'FIXED' | 'PERCENT_OF_BASE';

export interface ComponentInput {
  componentId: string | null;
  name: string;
  type: ComponentType;
  calcType: CalcType;
  /** Effective value: the staff override when set, else the component default. */
  value: number;
}

export interface BreakdownItem extends ComponentInput {
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

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function componentAmount(baseSalary: number, calcType: CalcType, value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return round2(calcType === 'PERCENT_OF_BASE' ? (baseSalary * value) / 100 : value);
}

/**
 * Computes allowances/deductions from salary components plus optional manual
 * adjustments (entered in the process-payroll form), each stored as its own
 * line so the payslip shows exactly how the net was reached.
 */
export function computePayrollBreakdown(
  baseSalary: number,
  components: ComponentInput[],
  manual: { allowances?: number; deductions?: number } = {},
): PayrollBreakdown {
  const base = round2(baseSalary);
  const items: BreakdownItem[] = components.map((c) => ({ ...c, amount: componentAmount(base, c.calcType, c.value) }));

  if (manual.allowances && manual.allowances > 0) {
    items.push({ componentId: null, name: 'Additional allowance', type: 'ALLOWANCE', calcType: 'FIXED', value: manual.allowances, amount: round2(manual.allowances) });
  }
  if (manual.deductions && manual.deductions > 0) {
    items.push({ componentId: null, name: 'Additional deduction', type: 'DEDUCTION', calcType: 'FIXED', value: manual.deductions, amount: round2(manual.deductions) });
  }

  const allowances = round2(items.filter((i) => i.type === 'ALLOWANCE').reduce((s, i) => s + i.amount, 0));
  const deductions = round2(items.filter((i) => i.type === 'DEDUCTION').reduce((s, i) => s + i.amount, 0));
  return { version: 1, baseSalary: base, items, allowances, deductions, netAmount: round2(base + allowances - deductions) };
}

/** Resolves a staff assignment into a calculation input (override wins). */
export function toComponentInput(assignment: {
  overrideValue: number | null;
  component: { id: string; name: string; type: ComponentType; calcType: CalcType; value: number; isActive: boolean };
}): ComponentInput | null {
  if (!assignment.component.isActive) return null;
  return {
    componentId: assignment.component.id,
    name: assignment.component.name,
    type: assignment.component.type,
    calcType: assignment.component.calcType,
    value: assignment.overrideValue ?? assignment.component.value,
  };
}
