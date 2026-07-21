import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Receipt, UserCheck, FileText, Download, Megaphone, Bus, Library,
  Phone, Mail, CheckCircle2, AlertTriangle, Bell,
} from 'lucide-react';
import apiClient from '../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBadge } from '../components/common/StatusBadge';

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

interface SchoolContact {
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

// Large, plain-language status tiles for the top of the dashboard — the
// things a worried (and possibly elderly) parent wants to know at a glance,
// without reading anything. Status is never color-alone: every tile pairs
// its color with an icon and a short, everyday-language line.
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
    box: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400',
    icon: <Bell className="w-9 h-9" />,
  },
};

const StatTile = ({
  label,
  value,
  status,
  helpText,
}: {
  label: string;
  value: string;
  status: TileStatus;
  helpText?: string;
}) => {
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

const GuardianDashboard = () => {
  const { user } = useAuthStore();
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [attendance, setAttendance] = useState<any>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [transportAssignment, setTransportAssignment] = useState<TransportAssignment | null>(null);
  const [libraryIssues, setLibraryIssues] = useState<LibraryIssue[]>([]);
  const [contact, setContact] = useState<SchoolContact | null>(null);
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

  // Announcements and school contact details aren't per-child — parents check
  // these first, so they're fetched independently of the selected child.
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
    const fetchContact = async () => {
      try {
        const res = await apiClient.get('/institution/website');
        const inst = res.data.data;
        if (inst) setContact({ name: inst.name, contactPhone: inst.contactPhone, contactEmail: inst.contactEmail });
      } catch (err) {
        console.error('Failed to load school contact info', err);
      }
    };
    fetchNotices();
    fetchContact();
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
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center text-lg">Loading your dashboard...</div>;
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

  // Derive plain-language status for the top tiles — never color alone.
  const attendancePct: number | null = attendance?.statistics?.attendancePercentage ?? null;
  const attendanceStatus: TileStatus = attendancePct === null ? 'info' : attendancePct >= 85 ? 'good' : attendancePct >= 70 ? 'warning' : 'critical';

  const totalFeesDue = invoices.reduce((sum, inv) => sum + Number(inv.dueAmount || 0), 0);
  const feesStatus: TileStatus = totalFeesDue > 0 ? 'critical' : 'good';

  const overdueBooks = libraryIssues.filter((i) => new Date(i.dueDate) < new Date());
  const libraryStatus: TileStatus = overdueBooks.length > 0 ? 'critical' : libraryIssues.length > 0 ? 'warning' : 'good';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Hello, {user?.firstName || 'Guardian'}
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1.5 text-lg">Here is what's happening with your family today.</p>
      </div>

      {/* At a glance — the four things a parent worries about most, in big,
          plain numbers. No jargon, no reading required to get the gist. */}
      {childDataLoading ? (
        <div className="text-slate-500 dark:text-slate-400 p-8 text-center text-lg">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Attendance"
            value={attendancePct === null ? '—' : `${attendancePct}%`}
            status={attendanceStatus}
            helpText="This month"
          />
          <StatTile
            label="Fees Due"
            value={totalFeesDue > 0 ? `৳${totalFeesDue.toLocaleString()}` : 'All Paid'}
            status={feesStatus}
            helpText={totalFeesDue > 0 ? 'Please pay soon' : 'Nothing owed'}
          />
          <StatTile
            label="Library Books"
            value={libraryIssues.length === 0 ? 'None' : `${libraryIssues.length}`}
            status={libraryStatus}
            helpText={overdueBooks.length > 0 ? `${overdueBooks.length} overdue` : 'Currently borrowed'}
          />
          <StatTile
            label="New Notices"
            value={`${notices.length}`}
            status="info"
            helpText="From the school"
          />
        </div>
      )}

      {/* Announcements — surfaced early since this is what parents check on
          landing, independent of which child is currently selected. */}
      {notices.length > 0 && (
        <div className="glass-card overflow-hidden border-l-4 border-l-amber-500">
          <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Megaphone className="w-6 h-6 text-amber-500" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Announcements</h3>
            </div>
            <Link
              to="/notices"
              className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {notices.map((notice) => (
              <div key={notice.id} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-base text-slate-900 dark:text-white">{notice.title}</p>
                  <span className="text-xs text-slate-400 shrink-0">{new Date(notice.publishedAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-3">{notice.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Child picker — big touch targets with a photo/initial so a child can
          be recognized at a glance rather than by reading a name. */}
      {children.length > 1 && (
        <div className="flex gap-3 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`flex items-center gap-2.5 pl-2 pr-5 py-2 rounded-2xl text-base font-bold transition-all ${
                selectedChildId === child.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.avatarUrl ? (
                <img src={child.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <span className={`w-9 h-9 rounded-full flex items-center justify-center font-black ${selectedChildId === child.id ? 'bg-white/20' : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'}`}>
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
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl font-black">
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
              <Receipt className="w-6 h-6 text-indigo-500" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Fees & Payments</h3>
            </div>
            <div className="p-6">
              {invoices.length === 0 ? (
                <EmptyState title="No invoices" description="No fee invoices for this child yet." icon={<Receipt className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-4">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between text-base">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{inv.invoiceNo}</p>
                        <p className="text-sm text-slate-500 mt-0.5">Due {new Date(inv.dueDate).toLocaleDateString()} · ৳{Number(inv.dueAmount).toLocaleString()} due</p>
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
            <div className="p-6">
              {!attendance ? (
                <EmptyState title="No attendance data" description="No attendance records yet." icon={<UserCheck className="w-8 h-8 text-slate-400" />} />
              ) : (
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
                    <div className="col-span-2 text-sm text-red-500 font-semibold">৳{attendance.finesDue} in absence fines due</div>
                  )}
                </div>
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
              {!transportAssignment ? (
                <EmptyState title="No transport assigned" description="This child isn't on a transport route yet." icon={<Bus className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="text-base space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-white">{transportAssignment.route?.name || 'Route unassigned'}</p>
                  {transportAssignment.pickupPoint && (
                    <p className="text-sm text-slate-500">Pickup: {transportAssignment.pickupPoint}</p>
                  )}
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
              {libraryIssues.length === 0 ? (
                <EmptyState title="No books issued" description="No library books currently checked out." icon={<Library className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-4">
                  {libraryIssues.map((issue) => (
                    <div key={issue.id} className="flex items-center justify-between text-base">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{issue.book.title}</p>
                        <p className="text-sm text-slate-500 mt-0.5">Due {new Date(issue.dueDate).toLocaleDateString()}</p>
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
              {exams.length === 0 ? (
                <EmptyState title="No exams yet" description="Report cards will appear here once exams are recorded." icon={<FileText className="w-8 h-8 text-slate-400" />} />
              ) : (
                <div className="space-y-2">
                  {exams.map((exam) => (
                    <div key={exam.id} className="flex items-center justify-between text-base p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5">
                      <span className="text-slate-900 dark:text-white font-semibold">{exam.name}</span>
                      <button
                        onClick={() => downloadReportCard(exam.id)}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl transition-colors"
                      >
                        <Download className="w-4 h-4" /> Download Report Card
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact the school — for anything confusing on this page, a
          one-tap phone/email out to the school office. */}
      {contact && (contact.contactPhone || contact.contactEmail) && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Need Help?</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">If anything here is unclear, contact the school office directly.</p>
          <div className="flex flex-wrap gap-3">
            {contact.contactPhone && (
              <a
                href={`tel:${contact.contactPhone}`}
                className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 rounded-2xl transition-colors text-base"
              >
                <Phone className="w-5 h-5" /> Call {contact.contactPhone}
              </a>
            )}
            {contact.contactEmail && (
              <a
                href={`mailto:${contact.contactEmail}`}
                className="flex items-center gap-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold px-5 py-3 rounded-2xl transition-colors text-base"
              >
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
