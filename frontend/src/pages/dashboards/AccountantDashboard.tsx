import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Receipt, TrendingUp, FileBarChart, Users } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { DashboardSkeleton } from '../../components/common/DashboardSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { PageHeader, StatCard, ErrorState, Button } from '../../components/ui';
import { formatCurrency, formatDate } from '../../i18n';

interface AdminOverview {
  counts: { totalStudents: number };
  fees: { collected: number; upcomingDues: number; overdue: number };
}

export const AccountantDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const overviewQuery = useQuery({
    queryKey: ['reports', 'admin-overview'],
    queryFn: async () => (await apiClient.get<{ data: AdminOverview }>('/reports/admin-overview')).data.data,
  });

  const unpaidInvoicesQuery = useQuery({
    queryKey: ['fees', 'invoices', 'unpaid-recent'],
    queryFn: async () => (await apiClient.get('/fees/invoices', { params: { status: 'UNPAID', page: 1, limit: 5 } })).data,
  });

  if (overviewQuery.isLoading) return <DashboardSkeleton />;
  if (overviewQuery.isError) {
    return <ErrorState onRetry={() => overviewQuery.refetch()} message="Could not load fee overview." />;
  }

  const overview = overviewQuery.data;
  const invoices = unpaidInvoicesQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user?.firstName ?? ''}`} description="Fee collections, dues, and outstanding invoices for your institution." />

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Collected" value={formatCurrency(overview?.fees.collected ?? 0)} icon={<CircleDollarSign />} tone="success" hint="Total collected" />
        <StatCard label="Upcoming Dues" value={formatCurrency(overview?.fees.upcomingDues ?? 0)} icon={<Receipt />} tone="warning" hint="Not yet due" />
        <StatCard label="Overdue" value={formatCurrency(overview?.fees.overdue ?? 0)} icon={<TrendingUp />} tone="danger" hint="Past due date" />
        <StatCard label="Total Students" value={overview?.counts.totalStudents ?? 0} icon={<Users />} tone="primary" hint="Billable population" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button leftIcon={<FileBarChart className="w-4 h-4" />} variant="secondary" onClick={() => navigate('/reports')}>Open Reports</Button>
        <Button leftIcon={<Users className="w-4 h-4" />} variant="secondary" onClick={() => navigate('/hr')}>Open HR</Button>
        <Button leftIcon={<Receipt className="w-4 h-4" />} onClick={() => navigate('/fees')}>Manage Invoices</Button>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Unpaid Invoices</h3>
          <button onClick={() => navigate('/fees')} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">View All</button>
        </div>
        {unpaidInvoicesQuery.isLoading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : unpaidInvoicesQuery.isError ? (
          <ErrorState compact onRetry={() => unpaidInvoicesQuery.refetch()} />
        ) : invoices.length === 0 ? (
          <EmptyState title="No unpaid invoices" description="All invoices are settled." icon={<Receipt className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
        ) : (
          <div className="space-y-3">
            {invoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{inv.invoiceNumber} · {inv.studentName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Due {formatDate(inv.dueDate)} · {formatCurrency(inv.dueAmount)} due</p>
                </div>
                <StatusBadge status={inv.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountantDashboard;
