import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, X, Save, Wand2, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import apiClient from '../../api/client';
import { Alert, Badge, Button, Card, Checkbox, Modal, PageHeader, Select, Tabs, Textarea, ErrorState, Skeleton, AiGeneratedNotice } from '../../components/ui';
import type { BadgeVariant } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT, formatDate, formatNumber } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { AiStatusBanner, DemoAlert } from './aiShared';
import { useAiStatus, useClassOptions, useSectionOptions, errorMessage, type AiMode, type PageMeta } from './aiUtils';

type Status = 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';

interface Draft {
  id: string;
  feature: string;
  entityType: string | null;
  entityId: string | null;
  content: string;
  status: Status;
  createdAt: string;
  reviewedAt: string | null;
  createdBy: { firstName: string; lastName: string; role: string } | null;
  reviewedBy: { firstName: string; lastName: string } | null;
  context:
    | { kind: 'examResult'; exam: string; subject: string; marks: number; maxMarks: number; grade: string | null; currentRemarks: string | null; student: { id: string; name: string; registrationNumber: string } }
    | { kind: 'student'; student: { id: string; name: string; registrationNumber: string } }
    | { kind: 'guardianQuestion'; question: string | null; askedAt: string; askedBy: string }
    | { kind: 'message'; channel: string; sms?: { characters: number; segments: number; encoding: string } }
    | null;
}

interface DraftResponse {
  data: Draft[];
  meta: PageMeta;
  counts: Partial<Record<Status, number>>;
}

const FEATURE_LABEL: Record<string, string> = {
  report_comment: 'Report comment',
  fee_reminder: 'Fee reminder SMS',
  message_draft: 'Message draft',
  guardian_chat: 'Guardian question',
};

const STATUS_VARIANT: Record<Status, BadgeVariant> = { DRAFT: 'warning', APPROVED: 'success', PUBLISHED: 'primary', REJECTED: 'neutral' };

export default function AiDrafts() {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const status = useAiStatus();
  const [tab, setTab] = useState<Status>('DRAFT');
  const [feature, setFeature] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [bulkOpen, setBulkOpen] = useState(false);

  const query = useQuery({
    queryKey: ['ai', 'drafts', { tab, feature, page }],
    queryFn: async (): Promise<DraftResponse> => (await apiClient.get('/ai/drafts', { params: { status: tab, feature: feature || undefined, page, pageSize } })).data,
    placeholderData: keepPreviousData,
  });

  const counts = query.data?.counts ?? {};
  const totalPages = query.data?.meta.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span className="flex items-center gap-2"><Inbox className="w-6 h-6 text-primary-600 dark:text-primary-400" />{t('AI review queue')}</span>}
        description={t('AI-written text waits here until a staff member approves, edits or rejects it. Nothing reaches guardians or students before approval.')}
        breadcrumbs={[{ label: t('AI Assistant'), to: '/ai' }, { label: t('Review queue') }]}
        actions={<Button leftIcon={<Wand2 className="w-4 h-4" />} onClick={() => setBulkOpen(true)}>{t('Generate report comments')}</Button>}
      />
      <AiStatusBanner status={status.data} />
      {!isAdmin && <Alert tone="info">{t('You see the drafts you created. Administrators also review guardian questions.')}</Alert>}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="overflow-x-auto">
          <Tabs
            variant="pills"
            value={tab}
            onChange={(v) => { setTab(v as Status); setPage(1); }}
            tabs={[
              { id: 'DRAFT', label: t('Awaiting review'), count: counts.DRAFT ?? 0 },
              { id: 'PUBLISHED', label: t('Published'), count: counts.PUBLISHED ?? 0 },
              { id: 'APPROVED', label: t('Approved'), count: counts.APPROVED ?? 0 },
              { id: 'REJECTED', label: t('Rejected'), count: counts.REJECTED ?? 0 },
            ]}
          />
        </div>
        <Select
          aria-label={t('Type')}
          value={feature}
          onChange={(e) => { setFeature(e.target.value); setPage(1); }}
          placeholder={t('All types')}
          options={Object.entries(FEATURE_LABEL).filter(([k]) => isAdmin || k !== 'guardian_chat').map(([value, label]) => ({ value, label: t(label) }))}
        />
      </div>

      {query.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}</div>
      ) : query.isError ? (
        <ErrorState title={t('Could not load drafts')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />
      ) : !query.data?.data.length ? (
        <EmptyState title={tab === 'DRAFT' ? t('Nothing to review') : t('No drafts here')} description={t('Drafts from report comments, fee reminders, message drafts and guardian questions appear here.')} icon={<Inbox className="w-10 h-10 text-slate-400" />} />
      ) : (
        <div className="space-y-3">
          {query.data.data.map((d) => <DraftCard key={d.id} draft={d} />)}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" variant="ghost" leftIcon={<ChevronLeft className="w-4 h-4" />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('Previous')}</Button>
              <span className="text-sm text-slate-600 dark:text-slate-300">{t('Page {p} of {n}', { p: page, n: totalPages })}</span>
              <Button size="sm" variant="ghost" rightIcon={<ChevronRight className="w-4 h-4" />} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('Next')}</Button>
            </div>
          )}
        </div>
      )}

      <BulkCommentsModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  );
}

