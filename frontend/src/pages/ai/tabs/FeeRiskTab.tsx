import { useState } from 'react';
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageSquareText, Wallet, AlarmClock } from 'lucide-react';
import apiClient from '../../../api/client';
import { Alert, Button, Modal, Select, StatCard, ErrorState, SkeletonStatGrid, AiGeneratedNotice } from '../../../components/ui';
import { DataTable, type Column } from '../../../components/DataTable/DataTable';
import { useT, formatCurrency, formatDate, formatNumber } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import { RiskBadge, DemoAlert, ModeChip } from '../aiShared';
import { useClassOptions, errorMessage, type AiMode, type PageMeta, type RiskLevel } from '../aiUtils';

interface FeeRow {
  id: string;
  studentId: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  className: string | null;
  sectionName: string | null;
  score: number;
  level: RiskLevel;
  outstandingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  oldestOverdueDays: number;
  latePaidCount: number;
  paidInvoices: number;
  avgDaysLate: number;
  nextDueDate: string | null;
  suggestedReminderDate: string | null;
  reason: string;
}

interface FeeResponse {
  data: Omit<FeeRow, 'id'>[];
  meta: PageMeta;
  summary: { HIGH: number; MEDIUM: number; LOW: number; total: number; totalOutstanding: number; totalOverdue: number; remindToday: number };
}

interface ReminderResult extends AiMode {
  text: string;
  sms: { characters: number; encoding: string; segments: number; note: string };
}

