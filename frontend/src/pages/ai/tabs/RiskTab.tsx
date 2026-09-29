import { useState } from 'react';
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShieldAlert, Sparkles } from 'lucide-react';
import apiClient from '../../../api/client';
import { Button, Drawer, Select, StatCard, ErrorState, AiGeneratedNotice, SkeletonStatGrid } from '../../../components/ui';
import { DataTable, type Column } from '../../../components/DataTable/DataTable';
import { useT, formatNumber } from '../../../i18n';
import { RiskBadge, ContributionBar, DemoAlert, ModeChip } from '../aiShared';
import { useClassOptions, errorMessage, type AiMode, type PageMeta, type RiskLevel } from '../aiUtils';

interface RiskFactor {
  key: string;
  label: string;
  contribution: number;
  maxContribution: number;
  value: string;
  hasData: boolean;
  detail: string;
}

export interface RiskRow {
  id: string;
  studentId: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  className: string | null;
  sectionName: string | null;
  attendanceRate: number | null;
  averageMarks: number | null;
  score: number;
  level: RiskLevel;
  reason: string;
  factors: RiskFactor[];
  lateCount: number;
  missedAssignments: number;
}

interface RiskResponse {
  data: Omit<RiskRow, 'id'>[];
  meta: PageMeta;
  summary: { HIGH: number; MEDIUM: number; LOW: number; total: number };
  windowDays: number;
}

export default function RiskTab() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [level, setLevel] = useState('');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<RiskRow | null>(null);
  const classes = useClassOptions();

  const query = useQuery({
    queryKey: ['ai', 'risk', { page, pageSize, level, classId, search }],
    queryFn: async (): Promise<RiskResponse> =>
      (
        await apiClient.get('/ai/risk-scoring', {
          params: { page, pageSize, level: level || undefined, classId: classId || undefined, search: search || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const rows: RiskRow[] = (query.data?.data ?? []).map((r) => ({ ...r, id: r.studentId }));

  const columns: Column<RiskRow>[] = [
    {
      key: 'name',
      header: t('Student'),
      primary: true,
      accessor: 'firstName',
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{r.firstName} {r.lastName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {r.registrationNumber}
            {r.className ? ` · ${r.className}${r.sectionName ? ` ${r.sectionName}` : ''}` : ''}
          </div>
        </div>
      ),
      exportValue: (r) => `${r.firstName} ${r.lastName}`,
    },
    { key: 'score', header: t('Risk score'), accessor: 'score', align: 'right', render: (r) => <span className="font-bold tabular-nums">{r.score}</span> },
    { key: 'level', header: t('Level'), accessor: 'level', render: (r) => <RiskBadge level={r.level} /> },
    {
      key: 'attendanceRate',
      header: t('Attendance'),
      accessor: 'attendanceRate',
      align: 'right',
      render: (r) => (r.attendanceRate === null ? <span className="text-slate-400">{t('No records')}</span> : `${formatNumber(r.attendanceRate, { maximumFractionDigits: 1 })}%`),
      exportValue: (r) => r.attendanceRate,
    },
    {
      key: 'averageMarks',
      header: t('Average marks'),
      accessor: 'averageMarks',
      align: 'right',
      render: (r) => (r.averageMarks === null ? <span className="text-slate-400">{t('No results')}</span> : `${formatNumber(r.averageMarks, { maximumFractionDigits: 1 })}%`),
      exportValue: (r) => r.averageMarks,
    },
    { key: 'missedAssignments', header: t('Missed assignments'), accessor: 'missedAssignments', align: 'right', hideOnMobile: true },
    { key: 'reason', header: t('Main factors'), accessor: 'reason', sortable: false, hideOnMobile: true, render: (r) => <span className="text-sm text-slate-600 dark:text-slate-300">{r.reason}</span> },
  ];

  const s = query.data?.summary;

  return (
    <div className="space-y-4">
      {query.isLoading ? (
        <SkeletonStatGrid count={3} />
      ) : s ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label={t('High risk')} value={formatNumber(s.HIGH)} tone="danger" icon={<ShieldAlert className="w-5 h-5" />} onClick={() => { setLevel('HIGH'); setPage(1); }} />
          <StatCard label={t('Medium risk')} value={formatNumber(s.MEDIUM)} tone="warning" onClick={() => { setLevel('MEDIUM'); setPage(1); }} />
          <StatCard label={t('Low risk')} value={formatNumber(s.LOW)} tone="success" hint={t('{n} students evaluated', { n: formatNumber(s.total) })} onClick={() => { setLevel('LOW'); setPage(1); }} />
        </div>
      ) : null}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t('Score 0–100 computed from attendance (40), average marks (35), missed assignments (15) and late arrivals (10) over the last {d} days. Missing data counts as 0, never guessed.', { d: query.data?.windowDays ?? 120 })}
      </p>

      {query.isError ? (
        <ErrorState title={t('Could not load risk scores')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />
      ) : (
        <DataTable<RiskRow>
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
          onRowClick={setSelected}
          exportFileName="ai-risk-scoring"
          emptyTitle={t('No students match')}
          emptyDescription={t('Try another filter, or add attendance and exam results to score students.')}
          toolbar={
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label={t('Risk level')}
                value={level}
                onChange={(e) => { setLevel(e.target.value); setPage(1); }}
                placeholder={t('All levels')}
                options={[{ value: 'HIGH', label: t('High') }, { value: 'MEDIUM', label: t('Medium') }, { value: 'LOW', label: t('Low') }]}
              />
              <Select
                aria-label={t('Class')}
                value={classId}
                onChange={(e) => { setClassId(e.target.value); setPage(1); }}
                placeholder={t('All classes')}
                options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          }
        />
      )}

      <RiskDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function RiskDrawer({ row, onClose }: { row: RiskRow | null; onClose: () => void }) {
  const t = useT();
  const explain = useMutation({
    mutationFn: async (id: string): Promise<{ explanation: string } & AiMode> => (await apiClient.get(`/ai/risk-scoring/${id}/explain`)).data.data,
  });

  return (
    <Drawer
      isOpen={!!row}
      onClose={() => { explain.reset(); onClose(); }}
      title={row ? `${row.firstName} ${row.lastName}` : ''}
      description={row ? `${t('Risk score')} ${row.score}/100` : undefined}
      width="md"
      footer={
        row && (
          <Link to={`/students/${row.studentId}`} className="text-sm font-medium text-primary-700 dark:text-primary-300 hover:underline">
            {t('Open student profile')}
          </Link>
        )
      }
    >
      {row && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <RiskBadge level={row.level} />
            <span className="text-sm text-slate-600 dark:text-slate-300">{row.reason}</span>
          </div>
          <div className="space-y-4">
            {row.factors.map((f) => (
              <div key={f.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{t(f.label)}</span>
                  <span className="text-slate-500 dark:text-slate-400">{f.value}</span>
                </div>
                <ContributionBar value={f.contribution} max={f.maxContribution} label={f.label} />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{f.detail}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <Button variant="secondary" size="sm" leftIcon={<Sparkles className="w-4 h-4" />} isLoading={explain.isPending} onClick={() => explain.mutate(row.studentId)}>
              {t('Explain in plain language')}
            </Button>
            {explain.isError && <ErrorState compact message={errorMessage(explain.error, t('Could not generate an explanation.'))} onRetry={() => explain.mutate(row.studentId)} />}
            {explain.data && (
              <>
                <DemoAlert mode={explain.data} />
                <AiGeneratedNotice>
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line">{explain.data.explanation}</p>
                  <div className="mt-2"><ModeChip mode={explain.data} /></div>
                </AiGeneratedNotice>
              </>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
