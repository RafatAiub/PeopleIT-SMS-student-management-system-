import React, { useState } from 'react';
import { CalendarRange, Plus, Edit2, Trash2, Star } from 'lucide-react';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  useSessionYears,
  useCreateSessionYear,
  useUpdateSessionYear,
  useSetDefaultSessionYear,
  useDeleteSessionYear,
} from '@/hooks/useSessionYears';
import type { SessionYear, SessionYearStatus } from '@/api/sessionYear.api';

const STATUS_LABELS: Record<SessionYearStatus, string> = {
  CURRENT: 'Running',
  UPCOMING: 'Upcoming',
  COMPLETED: 'Completed',
};

const STATUS_STYLES: Record<SessionYearStatus, string> = {
  CURRENT: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  UPCOMING: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20',
  COMPLETED: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10',
};

// DD-MM-YYYY, read in UTC so dates never shift with the viewer's timezone.
function formatDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

interface FormState {
  label: string;
  startDate: string;
  endDate: string;
  isDefault: boolean;
}

const EMPTY_FORM: FormState = { label: '', startDate: '', endDate: '', isDefault: false };

// Suggests "2026-27" style names from the chosen dates.
function suggestLabel(startDate: string, endDate: string) {
  if (!startDate || !endDate) return '';
  const start = startDate.slice(0, 4);
  const end = endDate.slice(0, 4);
  return start === end ? start : `${start}-${end.slice(2)}`;
}

export default function SessionYears() {
  const { data: years = [], isLoading } = useSessionYears();
  const createMutation = useCreateSessionYear();
  const updateMutation = useUpdateSessionYear();
  const setDefaultMutation = useSetDefaultSessionYear();
  const deleteMutation = useDeleteSessionYear();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SessionYear | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [labelTouched, setLabelTouched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SessionYear | null>(null);
  const [defaultTarget, setDefaultTarget] = useState<SessionYear | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, isDefault: years.length === 0 });
    setLabelTouched(false);
    setModalOpen(true);
  };

  const openEdit = (y: SessionYear) => {
    setEditing(y);
    setForm({ label: y.label, startDate: y.startDate.slice(0, 10), endDate: y.endDate.slice(0, 10), isDefault: y.isCurrent });
    setLabelTouched(true);
    setModalOpen(true);
  };

  const updateDates = (patch: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (!labelTouched) next.label = suggestLabel(next.startDate, next.endDate);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { label: form.label.trim(), startDate: form.startDate, endDate: form.endDate };
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data: payload });
    } else {
      await createMutation.mutateAsync({ ...payload, isDefault: form.isDefault });
    }
    setModalOpen(false);
  };

  const columns: Column<SessionYear>[] = [
    {
      key: 'no',
      header: 'No.',
      sortable: false,
      width: '60px',
      render: (y) => <span className="text-slate-500">{years.indexOf(y) + 1}</span>,
    },
    {
      key: 'label',
      header: 'Name',
      accessor: 'label',
      render: (y) => <span className="font-semibold text-slate-900 dark:text-white">{y.label}</span>,
    },
    { key: 'startDate', header: 'Start Date', accessor: 'startDate', render: (y) => formatDate(y.startDate) },
    { key: 'endDate', header: 'End Date', accessor: 'endDate', render: (y) => formatDate(y.endDate) },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (y) => (
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_STYLES[y.status]}`}>{STATUS_LABELS[y.status]}</span>
      ),
    },
    {
      key: 'isCurrent',
      header: 'Default',
      sortable: false,
      render: (y) =>
        y.isCurrent ? (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20">
            Yes
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setDefaultTarget(y)}
            title="Make this the default session year"
            className="px-2.5 py-1 rounded-full text-[11px] font-bold border bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
          >
            No
          </button>
        ),
    },
    {
      key: 'usage',
      header: 'Students / Events',
      sortable: false,
      render: (y) => (
        <span className="text-xs text-slate-600 dark:text-slate-400">
          {y.studentCount} / {y.eventCount}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      sortable: false,
      render: (y) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => openEdit(y)}
            title="Edit session year"
            aria-label={`Edit ${y.label}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          {!y.isCurrent && (
            <>
              <button
                onClick={() => setDefaultTarget(y)}
                title="Make default"
                aria-label={`Make ${y.label} the default session year`}
                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Star className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeleteTarget(y)}
                title="Delete session year"
                aria-label={`Delete ${y.label}`}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <CalendarRange className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Session Year</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Set up your school's academic sessions. The default session is used for new admissions and events.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">List Session Year</h3>
          <Button variant="primary" onClick={openCreate} className="px-4 py-2.5 text-sm self-start sm:self-auto">
            <Plus className="w-4 h-4" />
            Create Session Year
          </Button>
        </div>
        <DataTable
          data={years}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Search session years..."
          emptyTitle="No session years yet"
          emptyDescription="Create your first session year — it becomes the default automatically."
        />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} className="max-w-lg p-0">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 rounded-t-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {editing ? `Edit ${editing.label}` : 'Create Session Year'}
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="session-start" className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Start Date *</label>
              <input
                id="session-start"
                type="date"
                required
                value={form.startDate}
                onChange={(e) => updateDates({ startDate: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="session-end" className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">End Date *</label>
              <input
                id="session-end"
                type="date"
                required
                min={form.startDate || undefined}
                value={form.endDate}
                onChange={(e) => updateDates({ endDate: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div>
            <label htmlFor="session-label" className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Name *</label>
            <input
              id="session-label"
              type="text"
              required
              minLength={2}
              maxLength={50}
              value={form.label}
              onChange={(e) => {
                setLabelTouched(true);
                setForm((prev) => ({ ...prev, label: e.target.value }));
              }}
              placeholder="e.g. 2026-27"
              className="input-field"
            />
            <p className="text-[11px] text-slate-500 mt-1">Filled in from the dates — change it if you like.</p>
          </div>
          {!editing && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.isDefault}
                disabled={years.length === 0}
                onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                className="rounded-sm"
              />
              Make this the default session year
            </label>
          )}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} className="py-2 px-4 text-sm">
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving} className="py-2 px-5 text-sm">
              {editing ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!defaultTarget}
        title="Change default session year"
        message={
          defaultTarget
            ? `Make "${defaultTarget.label}" the default? New admissions and the Events page will use it from now on.`
            : ''
        }
        confirmLabel="Make Default"
        variant="info"
        isLoading={setDefaultMutation.isPending}
        onConfirm={() => defaultTarget && setDefaultMutation.mutate(defaultTarget.id, { onSuccess: () => setDefaultTarget(null) })}
        onCancel={() => setDefaultTarget(null)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete session year"
        message={deleteTarget ? `Delete "${deleteTarget.label}"? This only works if no students or events use it.` : ''}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
