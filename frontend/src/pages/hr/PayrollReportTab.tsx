import React, { useState } from 'react';
import { Users, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState, Select, SkeletonStatGrid, StatCard, Skeleton } from '@/components/ui';
import { formatCurrency, formatNumber, useT } from '@/i18n';
import { usePayrollReport } from './hr.queries';
import { CURRENT_PAY_PERIOD, PAY_PERIOD_OPTIONS, type PayrollReport } from './hr.types';

type Row = PayrollReport['rows'][number];
type DeptRow = PayrollReport['byDepartment'][number] & { id: string };

/** GET /hr/payroll/report — SUPER_ADMIN / ADMIN / ACCOUNTANT. */
export default function PayrollReportTab() {
  const t = useT();
  const [payPeriod, setPayPeriod] = useState(CURRENT_PAY_PERIOD);
  const { data, isLoading, isError, refetch } = usePayrollReport(payPeriod);

  const rowColumns: Column<Row>[] = [
    {
      key: 'staffName',
      header: t('Staff'),
      accessor: 'staffName',
      primary: true,
      sortable: true,
      render: (r) => (
        <>
          <div className="font-semibold text-slate-900 dark:text-white">{r.staffName}</div>
          <div className="text-xs text-slate-500">{[r.designation, r.department].filter(Boolean).join(' · ')}</div>
        </>
      ),
    },
    { key: 'payslipNo', header: t('Payslip No.'), accessor: 'payslipNo', hideOnMobile: true, exportValue: (r) => r.payslipNo ?? '' },
    { key: 'department', header: t('Department'), accessor: 'department', defaultHidden: true },
    { key: 'baseSalary', header: t('Base'), align: 'right', render: (r) => formatCurrency(r.baseSalary), exportValue: (r) => r.baseSalary },
    { key: 'allowances', header: t('Allowances'), align: 'right', hideOnMobile: true, render: (r) => formatCurrency(r.allowances), exportValue: (r) => r.allowances },
    { key: 'deductions', header: t('Deductions'), align: 'right', hideOnMobile: true, render: (r) => formatCurrency(r.deductions), exportValue: (r) => r.deductions },
    { key: 'netAmount', header: t('Net'), align: 'right', render: (r) => <span className="font-semibold">{formatCurrency(r.netAmount)}</span>, exportValue: (r) => r.netAmount },
    { key: 'status', header: t('Status'), render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    {
      key: 'components',
      header: t('Components'),
      defaultHidden: true,
      render: (r) => (r.components?.length ? r.components.map((c) => `${c.name} ${c.type === 'ALLOWANCE' ? '+' : '−'}${c.amount}`).join(', ') : '—'),
      exportValue: (r) => (r.components ?? []).map((c) => `${c.name}: ${c.type === 'ALLOWANCE' ? '' : '-'}${c.amount}`).join('; '),
    },
  ];

  const deptColumns: Column<DeptRow>[] = [
    { key: 'department', header: t('Department'), accessor: 'department', primary: true, sortable: true },
    { key: 'count', header: t('Staff'), accessor: 'count', align: 'right' },
    { key: 'baseSalary', header: t('Base'), align: 'right', render: (r) => formatCurrency(r.baseSalary), exportValue: (r) => r.baseSalary },
    { key: 'allowances', header: t('Allowances'), align: 'right', hideOnMobile: true, render: (r) => formatCurrency(r.allowances), exportValue: (r) => r.allowances },
    { key: 'deductions', header: t('Deductions'), align: 'right', hideOnMobile: true, render: (r) => formatCurrency(r.deductions), exportValue: (r) => r.deductions },
    { key: 'netAmount', header: t('Net'), align: 'right', render: (r) => <span className="font-semibold">{formatCurrency(r.netAmount)}</span>, exportValue: (r) => r.netAmount },
  ];

  const allowances = data?.byComponent.filter((c) => c.type === 'ALLOWANCE') ?? [];
  const deductions = data?.byComponent.filter((c) => c.type === 'DEDUCTION') ?? [];

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <Select
          id="payroll-report-period"
          label={t('Pay period')}
          value={payPeriod}
          onChange={(e) => setPayPeriod(e.target.value)}
          options={PAY_PERIOD_OPTIONS.map((p) => ({ value: p, label: p }))}
          containerClassName="min-w-[200px]"
        />
      </div>

      {isError ? (
        <div className="glass-card rounded-2xl"><ErrorState message={t('Could not load the payroll report.')} onRetry={() => refetch()} /></div>
      ) : isLoading ? (
        <>
          <SkeletonStatGrid />
          <Skeleton className="h-64 rounded-2xl" />
        </>
      ) : !data || data.totals.count === 0 ? (
        <div className="glass-card rounded-2xl">
          <EmptyState title={t('No payroll processed for {period}', { period: payPeriod })} description={t('Process payroll (or run it for all staff) from the Payroll tab.')} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label={t('Payslips')} value={formatNumber(data.totals.count)} icon={<Users />} tone="info" />
            <StatCard label={t('Total allowances')} value={formatCurrency(data.totals.allowances)} icon={<TrendingUp />} tone="success" />
            <StatCard label={t('Total deductions')} value={formatCurrency(data.totals.deductions)} icon={<TrendingDown />} tone="danger" />
            <StatCard
              label={t('Net payable')}
              value={formatCurrency(data.totals.netAmount)}
              icon={<Wallet />}
              tone="warning"
              hint={`${t('Paid')} ${formatCurrency(data.totals.paidAmount)} · ${t('Unpaid')} ${formatCurrency(data.totals.unpaidAmount)}`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[{ title: t('Allowances by component'), list: allowances, cls: 'text-emerald-700 dark:text-emerald-400' }, { title: t('Deductions by component'), list: deductions, cls: 'text-rose-700 dark:text-rose-400' }].map((block) => (
              <div key={block.title} className="glass-card rounded-2xl p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{block.title}</h3>
                {block.list.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('None')}</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {block.list.map((c) => (
                      <li key={c.name} className="py-2 flex items-center justify-between text-sm gap-3">
                        <span>{c.name} <span className="text-xs text-slate-500">({t('{n} staff', { n: c.count })})</span></span>
                        <span className={`font-semibold ${block.cls}`}>{formatCurrency(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('By department')}</h3>
            <DataTable
              data={data.byDepartment.map((d) => ({ ...d, id: d.department }))}
              columns={deptColumns}
              exportFileName={`payroll-by-department-${payPeriod.replace(/\s+/g, '-')}`}
            />
          </div>

          <div className="glass-card rounded-2xl p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('Payslips')}</h3>
            <DataTable data={data.rows} columns={rowColumns} exportFileName={`payroll-report-${payPeriod.replace(/\s+/g, '-')}`} />
          </div>
        </>
      )}
    </div>
  );
}
