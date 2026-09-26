import React, { useMemo, useState } from 'react';
import { CalendarHeart, Edit2, Trash2, RefreshCw, RotateCcw, PartyPopper, Info, CloudDownload } from 'lucide-react';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useAuthStore } from '@/store/authStore';
import {
  useHolidays,
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
  useUpdateWeeklyOffDays,
  useRestoreHolidayDefaults,
  useSyncGovernmentHolidays,
} from '@/hooks/useHolidays';
import type { Holiday, HolidayType } from '@/api/holiday.api';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_LABELS: Record<HolidayType, string> = {
  GOVERNMENT: 'Govt. Holiday',
  SCHOOL: 'School Holiday',
  WEEKLY: 'Weekend',
};

const TYPE_STYLES: Record<HolidayType, string> = {
  GOVERNMENT: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  SCHOOL: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20',
  WEEKLY: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10',
};

type TypeFilter = 'ALL' | 'HOLIDAYS' | HolidayType;

const FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'HOLIDAYS', label: 'Holidays' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'SCHOOL', label: 'School' },
  { value: 'WEEKLY', label: 'Weekends' },
  { value: 'ALL', label: 'All' },
];

// Dates come back as midnight UTC; always read/format them in UTC so a
// holiday never shifts by a day in the viewer's timezone.
const isoDay = (date: string) => date.slice(0, 10);

