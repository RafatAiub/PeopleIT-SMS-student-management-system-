import React, { useState, useEffect } from 'react';
import { ReceiptText } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { Badge } from '../../components/ui/Badge';

interface PaymentRow {
  id: string;
  amount: string;
  method: string;
  transactionRef: string | null;
  status: string;
  paidAt: string;
  invoice: {
    invoiceNo: string;
    student: { firstName: string; lastName: string; studentId: string; class: { name: string } | null };
  };
}

const METHODS = ['CASH', 'BKASH', 'NAGAD', 'SSLCOMMERZ', 'BANK_TRANSFER'];
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  COMPLETED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  REFUNDED: 'neutral',
};

const FeesTransactionLogs = () => {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState('');
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  useEffect(() => {
    setLoading(true);
    apiClient
      .get('/fee-setup/payments', {
        params: { page: params.page, pageSize: params.pageSize, search: debouncedSearch || undefined, method: method || undefined },
      })
      .then((res) => {
        setRows(res.data.data || []);
        setTotal(res.data.meta?.total || 0);
      })
      .catch((error) => {
        console.error('Failed to fetch transactions', error);
        toast.error('Failed to load transaction logs');
      })
      .finally(() => setLoading(false));
  }, [params.page, params.pageSize, debouncedSearch, method]);

  const columns: Column<PaymentRow>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{rows.findIndex((r) => r.id === row.id) + 1 + (params.page - 1) * params.pageSize}</span>,
    },
    {
      key: 'student', header: 'Student',
      render: (row) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{row.invoice.student.firstName} {row.invoice.student.lastName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            GR Number: {row.invoice.student.studentId}{row.invoice.student.class ? ` · ${row.invoice.student.class.name}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'invoice', header: 'Invoice', render: (row) => row.invoice.invoiceNo },
    { key: 'amount', header: 'Amount', render: (row) => Number(row.amount).toLocaleString('en-BD', { minimumFractionDigits: 2 }) },
    { key: 'method', header: 'Payment Mode', render: (row) => row.method.replace('_', ' ') },
    { key: 'ref', header: 'Transaction ID', render: (row) => row.transactionRef || '—' },
    { key: 'status', header: 'Status', render: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'neutral'}>{row.status}</Badge> },
    { key: 'date', header: 'Date', render: (row) => new Date(row.paidAt).toLocaleString('en-GB') },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <ReceiptText className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Fees Transactions Logs</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Every fee payment recorded, online and offline.</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-4">
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Payment Mode</label>
          <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="input-field">
            <option value="">All</option>
            {METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </div>
        <DataTable
          data={rows}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search by student, GR number or invoice..."
          serverSearch
          onSearch={setSearch}
          serverPagination
          totalCount={total}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          emptyTitle="No transactions yet"
          emptyDescription="Payments recorded against invoices will appear here."
        />
      </div>
    </div>
  );
};

export default FeesTransactionLogs;
