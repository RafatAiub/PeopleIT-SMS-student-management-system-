import React, { useState, useEffect } from 'react';
import { BellRing } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/common/ConfirmModal';

interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  target: string;
  recipientCount: number;
  createdAt: string;
}

const TARGETS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Users' },
  { value: 'STUDENT', label: 'Students' },
  { value: 'GUARDIAN', label: 'Parents / Guardians' },
  { value: 'TEACHER', label: 'Teachers' },
  { value: 'STAFF', label: 'Staff' },
];
const targetLabel = (v: string) => TARGETS.find((t) => t.value === v)?.label ?? v;

const CustomNotifications = () => {
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { params, setPage, setPageSize } = useTableParams();

  const [form, setForm] = useState({ title: '', body: '', target: 'ALL' });
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BroadcastRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/notifications/custom', { params: { page: params.page, pageSize: params.pageSize } });
      setRows(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, params.pageSize]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and message are required');
      return;
    }
    setSending(true);
    try {
      const res = await apiClient.post('/notifications/custom', {
        title: form.title.trim(),
        body: form.body.trim(),
        target: form.target,
      });
      toast.success(res.data?.message || 'Notification sent');
      setForm({ title: '', body: '', target: 'ALL' });
      setPage(1);
      fetchRows();
    } catch (error: any) {
      console.error('Failed to send notification', error);
      toast.error(error.response?.data?.message || 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/notifications/custom/${deleteTarget.id}`);
      toast.success('Notification deleted');
      setDeleteTarget(null);
      fetchRows();
    } catch (error: any) {
      console.error('Failed to delete notification', error);
      toast.error(error.response?.data?.message || 'Failed to delete notification');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<BroadcastRow>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{rows.findIndex((r) => r.id === row.id) + 1 + (params.page - 1) * params.pageSize}</span>,
    },
    { key: 'title', header: 'Title', accessor: 'title' },
    { key: 'body', header: 'Message', render: (row) => <span className="line-clamp-2 max-w-md block">{row.body}</span> },
    { key: 'target', header: 'Sent To', render: (row) => targetLabel(row.target) },
    { key: 'recipients', header: 'Recipients', render: (row) => row.recipientCount },
    { key: 'date', header: 'Date', render: (row) => new Date(row.createdAt).toLocaleString('en-GB') },
  ];

  const actions: RowAction<BroadcastRow>[] = [
    { label: 'Delete', icon: 'delete', onClick: (row) => setDeleteTarget(row), variant: 'danger' },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <BellRing className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Custom Notifications</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Send an in-app notification to a group of users.</p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Send Notification</h3>
        <form onSubmit={handleSend} className="space-y-4 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Send To <span className="text-rose-500">*</span></label>
              <select value={form.target} onChange={(e) => setForm((p) => ({ ...p, target: e.target.value }))} className="input-field">
                {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title <span className="text-rose-500">*</span></label>
              <input type="text" maxLength={200} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Message <span className="text-rose-500">*</span></label>
            <textarea rows={4} maxLength={5000} value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} placeholder="Message" className="input-field resize-none" />
          </div>
          <Button type="submit" variant="gradient" isLoading={sending}>{sending ? 'Sending…' : 'Submit'}</Button>
        </form>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white px-2 pt-1 pb-3">List Notifications</h3>
        <DataTable
          data={rows}
          columns={columns}
          actions={actions}
          isLoading={loading}
          serverPagination
          totalCount={total}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          emptyTitle="No notifications sent yet"
          emptyDescription="Notifications you send will be listed here."
        />
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete this notification?"
        message="It will also be removed from every recipient's notification inbox."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default CustomNotifications;
