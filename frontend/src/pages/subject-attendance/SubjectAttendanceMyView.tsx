import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import apiClient from '@/api/client';
import { ErrorState, PageHeader, Select, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT, formatDate } from '@/i18n';
import { useStudentSubjectView } from './subjectAttendance.queries';

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

const STATUS_LABEL: Record<string, string> = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', HALF_DAY: 'Half day' };
const STATUS_CLASS: Record<string, string> = {
  PRESENT: 'text-emerald-700 dark:text-emerald-400',
  ABSENT: 'text-rose-700 dark:text-rose-400',
  LATE: 'text-amber-700 dark:text-amber-400',
  HALF_DAY: 'text-blue-700 dark:text-blue-400',
};

export default function SubjectAttendanceMyView({ mode }: { mode: 'student' | 'guardian' }) {
  const t = useT();
  const [childId, setChildId] = useState<string | null>(null);

  const children = useQuery({
    queryKey: ['guardian-children-subject-att'],
    queryFn: async (): Promise<Child[]> => (await apiClient.get('/guardians/me/students')).data.data || [],
    enabled: mode === 'guardian',
  });
  useEffect(() => {
    if (!childId && children.data?.length) setChildId(children.data[0].id);
  }, [children.data, childId]);

  const view = useStudentSubjectView(mode, childId);

  const loading = view.isLoading || (mode === 'guardian' && children.isLoading);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={mode === 'student' ? t('My Subject Attendance') : t('Child’s Subject Attendance')}
        description={t('Attendance percentage for each subject, from period-wise registers.')}
        actions={
          mode === 'guardian' && (children.data?.length ?? 0) > 1 ? (
            <Select
              aria-label={t('Viewing child')}
              value={childId ?? ''}
              onChange={(e) => setChildId(e.target.value)}
              options={(children.data ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName} (${c.studentId})` }))}
            />
          ) : undefined
        }
      />
      {mode === 'guardian' && children.isError ? (
        <div className="glass-card rounded-2xl"><ErrorState message={t('Could not load your children.')} onRetry={() => children.refetch()} /></div>
      ) : mode === 'guardian' && !children.isLoading && (children.data?.length ?? 0) === 0 ? (
        <div className="glass-card rounded-2xl"><EmptyState title={t('No linked children')} description={t('Contact your institution administrator.')} /></div>
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : view.isError ? (
        <div className="glass-card rounded-2xl"><ErrorState message={t('Could not load subject attendance.')} onRetry={() => view.refetch()} /></div>
      ) : !view.data || view.data.subjects.length === 0 ? (
        <div className="glass-card rounded-2xl"><EmptyState icon={<BookOpen />} title={t('No subject attendance recorded yet')} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {view.data.subjects.map((s) => (
              <div key={s.subjectName} className="glass-card rounded-xl p-4">
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{s.subjectName}</p>
                <p className={`text-2xl font-semibold ${s.percentage !== null && s.percentage < 75 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                  {s.percentage === null ? '—' : `${s.percentage}%`}
                </p>
                <p className="text-xs text-slate-500">
                  {t('{a} of {b} classes attended', { a: s.present + s.late, b: s.total })}
                  {s.halfDay ? ` · ${t('{n} half', { n: s.halfDay })}` : ''}
                </p>
              </div>
            ))}
          </div>
          <div className="glass-card rounded-2xl p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('Recent classes')}</h3>
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {view.data.recent.map((r, i) => (
                <li key={i} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{formatDate(r.date)}{r.period ? ` · ${t('Period')} ${r.period}` : ''}</span>
                  <span className="text-slate-600 dark:text-slate-400">{r.subjectName}</span>
                  <span className={`font-semibold ${STATUS_CLASS[r.status] ?? ''}`}>{t(STATUS_LABEL[r.status] ?? r.status)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
