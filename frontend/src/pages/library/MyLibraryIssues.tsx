import React, { useEffect, useState } from 'react';
import { BookOpen, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';

interface LibraryIssue {
  id: string;
  bookId: string;
  book: { title: string; author: string; isbn: string };
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
  { key: '', label: 'All' },
  { key: 'ISSUED', label: 'Issued' },
  { key: 'RETURNED', label: 'Returned' },
  { key: 'OVERDUE', label: 'Overdue' },
];

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
      const params: Record<string, any> = { pageSize: 100 };
      if (statusFilter) params.status = statusFilter;
      if (isGuardian && selectedChildId) params.studentId = selectedChildId;
      const res = await apiClient.get('/library/me/issues', { params });
      setIssues(res.data.data?.issues || res.data.data || []);
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

  const isOverdue = (issue: LibraryIssue) =>
    issue.status === 'ISSUED' && new Date(issue.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);

  const columns: Column<LibraryIssue>[] = [
    {
      key: 'book',
      header: 'Book',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{row.book?.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{row.book?.author}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'isbn',
      header: 'ISBN',
      render: (row) => <span className="text-sm text-slate-500 dark:text-slate-400">{row.book?.isbn}</span>,
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      render: (row) => (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '-'}
        </span>
      ),
    },
    {
      key: 'returnDate',
      header: 'Return Date',
      render: (row) => (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {row.returnDate ? new Date(row.returnDate).toLocaleDateString() : '-'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={isOverdue(row) ? 'OVERDUE' : row.status} />,
    },
    {
      key: 'fineAmount',
      header: 'Fine',
      render: (row) => {
        const fine = Number(row.fineAmount) || 0;
        return fine > 0 ? (
          <span className="text-sm font-bold text-red-600 dark:text-red-400">৳{fine.toLocaleString()}</span>
        ) : (
          <span className="text-sm text-slate-500 dark:text-slate-400">-</span>
        );
      },
    },
  ];

  if (isGuardian && childrenLoading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your dashboard...</div>;
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title="No linked children found"
          description="Contact your school administrator to link your account to your child's student profile."
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">My Library Issues</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Track your issued and returned books.</p>
      </div>

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedChildId === child.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 flex overflow-hidden bg-slate-50 dark:bg-slate-900/30 p-1 gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              statusFilter === tab.key
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
                : 'text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="glass-card p-8">
          <EmptyState
            title="Failed to load library issues"
            description="Something went wrong while fetching your library issues."
            icon={<BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={
              <button
                onClick={fetchIssues}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Retry
              </button>
            }
          />
        </div>
      ) : (
        <DataTable
          data={issues}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search by book title or ISBN..."
          emptyTitle="No library issues"
          emptyDescription="No book issues found for the selected filters."
        />
      )}
    </div>
  );
};

export default MyLibraryIssues;