function formatHolidayDate(date: string) {
  return new Date(`${isoDay(date)}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function todayIso() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
}

function daysUntil(date: string) {
  const ms = new Date(`${isoDay(date)}T00:00:00Z`).getTime() - new Date(`${todayIso()}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

interface FormState {
  date: string;
  endDate: string;
  title: string;
  description: string;
  type: HolidayType;
}

const EMPTY_FORM: FormState = { date: '', endDate: '', title: '', description: '', type: 'SCHOOL' };

export default function ManageHoliday() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  const [year, setYear] = useState(currentYear);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('HOLIDAYS');

  const { data, isLoading, refetch, isFetching } = useHolidays(year);
  const holidays = useMemo(() => data?.holidays ?? [], [data]);

  const createMutation = useCreateHoliday();
  const updateMutation = useUpdateHoliday();
  const deleteMutation = useDeleteHoliday();
  const weeklyMutation = useUpdateWeeklyOffDays();
  const restoreMutation = useRestoreHolidayDefaults();
  const syncMutation = useSyncGovernmentHolidays();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [pendingOffDays, setPendingOffDays] = useState<number[] | null>(null);

  const offDays = pendingOffDays ?? data?.weeklyOffDays ?? [];
  const offDaysChanged =
    pendingOffDays !== null && [...pendingOffDays].sort().join() !== [...(data?.weeklyOffDays ?? [])].sort().join();

  const counts = useMemo(
    () => ({
      GOVERNMENT: holidays.filter((h) => h.type === 'GOVERNMENT').length,
      SCHOOL: holidays.filter((h) => h.type === 'SCHOOL').length,
      WEEKLY: holidays.filter((h) => h.type === 'WEEKLY').length,
    }),
    [holidays],
  );

  const visible = useMemo(() => {
    if (typeFilter === 'ALL') return holidays;
    if (typeFilter === 'HOLIDAYS') return holidays.filter((h) => h.type !== 'WEEKLY');
    return holidays.filter((h) => h.type === typeFilter);
  }, [holidays, typeFilter]);

  // The next special (non-weekend) day off, for the countdown banner.
  const nextHoliday = useMemo(() => {
    const today = todayIso();
    return holidays.find((h) => h.type !== 'WEEKLY' && isoDay(h.date) >= today) ?? null;
  }, [holidays]);

  const changeYear = (value: number) => {
    setYear(value);
    setPendingOffDays(null);
    setForm((prev) => ({ ...prev, date: '', endDate: '' }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.title.trim()) return;
    await createMutation.mutateAsync({
      date: form.date,
      endDate: form.endDate && form.endDate !== form.date ? form.endDate : undefined,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      type: 'SCHOOL',
    });
    setForm(EMPTY_FORM);
  };

  const openEdit = (h: Holiday) => {
    setEditing(h);
    setEditForm({ date: isoDay(h.date), endDate: '', title: h.title, description: h.description ?? '', type: h.type });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await updateMutation.mutateAsync({
      id: editing.id,
      data: {
        date: editForm.date,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        type: editForm.type,
      },
    });
    setEditing(null);
  };

  const toggleOffDay = (day: number) => {
    setPendingOffDays(offDays.includes(day) ? offDays.filter((d) => d !== day) : [...offDays, day]);
  };

  const saveOffDays = () => {
    if (pendingOffDays === null) return;
    weeklyMutation.mutate({ year, weeklyOffDays: pendingOffDays }, { onSuccess: () => setPendingOffDays(null) });
  };

  const columns: Column<Holiday>[] = [
    {
      key: 'no',
      header: 'No.',
      sortable: false,
      width: '60px',
      render: (h) => <span className="text-slate-500">{visible.indexOf(h) + 1}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      accessor: 'date',
      render: (h) => {
        const past = isoDay(h.date) < todayIso();
        return (
          <span className={`whitespace-nowrap font-medium ${past ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
            {formatHolidayDate(h.date)}
          </span>
        );
      },
    },
    {
      key: 'title',
      header: 'Title',
      accessor: 'title',
      render: (h) => (
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-slate-900 dark:text-white">{h.title}</span>
          <div className="flex flex-wrap gap-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${TYPE_STYLES[h.type]}`}>{TYPE_LABELS[h.type]}</span>
            {h.isTentative && (
              <span
                title="This holiday depends on the moon sighting — the date may change by a day."
                className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
              >
                Date may change
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      accessor: 'description',
      sortable: false,
      render: (h) => <span className="text-xs text-slate-600 dark:text-slate-400">{h.description || '—'}</span>,
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Action',
            sortable: false,
            render: (h: Holiday) => (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(h)}
                  title="Edit holiday"
                  aria-label={`Edit ${h.title}`}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(h)}
                  title="Delete holiday"
                  aria-label={`Delete ${h.title}`}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ),
          } as Column<Holiday>,
        ]
      : []),
  ];

  const yearMin = `${year}-01-01`;
  const yearMax = `${year}-12-31`;
  const nextIn = nextHoliday ? daysUntil(nextHoliday.date) : null;

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <CalendarHeart className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isAdmin ? 'Manage Holiday' : 'Holiday Calendar'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            {isAdmin
              ? 'Weekends and Bangladesh government holidays are added automatically for each session year — edit or delete any of them, and add your own school holidays.'
              : 'All the days the school is closed this session year.'}
          </p>
        </div>
      </div>

      {nextHoliday && nextIn !== null && (
        <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border border-amber-200/60 dark:border-amber-500/20 bg-gradient-to-r from-amber-50 to-rose-50 dark:from-amber-500/5 dark:to-rose-500/5">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <PartyPopper className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Next holiday</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{nextHoliday.title}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {formatHolidayDate(nextHoliday.date)} ·{' '}
              <span className="font-semibold">{nextIn === 0 ? 'Today!' : nextIn === 1 ? 'Tomorrow!' : `in ${nextIn} days`}</span>
            </p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Holiday</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="holiday-year" className="text-sm font-medium text-slate-700 dark:text-slate-400">
                  Session Year<span className="text-red-500 ml-1">*</span>
                </label>
                <select id="holiday-year" value={year} onChange={(e) => changeYear(Number(e.target.value))} className="input-field">
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="holiday-date" className="text-sm font-medium text-slate-700 dark:text-slate-400">
                  Date<span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  id="holiday-date"
                  type="date"
                  required
                  min={yearMin}
                  max={yearMax}
                  value={form.date}
                  onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value, endDate: prev.endDate && prev.endDate < e.target.value ? '' : prev.endDate }))}
                  className="input-field"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="holiday-end-date" className="text-sm font-medium text-slate-700 dark:text-slate-400">
                  To Date <span className="text-xs text-slate-400">(for vacations)</span>
                </label>
                <input
                  id="holiday-end-date"
                  type="date"
                  min={form.date || yearMin}
                  max={yearMax}
                  disabled={!form.date}
                  value={form.endDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="input-field disabled:opacity-60"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="holiday-title" className="text-sm font-medium text-slate-700 dark:text-slate-400">
                  Title<span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  id="holiday-title"
                  type="text"
                  required
                  minLength={2}
                  maxLength={150}
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Winter Vacation, Annual Sports Day"
                  className="input-field"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="holiday-description" className="text-sm font-medium text-slate-700 dark:text-slate-400">Description</label>
              <textarea
                id="holiday-description"
                rows={2}
                maxLength={1000}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="A short note students and guardians will see"
                className="input-field resize-none"
              />
            </div>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending} className="px-6">
              Submit
            </Button>
          </form>
        </div>
      )}

      {isAdmin && data && (
        <div className="glass-card p-6 rounded-2xl space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Weekly Holidays ({year})</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Pick the days the school is closed every week. Every matching day of {year} is added to the list.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 self-start md:self-auto">
              <Button
                type="button"
                variant="secondary"
                isLoading={syncMutation.isPending}
                onClick={() => syncMutation.mutate(year)}
                className="px-4 py-2 text-sm"
              >
                <CloudDownload className="w-4 h-4" />
                Sync Govt Holidays
              </Button>
              <Button type="button" variant="secondary" onClick={() => setRestoreOpen(true)} className="px-4 py-2 text-sm">
                <RotateCcw className="w-4 h-4" />
                Restore Defaults
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {WEEKDAYS.map((label, day) => {
              const active = offDays.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleOffDay(day)}
                  aria-pressed={active}
                  className={`w-14 py-2 rounded-xl text-sm font-bold border transition-colors ${
                    active
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-primary-400'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            {offDaysChanged && (
              <>
                <Button type="button" variant="primary" isLoading={weeklyMutation.isPending} onClick={saveOffDays} className="px-4 py-2 text-sm">
                  Save
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPendingOffDays(null)} className="px-3 py-2 text-sm">
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="glass-card p-6 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">List Holiday</h3>
          <div className="flex items-center gap-2">
            <label htmlFor="holiday-list-year" className="sr-only">Session Year</label>
            <select
              id="holiday-list-year"
              value={year}
              onChange={(e) => changeYear(Number(e.target.value))}
              className="input-field py-2 text-sm w-28"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => refetch()}
              title="Refresh"
              aria-label="Refresh list"
              className="p-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex-shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter holidays">
          {FILTERS.map((f) => {
            const count =
              f.value === 'ALL'
                ? holidays.length
                : f.value === 'HOLIDAYS'
                  ? counts.GOVERNMENT + counts.SCHOOL
                  : counts[f.value];
            const active = typeFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-primary-400'
                }`}
              >
                {f.label} <span className={active ? 'opacity-80' : 'text-slate-400'}>({count})</span>
              </button>
            );
          })}
        </div>

        {data?.governmentSource === 'FALLBACK' && (
          <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-px" />
            The government holiday list for {year} isn't published yet, so only fixed-date national days are shown.
            Eid, Puja and the other holidays will be added automatically as soon as it's published.
          </p>
        )}
        {data?.governmentSource === 'FEED' && data.governmentSyncedAt && (
          <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Government holidays follow the official Bangladesh holiday calendar — last checked{' '}
            {new Date(data.governmentSyncedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.
          </p>
        )}

        <DataTable
          data={visible}
          columns={columns}
          isLoading={isLoading}
          pageSize={25}
          searchPlaceholder="Search holidays..."
          emptyTitle="No holidays found"
          emptyDescription={isAdmin ? 'Add a holiday above, or restore the default holidays.' : 'No holidays have been published for this year yet.'}
        />
      </div>

      {/* Edit modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} className="max-w-lg p-0">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 rounded-t-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Holiday</h3>
        </div>
        <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-holiday-date" className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Date *</label>
              <input
                id="edit-holiday-date"
                type="date"
                required
                value={editForm.date}
                onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="edit-holiday-type" className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Type</label>
              <select
                id="edit-holiday-type"
                value={editForm.type}
                onChange={(e) => setEditForm((prev) => ({ ...prev, type: e.target.value as HolidayType }))}
                className="input-field"
              >
                <option value="SCHOOL">{TYPE_LABELS.SCHOOL}</option>
                <option value="GOVERNMENT">{TYPE_LABELS.GOVERNMENT}</option>
                <option value="WEEKLY">{TYPE_LABELS.WEEKLY}</option>
              </select>
            </div>
          </div>
          {editing?.isTentative && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              This date is an estimate based on the moon sighting. Changing it to the announced date marks it as confirmed.
            </p>
          )}
          <div>
            <label htmlFor="edit-holiday-title" className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Title *</label>
            <input
              id="edit-holiday-title"
              type="text"
              required
              minLength={2}
              maxLength={150}
              value={editForm.title}
              onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="edit-holiday-description" className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Description</label>
            <textarea
              id="edit-holiday-description"
              rows={3}
              maxLength={1000}
              value={editForm.description}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
              className="input-field resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} className="py-2 px-4 text-sm">
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={updateMutation.isPending} className="py-2 px-5 text-sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete holiday"
        message={deleteTarget ? `Remove "${deleteTarget.title}" on ${formatHolidayDate(deleteTarget.date)} from the holiday list?` : ''}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        isOpen={restoreOpen}
        title="Restore default holidays"
        message={`Add back the weekends and government holidays for ${year} that were deleted, and re-check the government list? Holidays you edited or added yourself stay as they are.`}
        confirmLabel="Restore"
        variant="info"
        isLoading={restoreMutation.isPending}
        onConfirm={() => restoreMutation.mutate(year, { onSuccess: () => setRestoreOpen(false) })}
        onCancel={() => setRestoreOpen(false)}
      />
    </div>
  );
}
