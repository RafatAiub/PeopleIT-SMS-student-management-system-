import React, { useState } from 'react';
import { Users, Landmark, RefreshCw, CheckCircle, Printer, DollarSign, Layers } from 'lucide-react';
import { useTableParams } from '@/hooks/useTableParams';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { Modal, Select, Input, Button, StatCard, ErrorState, Alert } from '@/components/ui';
import { formatCurrency, useT } from '@/i18n';
import { usePayrollList, useProcessPayroll, usePayPayroll, usePayrollBatch } from './hr.queries';
import { PAY_PERIOD_OPTIONS, CURRENT_PAY_PERIOD, type PayrollBatchResult, type PayrollRecord, type StaffProfile } from './hr.types';
import PayslipPrint from './PayslipPrint';

interface PayrollTabProps {
  canWrite: boolean;
  /** Set from the Staff tab's "Payroll" row action to preselect a staff member. */
  presetStaff: StaffProfile | null;
  onConsumePreset: () => void;
}

export default function PayrollTab({ canWrite, presetStaff, onConsumePreset }: PayrollTabProps) {
  const t = useT();
  const { params, setPage, setPageSize } = useTableParams();
  const [payPeriodFilter, setPayPeriodFilter] = useState('');

  const { data, isLoading, isError, refetch } = usePayrollList({
    page: params.page,
    pageSize: params.pageSize,
    payPeriod: payPeriodFilter || undefined,
  });

  const processMutation = useProcessPayroll();
  const payMutation = usePayPayroll();
  const batchMutation = usePayrollBatch();
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchPeriod, setBatchPeriod] = useState(CURRENT_PAY_PERIOD);
  const [batchResult, setBatchResult] = useState<PayrollBatchResult | null>(null);

  const handleRunBatch = async () => {
    const result = await batchMutation.mutateAsync(batchPeriod);
    setBatchResult(result);
  };

  const [isProcessOpen, setIsProcessOpen] = useState(!!presetStaff);
  const [payTarget, setPayTarget] = useState<PayrollRecord | null>(null);
  const [payslip, setPayslip] = useState<PayrollRecord | null>(null);

  const [selectedStaff, setSelectedStaff] = useState<StaffProfile | null>(presetStaff);
  const [payrollMonth, setPayrollMonth] = useState(CURRENT_PAY_PERIOD);
  const [customBasic, setCustomBasic] = useState(presetStaff?.baseSalary ?? 0);
  const [customAllowances, setCustomAllowances] = useState(0);
  const [customDeductions, setCustomDeductions] = useState(0);
  const [formError, setFormError] = useState('');

  // Open the process-payroll modal whenever the Staff tab hands us a preset.
  React.useEffect(() => {
    if (presetStaff) {
      setSelectedStaff(presetStaff);
      setCustomBasic(presetStaff.baseSalary ?? 0);
      setCustomAllowances(0);
      setCustomDeductions(0);
      setPayrollMonth(CURRENT_PAY_PERIOD);
      setFormError('');
      setIsProcessOpen(true);
      onConsumePreset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetStaff]);

  const payrollList = data?.payrolls ?? [];
  const summary = data?.summary ?? null;
  const calculatedNetPayout = customBasic + customAllowances - customDeductions;

  const handleProcessPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) {
      setFormError('Select a staff member.');
      return;
    }
    if (customBasic <= 0) {
      setFormError('Basic salary must be greater than 0.');
      return;
    }
    setFormError('');
    await processMutation.mutateAsync({
      staffId: selectedStaff.id,
      payPeriod: payrollMonth,
      allowances: customAllowances,
      deductions: customDeductions,
    });
    setIsProcessOpen(false);
    setSelectedStaff(null);
  };

  const handleMarkPaid = async () => {
    if (!payTarget) return;
    await payMutation.mutateAsync(payTarget.id);
    setPayTarget(null);
  };

  const columns: Column<PayrollRecord>[] = [
    {
      key: 'staffName',
      header: 'Payee Name',
      accessor: 'staffName',
      primary: true,
      render: (record) => (
        <>
          <div className="font-semibold text-slate-900 dark:text-white">{record.staffName}</div>
          <div className="text-xs text-slate-500">{record.designation || '—'}</div>
        </>
      ),
    },
    { key: 'payPeriod', header: 'Salary Month', accessor: 'payPeriod' },
    {
      key: 'payslipNo',
      header: 'Payslip No.',
      hideOnMobile: true,
      exportValue: (record) => record.payslipNo ?? '',
      render: (record) => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{record.payslipNo || '—'}</span>,
    },
    {
      key: 'baseSalary',
      header: 'Base',
      sortable: false,
      align: 'right',
      exportValue: (record) => record.baseSalary ?? 0,
      render: (record) => <>{formatCurrency(record.baseSalary || 0)}</>,
    },
    {
      key: 'allowancesDeductions',
      header: 'Allowances / Deductions',
      sortable: false,
      hideOnMobile: true,
      render: (record) => (
        <>
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">+{formatCurrency(record.allowances)}</span>
          <span className="text-slate-500"> / </span>
          <span className="text-rose-700 dark:text-rose-400 font-semibold">-{formatCurrency(record.deductions)}</span>
        </>
      ),
    },
    {
      key: 'netPayout',
      header: 'Net Paid',
      sortable: false,
      align: 'right',
      exportValue: (record) => record.netAmount ?? 0,
      render: (record) => <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(record.netAmount || 0)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (record) => <StatusBadge status={record.status} />,
    },
    {
      key: 'payrollActions',
      header: 'Actions',
      sortable: false,
      render: (record) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setPayslip(record)}
            title="Print payslip"
            aria-label={`Print payslip for ${record.staffName}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <Printer className="w-4 h-4" />
          </button>
          {canWrite && record.status === 'UNPAID' && (
            <button
              onClick={() => setPayTarget(record)}
              className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-100 dark:hover:bg-emerald-600/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Mark Paid
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Staff Count" value={summary?.totalStaff ?? 0} icon={<Users />} tone="info" hint="Eligible for payroll" />
        <StatCard
          label={`Paid (${summary?.currentPeriod ?? 'This Month'})`}
          value={formatCurrency(summary?.paidThisMonthTotal ?? 0)}
          icon={<Landmark />}
          tone="success"
        />
        <StatCard
          label="Pending Approvals"
          value={summary?.pendingCount ?? 0}
          icon={<RefreshCw />}
          tone={summary?.pendingCount ? 'warning' : 'success'}
          hint={summary?.pendingCount ? 'Awaiting Mark Paid' : 'All caught up'}
        />
      </div>

      {isError ? (
        <div className="glass-card rounded-2xl">
          <ErrorState message={t('Could not load the payroll ledger.')} onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 shadow-xs p-4">
          <DataTable
            data={payrollList}
            columns={columns}
            isLoading={isLoading}
            serverPagination
            totalCount={data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            exportFileName="payroll-ledger"
            emptyTitle="No payroll payouts released yet"
            emptyDescription="Process a payroll from the Staff Directory to see it listed here."
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Layers className="w-4 h-4" />}
                  onClick={() => { setBatchResult(null); setBatchPeriod(payPeriodFilter || CURRENT_PAY_PERIOD); setIsBatchOpen(true); }}
                >
                  Run payroll for all staff
                </Button>
              )}
              <label htmlFor="payroll-cycle-filter" className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                Cycle
                <select
                  id="payroll-cycle-filter"
                  value={payPeriodFilter}
                  onChange={(e) => { setPayPeriodFilter(e.target.value); setPage(1); }}
                  className="input-field w-auto min-h-10 py-1.5"
                >
                  <option value="">All Cycles</option>
                  {PAY_PERIOD_OPTIONS.map((period) => (
                    <option key={period} value={period}>{period}</option>
                  ))}
                </select>
              </label>
              </div>
            }
          />
        </div>
      )}

      {/* Process payroll modal */}
      <Modal
        isOpen={isProcessOpen}
        onClose={() => { setIsProcessOpen(false); setSelectedStaff(null); setFormError(''); }}
        title="Process Monthly Payroll"
        size="md"
      >
        <form onSubmit={handleProcessPayroll} className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Staff Member</p>
            <div className="text-slate-900 dark:text-white font-medium text-base mt-1">{selectedStaff?.name ?? '—'}</div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{selectedStaff?.designation || '—'}</div>
            {!selectedStaff && (
              <p className="text-xs text-slate-500 mt-2">
                Open this from the "Payroll" action on a staff row in the Staff tab.
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-white/5 pt-4 grid grid-cols-1 gap-3">
            <Select
              label="Payout Month"
              value={payrollMonth}
              onChange={(e) => setPayrollMonth(e.target.value)}
              options={PAY_PERIOD_OPTIONS.map((p) => ({ value: p, label: p }))}
            />
            <Input
              label="Basic Salary (৳)"
              type="number"
              value={customBasic}
              onChange={(e) => setCustomBasic(Number(e.target.value) || 0)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Allowances (৳)"
                type="number"
                value={customAllowances}
                onChange={(e) => setCustomAllowances(Number(e.target.value) || 0)}
              />
              <Input
                label="Deductions (৳)"
                type="number"
                value={customDeductions}
                onChange={(e) => setCustomDeductions(Number(e.target.value) || 0)}
              />
            </div>

            {formError && <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>}

            <div className="mt-2 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Net Calculated Payout:</span>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(calculatedNetPayout)}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                If salary components are assigned to this staff member (Staff tab → Components), they are added on top of the amounts above and itemised on the payslip.
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Formula: Basic + Allowance - Deduction. Submits as unpaid — mark it paid from the Salary Release Ledger to release payment.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={() => { setIsProcessOpen(false); setSelectedStaff(null); }}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={processMutation.isPending} disabled={!selectedStaff} leftIcon={<DollarSign className="w-4 h-4" />}>
              Process Payroll
            </Button>
          </div>
        </form>
      </Modal>

      {/* Batch payroll run */}
      <Modal
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
        title="Run payroll for all active staff"
        description="Processes every active staff member who has no payroll for the chosen month yet. Safe to run again — already-processed staff are skipped."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsBatchOpen(false)}>{batchResult ? 'Close' : 'Cancel'}</Button>
            {!batchResult && (
              <Button isLoading={batchMutation.isPending} leftIcon={<Layers className="w-4 h-4" />} onClick={handleRunBatch}>
                Run batch
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="Payout Month"
            value={batchPeriod}
            onChange={(e) => { setBatchPeriod(e.target.value); setBatchResult(null); }}
            options={PAY_PERIOD_OPTIONS.map((p) => ({ value: p, label: p }))}
            disabled={batchMutation.isPending}
          />
          <p className="text-xs text-slate-500">
            Each payroll uses the staff member&apos;s base salary plus any assigned salary components. No manual allowances or deductions are added in a batch run.
          </p>
          {batchResult && (
            <Alert tone={batchResult.failed ? 'warning' : 'success'} title={`${batchResult.payPeriod}: ${batchResult.processed} processed`}>
              <p>{batchResult.skipped} already processed · {batchResult.failed} failed · {batchResult.activeStaff} active staff</p>
              <p>Total net payable (new records): {formatCurrency(batchResult.totalNet)}</p>
              {batchResult.errors.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs">
                  {batchResult.errors.map((err) => <li key={err.staffId}>{err.staffName}: {err.message}</li>)}
                </ul>
              )}
            </Alert>
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!payTarget}
        title="Mark payroll as paid"
        message={payTarget ? `Confirm that ${formatCurrency(payTarget.netAmount)} has been paid to ${payTarget.staffName} for ${payTarget.payPeriod}?` : ''}
        confirmLabel="Mark Paid"
        variant="info"
        isLoading={payMutation.isPending}
        onConfirm={handleMarkPaid}
        onCancel={() => setPayTarget(null)}
      />

      {/* Payslip print modal */}
      <Modal isOpen={!!payslip} onClose={() => setPayslip(null)} size="lg">
        {payslip && <PayslipPrint record={payslip} />}
      </Modal>
    </div>
  );
}
