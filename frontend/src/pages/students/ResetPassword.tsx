import React, { useState, useEffect } from 'react';
import { KeyRound, Search, Eye, EyeOff, Wand2, Copy, ShieldAlert } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

interface StudentOption {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultPassword, setResultPassword] = useState<string | null>(null);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setStudentOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setStudentsLoading(true);
      try {
        const res = await apiClient.get('/students', { params: { search: query, pageSize: 20 } });
        setStudentOptions(res.data.data || []);
      } catch (err) {
        console.error('Failed to search students', err);
      } finally {
        setStudentsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
    if (!selectedStudentId) {
      toast.error('Select a student first');
      return;
    }
    setSubmitting(true);
    setResultPassword(null);
    try {
      const res = await apiClient.post(`/students/${selectedStudentId}/reset-password`, {
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

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Students Reset Password</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Reset a student's login password — generate a new one or set a custom password.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl max-w-xl space-y-5">
        <form onSubmit={handleReset} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Search Student</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or student ID..."
                className="input-field pl-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Student</label>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                setSelectedStudentId(e.target.value);
                setResultPassword(null);
              }}
              className="input-field cursor-pointer"
              disabled={studentsLoading || studentOptions.length === 0}
            >
              <option value="">
                {studentsLoading ? 'Searching…' : studentOptions.length === 0 ? 'Type at least 2 characters to search' : '-- Select Student --'}
              </option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentId})</option>
              ))}
            </select>
          </div>

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

          <div className="flex justify-end">
            <Button type="submit" variant="gradient" isLoading={submitting} disabled={!selectedStudentId || submitting}>
              {submitting ? 'Resetting…' : 'Reset Password'}
            </Button>
          </div>
        </form>

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
      </div>
    </div>
  );
};

export default ResetPassword;
