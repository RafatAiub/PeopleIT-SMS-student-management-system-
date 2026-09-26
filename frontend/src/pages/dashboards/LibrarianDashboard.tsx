import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Library, BookOpen, AlertTriangle, Users } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { DashboardSkeleton } from '../../components/common/DashboardSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { PageHeader, StatCard, ErrorState, Button } from '../../components/ui';
import { formatDate } from '../../i18n';

export const LibrarianDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const booksQuery = useQuery({
    queryKey: ['library', 'books', 'count'],
    queryFn: async () => (await apiClient.get('/library/books', { params: { page: 1, pageSize: 1 } })).data,
  });

  const issuedQuery = useQuery({
    queryKey: ['library', 'issues', 'ISSUED'],
    queryFn: async () => (await apiClient.get('/library/issues', { params: { status: 'ISSUED', page: 1, pageSize: 10 } })).data,
  });

  if (booksQuery.isLoading || issuedQuery.isLoading) return <DashboardSkeleton />;
  if (booksQuery.isError || issuedQuery.isError) {
    return <ErrorState onRetry={() => { booksQuery.refetch(); issuedQuery.refetch(); }} message="Could not load library data." />;
  }

  const booksTotal = booksQuery.data?.meta?.total ?? booksQuery.data?.data?.length ?? 0;
  const issuedList = issuedQuery.data?.data ?? [];
  const issuedTotal = issuedQuery.data?.meta?.total ?? issuedList.length;
  const overdue = issuedList.filter((i: any) => new Date(i.dueDate) < new Date());

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user?.firstName ?? ''}`} description="Library catalog and book issue status for your institution." />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Books in Catalog" value={booksTotal} icon={<BookOpen />} tone="primary" hint="Total titles" />
        <StatCard label="Currently Issued" value={issuedTotal} icon={<Library />} tone="info" hint="Checked out" />
        <StatCard label="Overdue" value={overdue.length} icon={<AlertTriangle />} tone="danger" hint="Past due date" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button leftIcon={<Library className="w-4 h-4" />} onClick={() => navigate('/library')}>Issue a Book</Button>
        <Button leftIcon={<Users className="w-4 h-4" />} variant="secondary" onClick={() => navigate('/library')}>Manage Catalog</Button>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Recently Issued Books</h3>
          <button onClick={() => navigate('/library')} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">View All</button>
        </div>
        {issuedList.length === 0 ? (
          <EmptyState title="No books currently issued" description="Issued books will appear here." icon={<Library className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
        ) : (
          <div className="space-y-3">
            {issuedList.map((issue: any) => (
              <div key={issue.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{issue.book?.title ?? 'Untitled'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Due {formatDate(issue.dueDate)}{issue.student ? ` · ${issue.student.firstName} ${issue.student.lastName}` : ''}</p>
                </div>
                <StatusBadge status={issue.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LibrarianDashboard;
