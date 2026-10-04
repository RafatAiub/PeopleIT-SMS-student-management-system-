import React, { useMemo } from 'react';
import { LineChart as LineIcon } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ErrorState, Skeleton } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { chartAxis, chartColors, chartGrid, chartTooltipStyle } from '../../lib/chartTheme';
import { useT, formatNumber, formatDate } from '../../i18n';
import { useProgress } from './insights.queries';

interface Props {
  /** Student cuid, or "me" for the signed-in STUDENT. */
  studentId: string | null;
  /** Hide the student name line (when the host page already shows it). */
  compact?: boolean;
}

/**
 * Per-subject marks across exams in chronological order (GET
 * /results/progress/:studentId). Reusable — e.g. the StudentProfile
 * Academics tab can render <ProgressReport studentId={id} />.
 */
export const ProgressReport: React.FC<Props> = ({ studentId, compact }) => {
  const t = useT();
  const query = useProgress(studentId);
  const colors = chartColors();
  const data = query.data;

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.exams.map((exam, i) => {
      const row: Record<string, string | number | null> = { exam: exam.name, overall: exam.percent };
      for (const s of data.subjects) row[s.subject] = s.points[i]?.percent ?? null;
      return row;
    });
  }, [data]);

  if (!studentId) return null;
  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  if (!data || data.exams.length === 0) {
    return <EmptyState icon={<LineIcon className="w-6 h-6" />} title={t('No exam results yet')} description={t('Progress appears once marks are recorded for at least one exam.')} />;
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {data.student.firstName} {data.student.lastName} · {data.student.studentId}
          {data.student.class ? ` · ${data.student.class.name}${data.student.section ? ` ${data.student.section.name}` : ''}` : ''}
        </p>
      )}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('Percentage by subject')}</h3>
        {data.exams.length < 2 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('Only one exam so far — lines appear once there are two or more.')}</p>
        )}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="exam" {...chartAxis} interval={0} tick={{ ...chartAxis.tick, fontSize: 11 }} />
              <YAxis domain={[0, 100]} {...chartAxis} unit="%" />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number | string) => (v === null || v === undefined ? '—' : `${formatNumber(Number(v))}%`)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {data.subjects.map((s, i) => (
                <Line key={s.subject} type="monotone" dataKey={s.subject} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('Marks by subject and exam')}</caption>
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-300 sticky left-0 bg-slate-50 dark:bg-slate-900">{t('Subject')}</th>
                {data.exams.map((e) => (
                  <th key={e.id} scope="col" className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    <div>{e.name}</div>
                    <div className="text-[11px] font-normal text-slate-500">{formatDate(e.startDate)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((s) => (
                <tr key={s.subject} className="border-t border-slate-100 dark:border-white/5">
                  <th scope="row" className="text-left px-3 py-2 font-medium text-slate-900 dark:text-white sticky left-0 bg-white dark:bg-slate-900">{s.subject}</th>
                  {s.points.map((p) => (
                    <td key={p.examId} className="text-right px-3 py-2 tabular-nums whitespace-nowrap">
                      {p.marksObtained === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <>
                          {formatNumber(p.marksObtained)}/{formatNumber(p.maxMarks ?? 0)} <span className="text-xs text-slate-500">({p.grade})</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 dark:border-white/10 font-semibold">
                <th scope="row" className="text-left px-3 py-2 sticky left-0 bg-white dark:bg-slate-900">{t('Overall')}</th>
                {data.exams.map((e) => (
                  <td key={e.id} className="text-right px-3 py-2 tabular-nums whitespace-nowrap">
                    {formatNumber(e.percent)}% · {t('GPA')} {formatNumber(e.gpa, { minimumFractionDigits: 2 })}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('Grading scale: {name}', { name: data.scale.name })}</p>
    </div>
  );
};

export default ProgressReport;
