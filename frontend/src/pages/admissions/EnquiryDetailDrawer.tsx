import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, ArrowRightCircle, ExternalLink, Phone, MessageSquare, Mail, StickyNote, Users, GitMerge } from 'lucide-react';
import { Drawer, Button, Select, Input, Textarea, DescriptionList, Alert, Badge, Tabs, TabPanel } from '@/components/ui';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useT, formatDate, useLocale } from '@/i18n';
import { useEnquiryAssignees, useUpdateEnquiry, useDeleteEnquiry, useConvertEnquiry } from './enquiries.queries';
import { useDuplicateCheck, useLogActivity, useMerge, useMoveStage, useStages, useTimeline } from './crm.api';
import { ACTIVITY_LABELS, stageLabel } from './crm.logic';
import ConvertEnquiryModal from './ConvertEnquiryModal';
import TaskList, { AddTaskForm } from './TaskList';
import { PRIORITY_OPTIONS, SOURCE_OPTIONS, enquiryToFormValues, toLocalInput, type ConvertFormValues, type Enquiry, type Priority } from './enquiries.types';

interface EnquiryDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry | null;
  onEdit: (enquiry: Enquiry) => void;
  /** Called after the enquiry is deleted so the parent can clear its selection. */
  onDeleted: () => void;
  /** Called when a merge replaces the open enquiry with the kept one. */
  onReplaced?: (enquiry: Enquiry) => void;
}

const LOG_TYPES = [
  { value: 'CALL', label: 'Call', icon: Phone },
  { value: 'SMS', label: 'SMS', icon: MessageSquare },
  { value: 'EMAIL', label: 'Email', icon: Mail },
  { value: 'MEETING', label: 'Meeting', icon: Users },
  { value: 'NOTE', label: 'Note', icon: StickyNote },
] as const;

