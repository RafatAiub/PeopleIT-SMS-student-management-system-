import React, { useEffect, useState } from 'react';
import { BookOpen, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader, ErrorState, Tabs, Skeleton, SkeletonText } from '../../components/ui';
import { Badge } from '../../components/ui/Badge';
import { formatCurrency, formatDate } from '../../i18n';

interface LibraryIssue {
  id: string;
  bookId: string;
  book: { title: string; author: string; isbn: string | null };
  studentId: string;
  dueDate: string;
  returnDate: string | null;
  status: string;
  fineAmount: number;
  createdAt: string;
}

interface ChildSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  class: { name: string } | null;
  section: { name: string } | null;
}

const STATUS_TABS = [
  { id: '', label: 'All' },
  { id: 'ISSUED', label: 'Issued' },
  { id: 'RETURNED', label: 'Returned' },
  { id: 'OVERDUE', label: 'Overdue' },
];

// OVERDUE is now stored by a daily backend job; until it runs, a past-due
// ISSUED loan is overdue too.
const isOverdue = (issue: LibraryIssue) =>
  issue.status === 'OVERDUE' ||
  (issue.status === 'ISSUED' && new Date(issue.dueDate).getTime() < new Date().setHours(0, 0, 0, 0));

const MyLibraryIssues: React.FC = () => {
  const { user } = useAuthStore();
  const isGuardian = user?.role === 'GUARDIAN';

  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(isGuardian);

  const [issues, setIssues] = useState<LibraryIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  // Load linked children for GUARDIAN role
  useEffect(() => {
    if (!isGuardian) return;
    const fetchChildren = async () => {
      try {
        const res = await apiClient.get('/guardians/me/students');
        const list: ChildSummary[] = res.data.data || [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      } catch (err) {
        console.error('Failed to load linked children', err);
        toast.error('Failed to load your children');
      } finally {
        setChildrenLoading(false);
      }
    };
    fetchChildren();
  }, [isGuardian]);

  const fetchIssues = async () => {
    if (isGuardian && !selectedChildId) return;
    setLoading(true);
    setError(false);
    try {
      // The server resolves each filter: OVERDUE = stored OVERDUE + past-due
      // ISSUED loans; ISSUED = every loan still out (ISSUED + OVERDUE).
      const params: Record<string, any> = { pageSize: 100 };
      if (statusFilter) params.status = statusFilter;
      if (isGuardian && selectedChildId) params.studentId = selectedChildId;
      const res = await apiClient.get('/library/me/issues', { params });
      const list: LibraryIssue[] = res.data.data?.issues || res.data.data || [];
      setIssues(list);
    } catch (err: any) {
      console.error('Failed to load library issues', err);
      setError(true);
      toast.error(err.response?.data?.message || 'Failed to load your library issues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isGuardian && childrenLoading) return;
    if (isGuardian && children.length === 0) {
      setLoading(false);
      return;
    }
    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, selectedChildId, childrenLoading]);

  if (isGuardian && childrenLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Library Issues" description="Track your issued and returned books." />
        <SkeletonText lines={4} />
      </div>
    );
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Library Issues" description="Track your issued and returned books." />
        <div className="glass-card p-8">
          <EmptyState
            title="No linked children found"
            description="Contact your school administrator to link your account to your child's student profile."
            icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Library Issues" description="Track your issued and returned books." />

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedChildId === child.id
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      <Tabs tabs={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} variant="pills" label="Filter by status" idPrefix="library-issue-status" />

      {error ? (
        <ErrorState message="Something went wrong while fetching your library issues." onRetry={fetchIssues} />
      ) : loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card p-4 space-y-2.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ))}
        </div>
      ) : issues.length === 0 ? (
        <div className="glass-card p-8">
          <EmptyState
            title="No library issues"
            description="No book issues found for the selected filters."
            icon={<BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {issues.map((issue) => {
            const overdue = isOverdue(issue);
            const fine = Number(issue.fineAmount) || 0;
            return (
              <div
                key={issue.id}
                className={`glass-card p-4 rounded-2xl border ${overdue ? 'border-red-200 dark:border-red-500/30' : 'border-slate-200/50 dark:border-white/10'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-transparent shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{issue.book?.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{issue.book?.author}{issue.book?.isbn ? ` · ISBN ${issue.book.isbn}` : ''}</p>
                      </div>
                      {overdue ? (
                        <Badge variant="danger" className="shrink-0">Overdue (past due date)</Badge>
                      ) : (
                        <Badge variant={issue.status === 'RETURNED' ? 'success' : 'info'} className="shrink-0">
                          {issue.status === 'RETURNED' ? 'Returned' : 'Issued'}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Due Date</p>
                        <p className={`font-medium ${overdue ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>{formatDate(issue.dueDate)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Return Date</p>
                        <p className="font-medium text-slate-800 dark:text-slate-200">{issue.returnDate ? formatDate(issue.returnDate) : '—'}</p>
                      </div>
                      {fine > 0 && (
                        <div className="col-span-2">
                          <p className="text-slate-500 dark:text-slate-400">Fine</p>
                          <p className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(fine)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyLibraryIssues;
