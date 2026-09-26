import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PartyPopper, Edit2, Trash2, ImagePlus, X, MapPin, Clock, CalendarDays, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useAuthStore } from '@/store/authStore';
import { useSessionYears } from '@/hooks/useSessionYears';
import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent } from '@/hooks/useEvents';
import { compressImage } from '@/utils/imageCompressor';
import type { SchoolEvent, EventAudience, EventCategory, EventType, EventWhen } from '@/api/event.api';

const CATEGORIES: { value: EventCategory; label: string; style: string }[] = [
  { value: 'ACADEMIC', label: 'Academic', style: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20' },
  { value: 'SPORTS', label: 'Sports', style: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' },
  { value: 'CULTURAL', label: 'Cultural', style: 'bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-500/20' },
  { value: 'CELEBRATION', label: 'Celebration', style: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' },
  { value: 'COMPETITION', label: 'Competition', style: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20' },
  { value: 'EXAM', label: 'Exam', style: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' },
  { value: 'MEETING', label: 'Parent / Staff Meeting', style: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20' },
  { value: 'TRIP', label: 'Trip / Excursion', style: 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-500/20' },
  { value: 'OTHER', label: 'Other', style: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10' },
];
const CATEGORY_BY_VALUE = Object.fromEntries(CATEGORIES.map((c) => [c.value, c])) as Record<EventCategory, (typeof CATEGORIES)[number]>;

const AUDIENCES: { value: EventAudience; label: string }[] = [
  { value: 'STUDENTS', label: 'Students' },
  { value: 'GUARDIANS', label: 'Guardians' },
  { value: 'TEACHERS', label: 'Teachers' },
  { value: 'STAFF', label: 'Other Staff' },
];

const WHEN_TABS: { value: EventWhen; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
];

const isoDay = (date: string) => date.slice(0, 10);

function todayIso() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
}

function formatDate(date: string) {
  return new Date(`${isoDay(date)}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatEventDates(e: SchoolEvent) {
  return isoDay(e.startDate) === isoDay(e.endDate) ? formatDate(e.startDate) : `${formatDate(e.startDate)} – ${formatDate(e.endDate)}`;
}

// "13:30" -> "1:30 PM"
function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function formatTiming(e: Pick<SchoolEvent, 'startTime' | 'endTime'>) {
  if (!e.startTime) return 'All day';
  return e.endTime ? `${formatTime(e.startTime)} – ${formatTime(e.endTime)}` : `From ${formatTime(e.startTime)}`;
}

function daysUntil(date: string) {
  const ms = new Date(`${isoDay(date)}T00:00:00Z`).getTime() - new Date(`${todayIso()}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

interface FormState {
  title: string;
  description: string;
  academicYearId: string;
  category: EventCategory;
  type: EventType;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  audience: EventAudience[];
  imageUrl: string | null;
  notify: boolean;
}

const emptyForm = (academicYearId = ''): FormState => ({
  title: '',
  description: '',
  academicYearId,
  category: 'OTHER',
  type: 'SINGLE',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  venue: '',
  audience: ['STUDENTS', 'GUARDIANS', 'TEACHERS'],
  imageUrl: null,
  notify: true,
});

export default function Events() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const { data: sessionYears = [] } = useSessionYears();
  const defaultSession = sessionYears.find((y) => y.isCurrent) ?? sessionYears[0];

  const [listSessionId, setListSessionId] = useState('');
  const [when, setWhen] = useState<EventWhen>('upcoming');
  const [category, setCategory] = useState<EventCategory | ''>('');
  const { data, isLoading } = useEvents({
    academicYearId: listSessionId || undefined,
    when,
    category: category || undefined,
  });
  const events = useMemo(() => data?.events ?? [], [data]);

  const createMutation = useCreateEvent();
  const updateMutation = useUpdateEvent();
  const deleteMutation = useDeleteEvent();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchoolEvent | null>(null);
  const [preview, setPreview] = useState<SchoolEvent | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Preselect the default session year once session years load.
  useEffect(() => {
    if (defaultSession && !form.academicYearId) {
      setForm((prev) => ({ ...prev, academicYearId: defaultSession.id }));
    }
  }, [defaultSession, form.academicYearId]);

  const formSession = sessionYears.find((y) => y.id === form.academicYearId);
  const minDate = formSession ? isoDay(formSession.startDate) : undefined;
  const maxDate = formSession ? isoDay(formSession.endDate) : undefined;

  const nextEvent = useMemo(() => {
    const today = todayIso();
    return events.find((e) => isoDay(e.endDate) >= today) ?? null;
  }, [events]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleAudience = (value: EventAudience) =>
    setForm((prev) => ({
      ...prev,
      audience: prev.audience.includes(value) ? prev.audience.filter((a) => a !== value) : [...prev.audience, value],
    }));

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a picture (JPG, PNG or WebP).');
      return;
    }
    try {
      const { dataUrl } = await compressImage(file, { maxWidth: 1000, maxHeight: 700, quality: 0.78, format: 'image/jpeg' });
      set('imageUrl', dataUrl);
    } catch (err: any) {
      toast.error(err.message || 'Could not read that picture.');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm(defaultSession?.id ?? ''));
  };

  const startEdit = (ev: SchoolEvent) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      description: ev.description ?? '',
      academicYearId: ev.academicYearId,
      category: ev.category,
      type: ev.type,
      startDate: isoDay(ev.startDate),
      endDate: ev.type === 'MULTIPLE' ? isoDay(ev.endDate) : '',
      startTime: ev.startTime ?? '',
      endTime: ev.endTime ?? '',
      venue: ev.venue ?? '',
      audience: ev.audience,
      imageUrl: ev.imageUrl,
      notify: false,
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.audience.length === 0) {
      toast.error('Choose at least one audience.');
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      academicYearId: form.academicYearId,
      category: form.category,
      type: form.type,
      startDate: form.startDate,
      endDate: form.type === 'MULTIPLE' ? form.endDate : undefined,
      startTime: form.startTime || null,
      endTime: form.startTime && form.endTime ? form.endTime : null,
      venue: form.venue.trim() || null,
      audience: form.audience,
      imageUrl: form.imageUrl,
    };
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, data: payload });
    } else {
      await createMutation.mutateAsync({ ...payload, notify: form.notify });
    }
    resetForm();
  };

  const columns: Column<SchoolEvent>[] = [
    {
      key: 'no',
      header: 'No.',
      sortable: false,
      width: '60px',
      render: (ev) => <span className="text-slate-500">{events.indexOf(ev) + 1}</span>,
    },
    {
      key: 'title',
      header: 'Title',
      accessor: 'title',
      render: (ev) => (
        <div className="flex flex-col gap-1 min-w-[160px]">
          <span className="font-semibold text-slate-900 dark:text-white">{ev.title}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORY_BY_VALUE[ev.category].style}`}>
              {CATEGORY_BY_VALUE[ev.category].label}
            </span>
            {ev.venue && (
              <span className="flex items-center gap-0.5 text-[11px] text-slate-500">
                <MapPin className="w-3 h-3" />
                {ev.venue}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: false,
      render: (ev) => <span className="text-xs">{ev.type === 'SINGLE' ? 'Single day' : 'Multiple days'}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      accessor: 'startDate',
      render: (ev) => (
        <span className={`text-xs whitespace-nowrap font-medium ${isoDay(ev.endDate) < todayIso() ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>
          {formatEventDates(ev)}
        </span>
      ),
    },
    {
      key: 'timing',
      header: 'Timing',
      sortable: false,
      render: (ev) => <span className="text-xs whitespace-nowrap">{formatTiming(ev)}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      accessor: 'description',
      sortable: false,
      render: (ev) => <span className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3">{ev.description || '—'}</span>,
    },
    {
      key: 'image',
      header: 'Image',
      sortable: false,
      render: (ev) =>
        ev.imageUrl ? (
          <button type="button" onClick={() => setPreview(ev)} aria-label={`View picture for ${ev.title}`}>
            <img src={ev.imageUrl} alt="" className="w-16 h-11 object-cover rounded-lg border border-slate-200 dark:border-white/10" />
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Action',
            sortable: false,
            render: (ev: SchoolEvent) => (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(ev)}
                  title="Edit event"
                  aria-label={`Edit ${ev.title}`}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(ev)}
                  title="Delete event"
                  aria-label={`Delete ${ev.title}`}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ),
          } as Column<SchoolEvent>,
        ]
      : []),
  ];

  const nextIn = nextEvent ? daysUntil(nextEvent.startDate) : null;
  const saving = createMutation.isPending || updateMutation.isPending;
  const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-400';

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <PartyPopper className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{isAdmin ? 'Manage Events' : 'School Events'}</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            {isAdmin
              ? 'Plan sports days, cultural programmes, parent meetings and more — the people you choose get a notification.'
              : 'Sports days, programmes, trips and everything else happening at school.'}
          </p>
        </div>
      </div>

      {nextEvent && nextIn !== null && when !== 'past' && (
        <div className="glass-card rounded-2xl overflow-hidden flex flex-col sm:flex-row border border-amber-200/60 dark:border-amber-500/20 bg-gradient-to-r from-amber-50 to-sky-50 dark:from-amber-500/5 dark:to-sky-500/5">
          {nextEvent.imageUrl && (
            <img src={nextEvent.imageUrl} alt="" className="w-full sm:w-48 h-32 sm:h-auto object-cover flex-shrink-0" />
          )}
          <div className="p-5 min-w-0">
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <Sparkles className="w-3.5 h-3.5" />
              {nextIn <= 0 ? 'Happening now' : nextIn === 1 ? 'Tomorrow!' : `Coming up in ${nextIn} days`}
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{nextEvent.title}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4" />{formatEventDates(nextEvent)}</span>
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{formatTiming(nextEvent)}</span>
              {nextEvent.venue && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{nextEvent.venue}</span>}
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div ref={formRef} className="glass-card p-6 rounded-2xl space-y-4 scroll-mt-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingId ? 'Edit Event' : 'Create Events'}</h3>
          {sessionYears.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Create a session year first (Academics → Session Year), then you can add events to it.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="event-title" className={labelClass}>Title<span className="text-red-500 ml-1">*</span></label>
                    <input
                      id="event-title"
                      type="text"
                      required
                      minLength={2}
                      maxLength={150}
                      value={form.title}
                      onChange={(e) => set('title', e.target.value)}
                      placeholder="e.g. Annual Sports Day"
                      className="input-field"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="event-session" className={labelClass}>Session Year<span className="text-red-500 ml-1">*</span></label>
                      <select
                        id="event-session"
                        required
                        value={form.academicYearId}
                        onChange={(e) => setForm((prev) => ({ ...prev, academicYearId: e.target.value, startDate: '', endDate: '' }))}
                        className="input-field"
                      >
                        {sessionYears.map((y) => (
                          <option key={y.id} value={y.id}>{y.label}{y.isCurrent ? ' (default)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="event-category" className={labelClass}>Category</label>
                      <select
                        id="event-category"
                        value={form.category}
                        onChange={(e) => set('category', e.target.value as EventCategory)}
                        className="input-field"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="event-description" className={labelClass}>Description</label>
                  <textarea
                    id="event-description"
                    rows={5}
                    maxLength={2000}
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="What's happening, what to bring, dress code..."
                    className="input-field resize-none h-[calc(100%-1.75rem)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="event-venue" className={labelClass}>Venue</label>
                  <input
                    id="event-venue"
                    type="text"
                    maxLength={150}
                    value={form.venue}
                    onChange={(e) => set('venue', e.target.value)}
                    placeholder="e.g. School playground, Auditorium"
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <span className={labelClass}>Image</span>
                  <div className="flex items-center gap-3">
                    {form.imageUrl ? (
                      <div className="relative">
                        <img src={form.imageUrl} alt="Event" className="w-20 h-12 object-cover rounded-lg border border-slate-200 dark:border-white/10" />
                        <button
                          type="button"
                          onClick={() => set('imageUrl', null)}
                          aria-label="Remove picture"
                          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No picture</span>
                    )}
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImage} className="hidden" />
                    <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} className="px-4 py-2 text-sm">
                      <ImagePlus className="w-4 h-4" />
                      {form.imageUrl ? 'Change' : 'Upload'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-5" role="radiogroup" aria-label="Event length">
                {(['SINGLE', 'MULTIPLE'] as EventType[]).map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="event-type"
                      checked={form.type === t}
                      onChange={() => setForm((prev) => ({ ...prev, type: t, endDate: '' }))}
                      className="accent-primary-600"
                    />
                    {t === 'SINGLE' ? 'Single day' : 'Multiple days'}
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`grid gap-4 ${form.type === 'MULTIPLE' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="space-y-1.5">
                    <label htmlFor="event-start" className={labelClass}>
                      {form.type === 'MULTIPLE' ? 'Start Date' : 'Date'}<span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                      id="event-start"
                      type="date"
                      required
                      min={minDate}
                      max={maxDate}
                      value={form.startDate}
                      onChange={(e) => set('startDate', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  {form.type === 'MULTIPLE' && (
                    <div className="space-y-1.5">
                      <label htmlFor="event-end" className={labelClass}>End Date<span className="text-red-500 ml-1">*</span></label>
                      <input
                        id="event-end"
                        type="date"
                        required
                        min={form.startDate || minDate}
                        max={maxDate}
                        value={form.endDate}
                        onChange={(e) => set('endDate', e.target.value)}
                        className="input-field"
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <span className={labelClass}>Timing <span className="text-xs text-slate-400">(leave empty for all day)</span></span>
                  <div className="flex items-center gap-2">
                    <label htmlFor="event-start-time" className="sr-only">Start time</label>
                    <input
                      id="event-start-time"
                      type="time"
                      value={form.startTime}
                      onChange={(e) => set('startTime', e.target.value)}
                      className="input-field"
                    />
                    <span className="text-slate-400">–</span>
                    <label htmlFor="event-end-time" className="sr-only">End time</label>
                    <input
                      id="event-end-time"
                      type="time"
                      disabled={!form.startTime}
                      min={form.startTime || undefined}
                      value={form.endTime}
                      onChange={(e) => set('endTime', e.target.value)}
                      className="input-field disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className={labelClass}>Who is this event for?<span className="text-red-500 ml-1">*</span></span>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCES.map((a) => {
                    const active = form.audience.includes(a.value);
                    return (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => toggleAudience(a.value)}
                        aria-pressed={active}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-primary-400'
                        }`}
                      >
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!editingId && (
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={form.notify} onChange={(e) => set('notify', e.target.checked)} className="rounded-sm" />
                  Send a notification to everyone in this audience
                </label>
              )}

              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" isLoading={saving} className="px-6">
                  {editingId ? 'Update' : 'Submit'}
                </Button>
                {editingId && (
                  <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      <div className="glass-card p-6 rounded-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            List Events {data?.sessionYear && <span className="text-sm font-medium text-slate-500">· {data.sessionYear.label}</span>}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden" role="group" aria-label="Show events">
              {WHEN_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setWhen(t.value)}
                  aria-pressed={when === t.value}
                  className={`px-3 py-2 text-xs font-semibold transition-colors ${
                    when === t.value ? 'bg-primary-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label htmlFor="events-category-filter" className="sr-only">Category</label>
            <select
              id="events-category-filter"
              value={category}
              onChange={(e) => setCategory(e.target.value as EventCategory | '')}
              className="input-field py-2 text-sm w-44"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <label htmlFor="events-session-filter" className="sr-only">Session Year</label>
            <select
              id="events-session-filter"
              value={listSessionId}
              onChange={(e) => setListSessionId(e.target.value)}
              className="input-field py-2 text-sm w-40"
            >
              <option value="">{defaultSession ? `${defaultSession.label} (default)` : 'Default session'}</option>
              {sessionYears.filter((y) => !y.isCurrent).map((y) => (
                <option key={y.id} value={y.id}>{y.label}</option>
              ))}
            </select>
          </div>
        </div>

        <DataTable
          data={events}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Search events..."
          emptyTitle={when === 'upcoming' ? 'No upcoming events' : 'No events found'}
          emptyDescription={isAdmin ? 'Create an event above to let everyone know what’s coming up.' : 'Check back soon for new school events!'}
        />
      </div>

      <Modal isOpen={!!preview} onClose={() => setPreview(null)} className="max-w-2xl p-0 overflow-hidden">
        {preview && (
          <div>
            {preview.imageUrl && <img src={preview.imageUrl} alt={preview.title} className="w-full max-h-[60vh] object-contain bg-slate-900" />}
            <div className="p-5 space-y-1">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{preview.title}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {formatEventDates(preview)} · {formatTiming(preview)}
                {preview.venue ? ` · ${preview.venue}` : ''}
              </p>
              {preview.description && <p className="text-sm text-slate-700 dark:text-slate-300 pt-2 whitespace-pre-line">{preview.description}</p>}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete event"
        message={deleteTarget ? `Delete "${deleteTarget.title}" (${formatEventDates(deleteTarget)})? This cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
