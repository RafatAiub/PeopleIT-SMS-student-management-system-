import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Receipt, UserCheck, FileText, Download, Megaphone, Bus, Library } from 'lucide-react';
import apiClient from '../api/client';
import toast from 'react-hot-toast';
import { EmptyState } from '../components/common/EmptyState';

interface ChildSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  class: { name: string } | null;
  section: { name: string } | null;
}

interface Invoice {
  id: string;
  invoiceNo: string;
  totalAmount: string;
  dueAmount: string;
  dueDate: string;
  status: string;
}

interface Exam {
  id: string;
  name: string;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  audience: string;
  publishedAt: string;
}

interface TransportAssignment {
  id: string;
  pickupPoint: string | null;
  route: { name: string; stops: string } | null;
  vehicle: { registrationNumber: string; driverName: string; driverPhone: string | null } | null;
}

interface LibraryIssue {
  id: string;
  book: { title: string; author: string };
  dueDate: string;
  status: string;
  fineAmount: number;
}

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    PAID: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    PARTIAL: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    UNPAID: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
    OVERDUE: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
    ISSUED: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    RETURNED: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
};

const GuardianDashboard = () => {
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [attendance, setAttendance] = useState<any>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [transportAssignment, setTransportAssignment] = useState<TransportAssignment | null>(null);
  const [libraryIssues, setLibraryIssues] = useState<LibraryIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [childDataLoading, setChildDataLoading] = useState(false);

  useEffect(() => {
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
        setLoading(false);
      }
    };
    fetchChildren();
  }, []);

  // Announcements aren't per-child — parents check these first, so they're
  // fetched independently of which child is currently selected.
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const res = await apiClient.get('/notices', { params: { isActive: true, pageSize: 20 } });
        const list: Notice[] = res.data.data || [];
        setNotices(list.filter((n) => n.audience === 'ALL' || n.audience === 'GUARDIANS').slice(0, 3));
      } catch (err) {
        console.error('Failed to load notices', err);
      }
    };
    fetchNotices();
  }, []);

  useEffect(() => {
    if (!selectedChildId) return;
    const fetchChildData = async () => {
      setChildDataLoading(true);
      try {
        const [invoicesRes, attendanceRes, examsRes, transportRes, libraryRes] = await Promise.all([
          apiClient.get('/fees/invoices', { params: { studentId: selectedChildId, pageSize: 20 } }).catch(() => ({ data: { data: [] } })),
          apiClient.get(`/attendance/child/${selectedChildId}`).catch(() => ({ data: { data: null } })),
          apiClient.get('/results').catch(() => ({ data: { data: [] } })),
          apiClient.get('/transport/me/assignment', { params: { studentId: selectedChildId } }).catch(() => ({ data: { data: null } })),
          apiClient.get('/library/me/issues', { params: { studentId: selectedChildId, status: 'ISSUED', pageSize: 10 } }).catch(() => ({ data: { data: [] } })),
        ]);
        setInvoices(invoicesRes.data.data || []);
        setAttendance(attendanceRes.data.data || null);
        setExams(examsRes.data.data || []);
        setTransportAssignment(transportRes.data.data || null);
        setLibraryIssues(libraryRes.data.data || []);
      } catch (err) {
        console.error('Failed to load child data', err);
      } finally {
        setChildDataLoading(false);
      }
    };
    fetchChildData();
  }, [selectedChildId]);

  const downloadReportCard = async (examId: string) => {
    if (!selectedChildId) return;
    try {
      const res = await apiClient.get(`/results/${selectedChildId}/report-card`, {
        params: { examId },
        responseType: 'blob',
      });
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

  if (loading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your dashboard...</div>;
  }

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

  const selectedChild = children.find((c) => c.id === selectedChildId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Guardian Dashboard</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Fees, attendance, and results for your children.</p>
      </div>

      {/* Announcements — surfaced first since this is what parents check on
          landing, independent of which child is currently selected. */}
      {notices.length > 0 && (
        <div className="glass-card overflow-hidden border-l-4 border-l-amber-500">
          <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Announcements</h3>
            </div>
            <Link to="/notices" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {notices.map((notice) => (
              <div key={notice.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{notice.title}</p>
                  <span className="text-[10px] text-slate-400 shrink-0">{new Date(notice.publishedAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{notice.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {children.length > 1 && (
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

      {selectedChild && (
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white">{selectedChild.firstName} {selectedChild.lastName}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selectedChild.class?.name || 'No class'} {selectedChild.section?.name ? `- ${selectedChild.section.name}` : ''} · ID: {selectedChild.studentId}
            </p>
          </div>
        </div>
      )}

      {childDataLoading ? (
        <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fees */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-indigo-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fee Invoices</h3>
            </div>
            <div className="p-5">
              {invoices.length === 0 ? (
                <EmptyState title="No invoices" description="No fee invoices for this child yet." icon={<Receipt className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{inv.invoiceNo}</p>
                        <p className="text-xs text-slate-500">Due {new Date(inv.dueDate).toLocaleDateString()} · ৳{Number(inv.dueAmount).toLocaleString()} due</p>
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
            <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Attendance</h3>
            </div>
            <div className="p-5">
              {!attendance ? (
                <EmptyState title="No attendance data" description="No attendance records yet." icon={<UserCheck className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{attendance.statistics?.attendancePercentage ?? 0}%</p>
                    <p className="text-xs text-slate-500">Attendance rate</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{attendance.statistics?.absent ?? 0}</p>
                    <p className="text-xs text-slate-500">Days absent</p>
                  </div>
                  {attendance.finesDue > 0 && (
                    <div className="col-span-2 text-xs text-red-500 font-semibold">৳{attendance.finesDue} in absence fines due</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Transport */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center gap-2">
              <Bus className="w-5 h-5 text-sky-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Transport</h3>
            </div>
            <div className="p-5">
              {!transportAssignment ? (
                <EmptyState title="No transport assigned" description="This child isn't on a transport route yet." icon={<Bus className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="text-sm space-y-1.5">
                  <p className="font-medium text-slate-900 dark:text-white">{transportAssignment.route?.name || 'Route unassigned'}</p>
                  {transportAssignment.pickupPoint && (
                    <p className="text-xs text-slate-500">Pickup: {transportAssignment.pickupPoint}</p>
                  )}
                  {transportAssignment.vehicle && (
                    <p className="text-xs text-slate-500">
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
            <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center gap-2">
              <Library className="w-5 h-5 text-rose-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Library Books</h3>
            </div>
            <div className="p-5">
              {libraryIssues.length === 0 ? (
                <EmptyState title="No books issued" description="No library books currently checked out." icon={<Library className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-3">
                  {libraryIssues.map((issue) => (
                    <div key={issue.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{issue.book.title}</p>
                        <p className="text-xs text-slate-500">Due {new Date(issue.dueDate).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge status={issue.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Report Cards */}
          <div className="glass-card overflow-hidden lg:col-span-2">
            <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center gap-2">
              <FileText className="w-5 h-5 text-violet-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Report Cards</h3>
            </div>
            <div className="p-5">
              {exams.length === 0 ? (
                <EmptyState title="No exams yet" description="Report cards will appear here once exams are recorded." icon={<FileText className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-2">
                  {exams.map((exam) => (
                    <div key={exam.id} className="flex items-center justify-between text-sm p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5">
                      <span className="text-slate-900 dark:text-white font-medium">{exam.name}</span>
                      <button
                        onClick={() => downloadReportCard(exam.id)}
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" /> Download PDF
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuardianDashboard;
