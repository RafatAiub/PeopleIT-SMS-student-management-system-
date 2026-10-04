import React, { useMemo, useState } from 'react';
import { Printer, Trophy, Users, CheckCircle2, Percent } from 'lucide-react';
import { Badge, Button, ErrorState, Modal, PageHeader, Select, StatCard } from '../../components/ui';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { EmptyState } from '../../components/common/EmptyState';
import { PrintLayout, SignatureLines } from '../../components/print/PrintLayout';
import { useT, formatNumber } from '../../i18n';
import { ClassExamFilters, type ClassExamValue } from './ClassExamFilters';
import { useMeritList, type MeritList as MeritListData, type MeritRow } from './insights.queries';

const fmt2 = (n: number) => formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MeritPrint: React.FC<{ data: MeritListData }> = ({ data }) => {
  const t = useT();
  return (
    <PrintLayout
      title={t('Merit List')}
      reference={`${data.exam.name} · ${data.className}${data.sectionName ? ` – ${data.sectionName}` : ''}`}
      footer={
        <>
          <p>
            {t('Ranked by {by}. Equal scores share a rank. Grading: {scale}.', {
              by: data.rankBy === 'percent' ? t('percentage') : t('total marks'),
              scale: data.scale.name,
            })}
          </p>
          <SignatureLines labels={[t('Class Teacher'), t('Exam Controller'), t('Principal')]} />
        </>
      }
    >
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100">
            {[t('Rank'), t('Roll'), t('Student'), t('Section'), t('Total'), '%', t('GPA'), t('Grade'), t('Result')].map((h) => (
              <th key={h} className="border border-slate-300 px-2 py-1 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((r) => (
            <tr key={r.id}>
              <td className="border border-slate-300 px-2 py-1 font-semibold">{r.rank}</td>
              <td className="border border-slate-300 px-2 py-1">{r.rollNumber ?? '—'}</td>
              <td className="border border-slate-300 px-2 py-1">{r.name} <span className="text-slate-500">({r.studentCode})</span></td>
              <td className="border border-slate-300 px-2 py-1">{r.sectionName ?? '—'}</td>
              <td className="border border-slate-300 px-2 py-1 tabular-nums">{formatNumber(r.totalObtained)} / {formatNumber(r.totalMax)}</td>
              <td className="border border-slate-300 px-2 py-1 tabular-nums">{fmt2(r.percent)}</td>
              <td className="border border-slate-300 px-2 py-1 tabular-nums">{fmt2(r.gpa)}</td>
              <td className="border border-slate-300 px-2 py-1">{r.grade}</td>
              <td className="border border-slate-300 px-2 py-1">{r.passed ? t('Pass') : t('Fail')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintLayout>
  );
};

/** Route: /results/merit-list — SUPER_ADMIN, ADMIN, TEACHER (backend STAFF_ROLES). */
const MeritList: React.FC = () => {
  const t = useT();
  const [filters, setFilters] = useState<ClassExamValue>({ examId: '', classId: '', sectionId: '' });
  const [rankBy, setRankBy] = useState<'total' | 'percent'>('total');
  const [printOpen, setPrintOpen] = useState(false);
  const ready = !!filters.examId && !!filters.classId;
  const query = useMeritList({ ...filters, rankBy }, ready);
  const data = query.data;

  const columns: Column<MeritRow>[] = useMemo(() => {
    const base: Column<MeritRow>[] = [
      {
        key: 'rank',
        header: t('Rank'),
        render: (r) => (
          <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
            {r.rank <= 3 && <Trophy className="w-3.5 h-3.5 text-amber-500" aria-hidden />}
            {r.rank}
          </span>
        ),
        exportValue: (r) => r.rank,
      },
      {
        key: 'name',
        header: t('Student'),
        primary: true,
        render: (r) => (
          <div>
            <div className="font-medium text-slate-900 dark:text-white">{r.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {r.studentCode}
              {r.rollNumber ? ` · ${t('Roll')} ${r.rollNumber}` : ''}
              {r.sectionName ? ` · ${r.sectionName}` : ''}
            </div>
          </div>
        ),
        exportValue: (r) => `${r.name} (${r.studentCode})`,
      },
      { key: 'rollNumber', header: t('Roll'), accessor: 'rollNumber', defaultHidden: true, exportValue: (r) => r.rollNumber ?? '' },
      {
        key: 'total',
        header: t('Total'),
        align: 'right',
        render: (r) => <span className="tabular-nums">{formatNumber(r.totalObtained)} / {formatNumber(r.totalMax)}</span>,
        exportValue: (r) => r.totalObtained,
      },
      { key: 'percent', header: '%', align: 'right', render: (r) => <span className="tabular-nums">{fmt2(r.percent)}</span>, exportValue: (r) => r.percent },
      { key: 'gpa', header: t('GPA'), align: 'right', render: (r) => <span className="tabular-nums">{fmt2(r.gpa)}</span>, exportValue: (r) => r.gpa },
      { key: 'grade', header: t('Grade'), render: (r) => <span className="font-semibold">{r.grade}</span>, exportValue: (r) => r.grade },
      {
        key: 'result',
        header: t('Result'),
        render: (r) => (
          <Badge variant={r.passed ? 'success' : 'danger'} dot>
            {r.passed ? t('Pass') : t('Fail')}
          </Badge>
        ),
        exportValue: (r) => (r.passed ? 'Pass' : `Fail (${r.failedSubjects.join(', ')})`),
      },
    ];
    const subjectCols: Column<MeritRow>[] = (data?.subjects ?? []).map((s) => ({
      key: `sub:${s}`,
      header: s,
      align: 'right' as const,
      defaultHidden: true,
      hideOnMobile: true,
      render: (r: MeritRow) => (r.marks[s] ? `${formatNumber(r.marks[s].marksObtained)} (${r.marks[s].grade})` : '—'),
      exportValue: (r: MeritRow) => (r.marks[s] ? r.marks[s].marksObtained : ''),
    }));
    return [...base, ...subjectCols];
  }, [data?.subjects, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Merit list')}
        description={t('Class ranking for an exam by total marks or percentage. Equal scores share a rank.')}
        breadcrumbs={[{ label: t('Results'), to: '/results' }, { label: t('Merit list') }]}
        actions={
          <Button variant="secondary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => setPrintOpen(true)} disabled={!data || data.items.length === 0}>
            {t('Print')}
          </Button>
        }
      />

      <div className="glass-card p-4">
        <ClassExamFilters value={filters} onChange={setFilters}>
          <Select
            label={t('Rank by')}
            value={rankBy}
            onChange={(e) => setRankBy(e.target.value as 'total' | 'percent')}
            options={[
              { value: 'total', label: t('Total marks') },
              { value: 'percent', label: t('Percentage') },
            ]}
          />
        </ClassExamFilters>
      </div>

      {!ready ? (
        <EmptyState icon={<Trophy className="w-6 h-6" />} title={t('Choose an exam and class')} description={t('The merit list appears once an exam and class are selected.')} />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : (
        <>
          {data && data.items.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label={t('Students ranked')} value={formatNumber(data.stats.students)} icon={<Users />} tone="info" />
              <StatCard label={t('Passed')} value={formatNumber(data.stats.passed)} icon={<CheckCircle2 />} tone="success" />
              <StatCard label={t('Highest %')} value={fmt2(data.stats.highestPercent)} icon={<Percent />} tone="accent" />
              <StatCard label={t('Grading scale')} value={<span className="text-base">{data.scale.name}</span>} tone="neutral" />
            </div>
          )}
          <DataTable
            data={data?.items ?? []}
            columns={columns}
            isLoading={query.isLoading}
            exportFileName={data ? `merit-list-${data.exam.name}-${data.className}${data.sectionName ? `-${data.sectionName}` : ''}` : 'merit-list'}
            emptyTitle={t('No results for this selection')}
            emptyDescription={t('Marks have not been entered for this exam and class yet.')}
            pageSize={50}
          />
        </>
      )}

      <Modal isOpen={printOpen} onClose={() => setPrintOpen(false)} size="full">
        {data && <MeritPrint data={data} />}
      </Modal>
    </div>
  );
};

export default MeritList;
