import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Skeleton, ErrorState } from '@/components/ui';
import { formatDate, useT } from '@/i18n';
import { canAccessReport, REPORT_LABELS } from './analytics.access';
import { useCronPreview, useRecipientOptions, useSaveSchedule, useSavedViews } from './analytics.queries';
import { buildCron, DEFAULT_CRON_PARTS, parseCronParts, WEEKDAY_NAMES, type CronParts, type Frequency } from './cronBuilder';
import type { ReportSchedule } from './analytics.types';

const MAX_RECIPIENTS = 20;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  schedule: ReportSchedule | null;
  role: string | undefined;
}

export const ScheduleFormModal: React.FC<Props> = ({ isOpen, onClose, schedule, role }) => {
  const t = useT();
  const views = useSavedViews();
  const recipientsQ = useRecipientOptions(isOpen);
  const save = useSaveSchedule();

  const [savedViewId, setSavedViewId] = useState('');
  const [parts, setParts] = useState<CronParts>(DEFAULT_CRON_PARTS);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setSavedViewId(schedule?.savedViewId ?? '');
    setParts(schedule ? parseCronParts(schedule.cron) : DEFAULT_CRON_PARTS);
    setRecipients(schedule?.recipients ?? []);
    setIsActive(schedule?.isActive ?? true);
    setSearch('');
    setErrors({});
  }, [isOpen, schedule]);

  const cron = buildCron(parts);
  const preview = useCronPreview(cron, isOpen);
  const viewOptions = (views.data?.items ?? []).filter((v) => canAccessReport(role, v.reportKey));
  const filteredRecipients = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (recipientsQ.data ?? []).filter((r) => !s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s));
  }, [recipientsQ.data, search]);

  const toggleRecipient = (email: string) =>
    setRecipients((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : prev.length >= MAX_RECIPIENTS ? prev : [...prev, email]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!savedViewId) errs.savedViewId = t('Choose a saved view');
    if (recipients.length === 0) errs.recipients = t('Add at least one recipient');
    if (preview.isError) errs.cron = t('Invalid schedule');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    save.mutate({ id: schedule?.id, savedViewId, cron, recipients, format: 'CSV', isActive }, { onSuccess: onClose });
  };

  const set = (patch: Partial<CronParts>) => setParts((p) => ({ ...p, ...patch }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={schedule ? t('Edit scheduled email') : t('New scheduled email')}
      description={t('Emails the saved view as a CSV attachment on a schedule.')}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="schedule-form" isLoading={save.isPending}>{t('Save')}</Button>
        </div>
      }
    >
      <form id="schedule-form" onSubmit={submit} className="space-y-4">
        <Select
          id="schedule-view"
          label={t('Saved view')}
          required
          value={savedViewId}
          error={errors.savedViewId}
          disabled={views.isLoading}
          onChange={(e) => setSavedViewId(e.target.value)}
          placeholder={views.isLoading ? t('Loading…') : t('Select a saved view')}
          options={viewOptions.map((v) => ({ value: v.id, label: `${v.name} · ${t(REPORT_LABELS[v.reportKey])}` }))}
          helperText={viewOptions.length === 0 && !views.isLoading ? t('Save a view from the Analytics page first.') : undefined}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            id="schedule-frequency"
            label={t('Frequency')}
            value={parts.frequency}
            onChange={(e) => set({ frequency: e.target.value as Frequency, custom: cron })}
            options={[
              { value: 'daily', label: t('Daily') },
              { value: 'weekly', label: t('Weekly') },
              { value: 'monthly', label: t('Monthly') },
              { value: 'custom', label: t('Custom (cron)') },
            ]}
          />
          {parts.frequency === 'weekly' && (
            <Select
              id="schedule-weekday"
              label={t('Day')}
              value={String(parts.weekday)}
              onChange={(e) => set({ weekday: Number(e.target.value) })}
              options={WEEKDAY_NAMES.map((d, i) => ({ value: String(i), label: t(d) }))}
            />
          )}
          {parts.frequency === 'monthly' && (
            <Select
              id="schedule-dom"
              label={t('Day of month')}
              value={String(parts.dayOfMonth)}
              onChange={(e) => set({ dayOfMonth: Number(e.target.value) })}
              options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            />
          )}
          {parts.frequency !== 'custom' ? (
            <Input id="schedule-time" type="time" label={t('Time')} value={parts.time} onChange={(e) => set({ time: e.target.value || '08:00' })} />
          ) : (
            <Input
              id="schedule-cron"
              label={t('Cron expression')}
              value={parts.custom}
              containerClassName="sm:col-span-2"
              error={errors.cron}
              helperText={t('minute hour day-of-month month day-of-week')}
              onChange={(e) => set({ custom: e.target.value })}
            />
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3 text-sm">
          <p className="font-medium text-slate-700 dark:text-slate-200">{t('Next runs')}</p>
          {preview.isLoading ? (
            <Skeleton className="h-4 w-48 mt-2" />
          ) : preview.isError ? (
            <p className="mt-1 text-red-600 dark:text-red-300">{t('Invalid schedule')}</p>
          ) : (
            <ul className="mt-1 text-slate-600 dark:text-slate-300 space-y-0.5">
              {(preview.data?.runs ?? []).map((r) => (
                <li key={r}>{formatDate(r, true)}</li>
              ))}
              {preview.data && <li className="text-xs text-slate-500 dark:text-slate-400">{t('Timezone: {tz}', { tz: preview.data.timeZone })}</li>}
            </ul>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('Recipients')} <span className="text-slate-500 dark:text-slate-400 font-normal">({recipients.length}/{MAX_RECIPIENTS})</span>
          </legend>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('Only active staff of your institution can receive report emails.')}</p>
          <Input id="schedule-recipient-search" placeholder={t('Search staff by name or email')} value={search} onChange={(e) => setSearch(e.target.value)} />
          {recipientsQ.isError ? (
            <ErrorState compact message={t('Could not load staff.')} onRetry={() => recipientsQ.refetch()} />
          ) : recipientsQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
              {filteredRecipients.length === 0 ? (
                <p className="p-3 text-sm text-slate-500 dark:text-slate-400">{t('No staff match your search.')}</p>
              ) : (
                filteredRecipients.map((r) => (
                  <div key={r.id} className="px-3 py-2">
                    <Checkbox
                      id={`recipient-${r.id}`}
                      label={r.name}
                      description={`${r.email} · ${r.role}`}
                      checked={recipients.includes(r.email.toLowerCase()) || recipients.includes(r.email)}
                      disabled={!recipients.includes(r.email.toLowerCase()) && recipients.length >= MAX_RECIPIENTS}
                      onChange={() => toggleRecipient(r.email.toLowerCase())}
                    />
                  </div>
                ))
              )}
            </div>
          )}
          {errors.recipients && <p className="text-xs text-red-600 dark:text-red-300" role="alert">{errors.recipients}</p>}
        </fieldset>

        <Checkbox id="schedule-active" label={t('Active')} description={t('Paused schedules are kept but not sent.')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </form>
    </Modal>
  );
};