function DraftContext({ draft }: { draft: Draft }) {
  const t = useT();
  const c = draft.context;
  if (!c) return null;
  if (c.kind === 'examResult') {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        <Link to={`/students/${c.student.id}`} className="font-medium text-primary-700 dark:text-primary-300 hover:underline">{c.student.name}</Link>
        {' · '}{c.exam} · {c.subject}: {c.marks}/{c.maxMarks}{c.grade ? ` (${c.grade})` : ''}
        {c.currentRemarks && <span className="block text-xs text-slate-500 mt-0.5">{t('Current remark')}: {c.currentRemarks}</span>}
      </p>
    );
  }
  if (c.kind === 'student') {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        <Link to={`/students/${c.student.id}`} className="font-medium text-primary-700 dark:text-primary-300 hover:underline">{c.student.name}</Link> · {c.student.registrationNumber}
      </p>
    );
  }
  if (c.kind === 'guardianQuestion') {
    return (
      <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3 text-sm">
        <p className="text-xs text-slate-500 mb-1">{t('{name} asked on {date}', { name: c.askedBy, date: formatDate(c.askedAt, true) })}</p>
        <p className="text-slate-800 dark:text-slate-200">{c.question}</p>
      </div>
    );
  }
  return <p className="text-xs text-slate-500">{c.channel}</p>;
}

function DraftCard({ draft }: { draft: Draft }) {
  const t = useT();
  const qc = useQueryClient();
  const [text, setText] = useState(draft.content);
  const [confirmReject, setConfirmReject] = useState(false);
  useEffect(() => setText(draft.content), [draft.content]);
  const dirty = text.trim() !== draft.content.trim();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ai', 'drafts'] });
    qc.invalidateQueries({ queryKey: ['ai', 'status'] });
  };

  const save = useMutation({
    mutationFn: async () => apiClient.patch(`/ai/drafts/${draft.id}`, { content: text.trim() }),
    onSuccess: () => { toast.success(t('Draft updated')); invalidate(); },
    onError: (e) => toast.error(errorMessage(e, t('Could not save the draft.'))),
  });
  const approve = useMutation({
    mutationFn: async () => apiClient.post(`/ai/drafts/${draft.id}/approve`, dirty ? { content: text.trim() } : {}),
    onSuccess: () => {
      toast.success(draft.feature === 'report_comment' ? t('Approved — remark saved to the result') : draft.feature === 'guardian_chat' ? t('Approved — the guardian can now see the reply') : t('Approved'));
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e, t('Could not approve the draft.'))),
  });
  const reject = useMutation({
    mutationFn: async () => apiClient.post(`/ai/drafts/${draft.id}/reject`, {}),
    onSuccess: () => { toast.success(t('Draft rejected')); setConfirmReject(false); invalidate(); },
    onError: (e) => toast.error(errorMessage(e, t('Could not reject the draft.'))),
  });

  const pending = draft.status === 'DRAFT';
  const smsLen = draft.context?.kind === 'message' || draft.feature === 'fee_reminder' ? text.length : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{t(FEATURE_LABEL[draft.feature] ?? draft.feature)}</Badge>
          <Badge variant={STATUS_VARIANT[draft.status]}>{t(draft.status === 'DRAFT' ? 'Awaiting review' : draft.status.charAt(0) + draft.status.slice(1).toLowerCase())}</Badge>
          {draft.context?.kind === 'message' && <Badge variant="neutral">{draft.context.channel}</Badge>}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {draft.createdBy ? `${draft.createdBy.firstName} ${draft.createdBy.lastName}`.trim() : ''} · {formatDate(draft.createdAt, true)}
        </span>
      </div>
      <div className="space-y-3">
        <DraftContext draft={draft} />
        <AiGeneratedNotice>
          {pending ? (
            <Textarea aria-label={t('Draft text')} rows={Math.min(10, Math.max(3, Math.ceil(text.length / 90)))} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
          ) : (
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line">{draft.content}</p>
          )}
          {smsLen !== null && pending && <p className="text-xs text-slate-500 mt-1">{t('{n} characters', { n: formatNumber(smsLen) })}</p>}
        </AiGeneratedNotice>
        {pending ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" leftIcon={<Check className="w-4 h-4" />} isLoading={approve.isPending} disabled={!text.trim()} onClick={() => approve.mutate()}>
              {dirty ? t('Save & approve') : t('Approve')}
            </Button>
            <Button size="sm" variant="secondary" leftIcon={<Save className="w-4 h-4" />} isLoading={save.isPending} disabled={!dirty || !text.trim()} onClick={() => save.mutate()}>
              {t('Save edit')}
            </Button>
            <Button size="sm" variant="danger-soft" leftIcon={<X className="w-4 h-4" />} onClick={() => setConfirmReject(true)}>
              {t('Reject')}
            </Button>
          </div>
        ) : (
          draft.reviewedBy && (
            <p className="text-xs text-slate-500">{t('Reviewed by {name} on {date}', { name: `${draft.reviewedBy.firstName} ${draft.reviewedBy.lastName}`.trim(), date: formatDate(draft.reviewedAt, true) })}</p>
          )
        )}
      </div>
      <ConfirmModal
        isOpen={confirmReject}
        onCancel={() => setConfirmReject(false)}
        onConfirm={() => reject.mutate()}
        variant="danger"
        title={t('Reject this draft?')}
        message={draft.feature === 'guardian_chat' ? t('The guardian will see the question as closed without a reply.') : t('The draft will not be used.')}
        confirmLabel={t('Reject')}
        isLoading={reject.isPending}
      />
    </Card>
  );
}

