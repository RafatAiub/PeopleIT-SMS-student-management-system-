import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  UserCheck, Receipt, FileText, ClipboardList, BookOpen, Megaphone, Bus, Library,
} from 'lucide-react';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { DashboardSkeleton } from '../../components/common/DashboardSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { PageHeader, StatCard, ErrorState } from '../../components/ui';
import { AttendanceHeatmap, type HeatmapDay } from '../../components/Charts/AttendanceHeatmap';
import { formatCurrency, formatDate } from '../../i18n';

function statusToRate(status: string): number {
  if (status === 'PRESENT') return 100;
  if (status === 'LATE') return 75;
  if (status === 'HALF_DAY') return 50;
  return 0;
}

const StudentDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const profileQuery = useQuery({
    queryKey: ['students', 'me'],
    queryFn: async () => (await apiClient.get('/students/me')).data.data,
  });

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'my-attendance'],
    queryFn: async () => (await apiClient.get('/attendance/my-attendance')).data.data,
  });

  const invoicesQuery = useQuery({
    queryKey: ['fees', 'invoices', 'me'],
    queryFn: async () => (await apiClient.get('/fees/invoices', { params: { pageSize: 10 } })).data.data ?? [],
  });

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'me'],
    queryFn: async () => (await apiClient.get('/assignments/me', { params: { pageSize: 5 } })).data.data ?? [],
  });

  const noticesQuery = useQuery({
    queryKey: ['notices', 'student'],
    queryFn: async () => {
      const list = (await apiClient.get('/notices', { params: { isActive: true, pageSize: 20 } })).data.data ?? [];
      return list.filter((n: any) => n.audience === 'ALL' || n.audience === 'STUDENTS').slice(0, 5);
    },
  });

  const transportQuery = useQuery({
    queryKey: ['transport', 'me', 'assignment', 'student'],
    queryFn: async () => (await apiClient.get('/transport/me/assignment')).data.data ?? null,
  });

  const libraryQuery = useQuery({
    queryKey: ['library', 'me', 'issues', 'student'],
    queryFn: async () => (await apiClient.get('/library/me/issues', { params: { status: 'ISSUED', pageSize: 10 } })).data.data ?? [],
  });

  if (profileQuery.isLoading) return <DashboardSkeleton />;
  if (profileQuery.isError) {
    return <ErrorState onRetry={() => profileQuery.refetch()} message="Could not load your profile." />;
  }

  const profile = profileQuery.data;
  const attendance = attendanceQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const notices = noticesQuery.data ?? [];
  const transportAssignment = transportQuery.data;
  const libraryIssues = libraryQuery.data ?? [];

  const totalDue = invoices.reduce((sum: number, inv: any) => sum + Number(inv.dueAmount || 0), 0);
  const heatmapDays: HeatmapDay[] = (attendance?.attendance ?? []).map((r: any) => ({
    date: new Date(r.date).toISOString().slice(0, 10),
    rate: statusToRate(r.status),
    detail: r.status,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi, ${user?.firstName ?? ''}`}
        description={`${profile?.class?.name ?? ''}${profile?.section?.name ? ` - ${profile.section.name}` : ''}${profile?.studentId ? ` · ID: ${profile.studentId}` : ''}`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Attendance"
          value={attendanceQuery.isError ? '—' : `${attendance?.statistics?.attendancePercentage ?? 0}%`}
          icon={<UserCheck />}
          tone={attendance && (attendance.statistics?.attendancePercentage ?? 100) < 75 ? 'danger' : 'success'}
          to="/attendance"
          hint="This term"
        />
        <StatCard
          label="Fees Due"
          value={invoicesQuery.isError ? '—' : (totalDue > 0 ? formatCurrency(totalDue) : 'All Paid')}
          icon={<Receipt />}
          tone={totalDue > 0 ? 'warning' : 'success'}
          to="/fees"
        />
        <StatCard
          label="My Assignments"
          value={assignmentsQuery.isError ? '—' : assignments.length}
          icon={<ClipboardList />}
          tone="info"
          to="/lecture"
        />
        <StatCard
          label="Library Books"
          value={libraryQuery.isError ? '—' : libraryIssues.length}
          icon={<Library />}
          tone="neutral"
          to="/library"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance */}
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Attendance</h3>
          </div>
          <div className="p-6">
            {attendanceQuery.isError ? (
              <ErrorState compact onRetry={() => attendanceQuery.refetch()} />
            ) : heatmapDays.length === 0 ? (
              <EmptyState title="No attendance data" description="No attendance records yet." icon={<UserCheck className="w-8 h-8 text-slate-400" />} />
            ) : (
              <AttendanceHeatmap days={heatmapDays} title="My attendance" />
            )}
          </div>
        </div>

        {/* Results shortcut + notices */}
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-violet-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Exam Results</h3>
          </div>
          <div className="p-6">
            <button onClick={() => navigate('/results')} className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline">
              View my exam results and report cards →
            </button>
          </div>
        </div>

        {/* Assignments */}
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ClipboardList className="w-5 h-5 text-blue-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">My Assignments</h3>
            </div>
            <button onClick={() => navigate('/lecture')} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">View All</button>
          </div>
          <div className="p-6">
            {assignmentsQuery.isError ? (
              <ErrorState compact onRetry={() => assignmentsQuery.refetch()} />
            ) : assignments.length === 0 ? (
              <EmptyState title="No assignments" description="Classwork assigned to you will show up here." icon={<ClipboardList className="w-8 h-8 text-slate-400" />} />
            ) : (
              <div className="space-y-3">
                {assignments.slice(0, 5).map((a: any) => (
                  <div key={a.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">{a.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{a.subject} · {formatDate(a.dueDate)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fees */}
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
            <Receipt className="w-5 h-5 text-primary-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Fees & Payments</h3>
          </div>
          <div className="p-6">
            {invoicesQuery.isError ? (
              <ErrorState compact onRetry={() => invoicesQuery.refetch()} />
            ) : invoices.length === 0 ? (
              <EmptyState title="No invoices" description="No fee invoices yet." icon={<Receipt className="w-8 h-8 text-slate-400" />} />
            ) : (
              <div className="space-y-3">
                {invoices.slice(0, 5).map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{inv.invoiceNo}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Due {formatDate(inv.dueDate)} · {formatCurrency(inv.dueAmount)} due</p>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Transport */}
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
            <Bus className="w-5 h-5 text-sky-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">School Bus</h3>
          </div>
          <div className="p-6">
            {transportQuery.isError ? (
              <ErrorState compact onRetry={() => transportQuery.refetch()} />
            ) : !transportAssignment ? (
              <EmptyState title="No transport assigned" description="You aren't on a transport route yet." icon={<Bus className="w-8 h-8 text-slate-400" />} />
            ) : (
              <div className="text-sm space-y-1.5">
                <p className="font-semibold text-slate-900 dark:text-white">{transportAssignment.route?.name || 'Route unassigned'}</p>
                {transportAssignment.pickupPoint && <p className="text-slate-500">Pickup: {transportAssignment.pickupPoint}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Notices */}
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Megaphone className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Notices</h3>
            </div>
            <button onClick={() => navigate('/notices')} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">View All</button>
          </div>
          <div className="p-6">
            {noticesQuery.isError ? (
              <ErrorState compact onRetry={() => noticesQuery.refetch()} />
            ) : notices.length === 0 ? (
              <EmptyState title="No notices yet" description="Published notices will show up here." icon={<Megaphone className="w-8 h-8 text-slate-400" />} />
            ) : (
              <div className="space-y-3">
                {notices.map((n: any) => (
                  <div key={n.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">{n.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <button onClick={() => navigate('/timetables')} className="glass-card p-4 w-full text-left flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
        <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">View my class timetable</span>
      </button>
    </div>
  );
};

export default StudentDashboard;
