import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Edit2, KeyRound, Printer, Eye, EyeOff, Wand2, Copy, ShieldAlert,
  FileText, Download, Upload,
} from 'lucide-react';
import apiClient from '../../../api/client';
import { useAuthStore } from '../../../store/authStore';
import {
  Button, Card, Modal, Tabs, TabPanel, Skeleton, SkeletonStatGrid,
  Alert, ErrorState, IncompleteNotice, PageHeader, StatCard, Avatar,
  DescriptionList, Input,
} from '../../../components/ui';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { EmptyState } from '../../../components/common/EmptyState';
import { AttendanceHeatmap, HeatmapDay } from '../../../components/Charts/AttendanceHeatmap';
import { formatCurrency, formatDate, useT } from '../../../i18n';

// ─────────────────────────────────────────────────────────────────────────
// Types (only the fields this page actually reads — the real payload has
// more, see student.repository.ts studentDetailSelect).
// ─────────────────────────────────────────────────────────────────────────
interface StudentDetail {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  permanentAddress?: string | null;
  bloodGroup?: string | null;
  religion?: string | null;
  nationality?: string | null;
  department?: string | null;
  category?: { id: string; name: string } | null;
  caste?: string | null;
  height?: string | null;
  weight?: string | null;
  hobbies?: string | null;
  avatarUrl?: string | null;
  status: string;
  admissionDate?: string | null;
  rollNumber?: string | null;
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  academicYear?: { id: string; label: string } | null;
  guardians?: {
    isPrimary: boolean;
    relationship?: string | null;
    guardian: { id: string; firstName: string; lastName: string; phone?: string | null; email?: string | null; relationship?: string | null };
  }[];
}

type TabId = 'overview' | 'academics' | 'attendance' | 'fees' | 'documents' | 'guardian' | 'transport' | 'library' | 'timeline';

const StudentProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const { user } = useAuthStore();
  const role = user?.role;

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  const canWrite = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TEACHER';
  const canResetPassword = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const canViewFees = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'ACCOUNTANT';
  const canViewTransport = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TRANSPORT_OFFICER';
  const canViewLibrary = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'LIBRARIAN';

  const fetchStudent = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/students/${id}`);
      setStudent(res.data.data);
    } catch (err: any) {
      console.error('Failed to load student', err);
      setError(err.response?.data?.message || 'Failed to load student profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string }[] = [
      { id: 'overview', label: t('Overview') },
      { id: 'academics', label: t('Academics') },
      { id: 'attendance', label: t('Attendance') },
    ];
    if (canViewFees) list.push({ id: 'fees', label: t('Fees') });
    list.push({ id: 'documents', label: t('Documents') });
    list.push({ id: 'guardian', label: t('Guardian') });
    if (canViewTransport) list.push({ id: 'transport', label: t('Transport') });
    if (canViewLibrary) list.push({ id: 'library', label: t('Library') });
    list.push({ id: 'timeline', label: t('Timeline') });
    return list;
  }, [canViewFees, canViewTransport, canViewLibrary, t]);

  // Ensure the active tab stays valid if the role can't see it (e.g. deep link)
  useEffect(() => {
    if (!tabs.some((tb) => tb.id === tab)) setTab('overview');
  }, [tabs, tab]);

  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <SkeletonStatGrid count={4} />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !student) {
    return <ErrorState title="Could not load student" message={error || 'Student not found'} onRetry={fetchStudent} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`${student.studentId} · ${student.class?.name || 'No class'}${student.section?.name ? ` - ${student.section.name}` : ''} · Roll ${student.rollNumber || 'N/A'}`}
        breadcrumbs={[{ label: 'Students', to: '/students' }, { label: `${student.firstName} ${student.lastName}` }]}
        actions={
          <>
            {canWrite && (
              <Button variant="secondary" size="sm" leftIcon={<Edit2 className="w-4 h-4" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {canResetPassword && (
              <Button variant="secondary" size="sm" leftIcon={<KeyRound className="w-4 h-4" />} onClick={() => setResetOpen(true)}>
                Reset password
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={() => navigate('/id-cards/generate')}
            >
              Print ID card
            </Button>
          </>
        }
      />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar name={`${student.firstName} ${student.lastName}`} src={student.avatarUrl} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{student.firstName} {student.lastName}</h2>
              <StatusBadge status={student.status} />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {student.email || 'No email'} · {student.phone || 'No phone'}
            </p>
          </div>
        </div>
      </Card>

      <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as TabId)} label="Student profile sections" idPrefix="student-profile" />

      <TabPanel id="overview" value={tab} idPrefix="student-profile">
        <OverviewTab student={student} />
      </TabPanel>
      <TabPanel id="academics" value={tab} idPrefix="student-profile">
        <AcademicsTab studentId={student.id} canWrite={canWrite} />
      </TabPanel>
      <TabPanel id="attendance" value={tab} idPrefix="student-profile">
        <AttendanceTab studentId={student.id} />
      </TabPanel>
      {canViewFees && (
        <TabPanel id="fees" value={tab} idPrefix="student-profile">
          <FeesTab studentId={student.id} />
        </TabPanel>
      )}
      <TabPanel id="documents" value={tab} idPrefix="student-profile">
        <DocumentsTab studentId={student.id} canWrite={canWrite} />
      </TabPanel>
      <TabPanel id="guardian" value={tab} idPrefix="student-profile">
        <GuardianTab guardians={student.guardians || []} />
      </TabPanel>
      {canViewTransport && (
        <TabPanel id="transport" value={tab} idPrefix="student-profile">
          <TransportTab studentId={student.id} />
        </TabPanel>
      )}
      {canViewLibrary && (
        <TabPanel id="library" value={tab} idPrefix="student-profile">
          <LibraryTab studentId={student.id} />
        </TabPanel>
      )}
      <TabPanel id="timeline" value={tab} idPrefix="student-profile">
        <IncompleteNotice reason="Activity timeline needs a timeline endpoint (planned)." />
      </TabPanel>

      {canWrite && (
        <EditStudentModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          student={student}
          onSaved={() => {
            setEditOpen(false);
            fetchStudent();
          }}
        />
      )}
      {canResetPassword && (
        <ResetPasswordModal isOpen={resetOpen} onClose={() => setResetOpen(false)} studentId={student.id} />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────
const OverviewTab: React.FC<{ student: StudentDetail }> = ({ student }) => (
  <Card className="p-5 sm:p-6">
    <DescriptionList
      columns={3}
      items={[
        { label: 'Full name', value: `${student.firstName} ${student.lastName}` },
        { label: 'Student ID', value: student.studentId },
        { label: 'Gender', value: student.gender },
        { label: 'Date of birth', value: student.dateOfBirth ? formatDate(student.dateOfBirth) : null },
        { label: 'Email', value: student.email },
        { label: 'Phone', value: student.phone },
        { label: 'Blood group', value: student.bloodGroup },
        { label: 'Religion', value: student.religion },
        { label: 'Nationality', value: student.nationality },
        { label: 'Caste', value: student.caste },
        { label: 'Height', value: student.height },
        { label: 'Weight', value: student.weight },
        { label: 'Hobbies', value: student.hobbies },
        { label: 'Category', value: student.category?.name },
        { label: 'Department', value: student.department },
        { label: 'Class', value: student.class?.name },
        { label: 'Section', value: student.section?.name },
        { label: 'Roll number', value: student.rollNumber },
        { label: 'Branch', value: student.branch?.name },
        { label: 'Academic year', value: student.academicYear?.label },
        { label: 'Admission date', value: student.admissionDate ? formatDate(student.admissionDate) : null },
        { label: 'Address', value: student.address },
        { label: 'Permanent address', value: student.permanentAddress },
        { label: 'Status', value: <StatusBadge status={student.status} /> },
      ]}
    />
  </Card>
);

// ─────────────────────────────────────────────────────────────────────────
// Academics — GET /results/results-list?studentId=, GET /results (exam list),
// GET /results/:studentId/report-card?examId= (PDF, opened in a new tab).
// ─────────────────────────────────────────────────────────────────────────
interface ExamResultRow {
  id: string;
  subject: string;
  marksObtained: number;
  maxMarks: number;
  grade?: string | null;
  exam: { id: string; name: string };
}

const AcademicsTab: React.FC<{ studentId: string; canWrite: boolean }> = ({ studentId }) => {
  const [rows, setRows] = useState<ExamResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/results/results-list', { params: { studentId, pageSize: 200 } });
      setRows(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows || rows.length === 0) {
    return <EmptyState title="No exam results yet" description="Results submitted for this student will appear here." />;
  }

  // Group by exam so each exam can offer a report-card download.
  const byExam = rows.reduce<Record<string, { exam: { id: string; name: string }; rows: ExamResultRow[] }>>((acc, r) => {
    const key = r.exam.id;
    if (!acc[key]) acc[key] = { exam: r.exam, rows: [] };
    acc[key].rows.push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.values(byExam).map(({ exam, rows: examRows }) => (
        <Card key={exam.id} className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">{exam.name}</h3>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => {
                const url = `${(apiClient.defaults.baseURL || '').replace(/\/$/, '')}/results/${studentId}/report-card?examId=${exam.id}`;
                window.open(url, '_blank');
              }}
            >
              Report card (PDF)
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/8">
                  <th className="py-2 pr-4">Subject</th>
                  <th className="py-2 pr-4">Marks</th>
                  <th className="py-2 pr-4">Grade</th>
                </tr>
              </thead>
              <tbody>
                {examRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                    <td className="py-2 pr-4">{r.subject}</td>
                    <td className="py-2 pr-4 tabular-nums">{r.marksObtained} / {r.maxMarks}</td>
                    <td className="py-2 pr-4">{r.grade || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Attendance — GET /attendance?studentId= (paginated real records), heatmap +
// monthly summary computed client-side.
// ─────────────────────────────────────────────────────────────────────────
const AttendanceTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [records, setRecords] = useState<{ date: string; status: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance', { params: { studentId, pageSize: 500 } });
      setRecords(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!records || records.length === 0) {
    return <EmptyState title="No attendance records" description="Attendance marked for this student will appear here." />;
  }

  const days: HeatmapDay[] = records.map((r) => ({
    date: new Date(r.date).toISOString().slice(0, 10),
    rate: r.status === 'PRESENT' ? 100 : r.status === 'LATE' || r.status === 'HALF_DAY' ? 50 : 0,
    detail: r.status,
  }));

  const present = records.filter((r) => r.status === 'PRESENT').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;
  const late = records.filter((r) => r.status === 'LATE' || r.status === 'HALF_DAY').length;
  const rate = records.length > 0 ? Math.round((present / records.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Attendance rate" value={`${rate}%`} tone="primary" />
        <StatCard label="Present" value={present} tone="success" />
        <StatCard label="Absent" value={absent} tone="danger" />
        <StatCard label="Late / half-day" value={late} tone="warning" />
      </div>
      <Card className="p-5 sm:p-6">
        <AttendanceHeatmap days={days} title="Attendance history" />
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Fees — GET /invoices?studentId=
// ─────────────────────────────────────────────────────────────────────────
interface InvoiceRow {
  id: string;
  invoiceNo: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  dueDate: string;
  status: string;
}

const FeesTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/fees/invoices', { params: { studentId, pageSize: 100 } });
      setInvoices(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!invoices || invoices.length === 0) {
    return <EmptyState title="No invoices" description="Fee invoices raised for this student will appear here." />;
  }

  const totalDue = invoices.reduce((sum, i) => sum + Number(i.dueAmount || 0), 0);
  const totalPaid = invoices.reduce((sum, i) => sum + Number(i.paidAmount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total paid" value={formatCurrency(totalPaid)} tone="success" />
        <StatCard label="Total due" value={formatCurrency(totalDue)} tone={totalDue > 0 ? 'danger' : 'success'} />
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/8">
                <th className="py-2 px-4">Invoice</th>
                <th className="py-2 px-4">Due date</th>
                <th className="py-2 px-4">Total</th>
                <th className="py-2 px-4">Paid</th>
                <th className="py-2 px-4">Due</th>
                <th className="py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                  <td className="py-2 px-4">
                    <Link to={`/fees`} className="text-primary-600 dark:text-primary-400 hover:underline">{inv.invoiceNo}</Link>
                  </td>
                  <td className="py-2 px-4">{formatDate(inv.dueDate)}</td>
                  <td className="py-2 px-4 tabular-nums">{formatCurrency(inv.totalAmount)}</td>
                  <td className="py-2 px-4 tabular-nums">{formatCurrency(inv.paidAmount)}</td>
                  <td className="py-2 px-4 tabular-nums">{formatCurrency(inv.dueAmount)}</td>
                  <td className="py-2 px-4"><StatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Documents — GET/POST /students/:id/documents
// ─────────────────────────────────────────────────────────────────────────
interface DocumentRow {
  id: string;
  name: string;
  type: string;
  fileUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt: string;
}

const DocumentsTab: React.FC<{ studentId: string; canWrite: boolean }> = ({ studentId, canWrite }) => {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/students/${studentId}/documents`);
      setDocs(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" leftIcon={<Upload className="w-4 h-4" />} onClick={() => setAddOpen(true)}>
            Add document
          </Button>
        </div>
      )}
      {!docs || docs.length === 0 ? (
        <EmptyState title="No documents" description="Uploaded student documents will appear here." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.map((d) => (
            <a
              key={d.id}
              href={d.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="glass-card p-4 rounded-xl border border-slate-200/50 dark:border-white/5 flex items-start gap-3 hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
            >
              <FileText className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{d.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{d.type} · {formatDate(d.uploadedAt)}</p>
              </div>
            </a>
          ))}
        </div>
      )}

      {canWrite && (
        <AddDocumentModal
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
          studentId={studentId}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
};

const AddDocumentModal: React.FC<{ isOpen: boolean; onClose: () => void; studentId: string; onSaved: () => void }> = ({
  isOpen,
  onClose,
  studentId,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setType('');
      setFileUrl('');
      setErrors({});
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'Document name is required';
    if (!type.trim()) nextErrors.type = 'Document type is required';
    if (!/^https?:\/\/.+/.test(fileUrl.trim())) nextErrors.fileUrl = 'Enter a valid file URL (http/https)';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/students/${studentId}/documents`, { name, type, fileUrl });
      toast.success('Document added');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add document');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add document" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Input label="Type" required placeholder="e.g. Birth Certificate" value={type} onChange={(e) => setType(e.target.value)} error={errors.type} />
        <Input label="File URL" required placeholder="https://…" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} error={errors.fileUrl} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={submitting}>Save</Button>
        </div>
      </form>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Guardian — already included on the GET /students/:id payload, no extra call.
// ─────────────────────────────────────────────────────────────────────────
const GuardianTab: React.FC<{ guardians: StudentDetail['guardians'] }> = ({ guardians }) => {
  if (!guardians || guardians.length === 0) {
    return <EmptyState title="No guardian linked" description="Link a guardian from the admission or edit form." />;
  }
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {guardians.map((g, i) => (
        <Card key={i} className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">{g.guardian.firstName} {g.guardian.lastName}</h3>
            {g.isPrimary && <span className="text-[11px] font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">Primary</span>}
          </div>
          <DescriptionList
            columns={1}
            items={[
              { label: 'Relationship', value: g.relationship || g.guardian.relationship },
              { label: 'Phone', value: g.guardian.phone },
              { label: 'Email', value: g.guardian.email },
            ]}
          />
        </Card>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Transport — GET /transport/assignments?studentId=
// ─────────────────────────────────────────────────────────────────────────
const TransportTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [assignment, setAssignment] = useState<any>(undefined); // undefined = loading, null = none
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setAssignment(undefined);
    try {
      const res = await apiClient.get('/transport/assignments', { params: { studentId, pageSize: 1 } });
      setAssignment((res.data.data || [])[0] || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load transport assignment');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (assignment === undefined && !error) return <Skeleton className="h-32 w-full rounded-2xl" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!assignment) return <EmptyState title="No transport assignment" description="This student is not assigned to a route yet." />;

  return (
    <Card className="p-5 sm:p-6">
      <DescriptionList
        columns={2}
        items={[
          { label: 'Route', value: assignment.route?.name },
          { label: 'Vehicle', value: assignment.vehicle?.registrationNumber },
          { label: 'Driver', value: assignment.vehicle?.driverName },
          { label: 'Pickup point', value: assignment.pickupPoint },
        ]}
      />
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Library — GET /library/issues?studentId=
// ─────────────────────────────────────────────────────────────────────────
const LibraryTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [issues, setIssues] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/library/issues', { params: { studentId, pageSize: 100 } });
      setIssues(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load library issues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!issues || issues.length === 0) {
    return <EmptyState title="No book issues" description="Books borrowed by this student will appear here." />;
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/8">
              <th className="py-2 px-4">Book</th>
              <th className="py-2 px-4">Issue date</th>
              <th className="py-2 px-4">Due date</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Fine</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((iss) => (
              <tr key={iss.id} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                <td className="py-2 px-4">{iss.book?.title}</td>
                <td className="py-2 px-4">{formatDate(iss.issueDate)}</td>
                <td className="py-2 px-4">{formatDate(iss.dueDate)}</td>
                <td className="py-2 px-4"><StatusBadge status={iss.status} /></td>
                <td className="py-2 px-4 tabular-nums">{formatCurrency(iss.fineAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Edit modal — same field set / validation as StudentList.tsx's edit modal,
// reused here as the "Edit" profile action per spec.
// ─────────────────────────────────────────────────────────────────────────
const EditStudentModal: React.FC<{ isOpen: boolean; onClose: () => void; student: StudentDetail; onSaved: () => void }> = ({
  isOpen,
  onClose,
  student,
  onSaved,
}) => {
  const [firstName, setFirstName] = useState(student.firstName);
  const [lastName, setLastName] = useState(student.lastName);
  const [email, setEmail] = useState(student.email || '');
  const [phone, setPhone] = useState(student.phone || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFirstName(student.firstName);
      setLastName(student.lastName);
      setEmail(student.email || '');
      setPhone(student.phone || '');
      setErrors({});
    }
  }, [isOpen, student]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) nextErrors.firstName = 'First name is required';
    if (!lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.put(`/students/${student.id}`, {
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
      });
      toast.success('Profile updated');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update student');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit student" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} error={errors.firstName} />
          <Input label="Last name" required value={lastName} onChange={(e) => setLastName(e.target.value)} error={errors.lastName} />
        </div>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Alert tone="info" className="text-xs">
          For class/section/roll/status and other fields, use the full edit form from the Students list.
        </Alert>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={submitting}>Save</Button>
        </div>
      </form>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Reset password — same endpoint/behaviour as ResetPassword.tsx.
// ─────────────────────────────────────────────────────────────────────────
const generateRandomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd;
};

const ResetPasswordModal: React.FC<{ isOpen: boolean; onClose: () => void; studentId: string }> = ({ isOpen, onClose, studentId }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultPassword, setResultPassword] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setResultPassword(null);
    }
  }, [isOpen]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiClient.post(`/students/${studentId}/reset-password`, { password: password.trim() || undefined });
      setResultPassword(res.data?.data?.password || password.trim() || null);
      toast.success('Password reset successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reset password" size="sm">
      <form onSubmit={handleReset} className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-400">New password</label>
            <button
              type="button"
              onClick={() => {
                setPassword(generateRandomPassword());
                setShowPassword(true);
              }}
              className="text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
            >
              <Wand2 className="w-3.5 h-3.5" /> Generate
            </button>
          </div>
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to auto-generate"
            rightSlot={
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        </div>

        {resultPassword && (
          <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs">This password is shown only once. Share it with the student securely.</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-sm font-mono text-slate-900 dark:text-white break-all">
                {resultPassword}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(resultPassword);
                  toast.success('Copied');
                }}
                className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>{resultPassword ? 'Done' : 'Cancel'}</Button>
          {!resultPassword && <Button type="submit" isLoading={submitting}>Reset password</Button>}
        </div>
      </form>
    </Modal>
  );
};

export default StudentProfile;