interface BulkResult extends AiMode {
  exam: { name: string };
  created: number;
  totalResults: number;
  skipped: { existingDraft: number; hasRemarks: number; overLimit: number };
}

function BulkCommentsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subject, setSubject] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const classes = useClassOptions(isOpen);
  const sections = useSectionOptions(classId);
  const exams = useQuery({
    queryKey: ['ai', 'exam-options'],
    queryFn: async (): Promise<{ id: string; name: string }[]> => ((await apiClient.get('/results', { params: { pageSize: 100 } })).data.data || []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  });

  const run = useMutation({
    mutationFn: async (): Promise<BulkResult> =>
      (await apiClient.post('/ai/comments/bulk', { examId, classId, sectionId: sectionId || undefined, subject: subject.trim() || undefined, overwrite, language })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'drafts'] }),
  });

  const close = () => { run.reset(); onClose(); };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={t('Generate report-card comments')}
      description={t('Creates one draft comment per exam result. Approving a draft writes it into that result’s remarks.')}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>{run.data ? t('Done') : t('Cancel')}</Button>
          {!run.data && <Button isLoading={run.isPending} disabled={!examId || !classId} onClick={() => run.mutate()}>{t('Generate drafts')}</Button>}
        </div>
      }
    >
      {run.data ? (
        <div className="space-y-3">
          <DemoAlert mode={run.data} />
          <Alert tone="success" title={t('{n} drafts created', { n: run.data.created })}>
            {t('{total} results in {exam}. Skipped: {a} already drafted, {b} already have remarks, {c} over the 150-per-run limit.', {
              total: run.data.totalResults,
              exam: run.data.exam.name,
              a: run.data.skipped.existingDraft,
              b: run.data.skipped.hasRemarks,
              c: run.data.skipped.overLimit,
            })}
          </Alert>
        </div>
      ) : (
        <div className="space-y-3">
          <Select label={t('Exam')} required value={examId} onChange={(e) => setExamId(e.target.value)} placeholder={t('Select exam')} options={(exams.data ?? []).map((e) => ({ value: e.id, label: e.name }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('Class')} required value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }} placeholder={t('Select class')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            <Select label={t('Section')} value={sectionId} onChange={(e) => setSectionId(e.target.value)} placeholder={t('All sections')} disabled={!classId} options={(sections.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Textarea label={t('Subject (optional)')} rows={1} value={subject} onChange={(e) => setSubject(e.target.value)} helperText={t('Exact subject name; empty = all subjects')} />
            <Select label={t('Language')} value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'bn')} options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />
          </div>
          <Checkbox label={t('Also draft for results that already have remarks')} checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          {run.isError && <Alert tone="danger">{errorMessage(run.error, t('Could not generate drafts.'))}</Alert>}
        </div>
      )}
    </Modal>
  );
}