export default function FeeRiskTab() {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const canReview = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [level, setLevel] = useState('');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<FeeRow | null>(null);
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [tone, setTone] = useState<'formal' | 'friendly' | 'urgent'>('formal');
  const classes = useClassOptions();

  const query = useQuery({
    queryKey: ['ai', 'fee-risk', { page, pageSize, level, classId, search }],
    queryFn: async (): Promise<FeeResponse> =>
      (await apiClient.get('/ai/fee-risk', { params: { page, pageSize, level: level || undefined, classId: classId || undefined, search: search || undefined } })).data,
    placeholderData: keepPreviousData,
  });

  const draft = useMutation({
    mutationFn: async (studentId: string): Promise<ReminderResult> =>
      (await apiClient.post(`/ai/fee-risk/${studentId}/draft-reminder`, { language, tone })).data.data,
  });

  const rows: FeeRow[] = (query.data?.data ?? []).map((r) => ({ ...r, id: r.studentId }));
  const today = new Date().setHours(0, 0, 0, 0);

  const columns: Column<FeeRow>[] = [
    {
      key: 'student',
      header: t('Student'),
      primary: true,
      accessor: 'firstName',
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{r.firstName} {r.lastName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{r.registrationNumber}{r.className ? ` · ${r.className}` : ''}</div>
        </div>
      ),
      exportValue: (r) => `${r.firstName} ${r.lastName}`,
    },
    { key: 'level', header: t('Risk'), accessor: 'level', render: (r) => <div className="flex items-center gap-2"><RiskBadge level={r.level} /><span className="text-xs tabular-nums text-slate-500">{r.score}</span></div> },
    { key: 'outstandingAmount', header: t('Outstanding'), accessor: 'outstandingAmount', align: 'right', render: (r) => formatCurrency(r.outstandingAmount) },
    {
      key: 'overdueAmount',
      header: t('Overdue'),
      accessor: 'overdueAmount',
      align: 'right',
      render: (r) => (r.overdueCount ? <span className="text-red-600 dark:text-red-400">{formatCurrency(r.overdueAmount)} <span className="text-xs">({t('{n} days', { n: r.oldestOverdueDays })})</span></span> : '—'),
    },
    { key: 'history', header: t('Paid late before'), hideOnMobile: true, sortable: false, render: (r) => (r.paidInvoices ? `${r.latePaidCount}/${r.paidInvoices}` : '—'), exportValue: (r) => `${r.latePaidCount}/${r.paidInvoices}` },
    {
      key: 'suggestedReminderDate',
      header: t('Remind on'),
      accessor: 'suggestedReminderDate',
      render: (r) =>
        r.suggestedReminderDate ? (
          <span className={new Date(r.suggestedReminderDate).getTime() <= today ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}>
            {new Date(r.suggestedReminderDate).getTime() <= today ? t('Today') : formatDate(r.suggestedReminderDate)}
          </span>
        ) : '—',
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (r) => (
        <Button size="xs" variant="secondary" leftIcon={<MessageSquareText className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); draft.reset(); setTarget(r); }}>
          {t('Draft reminder')}
        </Button>
      ),
    },
  ];

  const s = query.data?.summary;

  return (
    <div className="space-y-4">
      {query.isLoading ? (
        <SkeletonStatGrid count={3} />
      ) : s ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label={t('Outstanding (students with dues)')} value={formatCurrency(s.totalOutstanding)} tone="danger" icon={<Wallet className="w-5 h-5" />} hint={t('{n} students', { n: formatNumber(s.total) })} />
          <StatCard label={t('High collection risk')} value={formatNumber(s.HIGH)} tone="warning" onClick={() => { setLevel('HIGH'); setPage(1); }} hint={t('Overdue: {v}', { v: formatCurrency(s.totalOverdue) })} />
          <StatCard label={t('Remind today')} value={formatNumber(s.remindToday)} tone="info" icon={<AlarmClock className="w-5 h-5" />} />
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState title={t('Could not load fee risk')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />
      ) : (
        <DataTable<FeeRow>
          data={rows}
          columns={columns}
          isLoading={query.isLoading}
          serverPagination
          totalCount={query.data?.meta.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          serverSearch
          onSearch={(q) => { setSearch(q); setPage(1); }}
          searchPlaceholder={t('Search name or ID…')}
          exportFileName="ai-fee-risk"
          emptyTitle={t('No outstanding dues')}
          emptyDescription={t('No active student currently has unpaid fees.')}
          toolbar={
            <div className="flex flex-wrap gap-2">
              <Select aria-label={t('Risk level')} value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} placeholder={t('All levels')}
                options={[{ value: 'HIGH', label: t('High') }, { value: 'MEDIUM', label: t('Medium') }, { value: 'LOW', label: t('Low') }]} />
              <Select aria-label={t('Class')} value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }} placeholder={t('All classes')}
                options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </div>
          }
        />
      )}

      <Modal
        isOpen={!!target}
        onClose={() => setTarget(null)}
        title={target ? t('Reminder SMS for {name}', { name: target.firstName }) : ''}
        description={target?.reason}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)}>{t('Close')}</Button>
            {!draft.data && (
              <Button isLoading={draft.isPending} onClick={() => target && draft.mutate(target.studentId)}>{t('Generate draft')}</Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {!draft.data && (
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('Language')} value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'bn')} options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />
              <Select label={t('Tone')} value={tone} onChange={(e) => setTone(e.target.value as 'formal' | 'friendly' | 'urgent')}
                options={[{ value: 'formal', label: t('Formal') }, { value: 'friendly', label: t('Friendly') }, { value: 'urgent', label: t('Urgent') }]} />
            </div>
          )}
          {draft.isError && <Alert tone="danger">{errorMessage(draft.error, t('Could not draft the reminder.'))}</Alert>}
          {draft.data && (
            <>
              <DemoAlert mode={draft.data} />
              <AiGeneratedNotice>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line">{draft.data.text}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{draft.data.sms.note}</p>
                <div className="mt-1"><ModeChip mode={draft.data} /></div>
              </AiGeneratedNotice>
              <Alert tone="info">
                {t('Saved to the AI review queue as a draft. Nothing has been sent — a staff member must approve it, then send it from Communication.')}{' '}
                {canReview && <Link to="/ai/review" className="font-semibold underline">{t('Open review queue')}</Link>}
              </Alert>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
