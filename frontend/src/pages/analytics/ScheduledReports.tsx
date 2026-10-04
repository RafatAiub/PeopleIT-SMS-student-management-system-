import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Badge, Button, ErrorState, PageHeader } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useAuthStore } from '../../store/authStore';
import { formatDate, useT } from '@/i18n';
import { REPORT_LABELS } from './analytics.access';
import { useDeleteSchedule, useRunSchedule, useSchedules, useToggleSchedule } from './analytics.queries';
import { describeCron } from './cronBuilder';
import { ScheduleFormModal } from './ScheduleFormModal';
import type { ReportSchedule, ScheduleRunResult } from './analytics.types';

/** Manage scheduled report emails (SUPER_ADMIN, ADMIN, ACCOUNTANT — mirrors /reports/schedules). */
export default function ScheduledReports() {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const q = useSchedules(page, pageSize);
  const toggle = useToggleSchedule();
  const remove = useDeleteSchedule();
  const run = useRunSchedule();
  const [editing, setEditing] = useState<ReportSchedule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<ReportSchedule | null>(null);
  const [lastRun, setLastRun] = useState<ScheduleRunResult | null>(null);

  const runNow = (s: ReportSchedule) =>
    run.mutate(s.id, {
      onSuccess: (r) => {
        setLastRun(r);
        if (!r.demo) toast.success(t('Report sent to {n} recipients.', { n: r.sent }));
      },
    });

  const columns: Column<ReportSchedule>[] = [
    {
      key: 'view',
      header: t('Saved view'),
      primary: true,
      render: (s) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-white truncate">{s.savedView.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t(REPORT_LABELS[s.savedView.reportKey])}</p>
        </div>
      ),
      exportValue: (s) => s.savedView.name,
    },
    {
      key: 'cron',
      header: t('Schedule'),
      render: (s) => {
        const d = describeCron(s.cron);
        return t(d.key, d.vars);
      },
      exportValue: (s) => s.cron,
    },
    { key: 'recipients', header: t('Recipients'), hideOnMobile: true, render: (s) => <span title={s.recipients.join(', ')}>{s.recipients.length}</span>, exportValue: (s) => s.recipients.join('; ') },
    { key: 'nextRunAt', header: t('Next run'), render: (s) => (s.nextRunAt ? formatDate(s.nextRunAt, true) : '—'), exportValue: (s) => s.nextRunAt },
    { key: 'lastRunAt', header: t('Last run'), hideOnMobile: true, render: (s) => (s.lastRunAt ? formatDate(s.lastRunAt, true) : t('Never')), exportValue: (s) => s.lastRunAt },
    { key: 'createdByName', header: t('Created by'), accessor: 'createdByName', defaultHidden: true },
    {
      key: 'isActive',
      header: t('Status'),
      render: (s) => <Badge variant={s.isActive ? 'success' : 'neutral'}>{s.isActive ? t('Active') : t('Paused')}</Badge>,
      exportValue: (s) => (s.isActive ? 'Active' : 'Paused'),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Scheduled report emails')}
        description={t('Email saved analytics views as CSV on a schedule.')}
        breadcrumbs={[{ label: t('Analytics'), to: '/analytics' }, { label: t('Scheduled emails') }]}
        actions={
          <Button type="button" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            {t('New schedule')}
          </Button>
        }
      />

      {q.data?.demo && (
        <Alert tone="warning" title={t('Demo mode')}>
          {t('Email (SMTP) is not configured, so scheduled reports are generated and logged but nothing is really sent.')}
        </Alert>
      )}

      {lastRun && (
        <Alert
          tone={lastRun.demo ? 'warning' : lastRun.failed > 0 ? 'danger' : 'success'}
          title={lastRun.demo ? t('Demo mode') : t('Report sent')}
          action={<Button type="button" variant="ghost" size="xs" onClick={() => setLastRun(null)}>{t('Dismiss')}</Button>}
        >
          {lastRun.demo
            ? t('The report was generated ({rows} rows, {range}) but not emailed: email API key not configured; nothing was really sent.', { rows: lastRun.rows, range: lastRun.rangeLabel })
            : t('Sent to {sent} recipients, {failed} failed ({rows} rows, {range}).', { sent: lastRun.sent, failed: lastRun.failed, rows: lastRun.rows, range: lastRun.rangeLabel })}
          {lastRun.skippedRecipients > 0 && ` ${t('{n} recipients were skipped because they are no longer active staff.', { n: lastRun.skippedRecipients })}`}
        </Alert>
      )}

      <div className="glass-card p-4 sm:p-6">
        {q.isError ? (
          <ErrorState message={t('Could not load schedules.')} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            data={q.data?.items ?? []}
            columns={columns}
            isLoading={q.isLoading}
            serverPagination
            totalCount={q.data?.meta.total ?? 0}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            exportFileName="scheduled-reports"
            actions={[
              { label: run.isPending ? t('Running…') : t('Run now'), onClick: (s) => { if (!run.isPending) runNow(s); } },
              { label: t('Pause / resume'), onClick: (s) => toggle.mutate({ id: s.id, isActive: !s.isActive }) },
              { label: t('Edit'), icon: 'edit', onClick: (s) => { setEditing(s); setFormOpen(true); } },
              { label: t('Delete'), icon: 'delete', variant: 'danger', onClick: (s) => setDeleting(s) },
            ]}
            toolbar={
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {q.data ? t('Times are in {tz}.', { tz: q.data.timeZone }) : null}
              </p>
            }
            emptyTitle={t('No scheduled emails yet')}
            emptyDescription={t('Save a view on the Analytics page, then schedule it here.')}
            emptyAction={<Button type="button" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>{t('New schedule')}</Button>}
          />
        )}
      </div>

      <ScheduleFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} schedule={editing} role={role} />

      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete schedule?')}
        message={t('The saved view is kept; only the scheduled email is removed.')}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}
