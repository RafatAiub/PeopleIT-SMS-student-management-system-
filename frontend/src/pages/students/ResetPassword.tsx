import React, { useState, useEffect } from 'react';
import { KeyRound, Eye, EyeOff, Wand2, Copy, ShieldAlert } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface StudentRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  user?: { avatarUrl?: string | null } | null;
}

// Same random-password generation as AdminDashboard.tsx's edit-admin-modal
// "Generate Password" action, reused here for consistency.
const generateRandomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
};

const ResetPassword = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);

  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultPassword, setResultPassword] = useState<string | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
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
      render: (student) => (
        <div className="flex items-center gap-3">
          {student.avatarUrl || student.user?.avatarUrl ? (
            <img
              src={student.avatarUrl || student.user?.avatarUrl || ''}
              alt="Avatar"
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
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
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Students Reset Password</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Pick a student to generate or set a new login password.</p>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-xs">
        <div className="p-4">
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
        </div>
      </div>

      {/* Reset Password Modal */}
      <Modal isOpen={!!selectedStudent} onClose={() => setSelectedStudent(null)} className="max-w-md space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-white/5">
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">Reset Password</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {selectedStudent?.firstName} {selectedStudent?.lastName} · {selectedStudent?.studentId}
            </p>
          </div>
        </div>

        <form onSubmit={handleReset} className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-400">New Password</label>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                <Wand2 className="w-3.5 h-3.5" /> Generate Password
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to auto-generate a password"
                className="input-field pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Leave blank and the server will generate a secure password automatically.
            </p>
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
                  className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex-shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setSelectedStudent(null)}>
              {resultPassword ? 'Done' : 'Cancel'}
            </Button>
            {!resultPassword && (
              <Button type="submit" variant="gradient" isLoading={submitting}>
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
