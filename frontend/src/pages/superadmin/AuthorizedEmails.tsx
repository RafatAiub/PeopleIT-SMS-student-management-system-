import React, { useEffect, useState } from 'react';
import { Plus, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatDate } from '@/i18n';
import { authorizedEmailApi, type AuthorizedEmail } from '@/api/authorizedEmail.api';

export const AuthorizedEmails: React.FC = () => {
  const [emails, setEmails] = useState<AuthorizedEmail[]>([]);
  const [loading, setLoading] = useState(true);

  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [emailError, setEmailError] = useState<string>();
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
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      setEmailError('Enter a valid email address');
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

  const columns: Column<AuthorizedEmail>[] = [
    {
      key: 'email',
      header: 'Email',
      primary: true,
      render: (entry) => (
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="font-mono font-semibold text-slate-900 dark:text-white">{entry.email}</span>
        </div>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (entry) => <span className="text-slate-500 dark:text-slate-400">{entry.note || '—'}</span>,
    },
    {
      key: 'addedBy',
      header: 'Added by',
      hideOnMobile: true,
      render: (entry) => (
        <span className="text-slate-500 dark:text-slate-400">
          {entry.addedBy ? `${entry.addedBy.firstName} ${entry.addedBy.lastName}` : '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Added on',
      hideOnMobile: true,
      render: (entry) => <span className="text-slate-500 dark:text-slate-400 text-xs">{formatDate(entry.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="Authorized emails"
        description="Only an email address added here may submit an institution registration application. Unauthorized attempts are rejected before any record is created."
      />

      <Card>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <Input
            label="Email"
            required
            type="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setEmailError(undefined); }}
            error={emailError}
            placeholder="applicant@example.com"
            containerClassName="flex-1 w-full"
          />
          <Input
            label="Note (optional)"
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="e.g. approved via sales call"
            containerClassName="flex-1 w-full"
          />
          <Button type="submit" variant="gradient" isLoading={adding} className="sm:mb-0">
            <Plus className="w-4 h-4" /> Authorize email
          </Button>
        </form>
      </Card>

      <DataTable
        data={emails}
        columns={columns}
        isLoading={loading}
        emptyTitle="No authorized emails yet"
        emptyDescription="Add one above to allow that address to register an institution."
        actions={[
          { label: 'Remove', icon: 'delete', variant: 'danger', onClick: (entry) => setDeleteTarget(entry) },
        ]}
      />

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
