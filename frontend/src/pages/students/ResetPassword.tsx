import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Wand2, Copy, ShieldAlert } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Display';
import { ErrorState } from '../../components/ui/Feedback';

interface StudentRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  user?: { avatarUrl?: string | null } | null;
}

// Same charset/length as the previous Math.random()-based generator (and
// AdminDashboard.tsx's edit-admin-modal "Generate Password" action), but
// drawn from crypto.getRandomValues instead of Math.random — Math.random is
// not a cryptographically secure source and shouldn't seed login passwords.
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
const PASSWORD_LENGTH = 10;

const generateRandomPassword = (): string => {
  const randomValues = new Uint32Array(PASSWORD_LENGTH);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (v) => PASSWORD_CHARS[v % PASSWORD_CHARS.length]).join('');
};

const ResetPassword = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultPassword, setResultPassword] = useState<string | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await apiClient.get('/students', {
        params: {
          page: params.page,
          pageSize: params.pageSize,
          search: debouncedSearch || undefined,
        },
      });
      setStudents(res.data.data || []);
      setTotalStudents(res.data.meta?.total || 0);
    } catch (err) {
      console.error('Failed to fetch students', err);
      toast.error('Failed to load students');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, params.pageSize, debouncedSearch]);

  const handleOpenResetModal = (student: StudentRow) => {
    setSelectedStudent(student);
    setPassword('');
    setShowPassword(false);
    setResultPassword(null);
  };

  const handleGeneratePassword = () => {
    setPassword(generateRandomPassword());
    setShowPassword(true);
    toast.success('Generated new password!');
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success('Copied to clipboard!');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setSubmitting(true);
    setResultPassword(null);
    try {
      const res = await apiClient.post(`/students/${selectedStudent.id}/reset-password`, {
        password: password.trim() || undefined,
      });
      const newPassword = res.data?.data?.password;
      setResultPassword(newPassword || password.trim() || null);
      toast.success('Password reset successfully');
    } catch (err: any) {
      console.error('Failed to reset password', err);
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<StudentRow>[] = [
    {
      key: 'no',
      header: 'No.',
      sortable: false,
      width: '60px',
      hideOnMobile: true,
      render: (student) => (
        <span className="text-slate-500 dark:text-slate-400">
          {students.findIndex((s) => s.id === student.id) + 1 + (params.page - 1) * params.pageSize}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      accessor: 'firstName',
      primary: true,
      exportValue: (s) => `${s.firstName} ${s.lastName}`,
      render: (student) => (
        <div className="flex items-center gap-3">
          {student.avatarUrl || student.user?.avatarUrl ? (
            <img
              src={student.avatarUrl || student.user?.avatarUrl || ''}
              alt="Avatar"
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs shrink-0">
              {student.firstName?.[0] || '?'}
            </div>
          )}
          <span className="font-medium text-slate-900 dark:text-white">{student.firstName} {student.lastName}</span>
        </div>
      ),
    },
    {
      key: 'studentId',
      header: 'GR Number',
      accessor: 'studentId',
    },
  ];

  const actions: RowAction<StudentRow>[] = [
    { label: 'Reset Password', icon: 'edit', onClick: handleOpenResetModal },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students Reset Password"
        description="Pick a student to generate or set a new login password."
      />

      {loadError ? (
        <ErrorState message="Failed to load students." onRetry={fetchStudents} />
      ) : (
        <DataTable
          data={students}
          columns={columns}
          actions={actions}
          isLoading={loading}
          searchPlaceholder="Search by name or GR number..."
          serverSearch
          onSearch={setSearch}
          serverPagination
          totalCount={totalStudents}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          emptyTitle="No students found"
          emptyDescription="Try adjusting your search."
        />
      )}

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        title="Reset Password"
        description={selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName} · ${selectedStudent.studentId}` : undefined}
        size="sm"
      >
        <form onSubmit={handleReset} className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="field-label mb-0">New Password</label>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                <Wand2 className="w-3.5 h-3.5" /> Generate Password
              </button>
            </div>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to auto-generate a password"
              helperText="Leave blank and the server will generate a secure password automatically."
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>

          {resultPassword && (
            <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-2">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">
                  This password is shown only once. Make sure to share it with the student securely.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-sm font-mono text-slate-900 dark:text-white break-all">
                  {resultPassword}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(resultPassword)}
                  title="Copy password"
                  className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setSelectedStudent(null)}>
              {resultPassword ? 'Done' : 'Cancel'}
            </Button>
            {!resultPassword && (
              <Button type="submit" variant="primary" isLoading={submitting}>
                {submitting ? 'Resetting…' : 'Reset Password'}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ResetPassword;
