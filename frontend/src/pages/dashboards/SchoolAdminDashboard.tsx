import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users, BookOpen, Building2, UserCheck, CircleDollarSign, Megaphone, ClipboardList,
  Trophy, ClipboardCheck, UserPlus, FileEdit, CalendarClock, ClipboardCheck as AttendanceIcon,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { DashboardSkeleton } from '../../components/common/DashboardSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader, StatCard, ErrorState } from '../../components/ui';
import { formatCurrency, formatDate } from '../../i18n';
import { OnboardingChecklist } from '../../components/saas';

interface AdminOverview {
  counts: {
    totalStudents: number;
    sessionStudents: number;
    totalTeachers: number;
    totalClasses: number;
    totalStreams: number;
  };
  fees: { collected: number; upcomingDues: number; overdue: number };
  attendanceToday: {
    present: number; absent: number; late: number; halfDay: number; totalMarked: number; percentPresent: number;
  };
  genderBreakdown: { male: number; female: number; other: number };
  topPerformers: Array<{ studentId: string; name: string; className: string | null; percentage: number }>;
  recentNotices: Array<{ id: string; title: string; content: string; audience: string; publishedAt: string }>;
}

const AttendanceBar: React.FC<{ label: string; count: number; total: number; color: string }> = ({ label, count, total, color }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-semibold text-slate-700 dark:text-slate-300">{count} ({pct}%)</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const GenderBar: React.FC<{ label: string; count: number; total: number; color: string }> = ({ label, count, total, color }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right font-semibold text-slate-700 dark:text-slate-300">{count}</span>
    </div>
  );
};

const QuickAction: React.FC<{ icon: React.ReactNode; label: string; to: string }> = ({ icon, label, to }) => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left w-full"
    >
      <span className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</span>
    </button>
  );
};

