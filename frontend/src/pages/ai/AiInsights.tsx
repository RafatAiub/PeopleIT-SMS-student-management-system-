import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, AlertTriangle, ShieldAlert, Activity, Zap, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/Display';
import { Badge, type BadgeVariant } from '../../components/ui/Badge';
import { SkeletonStatGrid, SkeletonText } from '../../components/ui/Skeleton';
import { ErrorState, AiGeneratedNotice } from '../../components/ui/Feedback';
import { EmptyState } from '../../components/common/EmptyState';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { useT, formatCurrency, formatDate, formatNumber } from '../../i18n';

interface AtRiskStudent {
  studentId: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  attendanceRate: number;
  averageMarks: number;
  riskLevel: string;
  reason: string;
}

// DataTable requires an `id` field on every row; the API's own identifier is
// `studentId`, so this is a display-only alias, never sent back anywhere.
type AtRiskRow = AtRiskStudent & { id: string };

interface InsightsData {
  studentCount: number;
  staffCount: number;
  totalOutstandingDue: number;
  summary: string;
  generatedAt: string;
}

const RISK_BADGE: Record<string, BadgeVariant> = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'success' };

export default function AiInsights() {
  const t = useT();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const [insightsRes, riskScoringRes] = await Promise.all([
        apiClient.get('/ai/dashboard-insights'),
        apiClient.get('/ai/risk-scoring'),
      ]);
      setInsights(insightsRes.data?.data ?? null);
      setAtRiskStudents(riskScoringRes.data?.data ?? []);
      if (isRefresh) toast.success(t('AI Analytics and At-Risk prediction models refreshed successfully.'));
    } catch (err: any) {
      console.error('Failed to fetch AI insights:', err);
      setError(true);
      toast.error(err.response?.data?.message || t('Failed to load AI insights'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rawLines = insights?.summary ? insights.summary.split('\n').map((l) => l.trim()).filter((l) => l) : [];
  const bulletPoints = rawLines.filter((l) => l.startsWith('-'));
  const aiRecommendations = rawLines.filter((l) => /^\d+\./.test(l));
  const executiveText = rawLines.filter((l) => !l.startsWith('-') && !/^\d+\./.test(l) && !l.toLowerCase().includes('recommendation')).join(' ');

  const sortedStudents = [...atRiskStudents].sort((a, b) => {
    if (a.riskLevel === 'HIGH' && b.riskLevel !== 'HIGH') return -1;
    if (a.riskLevel !== 'HIGH' && b.riskLevel === 'HIGH') return 1;
    if (a.riskLevel === 'MEDIUM' && b.riskLevel === 'LOW') return -1;
    if (a.riskLevel === 'LOW' && b.riskLevel === 'MEDIUM') return 1;
    return 0;
  }).map((s) => ({ ...s, id: s.studentId }));

  const columns: Column<AtRiskRow>[] = [
    {
      key: 'name',
      header: t('Student'),
      primary: true,
      accessor: 'firstName',
      render: (row) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{row.firstName} {row.lastName}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500">{row.registrationNumber}</div>
        </div>
      ),
    },
    {
      key: 'attendanceRate',
      header: t('Attendance Rate'),
      accessor: 'attendanceRate',
      align: 'right',
      render: (row) => (
        <span className={row.attendanceRate < 80 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-semibold text-emerald-600 dark:text-emerald-400'}>
          {formatNumber(row.attendanceRate, { maximumFractionDigits: 1 })}%
        </span>
      ),
    },
    {
      key: 'averageMarks',
      header: t('Average Marks'),
      accessor: 'averageMarks',
      align: 'right',
      render: (row) => (
        <span className={row.averageMarks < 60 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-semibold text-slate-800 dark:text-slate-200'}>
          {formatNumber(row.averageMarks, { maximumFractionDigits: 1 })}%
        </span>
      ),
    },
    {
      key: 'riskLevel',
      header: t('Risk Level'),
      accessor: 'riskLevel',
      render: (row) => <Badge variant={RISK_BADGE[row.riskLevel] ?? 'neutral'}>{row.riskLevel}</Badge>,
    },
    {
      key: 'reason',
      header: t('Reason'),
      accessor: 'reason',
      sortable: false,
      hideOnMobile: true,
      render: (row) => (
        <span className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300 max-w-md">
          {row.riskLevel === 'HIGH' ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />}
          {row.reason}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            {t('AI-Driven Insights')}
          </span>
        }
        description={t('Rule-based statistics and student risk indicators, generated from your institution’s own data.')}
        actions={
          <Button onClick={() => fetchData(true)} disabled={loading || refreshing} isLoading={refreshing} leftIcon={<Brain className="w-4 h-4" />}>
            {refreshing ? t('Running Analysis...') : t('Recalculate Insights')}
          </Button>
        }
      />

      {error ? (
        <ErrorState
          title={t('Failed to load AI insights')}
          message={t('Something went wrong while generating insights for your institution.')}
          onRetry={() => fetchData()}
        />
      ) : loading ? (
        <div className="space-y-6">
          <SkeletonStatGrid count={3} />
          <div className="glass-card p-6 rounded-2xl">
            <SkeletonText lines={4} />
          </div>
        </div>
      ) : !insights ? (
        <EmptyState
          title={t('No insights available yet')}
          description={t('There is not enough data in your institution yet to generate AI insights.')}
          icon={<Brain className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col justify-between">
              <AiGeneratedNotice>
                <p className="text-xs text-blue-800/80 dark:text-blue-200/80 mb-3">
                  {t("Generated from your institution's data using rules; review before sharing.")}
                </p>
                <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 font-bold text-sm mb-3 uppercase tracking-widest">
                  <TrendingUp className="w-4.5 h-4.5" />
                  {t('Executive Summary')}
                </div>
                {executiveText && (
                  <p className="text-slate-800 dark:text-slate-200 text-base leading-relaxed font-light italic mb-4">
                    "{executiveText.replace('AI Executive Summary for Institution:', '').trim()}"
                  </p>
                )}
                {bulletPoints.length > 0 && (
                  <div className="space-y-2 bg-white/60 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-200/50 dark:border-white/5">
                    {bulletPoints.map((bp, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                        <span>{bp.replace('-', '').trim()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-blue-200/50 dark:border-blue-400/10 flex items-center justify-between text-xs text-slate-500 dark:text-slate-500 font-medium">
                  <span className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> {t('Rule-based analysis')}</span>
                  <span>{t('Generated at')}: {formatDate(insights.generatedAt, true)}</span>
                </div>
              </AiGeneratedNotice>
            </div>

            <div className="glass-card p-6 rounded-2xl space-y-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> {t('Metrics Overview')}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-white/5">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{t('Total Students')}</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">{formatNumber(insights.studentCount)}</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-white/5">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{t('Active Staff')}</span>
                  <span className="text-lg font-black text-primary-600 dark:text-primary-400">{formatNumber(insights.staffCount)}</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-white/5">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{t('Outstanding Due')}</span>
                  <span className="text-lg font-black text-rose-600 dark:text-rose-400">{formatCurrency(insights.totalOutstandingDue)}</span>
                </div>
              </div>
            </div>
          </div>

          {aiRecommendations.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400" /> {t('Actionable Recommendations')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiRecommendations.map((rec, idx) => {
                  const titleMatch = rec.match(/^\d+\.\s*(.*?):/);
                  const title = titleMatch ? titleMatch[1] : `${t('Recommendation')} ${idx + 1}`;
                  const content = rec.replace(/^\d+\.\s*(.*?):/, '').trim();
                  return (
                    <div key={idx} className="glass-card p-5 rounded-2xl border border-amber-200 dark:border-amber-500/10 bg-amber-50/50 dark:bg-amber-500/5 flex gap-4 shadow-xs">
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                        <span className="font-black">{idx + 1}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">{title}</h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{content || rec}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500 dark:text-rose-400" />
                {t('Risk Assessment Board')}
              </h3>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/5">
                {t('{n} Students Evaluated', { n: formatNumber(atRiskStudents.length) })}
              </span>
            </div>

            <DataTable<AtRiskRow>
              data={sortedStudents}
              columns={columns}
              isLoading={false}
              emptyTitle={t('No at-risk students found')}
              emptyDescription={t('Nobody currently meets the low-attendance or low-marks thresholds.')}
              exportFileName="ai-risk-scoring"
            />
          </div>
        </>
      )}
    </div>
  );
}
