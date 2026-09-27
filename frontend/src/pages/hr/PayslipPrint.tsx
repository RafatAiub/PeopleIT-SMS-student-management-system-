import React from 'react';
import { PrintLayout, SignatureLines } from '@/components/print/PrintLayout';
import { formatCurrency } from '@/i18n';
import type { PayrollRecord } from './hr.types';

/** Payslip built only from the payroll record's own fields — staff, period,
 *  base, allowances, deductions, net, and (when salary components applied)
 *  the stored component breakdown. No other data is invented. */
export default function PayslipPrint({ record }: { record: PayrollRecord }) {
  const items = record.breakdown?.items ?? [];
  const allowanceItems = items.filter((i) => i.type === 'ALLOWANCE');
  const deductionItems = items.filter((i) => i.type === 'DEDUCTION');
  return (
    <PrintLayout
      title="Payslip"
      reference={record.payslipNo ? `Payslip No. ${record.payslipNo} · Pay Period: ${record.payPeriod}` : `Pay Period: ${record.payPeriod}`}
      size="a5"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Staff Name</p>
            <p className="font-semibold">{record.staffName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Designation</p>
            <p className="font-semibold">{record.designation || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Pay Period</p>
            <p className="font-semibold">{record.payPeriod}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
            <p className="font-semibold">{record.status}{record.paidAt ? ` · ${new Date(record.paidAt).toLocaleDateString()}` : ''}</p>
          </div>
        </div>

        <table className="w-full text-sm border-collapse mt-2">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-2 text-slate-600">Base Salary</td>
              <td className="py-2 text-right font-medium">{formatCurrency(record.baseSalary)}</td>
            </tr>
            {allowanceItems.map((item, i) => (
              <tr key={`a-${i}`} className="border-b border-slate-100">
                <td className="py-1.5 pl-3 text-slate-600">
                  {item.name}
                  {item.calcType === 'PERCENT_OF_BASE' && <span className="text-xs text-slate-500"> ({item.value}% of base)</span>}
                </td>
                <td className="py-1.5 text-right text-emerald-700">+{formatCurrency(item.amount)}</td>
              </tr>
            ))}
            <tr className="border-b border-slate-200">
              <td className="py-2 text-slate-600">{items.length ? 'Total allowances' : 'Allowances'}</td>
              <td className="py-2 text-right font-medium text-emerald-700">+{formatCurrency(record.allowances)}</td>
            </tr>
            {deductionItems.map((item, i) => (
              <tr key={`d-${i}`} className="border-b border-slate-100">
                <td className="py-1.5 pl-3 text-slate-600">
                  {item.name}
                  {item.calcType === 'PERCENT_OF_BASE' && <span className="text-xs text-slate-500"> ({item.value}% of base)</span>}
                </td>
                <td className="py-1.5 text-right text-rose-700">-{formatCurrency(item.amount)}</td>
              </tr>
            ))}
            <tr className="border-b border-slate-200">
              <td className="py-2 text-slate-600">{items.length ? 'Total deductions' : 'Deductions'}</td>
              <td className="py-2 text-right font-medium text-rose-700">-{formatCurrency(record.deductions)}</td>
            </tr>
            <tr>
              <td className="py-2 font-bold">Net Amount</td>
              <td className="py-2 text-right font-bold text-base">{formatCurrency(record.netAmount)}</td>
            </tr>
          </tbody>
        </table>

        <SignatureLines labels={['Accounts', 'Employee Signature']} />
      </div>
    </PrintLayout>
  );
}
