import React, { useState, useEffect } from 'react';
import { Copy, ShieldAlert } from 'lucide-react';
import apiClient from '../../api/client';
import { studentApplicationApi } from '../../api/studentApplication.api';
import toast from 'react-hot-toast';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Display';
import { ErrorState } from '../../components/ui/Feedback';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Badge } from '../../components/ui/Badge';

interface GuardianInfo {
  relationship: string;
  guardian: { id: string; firstName: string; lastName: string; email: string | null; avatarUrl: string | null };
}

interface PendingStudentRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  admissionDate: string | null;
  avatarUrl?: string | null;
  user?: { avatarUrl?: string | null } | null;
  class?: { id: string; name: string } | null;
  guardians?: GuardianInfo[];
  status: string;
}

const OnlineRegistrations = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [rows, setRows] = useState<PendingStudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [approveTarget, setApproveTarget] = useState<PendingStudentRow | null>(null);
  const [approveEmail, setApproveEmail] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<{ email: string; password: string } | null>(null);

  const [rejectTarget, setRejectTarget] = useState<PendingStudentRow | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const fetchClasses = async () => {
    try {
      const res = await apiClient.get('/students/meta/classes');
      setClasses(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch classes', error);
    }
  };

  // This queue only ever shows applications with status=PENDING — approving
  // one flips it to ACTIVE (leaves the queue) and rejecting deletes it
  // entirely, so there is no second status value to filter this list by.
  const fetchPending = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await apiClient.get('/students', {
        params: { status: 'PENDING', classId: classFilter || undefined, page, pageSize },
      });
      setRows(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch (error) {
      console.error('Failed to fetch pending registrations', error);
      toast.error('Failed to load online registrations');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    fetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter, page, pageSize]);

  const handleOpenApprove = (row: PendingStudentRow) => {
    setApproveTarget(row);
    setApproveEmail(row.guardians?.[0]?.guardian.email || '');
    setApproveResult(null);
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveTarget) return;
    setApproving(true);
    try {
      const result = await studentApplicationApi.approve(approveTarget.id, approveEmail.trim());
      setApproveResult(result);
      toast.success('Application approved');
      fetchPending();
    } catch (error: any) {
      console.error('Failed to approve application', error);
      toast.error(error.response?.data?.message || 'Failed to approve application');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await apiClient.delete(`/students/${rejectTarget.id}`);
      toast.success('Application rejected');
      setRejectTarget(null);
      fetchPending();
    } catch (error: any) {
      console.error('Failed to reject application', error);
      toast.error(error.response?.data?.message || 'Failed to reject application');
    } finally {
      setRejecting(false);
    }
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success('Copied to clipboard!');
  };

  const columns: Column<PendingStudentRow>[] = [
    {
      key: 'no',
      header: 'No.',
      sortable: false,
      width: '60px',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-slate-500 dark:text-slate-400">
          {rows.findIndex((r) => r.id === row.id) + 1 + (page - 1) * pageSize}
        </span>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      primary: true,
      exportValue: (r) => `${r.firstName} ${r.lastName}`,
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.avatarUrl || row.user?.avatarUrl ? (
            <img
              src={row.avatarUrl || row.user?.avatarUrl || ''}
              alt="Avatar"
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs shrink-0">
              {row.firstName?.[0] || '?'}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-white truncate">{row.firstName} {row.lastName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">GR Number: {row.studentId}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'dateOfBirth',
      header: 'Date of Birth',
      exportValue: (r) => (r.dateOfBirth ? new Date(r.dateOfBirth).toLocaleDateString('en-GB') : ''),
      render: (row) => (row.dateOfBirth ? new Date(row.dateOfBirth).toLocaleDateString('en-GB').replace(/\//g, '-') : '—'),
    },
    {
      key: 'gender',
      header: 'Gender',
      render: (row) => (row.gender ? row.gender.charAt(0) + row.gender.slice(1).toLowerCase() : '—'),
    },
    {
      key: 'class',
      header: 'Class',
      exportValue: (r) => r.class?.name || '',
      render: (row) => row.class?.name || '—',
    },
    {
      key: 'admissionDate',
      header: 'Admission Date',
      hideOnMobile: true,
      exportValue: (r) => (r.admissionDate ? new Date(r.admissionDate).toLocaleDateString('en-GB') : ''),
      render: (row) => (row.admissionDate ? new Date(row.admissionDate).toLocaleDateString('en-GB').replace(/\//g, '-') : '—'),
    },
    {
      key: 'guardian',
      header: 'Father/Guardian',
      sortable: false,
      exportValue: (r) => {
        const g = r.guardians?.[0]?.guardian;
        return g ? `${g.firstName} ${g.lastName}` : '';
      },
      render: (row) => {
        const g = row.guardians?.[0]?.guardian;
        if (!g) return '—';
        return (
          <div className="flex items-center gap-2">
            {g.avatarUrl ? (
              <img src={g.avatarUrl} alt="Guardian" className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-white/10" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                {g.firstName?.[0] || '?'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-slate-900 dark:text-white truncate">{g.firstName} {g.lastName}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{g.email || '—'}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Application Status',
      sortable: false,
      exportValue: () => 'Pending',
      render: () => <Badge variant="warning">Pending</Badge>,
    },
  ];

  const actions: RowAction<PendingStudentRow>[] = [
    { label: 'Approve', icon: 'edit', onClick: handleOpenApprove },
    { label: 'Reject', icon: 'delete', onClick: (row) => setRejectTarget(row), variant: 'danger' },
  ];

  const toolbar = (
    <Select
      aria-label="Filter by class"
      value={classFilter}
      onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
      className="w-auto min-w-40"
      placeholder="All Classes"
      options={classes.map((c) => ({ value: c.id, label: c.name }))}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online Registrations"
        description="Review student applications submitted through the public Online Registration form."
      />

      {loadError ? (
        <ErrorState message="Failed to load online registrations." onRetry={fetchPending} />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          actions={actions}
          isLoading={loading}
          serverPagination
          totalCount={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          toolbar={toolbar}
          exportFileName="online-registrations"
          emptyTitle="No pending registrations"
          emptyDescription="Applications submitted through the public Online Registration form will show up here."
        />
      )}

      {/* Approve Modal */}
      <Modal
        isOpen={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approve Application"
        description={approveTarget ? `${approveTarget.firstName} ${approveTarget.lastName} · ${approveTarget.studentId}` : undefined}
        size="sm"
      >
        {!approveResult ? (
          <form onSubmit={handleApprove} className="space-y-5">
            <Input
              label="Student Login Email"
              type="email"
              required
              value={approveEmail}
              onChange={(e) => setApproveEmail(e.target.value)}
              placeholder="student@school.edu"
              helperText="A login is created for the student on approval — a password is generated automatically and shown once."
              data-autofocus
            />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setApproveTarget(null)}>Cancel</Button>
              <Button type="submit" variant="primary" isLoading={approving}>
                {approving ? 'Approving…' : 'Approve'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">This password is shown only once. Share it with the family securely.</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
                <code className="block px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-sm font-mono text-slate-900 dark:text-white break-all">
                  {approveResult.email}
                </code>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Password</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-sm font-mono text-slate-900 dark:text-white break-all">
                    {approveResult.password}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(approveResult.password)}
                    title="Copy password"
                    className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" variant="primary" onClick={() => setApproveTarget(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!rejectTarget}
        title="Reject this application?"
        message={`This permanently removes ${rejectTarget?.firstName} ${rejectTarget?.lastName}'s application. This cannot be undone.`}
        confirmLabel="Reject"
        variant="danger"
        isLoading={rejecting}
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  );
};

export default OnlineRegistrations;
