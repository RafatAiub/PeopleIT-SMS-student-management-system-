import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Clock, Sparkles, Users, ClipboardList } from 'lucide-react';
import apiClient from '../../../api/client';
import { Badge, Button, Select, StatCard, ErrorState, SkeletonStatGrid, AiGeneratedNotice } from '../../../components/ui';
import { DataTable, type Column } from '../../../components/DataTable/DataTable';
import { useT, formatNumber } from '../../../i18n';
import { DemoAlert, ModeChip } from '../aiShared';
import { errorMessage, type AiMode, type PageMeta } from '../aiUtils';

interface WorkloadRow {
  id: string;
  teacherId: string;
  name: string;
  employeeId: string | null;
  periodsPerWeek: number;
  sectionsTaught: number;
  subjectsTaught: number;
  assignmentsCreated: number;
  marksPending: number;
  loadFlag: 'HIGH' | 'LOW' | 'NORMAL';
  teaching: { className: string; sectionName: string; subject: string; periods: number }[];
}

interface WorkloadResponse {
  data: Omit<WorkloadRow, 'id'>[];
  meta: PageMeta;
  stats: { teacherCount: number; avgPeriods: number; maxPeriods: number; minPeriods: number; overloaded: number; underloaded: number; totalMarksPending: number };
  exam: { id: string; name: string } | null;
  summary: ({ text: string } & AiMode) | null;
}

export default function WorkloadTab() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [examId, setExamId] = useState('');
  const [wantSummary, setWantSummary] = useState(false);

  const exams = useQuery({
    queryKey: ['ai', 'exam-options'],
    queryFn: async (): Promise<{ id: string; name: string }[]> => ((await apiClient.get('/results', { params: { pageSize: 100 } })).data.data || []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })),
    staleTime: 5 * 60_000,
  });

  const query = useQuery({
    queryKey: ['ai', 'workload', { page, pageSize, examId, wantSummary }],
    queryFn: async (): Promise<WorkloadResponse> =>
      (await apiClient.get('/ai/teacher-workload', { params: { page, pageSize, examId: examId || undefined, summary: wantSummary || undefined } })).data,
    placeholderData: keepPreviousData,
  });

  const rows: WorkloadRow[] = (query.data?.data ?? []).map((r) => ({ ...r, id: r.teacherId }));
  const columns: Column<WorkloadRow>[] = [
    {
      key: 'name',
      header: t('Teacher'),
      primary: true,
      accessor: 'name',
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>
          {r.employeeId && <div className="text-xs text-slate-500">{r.employeeId}</div>}
        </div>
      ),
    },
    {
      key: 'periodsPerWeek',
      header: t('Periods / week'),
      accessor: 'periodsPerWeek',
      align: 'right',
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-bold tabular-nums">{r.periodsPerWeek}</span>
          {r.loadFlag === 'HIGH' && <Badge variant="danger">{t('Heavy')}</Badge>}
          {r.loadFlag === 'LOW' && <Badge variant="neutral">{t('Light')}</Badge>}
        </span>
      ),
    },
    { key: 'sectionsTaught', header: t('Sections'), accessor: 'sectionsTaught', align: 'right' },
    { key: 'subjectsTaught', header: t('Subjects'), accessor: 'subjectsTaught', align: 'right', hideOnMobile: true },
    { key: 'assignmentsCreated', header: t('Assignments (90 days)'), accessor: 'assignmentsCreated', align: 'right', hideOnMobile: true },
    { key: 'marksPending', header: t('Marks pending'), accessor: 'marksPending', align: 'right', render: (r) => (r.marksPending ? <span className="text-amber-700 dark:text-amber-300 font-semibold">{formatNumber(r.marksPending)}</span> : '0') },
    {
      key: 'teaching',
      header: t('Teaches'),
      sortable: false,
      hideOnMobile: true,
      defaultHidden: true,
      render: (r) => <span className="text-xs text-slate-600 dark:text-slate-300">{r.teaching.map((u) => `${u.className}-${u.sectionName} ${u.subject} (${u.periods})`).join(', ') || '—'}</span>,
      exportValue: (r) => r.teaching.map((u) => `${u.className}-${u.sectionName} ${u.subject} (${u.periods})`).join('; '),
    },
  ];

  const s = query.data?.stats;
  return (
    <div className="space-y-4">
      {query.isLoading ? (
        <SkeletonStatGrid count={3} />
      ) : s ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label={t('Average periods / week')} value={formatNumber(s.avgPeriods)} icon={<Clock className="w-5 h-5" />} tone="info" hint={t('Range {a}–{b}', { a: s.minPeriods, b: s.maxPeriods })} />
          <StatCard label={t('Heavier than average')} value={formatNumber(s.overloaded)} icon={<Users className="w-5 h-5" />} tone="warning" hint={t('{n} teachers', { n: s.teacherCount })} />
          <StatCard label={t('Marks pending')} value={formatNumber(s.totalMarksPending)} icon={<ClipboardList className="w-5 h-5" />} tone="danger" hint={query.data?.exam ? query.data.exam.name : t('No exam yet')} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <Select
          label={t('Exam for marks pending')}
          value={examId}
          onChange={(e) => { setExamId(e.target.value); setPage(1); }}
          placeholder={t('Latest exam')}
          options={(exams.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
        />
        <Button variant="secondary" size="sm" leftIcon={<Sparkles className="w-4 h-4" />} isLoading={wantSummary && query.isFetching} onClick={() => setWantSummary(true)}>
          {t('Summarise workload')}
        </Button>
      </div>

      {query.data?.summary && (
        <>
          <DemoAlert mode={query.data.summary} />
          <AiGeneratedNotice>
            <p className="text-sm text-slate-800 dark:text-slate-200">{query.data.summary.text}</p>
            <div className="mt-2"><ModeChip mode={query.data.summary} /></div>
          </AiGeneratedNotice>
        </>
      )}

      {query.isError ? (
        <ErrorState title={t('Could not load teacher workload')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />
      ) : (
        <DataTable<WorkloadRow>
          data={rows}
          columns={columns}
          isLoading={query.isLoading}
          serverPagination
          totalCount={query.data?.meta.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          exportFileName="ai-teacher-workload"
          emptyTitle={t('No teachers found')}
          emptyDescription={t('Add teachers and timetable slots to see workload.')}
        />
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t('Periods come from the class routine; marks pending = students in each class/section the teacher teaches minus results entered for that subject in the selected exam.')}
      </p>
    </div>
  );
}
