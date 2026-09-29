import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import apiClient from '../../../api/client';
import { Alert, Badge, Button, Card, CardHeader, StatCard, ErrorState, SkeletonStatGrid, AiGeneratedNotice } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import { DataTable, type Column } from '../../../components/DataTable/DataTable';
import { EmptyState } from '../../../components/common/EmptyState';
import { useT, formatNumber } from '../../../i18n';
import { DemoAlert, ModeChip } from '../aiShared';
import { errorMessage, type AiMode } from '../aiUtils';

interface Forecast {
  forecast: number;
  low: number;
  high: number;
  slope: number;
  r2: number | null;
  n: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  method: string;
  note: string;
}

interface ClassForecast extends Forecast {
  classId: string | null;
  className: string;
  history: { year: number; count: number }[];
  trend: 'UP' | 'DOWN' | 'FLAT';
}
type ClassRow = ClassForecast & { id: string };

interface ForecastResponse {
  targetYear: number;
  disclaimer: string;
  total: Forecast & { history: { year: number; count: number }[] };
  classes: ClassForecast[];
  narrative: ({ text: string } & AiMode) | null;
}

const CONF: Record<string, BadgeVariant> = { HIGH: 'success', MEDIUM: 'warning', LOW: 'neutral' };

export default function ForecastTab() {
  const t = useT();
  const [narrative, setNarrative] = useState(false);
  const query = useQuery({
    queryKey: ['ai', 'forecast', narrative],
    queryFn: async (): Promise<ForecastResponse> => (await apiClient.get('/ai/enrolment-forecast', { params: { narrative: narrative || undefined } })).data.data,
  });

  if (query.isLoading) return <SkeletonStatGrid count={3} />;
  if (query.isError) return <ErrorState title={t('Could not build the forecast')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />;
  const d = query.data!;
  if (!d.total.history.length) return <EmptyState title={t('No admission history yet')} description={t('Forecasts need students with admission dates.')} />;

  const last = d.total.history[d.total.history.length - 1];
  const rows: ClassRow[] = d.classes.map((c) => ({ ...c, id: c.classId ?? 'none' }));
  const years = d.total.history.slice(-5).map((h) => h.year);

  const columns: Column<ClassRow>[] = [
    { key: 'className', header: t('Class'), accessor: 'className', primary: true },
    ...years.map((y) => ({
      key: `y${y}`,
      header: String(y),
      align: 'right' as const,
      hideOnMobile: true,
      sortable: false,
      render: (r: ClassRow) => r.history.find((h) => h.year === y)?.count ?? 0,
      exportValue: (r: ClassRow) => r.history.find((h) => h.year === y)?.count ?? 0,
    })),
    {
      key: 'forecast',
      header: t('Forecast {y}', { y: d.targetYear }),
      accessor: 'forecast',
      align: 'right',
      render: (r) => (
        <span className="font-bold tabular-nums">
          {r.forecast} <span className="text-xs font-normal text-slate-500">({r.low}–{r.high})</span>
        </span>
      ),
    },
    {
      key: 'trend',
      header: t('Trend'),
      accessor: 'trend',
      render: (r) => (r.trend === 'UP' ? <TrendingUp className="w-4 h-4 text-emerald-600" aria-label={t('Up')} /> : r.trend === 'DOWN' ? <TrendingDown className="w-4 h-4 text-red-600" aria-label={t('Down')} /> : <Minus className="w-4 h-4 text-slate-400" aria-label={t('Flat')} />),
    },
    { key: 'confidence', header: t('Confidence'), accessor: 'confidence', render: (r) => <Badge variant={CONF[r.confidence]}>{t(r.confidence === 'HIGH' ? 'High' : r.confidence === 'MEDIUM' ? 'Medium' : 'Low')}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <Alert tone="info" title={t('Statistical estimate')}>{d.disclaimer}</Alert>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label={t('Forecast new admissions {y}', { y: d.targetYear })} value={formatNumber(d.total.forecast)} tone="primary" hint={t('Range {a}–{b}', { a: d.total.low, b: d.total.high })} />
        <StatCard label={t('Admissions {y}', { y: last.year })} value={formatNumber(last.count)} tone="info" hint={t('Counted to date')} />
        <StatCard label={t('Confidence')} value={t(d.total.confidence === 'HIGH' ? 'High' : d.total.confidence === 'MEDIUM' ? 'Medium' : 'Low')} tone={d.total.confidence === 'HIGH' ? 'success' : 'warning'} hint={d.total.note} />
      </div>

      <div>
        <Button variant="secondary" size="sm" leftIcon={<Sparkles className="w-4 h-4" />} isLoading={narrative && query.isFetching} onClick={() => setNarrative(true)}>
          {t('Explain the forecast')}
        </Button>
      </div>
      {d.narrative && (
        <>
          <DemoAlert mode={d.narrative} />
          <AiGeneratedNotice>
            <p className="text-sm text-slate-800 dark:text-slate-200">{d.narrative.text}</p>
            <div className="mt-2"><ModeChip mode={d.narrative} /></div>
          </AiGeneratedNotice>
        </>
      )}

      <Card flush>
        <div className="p-5 pb-0"><CardHeader title={t('By class')} description={t('Admissions per year and next-year estimate.')} /></div>
        <DataTable<ClassRow> data={rows} columns={columns} exportFileName="ai-enrolment-forecast" emptyTitle={t('No class data')} />
      </Card>
    </div>
  );
}
