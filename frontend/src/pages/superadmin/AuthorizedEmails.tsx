import React, { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { authorizedEmailApi, type AuthorizedEmail } from '../../api/authorizedEmail.api';

export const AuthorizedEmails: React.FC = () => {
  const [emails, setEmails] = useState<AuthorizedEmail[]>([]);
  const [loading, setLoading] = useState(true);

  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AuthorizedEmail | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEmails = async () => {
    try {
      setLoading(true);
      const data = await authorizedEmailApi.list();
      setEmails(data);
    } catch (err) {
      console.error('Failed to fetch authorized emails', err);
      toast.error('Failed to load authorized emails');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    setAdding(true);
    try {
      await authorizedEmailApi.add({ email: newEmail.trim(), note: newNote.trim() || undefined });
      toast.success('Email authorized successfully');
      setNewEmail('');
      setNewNote('');
      fetchEmails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to authorize email');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await authorizedEmailApi.remove(deleteTarget.id);
      toast.success('Email removed from authorized list');
      setDeleteTarget(null);
      fetchEmails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove email');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="glass-card p-6 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-primary-500 to-accent-400" />
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Authorized Emails</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Only an email address added here may submit an institution registration application. Unauthorized
              attempts are rejected with 401 Unauthorized before any record is created.
            </p>
          </div>
        </div>
      </div>

      {/* Add form */}
      <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl">
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 items-start">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email *</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="applicant@example.com"
              className="input-field"
              required
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Note (optional)</label>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. approved via sales call"
              className="input-field"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md disabled:opacity-50 min-h-[44px] mt-auto sm:mt-0 sm:self-end"
          >
            <Plus className="w-4 h-4" /> {adding ? 'Adding…' : 'Authorize Email'}
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl space-y-6">
        <div className="overflow-x-auto border border-slate-200 dark:border-white/10 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-white/5">
                <th className="p-4 pl-6">Email</th>
                <th className="p-4">Note</th>
                <th className="p-4">Added By</th>
                <th className="p-4">Added On</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
                      <span>Loading authorized emails...</span>
                    </div>
                  </td>
                </tr>
              ) : emails.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500 italic">
                    No authorized emails yet. Add one above to allow that address to register.
                  </td>
                </tr>
              ) : (
                emails.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-mono font-bold text-slate-900 dark:text-white">{entry.email}</span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-500">{entry.note || '—'}</td>
                    <td className="p-4 text-slate-500">
                      {entry.addedBy ? `${entry.addedBy.firstName} ${entry.addedBy.lastName}` : '—'}
                    </td>
                    <td className="p-4 font-mono text-slate-500 text-[11px]">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <button
                        onClick={() => setDeleteTarget(entry)}
                        className="flex items-center gap-1 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20 font-bold px-3 py-2 rounded-xl text-[11px] min-h-[36px] ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Remove authorized email?"
        message={`"${deleteTarget?.email}" will no longer be able to submit a registration application.`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default AuthorizedEmails;
