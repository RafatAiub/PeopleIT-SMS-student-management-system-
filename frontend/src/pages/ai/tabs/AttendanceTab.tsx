import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarX, TrendingDown, TrendingUp, Minus, Sparkles } from 'lucide-react';
import apiClient from '../../../api/client';
import { Badge, Button, Card, CardHeader, Select, StatCard, ErrorState, SkeletonStatGrid, AiGeneratedNotice } from '../../../components/ui';
import { DataTable, type Column } from '../../../components/DataTable/DataTable';
import { EmptyState } from '../../../components/common/EmptyState';
import { useT, formatDate, formatNumber } from '../../../i18n';
import { DemoAlert, ModeChip } from '../aiShared';
import { useClassOptions, errorMessage, type AiMode, type PageMeta } from '../aiUtils';

interface PatternItem {
  type: 'CONSECUTIVE' | 'DROP';
  studentId: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  className: string | null;
  sectionName: string | null;
  run?: { start: string; end: string; length: number; ongoing: boolean };
  runCount?: number;
  previousRate?: number | null;
  recentRate?: number | null;
  delta?: number | null;
}
type PatternRow = PatternItem & { id: string };

interface ClassTrendRow {
  className: string;
  students: number;
  direction: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';
  previousRate: number | null;
  recentRate: number | null;
  delta: number | null;
}

interface PatternResponse {
  data: PatternItem[];
  meta: PageMeta;
  counts: { consecutive: number; drops: number };
  classTrends: ClassTrendRow[];
  overall: { previousRate: number | null; recentRate: number | null; delta: number | null; direction: string };
  summary: ({ text: string } & AiMode) | null;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${formatNumber(v, { maximumFractionDigits: 1 })}%`);

export default function AttendanceTab() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [type, setType] = useState('');
  const [classId, setClassId] = useState('');
  const [wantSummary, setWantSummary] = useState(false);
  const classes = useClassOptions();

  const query = useQuery({
    queryKey: ['ai', 'attendance-patterns', { page, pageSize, type, classId, wantSummary }],
    queryFn: async (): Promise<PatternResponse> =>
      (
        await apiClient.get('/ai/attendance-patterns', {
          params: { page, pageSize, type: type || undefined, classId: classId || undefined, summary: wantSummary || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const rows: PatternRow[] = (query.data?.data ?? []).map((r) => ({ ...r, id: `${r.type}-${r.studentId}` }));

  const columns: Column<PatternRow>[] = [
    {
      key: 'student',
      header: t('Student'),
      primary: true,
      accessor: 'firstName',
      render: (r) => (
        <Link to={`/students/${r.studentId}`} className="hover:underline">
          <div className="font-semibold text-slate-900 dark:text-white">{r.firstName} {r.lastName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{r.registrationNumber}{r.className ? ` · ${r.className}${r.sectionName ? ` ${r.sectionName}` : ''}` : ''}</div>
        </Link>
      ),
      exportValue: (r) => `${r.firstName} ${r.lastName}`,
    },
    {
      key: 'type',
      header: t('Pattern'),
      accessor: 'type',
      render: (r) => (r.type === 'CONSECUTIVE' ? <Badge variant="danger">{t('Consecutive absences')}</Badge> : <Badge variant="warning">{t('Sudden drop')}</Badge>),
    },
    {
      key: 'detail',
      header: t('Detail'),
      sortable: false,
      render: (r) =>
        r.type === 'CONSECUTIVE' && r.run ? (
          <span className="text-sm">
            {t('{n} school days in a row', { n: r.run.length })} ({formatDate(r.run.start)} – {formatDate(r.run.end)})
            {r.run.ongoing && <Badge variant="danger" className="ml-2">{t('Still absent')}</Badge>}
          </span>
        ) : (
          <span className="text-sm">
            {pct(r.previousRate)} → {pct(r.recentRate)} <span className="text-red-600 dark:text-red-400">({formatNumber(r.delta ?? 0, { maximumFractionDigits: 1 })} {t('pts')})</span>
          </span>
        ),
      exportValue: (r) => (r.type === 'CONSECUTIVE' ? `${r.run?.length} days` : `${r.previousRate} -> ${r.recentRate}`),
    },
  ];

  const d = query.data;
  const trendIcon = (dir: string) =>
    dir === 'IMPROVING' ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : dir === 'DECLINING' ? <TrendingDown className="w-4 h-4 text-red-600" /> : <Minus className="w-4 h-4 text-slate-400" />;

  return (
    <div className="space-y-4">
      {query.isLoading ? (
        <SkeletonStatGrid count={3} />
      ) : d ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label={t('3+ days absent in a row')} value={formatNumber(d.counts.consecutive)} tone="danger" icon={<CalendarX className="w-5 h-5" />} onClick={() => { setType('CONSECUTIVE'); setPage(1); }} />
          <StatCard label={t('Sudden drops')} value={formatNumber(d.counts.drops)} tone="warning" hint={t('Last 14 days vs previous 30')} onClick={() => { setType('DROP'); setPage(1); }} />
          <StatCard label={t('Overall attendance (14 days)')} value={pct(d.overall.recentRate)} tone="info" hint={t('Previous 30 days: {v}', { v: pct(d.overall.previousRate) })} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Sparkles className="w-4 h-4" />} isLoading={wantSummary && query.isFetching} onClick={() => setWantSummary(true)}>
          {t('Summarise patterns')}
        </Button>
      </div>
      {d?.summary && (
        <>
          <DemoAlert mode={d.summary} />
          <AiGeneratedNotice>
            <p className="text-sm text-slate-800 dark:text-slate-200">{d.summary.text}</p>
            <div className="mt-2"><ModeChip mode={d.summary} /></div>
          </AiGeneratedNotice>
        </>
      )}

      {query.isError ? (
        <ErrorState title={t('Could not load attendance patterns')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />
      ) : (
        <DataTable<PatternRow>
          data={rows}
          columns={columns}
          isLoading={query.isLoading}
          serverPagination
          totalCount={d?.meta.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          exportFileName="ai-attendance-patterns"
          emptyTitle={t('No concerning patterns')}
          emptyDescription={t('No student has 3+ consecutive absences or a sudden attendance drop.')}
          toolbar={
            <div className="flex flex-wrap gap-2">
              <Select aria-label={t('Pattern')} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} placeholder={t('All patterns')}
                options={[{ value: 'CONSECUTIVE', label: t('Consecutive absences') }, { value: 'DROP', label: t('Sudden drop') }]} />
              <Select aria-label={t('Class')} value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }} placeholder={t('All classes')}
                options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </div>
          }
        />
      )}

      <Card>
        <CardHeader title={t('Class trends')} description={t('Attendance rate, last 14 days vs the previous 30 days.')} />
        {query.isLoading ? null : !d || d.classTrends.length === 0 ? (
          <EmptyState compact title={t('No class data')} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {d.classTrends.map((c) => (
              <li key={c.className} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  {trendIcon(c.direction)}
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{c.className}</span>
                  <span className="text-xs text-slate-500">{t('{n} students', { n: c.students })}</span>
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                  {c.direction === 'INSUFFICIENT_DATA' ? t('Not enough data') : `${pct(c.previousRate)} → ${pct(c.recentRate)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
