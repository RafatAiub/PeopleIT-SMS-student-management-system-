import React, { useState } from 'react';
import { FileText, DollarSign, Landmark, AlertCircle } from 'lucide-react';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard, Select, ErrorState } from '../../components/ui';
import { formatCurrency, formatDate } from '../../i18n';
import { useTableParams } from '../../hooks/useTableParams';
import { useInvoicesList } from './hooks';
import type { InvoiceListItem } from './types';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
];

interface InvoicesTabProps {
  canRecordPayment: boolean;
  onRowClick: (invoice: InvoiceListItem) => void;
  onRecordPayment: (invoice: InvoiceListItem) => void;
}

export const InvoicesTab: React.FC<InvoicesTabProps> = ({ canRecordPayment, onRowClick, onRecordPayment }) => {
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();
  const [status, setStatus] = useState('');

  const { data, isLoading, isError, refetch } = useInvoicesList({
    page: params.page,
    pageSize: params.pageSize,
    status: status || undefined,
    search: debouncedSearch || undefined,
  });

  const invoices = data?.data ?? [];
  const totalCount = data?.meta?.total ?? 0;
  const summary = data?.summary;

  const columns: Column<InvoiceListItem>[] = [
    { key: 'invoiceNo', header: 'Invoice no.', accessor: 'invoiceNo', primary: true },
    {
      key: 'student',
      header: 'Student',
      sortable: false,
      render: (invoice) => (
        <>
          <div className="text-slate-900 dark:text-white font-medium">{invoice.student?.firstName} {invoice.student?.lastName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">ID: {invoice.student?.studentId}</div>
        </>
      ),
    },
    {
      key: 'issueDate',
      header: 'Issue date',
      sortable: false,
      hideOnMobile: true,
      render: (invoice) => formatDate(invoice.createdAt),
    },
    {
      key: 'dueDate',
      header: 'Due date',
      sortable: false,
      render: (invoice) => formatDate(invoice.dueDate),
    },
    {
      key: 'totalAmount',
      header: 'Amount',
      sortable: false,
      align: 'right',
      render: (invoice) => <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(invoice.totalAmount)}</span>,
    },
    {
      key: 'paidAmount',
      header: 'Paid',
      sortable: false,
      align: 'right',
      hideOnMobile: true,
      render: (invoice) => formatCurrency(invoice.paidAmount),
    },
    {
      key: 'dueAmount',
      header: 'Due',
      sortable: false,
      align: 'right',
      render: (invoice) => (
        Number(invoice.dueAmount) > 0
          ? <span className="text-rose-600 dark:text-rose-400 font-medium">{formatCurrency(invoice.dueAmount)}</span>
          : <span className="text-slate-400">{formatCurrency(0)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (invoice) => <StatusBadge status={invoice.status} />,
    },
  ];

  if (canRecordPayment) {
    columns.push({
      key: 'quickAction',
      header: 'Actions',
      sortable: false,
      render: (invoice) => (
        invoice.status !== 'PAID' && Number(invoice.dueAmount) > 0 ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRecordPayment(invoice); }}
            className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-100 dark:hover:bg-emerald-600/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          >
            <DollarSign className="w-3.5 h-3.5" /> Record payment
          </button>
        ) : null
      ),
    });
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} message="Failed to load invoices." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total invoiced" value={formatCurrency(summary?.totalInvoiced ?? 0)} icon={<FileText />} tone="primary" hint="Matching current filters" />
        <StatCard label="Collected" value={formatCurrency(summary?.totalCollected ?? 0)} icon={<DollarSign />} tone="success" hint="Payments received" />
        <StatCard label="Outstanding" value={formatCurrency(summary?.totalOutstanding ?? 0)} icon={<Landmark />} tone="warning" hint="Still due" />
        <StatCard label="Overdue invoices" value={summary?.overdueCount ?? 0} icon={<AlertCircle />} tone="danger" hint={summary?.overdueCount ? 'Needs follow-up' : 'None overdue'} />
      </div>

      <DataTable
        data={invoices}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search by invoice number or student..."
        serverSearch
        onSearch={setSearch}
        serverPagination
        totalCount={totalCount}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onRowClick={onRowClick}
        exportFileName="invoices"
        toolbar={
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            options={STATUS_OPTIONS.filter((o) => o.value !== '')}
            placeholder="All statuses"
            className="w-auto min-w-40"
          />
        }
        emptyTitle="No invoices found"
        emptyDescription="Generate an invoice to get started."
      />
    </div>
  );
};