export const SchoolAdminDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const overviewQuery = useQuery({
    queryKey: ['reports', 'admin-overview'],
    queryFn: async () => (await apiClient.get<{ data: AdminOverview }>('/reports/admin-overview')).data.data,
  });

  const pendingRegistrationsQuery = useQuery({
    queryKey: ['students', 'pending-count'],
    queryFn: async () => (await apiClient.get('/students', { params: { status: 'PENDING', page: 1, limit: 1 } })).data,
    enabled: isAdmin,
  });

  const pendingLeaveQuery = useQuery({
    queryKey: ['leave', 'requests', 'pending-count'],
    queryFn: async () => (await apiClient.get('/leave/requests', { params: { status: 'PENDING', page: 1, pageSize: 1 } })).data,
    enabled: isAdmin,
  });

  const pendingUserRegistrationsQuery = useQuery({
    queryKey: ['users', 'pending-registrations'],
    queryFn: async () => (await apiClient.get('/users/pending-registrations')).data.data || [],
    enabled: isAdmin,
  });

  const approvedLeaveQuery = useQuery({
    queryKey: ['leave', 'requests', 'approved'],
    queryFn: async () => (await apiClient.get('/leave/requests', { params: { status: 'APPROVED', page: 1, pageSize: 5 } })).data.data || [],
    enabled: isAdmin,
  });

  const overview = overviewQuery.data;

  if (overviewQuery.isLoading) return <DashboardSkeleton />;
  if (overviewQuery.isError) {
    return <ErrorState onRetry={() => overviewQuery.refetch()} message="Could not load your institution's overview." />;
  }

  const genderTotal = overview ? overview.genderBreakdown.male + overview.genderBreakdown.female + overview.genderBreakdown.other : 0;
  const feesTotal = overview ? overview.fees.collected + overview.fees.upcomingDues + overview.fees.overdue : 0;

  const pendingRegistrationsCount = pendingRegistrationsQuery.data?.total ?? pendingRegistrationsQuery.data?.data?.length ?? null;
  const pendingLeaveCount = pendingLeaveQuery.data?.meta?.total ?? pendingLeaveQuery.data?.data?.length ?? null;
  const pendingUserRegistrationsCount = pendingUserRegistrationsQuery.data?.length ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user?.firstName ?? ''}`} description="Here's an overview of your institution's performance, staff activity, and academic operations." />

      {/* Setup checklist — renders nothing once dismissed or complete */}
      <OnboardingChecklist />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Students" value={overview?.counts.totalStudents ?? 0} icon={<Users />} tone="primary" hint="All active students" />
        <StatCard label="Session Students" value={overview?.counts.sessionStudents ?? 0} icon={<UserCheck />} tone="info" hint="Current session" />
        <StatCard label="Total Teachers" value={overview?.counts.totalTeachers ?? 0} icon={<BookOpen />} tone="success" hint="Active staff" />
        <StatCard label="Total Classes" value={overview?.counts.totalClasses ?? 0} icon={<Building2 />} tone="accent" hint="Across all branches" />
        <StatCard label="Total Streams" value={overview?.counts.totalStreams ?? 0} icon={<ClipboardList />} tone="neutral" hint="Configured streams" />
      </div>

      {/* Quick actions */}
      {isAdmin && (
        <div className="glass-card p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <QuickAction icon={<UserPlus className="w-4.5 h-4.5" />} label="Add student" to="/students/admission" />
            <QuickAction icon={<CircleDollarSign className="w-4.5 h-4.5" />} label="Create invoice" to="/fees" />
            <QuickAction icon={<AttendanceIcon className="w-4.5 h-4.5" />} label="Take attendance" to="/attendance" />
            <QuickAction icon={<Megaphone className="w-4.5 h-4.5" />} label="Post notice" to="/notices" />
          </div>
        </div>
      )}

      {/* Pending approvals */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Pending online registrations"
            value={pendingRegistrationsCount ?? '—'}
            icon={<FileEdit />}
            tone="warning"
            to="/students/online-registrations"
            hint="Awaiting review"
          />
          <StatCard
            label="Pending leave requests"
            value={pendingLeaveCount ?? '—'}
            icon={<CalendarClock />}
            tone="warning"
            to="/leave/requests"
            hint="Staff leave awaiting action"
          />
          <StatCard
            label="Pending user registrations"
            value={pendingUserRegistrationsCount ?? '—'}
            icon={<UserPlus />}
            tone="warning"
            to="/users"
            hint="Self-registered accounts"
          />
        </div>
      )}

      {/* Fees / Attendance / Gender */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Fees Collection</h3>
          {overview && feesTotal > 0 ? (
            <div className="flex items-center gap-4">
              <div style={{ width: 128, height: 128 }} className="flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Collected', value: overview.fees.collected },
                        { name: 'Upcoming Dues', value: overview.fees.upcomingDues },
                        { name: 'Overdue', value: overview.fees.overdue },
                      ]}
                      cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2} dataKey="value"
                    >
                      <Cell fill="#2B5C74" strokeWidth={0} />
                      <Cell fill="#F59E0B" strokeWidth={0} />
                      <Cell fill="#EF4444" strokeWidth={0} />
                    </Pie>
                    <RTooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#2B5C74' }} />Collected</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(overview.fees.collected)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#F59E0B' }} />Upcoming Dues</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(overview.fees.upcomingDues)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#EF4444' }} />Overdue Amount</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(overview.fees.overdue)}</span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="No fee activity yet" description="Invoices will appear here once fees are generated." icon={<CircleDollarSign className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
          )}
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Today's Attendance</h3>
            {overview && overview.attendanceToday.totalMarked > 0 && (
              <span className="text-xs font-bold text-accent-600 dark:text-accent-400">{overview.attendanceToday.percentPresent}% Present</span>
            )}
          </div>
          {overview && overview.attendanceToday.totalMarked > 0 ? (
            <div className="space-y-3">
              <AttendanceBar label="Present" count={overview.attendanceToday.present} total={overview.attendanceToday.totalMarked} color="bg-accent-500" />
              <AttendanceBar label="Absent" count={overview.attendanceToday.absent} total={overview.attendanceToday.totalMarked} color="bg-red-500" />
              <AttendanceBar label="Late" count={overview.attendanceToday.late} total={overview.attendanceToday.totalMarked} color="bg-amber-500" />
              <AttendanceBar label="Half Day" count={overview.attendanceToday.halfDay} total={overview.attendanceToday.totalMarked} color="bg-slate-400" />
            </div>
          ) : (
            <EmptyState title="No Data Found" description="Attendance hasn't been marked for today yet." icon={<ClipboardCheck className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
          )}
        </div>

        <div className="glass-card p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Total Students</h3>
          {overview && genderTotal > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative" style={{ width: 140, height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Boys', value: overview.genderBreakdown.male },
                        { name: 'Girls', value: overview.genderBreakdown.female },
                        ...(overview.genderBreakdown.other > 0 ? [{ name: 'Other', value: overview.genderBreakdown.other }] : []),
                      ]}
                      cx="50%" cy="50%" innerRadius={48} outerRadius={64} paddingAngle={2} dataKey="value"
                    >
                      <Cell fill="#3D7590" strokeWidth={0} />
                      <Cell fill="#10B981" strokeWidth={0} />
                      {overview.genderBreakdown.other > 0 && <Cell fill="#94A3B8" strokeWidth={0} />}
                    </Pie>
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">{genderTotal}</span>
                  <span className="text-[11px] text-slate-400">Total Students</span>
                </div>
              </div>
              <div className="w-full space-y-2">
                <GenderBar label="Boys" count={overview.genderBreakdown.male} total={genderTotal} color="bg-primary-500" />
                <GenderBar label="Girls" count={overview.genderBreakdown.female} total={genderTotal} color="bg-accent-500" />
              </div>
            </div>
          ) : (
            <EmptyState title="No students yet" description="Student demographics will appear once students are enrolled." icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
          )}
        </div>
      </div>

      {/* Top performers + Approved leaves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Recent Assessment Performance</h3>
          {overview && overview.topPerformers.length > 0 ? (
            <div className="space-y-4">
              {overview.topPerformers.map((p) => (
                <div key={p.studentId}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {p.name}{p.className && <span className="text-[11px] font-normal text-slate-400 ml-1.5">({p.className})</span>}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">{p.percentage.toFixed(2)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-600 rounded-full transition-all" style={{ width: `${Math.min(p.percentage, 100)}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400 pt-1">*Based on the most recent exam's results</p>
            </div>
          ) : (
            <EmptyState title="No results yet" description="Top performers will appear here once exam results are recorded." icon={<Trophy className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
          )}
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Approved Leaves</h3>
            <button onClick={() => navigate('/hr')} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">Manage HR</button>
          </div>
          {!isAdmin ? (
            <EmptyState title="Not available" description="Leave data is only shown to administrators." icon={<ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
          ) : approvedLeaveQuery.isLoading ? (
            <div className="text-sm text-slate-400">Loading…</div>
          ) : approvedLeaveQuery.isError ? (
            <ErrorState compact onRetry={() => approvedLeaveQuery.refetch()} />
          ) : (approvedLeaveQuery.data || []).length > 0 ? (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {approvedLeaveQuery.data.map((lv: any) => (
                <div key={lv.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {lv.applicant ? `${lv.applicant.firstName} ${lv.applicant.lastName}` : lv.applicantUserId}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatDate(lv.startDate)} – {formatDate(lv.endDate)}
                    </p>
                  </div>
                  <span className="badge-success text-[10px] flex-shrink-0">Approved</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No approved leaves" description="Approved leave requests will show up here." icon={<ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
          )}
        </div>
      </div>

      {/* Notices */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Noticeboard</h3>
          <button onClick={() => navigate('/notices')} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">View All Notices</button>
        </div>
        {overview && overview.recentNotices.length > 0 ? (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {overview.recentNotices.map((n) => (
              <div key={n.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{n.title}</p>
                  <span className="badge-info text-[10px] flex-shrink-0">{n.audience}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{n.content}</p>
                <p className="text-[11px] text-slate-400 mt-1.5">{formatDate(n.publishedAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No notices yet" description="Published notices will show up here." icon={<Megaphone className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
        )}
      </div>
    </div>
  );
};

export default SchoolAdminDashboard;
