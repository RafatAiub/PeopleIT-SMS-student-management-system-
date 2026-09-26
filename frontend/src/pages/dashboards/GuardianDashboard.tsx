import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Receipt, UserCheck, FileText, Download, Megaphone, Bus, Library,
  Phone, Mail, CheckCircle2, AlertTriangle, Bell,
} from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ErrorState, Button } from '../../components/ui';
import { AttendanceHeatmap, type HeatmapDay } from '../../components/Charts/AttendanceHeatmap';
import { formatCurrency, formatDate } from '../../i18n';

interface ChildSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  avatarUrl?: string | null;
  class: { name: string } | null;
  section: { name: string } | null;
}

type TileStatus = 'good' | 'warning' | 'critical' | 'info';

const TILE_STYLES: Record<TileStatus, { box: string; icon: React.ReactNode }> = {
  good: {
    box: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-9 h-9" />,
  },
  warning: {
    box: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400',
    icon: <AlertTriangle className="w-9 h-9" />,
  },
  critical: {
    box: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400',
    icon: <AlertTriangle className="w-9 h-9" />,
  },
  info: {
    box: 'bg-primary-50 dark:bg-primary-500/10 border-primary-200 dark:border-primary-500/20 text-primary-700 dark:text-primary-400',
    icon: <Bell className="w-9 h-9" />,
  },
};

const StatTile: React.FC<{ label: string; value: string; status: TileStatus; helpText?: string }> = ({ label, value, status, helpText }) => {
  const style = TILE_STYLES[status];
  return (
    <div className={`rounded-2xl border-2 p-5 flex items-center gap-4 ${style.box}`}>
      <div className="shrink-0">{style.icon}</div>
      <div className="min-w-0">
        <p className="text-3xl font-black leading-none">{value}</p>
        <p className="text-base font-bold mt-2">{label}</p>
        {helpText && <p className="text-sm mt-1 opacity-80">{helpText}</p>}
      </div>
    </div>
  );
};

// Status -> attendance rate mapping for the heatmap (0-100).
function statusToRate(status: string): number {
  if (status === 'PRESENT') return 100;
  if (status === 'LATE') return 75;
  if (status === 'HALF_DAY') return 50;
  return 0; // ABSENT
}

const GuardianDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const childrenQuery = useQuery({
    queryKey: ['guardians', 'me', 'students'],
    queryFn: async () => {
      const res = await apiClient.get('/guardians/me/students');
      const list: ChildSummary[] = res.data.data || [];
      if (list.length > 0 && !selectedChildId) setSelectedChildId(list[0].id);
      return list;
    },
  });

  const noticesQuery = useQuery({
    queryKey: ['notices', 'guardian'],
    queryFn: async () => {
      const res = await apiClient.get('/notices', { params: { isActive: true, pageSize: 20 } });
      const list = res.data.data || [];
      return list.filter((n: any) => n.audience === 'ALL' || n.audience === 'GUARDIANS').slice(0, 3);
    },
  });

  const contactQuery = useQuery({
    queryKey: ['institution', 'website'],
    queryFn: async () => {
      const res = await apiClient.get('/institution/website');
      const inst = res.data.data;
      return inst ? { name: inst.name, contactPhone: inst.contactPhone, contactEmail: inst.contactEmail } : null;
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ['fees', 'invoices', selectedChildId],
    queryFn: async () => (await apiClient.get('/fees/invoices', { params: { studentId: selectedChildId, pageSize: 20 } })).data.data || [],
    enabled: !!selectedChildId,
  });

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'child', selectedChildId],
    queryFn: async () => (await apiClient.get(`/attendance/child/${selectedChildId}`)).data.data || null,
    enabled: !!selectedChildId,
  });

  const examsQuery = useQuery({
    queryKey: ['results', 'exams', selectedChildId],
    queryFn: async () => (await apiClient.get('/results')).data.data || [],
    enabled: !!selectedChildId,
  });

  const transportQuery = useQuery({
    queryKey: ['transport', 'me', 'assignment', selectedChildId],
    queryFn: async () => (await apiClient.get('/transport/me/assignment', { params: { studentId: selectedChildId } })).data.data || null,
    enabled: !!selectedChildId,
  });

  const libraryQuery = useQuery({
    queryKey: ['library', 'me', 'issues', selectedChildId],
    queryFn: async () => (await apiClient.get('/library/me/issues', { params: { studentId: selectedChildId, status: 'ISSUED', pageSize: 10 } })).data.data || [],
    enabled: !!selectedChildId,
  });

  const downloadReportCard = async (examId: string) => {
    if (!selectedChildId) return;
    try {
      const res = await apiClient.get(`/results/${selectedChildId}/report-card`, { params: { examId }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-card-${selectedChildId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Report card not available for this exam yet');
    }
  };

  if (childrenQuery.isLoading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center text-lg">Loading your dashboard...</div>;
  }

  if (childrenQuery.isError) {
    return <ErrorState onRetry={() => childrenQuery.refetch()} message="Could not load your linked children." />;
  }

  const children = childrenQuery.data ?? [];

  if (children.length === 0) {
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

  const activeChildId = selectedChildId ?? children[0].id;
  const selectedChild = children.find((c) => c.id === activeChildId);

  const invoices = invoicesQuery.data ?? [];
  const attendance = attendanceQuery.data;
  const exams = examsQuery.data ?? [];
  const transportAssignment = transportQuery.data;
  const libraryIssues = libraryQuery.data ?? [];
  const notices = noticesQuery.data ?? [];
  const contact = contactQuery.data;

  const childDataLoading = invoicesQuery.isLoading || attendanceQuery.isLoading || examsQuery.isLoading || transportQuery.isLoading || libraryQuery.isLoading;

  const attendancePct: number | null = attendance?.statistics?.attendancePercentage ?? null;
  const attendanceStatus: TileStatus = attendancePct === null ? 'info' : attendancePct >= 85 ? 'good' : attendancePct >= 70 ? 'warning' : 'critical';

  const totalFeesDue = invoices.reduce((sum: number, inv: any) => sum + Number(inv.dueAmount || 0), 0);
  const feesStatus: TileStatus = totalFeesDue > 0 ? 'critical' : 'good';

  const overdueBooks = libraryIssues.filter((i: any) => new Date(i.dueDate) < new Date());
  const libraryStatus: TileStatus = overdueBooks.length > 0 ? 'critical' : libraryIssues.length > 0 ? 'warning' : 'good';

  const heatmapDays: HeatmapDay[] = (attendance?.attendance ?? []).map((r: any) => ({
    date: new Date(r.date).toISOString().slice(0, 10),
    rate: statusToRate(r.status),
    detail: r.status,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Hello, {user?.firstName || 'Guardian'}</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1.5 text-lg">Here is what's happening with your family today.</p>
      </div>

      {childDataLoading ? (
        <div className="text-slate-500 dark:text-slate-400 p-8 text-center text-lg">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Attendance" value={attendancePct === null ? '—' : `${attendancePct}%`} status={attendanceStatus} helpText="This month" />
          <StatTile
            label="Fees Due"
            value={totalFeesDue > 0 ? formatCurrency(totalFeesDue) : 'All Paid'}
            status={feesStatus}
            helpText={totalFeesDue > 0 ? 'Please pay soon' : 'Nothing owed'}
          />
          <StatTile
            label="Library Books"
            value={libraryIssues.length === 0 ? 'None' : `${libraryIssues.length}`}
            status={libraryStatus}
            helpText={overdueBooks.length > 0 ? `${overdueBooks.length} overdue` : 'Currently borrowed'}
          />
          <StatTile label="New Notices" value={`${notices.length}`} status="info" helpText="From the school" />
        </div>
      )}

      {noticesQuery.isError ? (
        <ErrorState compact onRetry={() => noticesQuery.refetch()} message="Could not load announcements." />
      ) : notices.length > 0 && (
        <div className="glass-card overflow-hidden border-l-4 border-l-amber-500">
          <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Megaphone className="w-6 h-6 text-amber-500" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Announcements</h3>
            </div>
            <Link to="/notices" className="text-sm font-bold text-primary-600 dark:text-primary-400 hover:underline px-3 py-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-500/10">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {notices.map((notice: any) => (
              <div key={notice.id} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-base text-slate-900 dark:text-white">{notice.title}</p>
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(notice.publishedAt)}</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-3">{notice.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {children.length > 1 && (
        <div className="flex gap-3 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`flex items-center gap-2.5 pl-2 pr-5 py-2 rounded-2xl text-base font-bold transition-all ${
                activeChildId === child.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.avatarUrl ? (
                <img src={child.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <span className={`w-9 h-9 rounded-full flex items-center justify-center font-black ${activeChildId === child.id ? 'bg-white/20' : 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400'}`}>
                  {child.firstName.charAt(0)}
                </span>
              )}
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      {selectedChild && (
        <div className="glass-card p-6 flex items-center gap-4">
          {selectedChild.avatarUrl ? (
            <img src={selectedChild.avatarUrl} alt="" className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-white/10" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 text-2xl font-black">
              {selectedChild.firstName.charAt(0)}
            </div>
          )}
          <div>
            <p className="font-black text-xl text-slate-900 dark:text-white">{selectedChild.firstName} {selectedChild.lastName}</p>
            <p className="text-base text-slate-500 dark:text-slate-400 mt-0.5">
              {selectedChild.class?.name || 'No class'} {selectedChild.section?.name ? `- ${selectedChild.section.name}` : ''} · ID: {selectedChild.studentId}
            </p>
          </div>
        </div>
      )}

      {childDataLoading ? (
        <div className="text-slate-500 dark:text-slate-400 p-8 text-center text-lg">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fees */}
          <div className="glass-card overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
              <Receipt className="w-6 h-6 text-primary-500" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Fees & Payments</h3>
            </div>
            <div className="p-6">
              {invoicesQuery.isError ? (
                <ErrorState compact onRetry={() => invoicesQuery.refetch()} />
              ) : invoices.length === 0 ? (
                <EmptyState title="No invoices" description="No fee invoices for this child yet." icon={<Receipt className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-4">
                  {invoices.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between text-base">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{inv.invoiceNo}</p>
                        <p className="text-sm text-slate-500 mt-0.5">Due {formatDate(inv.dueDate)} · {formatCurrency(inv.dueAmount)} due</p>
                      </div>
                      <StatusBadge status={inv.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Attendance */}
          <div className="glass-card overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
              <UserCheck className="w-6 h-6 text-emerald-500" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Attendance</h3>
            </div>
            <div className="p-6 space-y-4">
              {attendanceQuery.isError ? (
                <ErrorState compact onRetry={() => attendanceQuery.refetch()} />
              ) : !attendance ? (
                <EmptyState title="No attendance data" description="No attendance records yet." icon={<UserCheck className="w-8 h-8 text-slate-400" />} />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 text-base">
                    <div>
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{attendance.statistics?.attendancePercentage ?? 0}%</p>
                      <p className="text-sm text-slate-500 mt-1">Attendance rate</p>
                    </div>
                    <div>
                      <p className="text-3xl font-black text-red-500">{attendance.statistics?.absent ?? 0}</p>
                      <p className="text-sm text-slate-500 mt-1">Days absent</p>
                    </div>
                    {attendance.finesDue > 0 && (
                      <div className="col-span-2 text-sm text-red-500 font-semibold">{formatCurrency(attendance.finesDue)} in absence fines due</div>
                    )}
                  </div>
                  {heatmapDays.length > 0 && <AttendanceHeatmap days={heatmapDays} title="Attendance history" />}
                </>
              )}
            </div>
          </div>

          {/* Transport */}
          <div className="glass-card overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
              <Bus className="w-6 h-6 text-sky-500" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">School Bus</h3>
            </div>
            <div className="p-6">
              {transportQuery.isError ? (
                <ErrorState compact onRetry={() => transportQuery.refetch()} />
              ) : !transportAssignment ? (
                <EmptyState title="No transport assigned" description="This child isn't on a transport route yet." icon={<Bus className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="text-base space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-white">{transportAssignment.route?.name || 'Route unassigned'}</p>
                  {transportAssignment.pickupPoint && <p className="text-sm text-slate-500">Pickup: {transportAssignment.pickupPoint}</p>}
                  {transportAssignment.vehicle && (
                    <p className="text-sm text-slate-500">
                      Vehicle {transportAssignment.vehicle.registrationNumber} · Driver {transportAssignment.vehicle.driverName}
                      {transportAssignment.vehicle.driverPhone ? ` (${transportAssignment.vehicle.driverPhone})` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Library */}
          <div className="glass-card overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
              <Library className="w-6 h-6 text-rose-500" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Library Books</h3>
            </div>
            <div className="p-6">
              {libraryQuery.isError ? (
                <ErrorState compact onRetry={() => libraryQuery.refetch()} />
              ) : libraryIssues.length === 0 ? (
                <EmptyState title="No books issued" description="No library books currently checked out." icon={<Library className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-4">
                  {libraryIssues.map((issue: any) => (
                    <div key={issue.id} className="flex items-center justify-between text-base">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{issue.book.title}</p>
                        <p className="text-sm text-slate-500 mt-0.5">Due {formatDate(issue.dueDate)}</p>
                      </div>
                      <StatusBadge status={issue.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Exam Results */}
          <div className="glass-card overflow-hidden lg:col-span-2">
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center gap-2.5">
              <FileText className="w-6 h-6 text-violet-500" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Exam Results</h3>
            </div>
            <div className="p-6">
              {examsQuery.isError ? (
                <ErrorState compact onRetry={() => examsQuery.refetch()} />
              ) : exams.length === 0 ? (
                <EmptyState title="No exams yet" description="Report cards will appear here once exams are recorded." icon={<FileText className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-2">
                  {exams.map((exam: any) => (
                    <div key={exam.id} className="flex items-center justify-between text-base p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5">
                      <span className="text-slate-900 dark:text-white font-semibold">{exam.name}</span>
                      <Button size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={() => downloadReportCard(exam.id)}>
                        Download Report Card
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {contactQuery.isError ? null : contact && (contact.contactPhone || contact.contactEmail) && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Need Help?</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">If anything here is unclear, contact the school office directly.</p>
          <div className="flex flex-wrap gap-3">
            {contact.contactPhone && (
              <a href={`tel:${contact.contactPhone}`} className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 rounded-2xl transition-colors text-base">
                <Phone className="w-5 h-5" /> Call {contact.contactPhone}
              </a>
            )}
            {contact.contactEmail && (
              <a href={`mailto:${contact.contactEmail}`} className="flex items-center gap-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold px-5 py-3 rounded-2xl transition-colors text-base">
                <Mail className="w-5 h-5" /> Email the School
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GuardianDashboard;
