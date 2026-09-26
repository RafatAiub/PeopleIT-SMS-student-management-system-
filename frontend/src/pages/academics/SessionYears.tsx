import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Star } from 'lucide-react';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/Display';
import { ErrorState } from '@/components/ui/Feedback';
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

const STATUS_BADGE_VARIANT: Record<SessionYearStatus, 'success' | 'info' | 'neutral'> = {
  CURRENT: 'success',
  UPCOMING: 'info',
  COMPLETED: 'neutral',
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
  const { data: years = [], isLoading, isError, refetch } = useSessionYears();
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
      render: (y) => <Badge variant={STATUS_BADGE_VARIANT[y.status]}>{STATUS_LABELS[y.status]}</Badge>,
    },
    {
      key: 'isCurrent',
      header: 'Default',
      sortable: false,
      render: (y) =>
        y.isCurrent ? (
          <Badge variant="success" dot>Default</Badge>
        ) : (
          <button
            type="button"
            onClick={() => setDefaultTarget(y)}
            title="Make this the default session year"
          >
            <Badge variant="danger" className="hover:opacity-80 transition-opacity cursor-pointer">Not default</Badge>
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
      <PageHeader
        title="Manage Session Year"
        description="Set up your school's academic sessions. The default session is used for new admissions and events."
        actions={
          <Button variant="gradient" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Create Session Year
          </Button>
        }
      />

      <div className="glass-card p-4 sm:p-6 rounded-2xl">
        {isError ? (
          <ErrorState title="Failed to load session years" onRetry={() => refetch()} />
        ) : (
          <DataTable
            data={years}
            columns={columns}
            isLoading={isLoading}
            searchPlaceholder="Search session years..."
            emptyTitle="No session years yet"
            emptyDescription="Create your first session year — it becomes the default automatically."
            emptyAction={
              <Button variant="primary" size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4" />
                Create Session Year
              </Button>
            }
          />
        )}
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