/** One enquiry: pipeline stage, owner, next step & due date, tasks, activity timeline, duplicates, convert. */
export default function EnquiryDetailDrawer({ isOpen, onClose, enquiry, onEdit, onDeleted, onReplaced }: EnquiryDetailDrawerProps) {
  const t = useT();
  const { lang } = useLocale();
  const { data: assignees = [] } = useEnquiryAssignees();
  const { data: stages = [] } = useStages();
  const updateMutation = useUpdateEnquiry();
  const moveStage = useMoveStage();
  const deleteMutation = useDeleteEnquiry();
  const convertMutation = useConvertEnquiry();
  const logActivity = useLogActivity();
  const merge = useMerge();

  const [current, setCurrent] = useState<Enquiry | null>(enquiry);
  const [tab, setTab] = useState<'overview' | 'timeline' | 'tasks'>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [logType, setLogType] = useState<string>('CALL');
  const [logBody, setLogBody] = useState('');
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setCurrent(enquiry);
    setLostReason(enquiry?.lostReason ?? '');
    setNextStep(enquiry?.nextStep ?? '');
    setLogBody('');
    if (enquiry?.id !== current?.id) setTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiry]);

  const timeline = useTimeline(isOpen ? current?.id : null);
  const dups = useDuplicateCheck(
    { studentName: current?.studentName ?? '', guardianName: current?.guardianName ?? undefined, phone: current?.phone ?? '', email: current?.email ?? '', excludeId: current?.id },
    isOpen && !!current,
  );

  if (!current) return null;

  const save = (patch: Partial<ReturnType<typeof enquiryToFormValues>>) => {
    const values = { ...enquiryToFormValues(current), ...patch };
    updateMutation.mutate({ id: current.id, values }, { onSuccess: (updated) => setCurrent(updated) });
  };

  const changeStage = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || stage.id === current.stageId) return;
    moveStage.mutate(
      { id: current.id, stageId, lostReason: stage.isLost ? lostReason.trim() || null : undefined },
      { onSuccess: (updated) => setCurrent(updated) },
    );
  };

  const submitLog = () => {
    if (!logBody.trim()) return;
    logActivity.mutate({ enquiryId: current.id, type: logType, body: logBody.trim() }, { onSuccess: () => setLogBody('') });
  };

  const handleConvert = (values: ConvertFormValues) => {
    convertMutation.mutate({ id: current.id, values }, { onSuccess: (result) => { setCurrent(result.enquiry); setConvertOpen(false); } });
  };

  const alreadyConverted = !!current.convertedStudentId;
  const sourceLabel = SOURCE_OPTIONS.find((o) => o.value === current.source)?.label ?? current.source;
  const activities = timeline.data?.activities ?? [];
  const tasks = timeline.data?.tasks ?? [];
  const openTasks = tasks.filter((x) => !x.done).length;

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={current.studentName} description={t('Enquiry details')} width="lg">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {current.stage && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <span className="w-2 h-2 rounded-full" style={{ background: current.stage.color }} aria-hidden />
                {stageLabel(current.stage, lang)}
              </span>
            )}
            {current.priority === 'HIGH' && <Badge variant="danger">{t('High priority')}</Badge>}
            {current.followUpAt && (
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {t('Next step due')}: {formatDate(current.followUpAt, true)}
              </span>
            )}
          </div>

          {(dups.data?.length ?? 0) > 0 && (
            <Alert tone="warning" title={t('Possible duplicates')}>
              <ul className="space-y-1.5 mt-1">
                {dups.data!.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{d.studentName}</span>
                    <span className="text-slate-600 dark:text-slate-300">{d.phone}</span>
                    <span className="text-xs">({(d.reasons ?? []).map((r) => t(r === 'PHONE' ? 'same phone' : r === 'EMAIL' ? 'same email' : 'similar name')).join(', ')})</span>
                    <Button size="xs" variant="outline" leftIcon={<GitMerge className="w-3 h-3" />} onClick={() => setMergeTarget({ id: d.id, name: d.studentName })}>
                      {t('Merge into this one')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <Tabs
            idPrefix="enq"
            variant="pills"
            label={t('Enquiry sections')}
            value={tab}
            onChange={(id) => setTab(id as typeof tab)}
            tabs={[
              { id: 'overview', label: t('Overview') },
              { id: 'timeline', label: t('Timeline'), count: activities.length || undefined },
              { id: 'tasks', label: t('Tasks'), count: openTasks || undefined },
            ]}
          />

          <TabPanel idPrefix="enq" id="overview" value={tab}>
            <div className="space-y-5">
              <DescriptionList
                columns={2}
                items={[
                  { label: t('Guardian'), value: current.guardianName || '—' },
                  { label: t('Phone'), value: <a className="text-primary-700 dark:text-primary-300 font-semibold" href={`tel:${current.phone}`}>{current.phone}</a> },
                  { label: t('Email'), value: current.email || '—' },
                  { label: t('Class interested'), value: current.classInterested || '—' },
                  { label: t('Source'), value: t(sourceLabel) },
                  { label: t('Created'), value: formatDate(current.createdAt, true) },
                ]}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onEdit(current)}>
                  {t('Edit')}
                </Button>
                <Button size="sm" variant="danger-soft" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)}>
                  {t('Delete')}
                </Button>
              </div>

              <section className="border-t border-slate-100 dark:border-white/6 pt-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t('Pipeline')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label={t('Stage')}
                    value={current.stageId ?? ''}
                    onChange={(e) => changeStage(e.target.value)}
                    disabled={moveStage.isPending}
                    options={stages.map((s) => ({ value: s.id, label: stageLabel(s, lang) }))}
                  />
                  <Select
                    label={t('Priority')}
                    value={current.priority ?? 'NORMAL'}
                    onChange={(e) => save({ priority: e.target.value as Priority })}
                    disabled={updateMutation.isPending}
                    options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: t(p.label) }))}
                  />
                </div>
                {current.stage?.isLost && (
                  <div className="flex items-end gap-2">
                    <Input containerClassName="flex-1" label={t('Lost reason')} value={lostReason} maxLength={300} onChange={(e) => setLostReason(e.target.value)} />
                    <Button size="sm" variant="secondary" disabled={lostReason === (current.lostReason ?? '')} onClick={() => moveStage.mutate({ id: current.id, stageId: current.stageId!, lostReason: lostReason.trim() || null }, { onSuccess: (u) => setCurrent(u) })}>
                      {t('Save')}
                    </Button>
                  </div>
                )}
              </section>

              <section className="border-t border-slate-100 dark:border-white/6 pt-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t('Owner & next step')}</h3>
                <Select
                  label={t('Owner')}
                  value={current.assignedToUserId ?? ''}
                  onChange={(e) => save({ assignedToUserId: e.target.value })}
                  options={[{ value: '', label: t('Unassigned') }, ...assignees.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`.trim() }))]}
                  disabled={updateMutation.isPending}
                />
                <Input
                  label={t('Next step')}
                  value={nextStep}
                  maxLength={300}
                  placeholder={t('e.g. Call father about the campus visit')}
                  onChange={(e) => setNextStep(e.target.value)}
                  onBlur={() => nextStep !== (current.nextStep ?? '') && save({ nextStep })}
                />
                <Input
                  label={t('Next step due')}
                  type="datetime-local"
                  key={current.followUpAt ?? 'none'}
                  defaultValue={toLocalInput(current.followUpAt)}
                  onBlur={(e) => e.target.value !== toLocalInput(current.followUpAt) && save({ followUpAt: e.target.value })}
                  disabled={updateMutation.isPending}
                />
              </section>

              {current.notes && (
                <section className="border-t border-slate-100 dark:border-white/6 pt-4 space-y-2">
                  <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t('Notes history')}</h3>
                  <pre className="whitespace-pre-wrap wrap-break-word text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-white/3 rounded-lg p-3 font-sans">{current.notes}</pre>
                </section>
              )}

              <section className="border-t border-slate-100 dark:border-white/6 pt-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t('Online application')}</h3>
                {alreadyConverted && current.convertedStudent ? (
                  <Alert tone="success" title={t('Already converted')}>
                    <p className="flex flex-wrap items-center gap-2">
                      {t('Reference')}: <span className="font-semibold">{current.convertedStudent.studentId}</span>
                      <StatusBadge status={current.convertedStudent.status} />
                    </p>
                    <Link to="/students/online-registrations" className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                      {t('View on Online Registrations')} <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </Alert>
                ) : (
                  <Button size="sm" variant="gradient" leftIcon={<ArrowRightCircle className="w-4 h-4" />} onClick={() => setConvertOpen(true)}>
                    {t('Convert to online application')}
                  </Button>
                )}
              </section>
            </div>
          </TabPanel>

          <TabPanel idPrefix="enq" id="timeline" value={tab}>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-3">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('What happened?')}>
                  {LOG_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={logType === value}
                      onClick={() => setLogType(value)}
                      className={`inline-flex items-center gap-1 min-h-8 px-2.5 rounded-lg text-xs font-semibold border ${logType === value ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-300 dark:border-white/12 text-slate-700 dark:text-slate-200'}`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden /> {t(label)}
                    </button>
                  ))}
                </div>
                <Textarea label={t('Details')} rows={2} value={logBody} maxLength={5000} onChange={(e) => setLogBody(e.target.value)} placeholder={t('e.g. Spoke to the mother; will visit on Sunday')} />
                <Button size="sm" variant="primary" isLoading={logActivity.isPending} disabled={!logBody.trim()} onClick={submitLog}>
                  {t('Log activity')}
                </Button>
              </div>
              {timeline.isLoading ? (
                <p className="text-sm text-slate-600">{t('Loading…')}</p>
              ) : activities.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">{t('Nothing logged yet.')}</p>
              ) : (
                <ol className="relative border-l border-slate-200 dark:border-white/10 ml-2 space-y-4">
                  {activities.map((a) => (
                    <li key={a.id} className="ml-4">
                      <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-2 border-primary-600" aria-hidden />
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{t(ACTIVITY_LABELS[a.type] ?? a.type)}</span> · {formatDate(a.createdAt, true)}
                        {a.actorName ? ` · ${a.actorName}` : ''}
                      </p>
                      {a.body && <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap wrap-break-word">{a.body}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </TabPanel>

          <TabPanel idPrefix="enq" id="tasks" value={tab}>
            <div className="space-y-4">
              <AddTaskForm enquiryId={current.id} defaultAssigneeId={current.assignedToUserId ?? ''} />
              <TaskList tasks={tasks} isLoading={timeline.isLoading} showEnquiry={false} canManage />
            </div>
          </TabPanel>
        </div>
      </Drawer>

      <ConvertEnquiryModal isOpen={convertOpen} onClose={() => setConvertOpen(false)} enquiry={current} onSubmit={handleConvert} isSubmitting={convertMutation.isPending} />

      <ConfirmModal
        isOpen={confirmDelete}
        title={t('Delete enquiry')}
        message={t('Move "{name}" to the trash? You can restore it from Trash for 30 days.', { name: current.studentName })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(current.id, { onSuccess: () => { setConfirmDelete(false); onDeleted(); } })}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmModal
        isOpen={!!mergeTarget}
        title={t('Merge duplicate')}
        message={t('"{other}" will be merged into "{name}": its timeline, tasks and any missing details move here, and the duplicate is removed.', {
          other: mergeTarget?.name ?? '',
          name: current.studentName,
        })}
        confirmLabel={t('Merge')}
        variant="warning"
        isLoading={merge.isPending}
        onConfirm={() =>
          mergeTarget &&
          merge.mutate(
            { keepId: current.id, dropId: mergeTarget.id },
            {
              onSuccess: (kept) => {
                setMergeTarget(null);
                setCurrent(kept);
                onReplaced?.(kept);
              },
            },
          )
        }
        onCancel={() => setMergeTarget(null)}
      />
    </>
  );
}
