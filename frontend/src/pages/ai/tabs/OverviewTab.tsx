import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Users, Briefcase, Wallet, CalendarCheck, RefreshCw, Zap } from 'lucide-react';
import apiClient from '../../../api/client';
import { Button, Card, CardHeader, StatCard, ErrorState, SkeletonStatGrid, SkeletonText, AiGeneratedNotice } from '../../../components/ui';
import { EmptyState } from '../../../components/common/EmptyState';
import { useT, formatCurrency, formatDate, formatNumber } from '../../../i18n';
import { DemoAlert, ModeChip } from '../aiShared';
import { errorMessage, type AiMode } from '../aiUtils';

interface InsightsData extends AiMode {
  studentCount: number;
  staffCount: number;
  totalOutstandingDue: number;
  summary: string;
  generatedAt: string;
  statistics: {
    attendanceAvg: number;
    attendancePrevAvg: number | null;
    unpaidInvoiceCount?: number;
    overdueInvoiceCount?: number;
    collectedThisMonth?: number;
    newAdmissionsThisMonth?: number;
    pendingDrafts?: number | null;
    hasAttendanceData?: boolean;
  };
}

/** Splits the summary into intro text, "- " facts and "N. Title: text" recommendations. */
function parseSummary(summary: string) {
  const lines = summary.split('\n').map((l) => l.trim()).filter(Boolean);
  const facts = lines.filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, ''));
  const recs = lines.filter((l) => /^\d+\./.test(l)).map((l) => {
    const m = l.match(/^\d+\.\s*(.*?):\s*(.*)$/);
    return m ? { title: m[1], text: m[2] } : { title: '', text: l.replace(/^\d+\.\s*/, '') };
  });
  const intro = lines
    .filter((l) => !l.startsWith('-') && !/^\d+\./.test(l) && !/^(executive summary|recommendations|ai executive summary)/i.test(l))
    .join(' ');
  return { facts, recs, intro };
}

export default function OverviewTab() {
  const t = useT();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ai', 'dashboard-insights'],
    queryFn: async (): Promise<InsightsData> => (await apiClient.get('/ai/dashboard-insights')).data.data,
  });

  const refresh = async () => {
    const data = (await apiClient.get('/ai/dashboard-insights', { params: { refresh: true } })).data.data;
    qc.setQueryData(['ai', 'dashboard-insights'], data);
  };

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonStatGrid count={4} />
        <Card><SkeletonText lines={5} /></Card>
      </div>
    );
  }
  if (query.isError) return <ErrorState title={t('Failed to load AI insights')} message={errorMessage(query.error, '')} onRetry={() => query.refetch()} />;
  const d = query.data;
  if (!d) return <EmptyState title={t('No insights available yet')} icon={<Brain className="w-10 h-10 text-slate-400" />} />;

  const { facts, recs, intro } = parseSummary(d.summary);
  const s = d.statistics;

  return (
    <div className="space-y-5">
      <DemoAlert mode={d} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t('Active students')} value={formatNumber(d.studentCount)} icon={<Users className="w-5 h-5" />} tone="primary" />
        <StatCard label={t('Active staff')} value={formatNumber(d.staffCount)} icon={<Briefcase className="w-5 h-5" />} tone="info" />
        <StatCard
          label={t('Outstanding due')}
          value={formatCurrency(d.totalOutstandingDue)}
          icon={<Wallet className="w-5 h-5" />}
          tone="danger"
          hint={s.overdueInvoiceCount !== undefined ? t('{n} invoices past due', { n: formatNumber(s.overdueInvoiceCount) }) : undefined}
        />
        <StatCard
          label={t('Attendance (30 days)')}
          value={s.hasAttendanceData === false ? t('No records') : `${formatNumber(s.attendanceAvg, { maximumFractionDigits: 1 })}%`}
          icon={<CalendarCheck className="w-5 h-5" />}
          tone="success"
          hint={s.attendancePrevAvg != null ? t('Previous 30 days: {v}%', { v: formatNumber(s.attendancePrevAvg, { maximumFractionDigits: 1 }) }) : undefined}
        />
      </div>

      <AiGeneratedNotice>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">{t('Executive summary')}</h3>
          <Button variant="ghost" size="xs" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={refresh}>
            {t('Regenerate')}
          </Button>
        </div>
        {intro && <p className="text-sm text-slate-800 dark:text-slate-200 mb-3">{intro}</p>}
        {facts.length > 0 && (
          <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {facts.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 pt-2 border-t border-blue-200/60 dark:border-blue-400/15 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ModeChip mode={d} />
          <span>{t('Generated at')}: {formatDate(d.generatedAt, true)}</span>
        </div>
      </AiGeneratedNotice>

      {recs.length > 0 && (
        <Card>
          <CardHeader title={t('Recommendations')} icon={<Zap className="w-4 h-4" />} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recs.map((r, i) => (
              <div key={i} className="rounded-lg border border-amber-200 dark:border-amber-400/20 bg-amber-50/60 dark:bg-amber-500/5 p-4">
                {r.title && <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{r.title}</p>}
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{r.text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
