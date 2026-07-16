import React, { useEffect, useState } from 'react';
import { Users, Receipt, UserCheck, FileText, Download } from 'lucide-react';
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

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    PAID: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    PARTIAL: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    UNPAID: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
    OVERDUE: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
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

  useEffect(() => {
    if (!selectedChildId) return;
    const fetchChildData = async () => {
      setChildDataLoading(true);
      try {
        const [invoicesRes, attendanceRes, examsRes] = await Promise.all([
          apiClient.get('/fees/invoices', { params: { studentId: selectedChildId, pageSize: 20 } }).catch(() => ({ data: { data: [] } })),
          apiClient.get(`/attendance/child/${selectedChildId}`).catch(() => ({ data: { data: null } })),
          apiClient.get('/results').catch(() => ({ data: { data: [] } })),
        ]);
        setInvoices(invoicesRes.data.data || []);
        setAttendance(attendanceRes.data.data || null);
        setExams(examsRes.data.data || []);
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
