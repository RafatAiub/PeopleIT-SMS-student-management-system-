import React, { useState } from 'react';
import { CalendarClock, Phone, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Select, Skeleton, Tabs } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useCreateTask, useDeleteTask, useTaskSummary, useTasks, useUpdateTask, type CrmTask, type TaskQuery } from './crm.api';
import { useEnquiryAssignees } from './enquiries.queries';
import { dueStateOf } from './crm.logic';
import { fromLocalInput } from './enquiries.types';

/** A plain list of CRM tasks with a done checkbox; managers can also delete. */
export default function TaskList({
  tasks,
  isLoading,
  showEnquiry = true,
  canManage = false,
  onOpenEnquiry,
}: {
  tasks: CrmTask[];
  isLoading?: boolean;
  showEnquiry?: boolean;
  canManage?: boolean;
  onOpenEnquiry?: (enquiryId: string) => void;
}) {
  const t = useT();
  const update = useUpdateTask();
  const del = useDeleteTask();
  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (tasks.length === 0) return <EmptyState compact title={t('No tasks')} description={t('Add a follow-up task so nothing slips.')} />;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-white/6 rounded-xl border border-slate-200 dark:border-white/10">
      {tasks.map((task) => {
        const due = task.done ? 'none' : dueStateOf(task.dueAt);
        return (
          <li key={task.id} className="flex items-start gap-3 p-3">
            <input
              type="checkbox"
              className="mt-1 w-5 h-5 accent-primary-600 shrink-0"
              checked={task.done}
              aria-label={task.done ? t('Mark "{title}" not done', { title: task.title }) : t('Mark "{title}" done', { title: task.title })}
              onChange={(e) => update.mutate({ id: task.id, done: e.target.checked })}
            />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className={cn('text-sm font-semibold text-slate-900 dark:text-slate-50 wrap-break-word', task.done && 'line-through text-slate-500 dark:text-slate-400')}>{task.title}</p>
              {showEnquiry && task.enquiry && (
                <p className="text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-2">
                  {onOpenEnquiry ? (
                    <button type="button" className="font-semibold text-primary-700 dark:text-primary-300 hover:underline" onClick={() => onOpenEnquiry(task.enquiry!.id)}>
                      {task.enquiry.studentName}
                    </button>
                  ) : (
                    <span className="font-semibold">{task.enquiry.studentName}</span>
                  )}
                  <a href={`tel:${task.enquiry.phone}`} className="inline-flex items-center gap-1 text-primary-700 dark:text-primary-300">
                    <Phone className="w-3 h-3" aria-hidden /> {task.enquiry.phone}
                  </a>
                </p>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                {task.dueAt && (
                  <span className={cn('inline-flex items-center gap-1', due === 'overdue' && 'text-red-700 dark:text-red-400 font-semibold')}>
                    <CalendarClock className="w-3 h-3" aria-hidden /> {formatDate(task.dueAt, true)}
                  </span>
                )}
                {due === 'overdue' && <Badge variant="danger">{t('Overdue')}</Badge>}
                {due === 'today' && <Badge variant="warning">{t('Today')}</Badge>}
                {task.assignee && <span>{`${task.assignee.firstName} ${task.assignee.lastName}`.trim()}</span>}
              </p>
              {task.notes && <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{task.notes}</p>}
            </div>
            {canManage && (
              <Button size="icon-sm" variant="ghost" aria-label={t('Delete task')} onClick={() => del.mutate(task.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Inline "add a task" form (managers). */
export function AddTaskForm({ enquiryId, defaultAssigneeId = '' }: { enquiryId?: string; defaultAssigneeId?: string }) {
  const t = useT();
  const { data: assignees = [] } = useEnquiryAssignees();
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState(defaultAssigneeId);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), dueAt: fromLocalInput(due), assigneeUserId: assignee || undefined, enquiryId: enquiryId ?? null },
      { onSuccess: () => { setTitle(''); setDue(''); } },
    );
  };
  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-3">
      <Input label={t('New task')} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. Send the prospectus on WhatsApp')} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label={t('Due')} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        <Select
          label={t('Assign to')}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          options={[{ value: '', label: enquiryId ? t('Enquiry owner (or me)') : t('Me') }, ...assignees.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`.trim() }))]}
        />
      </div>
      <Button type="submit" size="sm" variant="primary" isLoading={create.isPending} disabled={!title.trim()}>
        {t('Add task')}
      </Button>
    </form>
  );
}

/** "My tasks" (any staff) or all tasks (admins), with status tabs and the overdue badge. */
export function TasksPanel({ onOpenEnquiry }: { onOpenEnquiry?: (enquiryId: string) => void }) {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const manager = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const [scope, setScope] = useState<TaskQuery['scope']>('mine');
  const [status, setStatus] = useState<TaskQuery['status']>('open');
  const [page, setPage] = useState(1);
  const summary = useTaskSummary();
  const { data, isLoading } = useTasks({ scope: manager ? scope : 'mine', status, page, pageSize: 50 });
  const total = data?.total ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {manager && (
          <Select
            aria-label={t('Whose tasks')}
            value={scope}
            onChange={(e) => { setScope(e.target.value as TaskQuery['scope']); setPage(1); }}
            className="w-auto min-w-36"
            options={[{ value: 'mine', label: t('My tasks') }, { value: 'all', label: t('Everyone’s tasks') }]}
          />
        )}
        {summary.data && summary.data.overdue > 0 && <Badge variant="danger">{t('{n} overdue', { n: formatNumber(summary.data.overdue) })}</Badge>}
        {summary.data && summary.data.today > 0 && <Badge variant="warning">{t('{n} due today', { n: formatNumber(summary.data.today) })}</Badge>}
      </div>
      <Tabs
        idPrefix="tasks"
        variant="pills"
        label={t('Task status')}
        value={status}
        onChange={(id) => { setStatus(id as TaskQuery['status']); setPage(1); }}
        tabs={[
          { id: 'open', label: t('Open') },
          { id: 'overdue', label: t('Overdue') },
          { id: 'today', label: t('Due today') },
          { id: 'done', label: t('Done') },
        ]}
      />
      {manager && <AddTaskForm />}
      <TaskList tasks={data?.items ?? []} isLoading={isLoading} canManage={manager} onOpenEnquiry={manager ? onOpenEnquiry : undefined} />
      {total > 50 && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('Previous')}
          </Button>
          <span>{t('Page {page} of {pages}', { page: formatNumber(page), pages: formatNumber(Math.ceil(total / 50)) })}</span>
          <Button size="sm" variant="secondary" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>
            {t('Next')}
          </Button>
        </div>
      )}
    </div>
  );
}
