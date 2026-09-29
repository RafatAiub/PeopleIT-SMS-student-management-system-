import React, { useState } from 'react';
import { CheckCircle2, XCircle, Clock, FlaskConical, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { StatCard, Select, Input, ErrorState, Badge, Button, Alert } from '../../components/ui';
import { useT, formatCurrency, formatDate, formatNumber } from '../../i18n';
import { useReconciliation, fetchAllReconciliation, type ReconciliationFilters } from './feeExtras.queries';
import type { OnlineGateway, FeeTxnStatus, ReconciliationFlag, ReconciliationRow } from './types';

const GATEWAY_LABEL: Record<OnlineGateway, string> = { BKASH: 'bKash', NAGAD: 'Nagad', SSLCOMMERZ: 'SSLCommerz' };

const FLAG_LABEL: Record<ReconciliationFlag, string> = {
  AMOUNT_MISMATCH: 'Amount mismatch',
  SUCCESS_WITHOUT_PAYMENT: 'Success, no payment',
  PAYMENT_WITHOUT_SUCCESS: 'Payment, not success',
  STALE_PENDING: 'Stuck > 24h',
};

const STATUS_VARIANT: Record<FeeTxnStatus, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  SUCCESS: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  PENDING: 'warning',
  INITIATED: 'info',
};

