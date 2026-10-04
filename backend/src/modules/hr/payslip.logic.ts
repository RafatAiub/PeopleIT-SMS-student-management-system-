// Pure payslip-number + payroll-report helpers (no prisma) — unit-testable.
import type { PayrollBreakdown } from '../payroll-components/payroll.logic';
import { round2 } from '../payroll-components/payroll.logic';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * "July 2026" (the format the HR UI uses) or "2026-07" → "202607".
 * Returns null when the period can't be parsed.
 */
export function payPeriodToYearMonth(payPeriod: string): string | null {
  const v = payPeriod.trim();
  const iso = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);
  if (iso) return `${iso[1]}${iso[2]}`;
  const named = /^([A-Za-z]+)\s+(\d{4})$/.exec(v);
  if (named) {
    const name = named[1].toLowerCase();
    const idx = MONTHS.findIndex((m) => m === name || (name.length >= 3 && m.startsWith(name)));
    if (idx >= 0) return `${named[2]}${String(idx + 1).padStart(2, '0')}`;
  }
  return null;
}

/** PAY-<TAG>-<YYYYMM>-<4-digit counter>. */
export function formatPayslipNo(tenantTag: string, yearMonth: string, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1) throw new Error(`Invalid payslip counter: ${counter}`);
  if (!/^\d{6}$/.test(yearMonth)) throw new Error(`Invalid year-month: ${yearMonth}`);
  return `PAY-${tenantTag}-${yearMonth}-${String(counter).padStart(4, '0')}`;
}

export function payslipPrefix(tenantTag: string, yearMonth: string): string {
  return `PAY-${tenantTag}-${yearMonth}-`;
}

export function parsePayslipCounter(payslipNo: string | null | undefined, prefix: string): number {
  if (!payslipNo || !payslipNo.startsWith(prefix)) return 0;
  const n = parseInt(payslipNo.slice(prefix.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Highest counter among existing payslip numbers with this prefix. */
export function maxPayslipCounter(payslipNos: (string | null)[], prefix: string): number {
  return payslipNos.reduce((max, p) => Math.max(max, parsePayslipCounter(p, prefix)), 0);
}

// ── Report aggregation ──────────────────────────────────────────────────

export interface ReportRecord {
  department: string | null;
  baseSalary: number;
  allowances: number;
  deductions: number;
  netAmount: number;
  status: string;
  breakdown: PayrollBreakdown | null;
}

interface Totals {
  count: number;
  baseSalary: number;
  allowances: number;
  deductions: number;
  netAmount: number;
}

const emptyTotals = (): Totals => ({ count: 0, baseSalary: 0, allowances: 0, deductions: 0, netAmount: 0 });

function addTotals(t: Totals, r: ReportRecord) {
  t.count++;
  t.baseSalary = round2(t.baseSalary + r.baseSalary);
  t.allowances = round2(t.allowances + r.allowances);
  t.deductions = round2(t.deductions + r.deductions);
  t.netAmount = round2(t.netAmount + r.netAmount);
}

/**
 * Totals overall, by department and by component. Records without a stored
 * breakdown (processed before components existed, or without any) contribute
 * their plain allowances/deductions under "Manual allowances"/"Manual deductions".
 */
export function aggregatePayrollReport(records: ReportRecord[]) {
  const totals = emptyTotals();
  let paid = 0;
  let unpaid = 0;
  const byDept = new Map<string, Totals>();
  const byComponent = new Map<string, { name: string; type: 'ALLOWANCE' | 'DEDUCTION'; count: number; total: number }>();

  const addComponent = (name: string, type: 'ALLOWANCE' | 'DEDUCTION', amount: number) => {
    if (!amount) return;
    const key = `${type}:${name}`;
    const e = byComponent.get(key) ?? { name, type, count: 0, total: 0 };
    e.count++;
    e.total = round2(e.total + amount);
    byComponent.set(key, e);
  };

  for (const r of records) {
    addTotals(totals, r);
    if (r.status === 'PAID') paid = round2(paid + r.netAmount);
    else unpaid = round2(unpaid + r.netAmount);

    const dept = r.department || 'Unassigned';
    const d = byDept.get(dept) ?? emptyTotals();
    addTotals(d, r);
    byDept.set(dept, d);

    if (r.breakdown?.items?.length) {
      for (const item of r.breakdown.items) addComponent(item.name, item.type, item.amount);
    } else {
      addComponent('Manual allowances', 'ALLOWANCE', r.allowances);
      addComponent('Manual deductions', 'DEDUCTION', r.deductions);
    }
  }

  return {
    totals: { ...totals, paidAmount: paid, unpaidAmount: unpaid },
    byDepartment: [...byDept.entries()]
      .map(([department, t]) => ({ department, ...t }))
      .sort((a, b) => a.department.localeCompare(b.department)),
    byComponent: [...byComponent.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
  };
}