// Online payment reconciliation — every FeePaymentTransaction with its
// matched Payment, amount mismatches and demo flag. SA/A/ACC only
// (backend: GET /fees/reconciliation).
export const ReconciliationTab: React.FC = () => {
  const t = useT();
  const [filters, setFilters] = useState<ReconciliationFilters>({ page: 1, pageSize: 20, from: '', to: '', gateway: '', status: '' });
  const [exporting, setExporting] = useState(false);
  const { data, isLoading, isError, refetch } = useReconciliation(filters);
  const summary = data?.summary;

  const set = (patch: Partial<ReconciliationFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const columns: Column<ReconciliationRow>[] = [
    {
      key: 'createdAt',
      header: t('Date'),
      render: (r) => formatDate(r.createdAt),
      exportValue: (r) => r.createdAt,
    },
    {
      key: 'gateway',
      header: t('Gateway'),
      primary: true,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {GATEWAY_LABEL[r.gateway]}
          {r.isDemo && <Badge variant="warning">{t('Demo')}</Badge>}
        </span>
      ),
      exportValue: (r) => `${GATEWAY_LABEL[r.gateway]}${r.isDemo ? ' (demo)' : ''}`,
    },
    {
      key: 'txn',
      header: t('Transaction'),
      hideOnMobile: true,
      render: (r) => (
        <div className="font-mono text-xs break-all">
          {r.gatewayTransactionId}
          {r.gatewayValId && <div className="text-slate-500">{r.gatewayValId}</div>}
        </div>
      ),
      exportValue: (r) => `${r.gatewayTransactionId}${r.gatewayValId ? ` / ${r.gatewayValId}` : ''}`,
    },
    {
      key: 'invoice',
      header: t('Invoice'),
      render: (r) => (
        <>
          <div className="font-medium text-slate-900 dark:text-white">{r.invoice.invoiceNo}</div>
          {r.student && <div className="text-xs text-slate-500">{r.student.firstName} {r.student.lastName} · {r.student.studentId}</div>}
        </>
      ),
      exportValue: (r) => `${r.invoice.invoiceNo}${r.student ? ` — ${r.student.firstName} ${r.student.lastName} (${r.student.studentId})` : ''}`,
    },
    { key: 'amount', header: t('Amount'), align: 'right', render: (r) => formatCurrency(r.amount), exportValue: (r) => r.amount },
    {
      key: 'status',
      header: t('Status'),
      render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>,
      exportValue: (r) => r.status,
    },
    {
      key: 'payment',
      header: t('Matched payment'),
      render: (r) =>
        r.payment ? (
          <div className="text-xs">
            <div className="font-medium">{r.payment.receiptNo ?? r.payment.id.slice(0, 8)}</div>
            <div className="text-slate-500">{formatCurrency(r.payment.amount)}</div>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      exportValue: (r) => (r.payment ? `${r.payment.receiptNo ?? r.payment.id} (${r.payment.amount})` : ''),
    },
    {
      key: 'flags',
      header: t('Issues'),
      render: (r) =>
        r.flags.length === 0 ? (
          <span className="text-emerald-600 text-xs">{t('OK')}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {r.flags.map((f) => (
              <Badge key={f} variant="danger">{t(FLAG_LABEL[f])}</Badge>
            ))}
          </div>
        ),
      exportValue: (r) => r.flags.map((f) => FLAG_LABEL[f]).join('; '),
    },
    { key: 'initiatedBy', header: t('Initiated by'), hideOnMobile: true, defaultHidden: true, render: (r) => r.initiatedBy ?? '—' },
  ];

  const exportAll = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllReconciliation({ from: filters.from, to: filters.to, gateway: filters.gateway, status: filters.status });
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          Date: r.createdAt,
          Gateway: GATEWAY_LABEL[r.gateway],
          Demo: r.isDemo ? 'Yes' : 'No',
          'Transaction ID': r.gatewayTransactionId,
          'Gateway payment ID': r.gatewayPaymentId ?? '',
          'Gateway reference': r.gatewayValId ?? '',
          Invoice: r.invoice.invoiceNo,
          Student: r.student ? `${r.student.firstName} ${r.student.lastName}` : '',
          'Student ID': r.student?.studentId ?? '',
          Amount: r.amount,
          Currency: r.currency,
          Status: r.status,
          'Receipt no.': r.payment?.receiptNo ?? '',
          'Payment amount': r.payment?.amount ?? '',
          Issues: r.flags.map((f) => FLAG_LABEL[f]).join('; '),
          'Initiated by': r.initiatedBy ?? '',
        })),
      );
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Reconciliation');
      XLSX.writeFile(book, `fee-reconciliation-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(t('Exported {count} rows', { count: rows.length }));
    } catch {
      toast.error(t('Export failed'));
    } finally {
      setExporting(false);
    }
  };

  if (isError) return <ErrorState onRetry={() => refetch()} message={t('Failed to load reconciliation.')} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('Successful')} value={formatNumber(summary?.successCount ?? 0)} icon={<CheckCircle2 />} tone="success" hint={formatCurrency(summary?.successAmount ?? 0)} />
        <StatCard label={t('Failed / cancelled')} value={formatNumber((summary?.failedCount ?? 0) + (summary?.cancelledCount ?? 0))} icon={<XCircle />} tone="danger" />
        <StatCard label={t('Pending')} value={formatNumber(summary?.pendingCount ?? 0)} icon={<Clock />} tone="warning" hint={t('Initiated or awaiting gateway')} />
        <StatCard label={t('Demo transactions')} value={formatNumber(summary?.demoCount ?? 0)} icon={<FlaskConical />} tone="info" hint={t('Simulated — no money moved')} />
      </div>

      {(summary?.demoCount ?? 0) > 0 && (
        <Alert tone="warning" title={t('Demo mode')}>
          {t('Some transactions were made in demo mode (gateway API key not configured). They were simulated and no money was charged, but they did mark invoices as paid.')}
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <Input label={t('From')} type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        <Input label={t('To')} type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        <Select
          label={t('Gateway')}
          value={filters.gateway}
          onChange={(e) => set({ gateway: e.target.value as OnlineGateway | '' })}
          placeholder={t('All gateways')}
          options={(Object.keys(GATEWAY_LABEL) as OnlineGateway[]).map((g) => ({ value: g, label: GATEWAY_LABEL[g] }))}
        />
        <Select
          label={t('Status')}
          value={filters.status}
          onChange={(e) => set({ status: e.target.value as FeeTxnStatus | '' })}
          placeholder={t('All statuses')}
          options={(['SUCCESS', 'PENDING', 'INITIATED', 'FAILED', 'CANCELLED'] as FeeTxnStatus[]).map((s) => ({ value: s, label: s }))}
        />
        <Button variant="outline" leftIcon={<Download className="w-4 h-4" />} onClick={exportAll} isLoading={exporting} disabled={!data || data.meta.total === 0}>
          {t('Export all')}
        </Button>
      </div>

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        isLoading={isLoading}
        serverPagination
        totalCount={data?.meta.total ?? 0}
        page={filters.page}
        pageSize={filters.pageSize}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        onPageSizeChange={(pageSize) => setFilters((f) => ({ ...f, pageSize, page: 1 }))}
        exportFileName="fee-reconciliation-page"
        emptyTitle={t('No online payment attempts')}
        emptyDescription={t('Online fee payments (bKash, Nagad, SSLCommerz) will appear here once students or guardians start paying online.')}
      />
    </div>
  );
};
