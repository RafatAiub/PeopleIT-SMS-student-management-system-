import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Percent, AlertTriangle, CalendarDays } from 'lucide-react';
import apiClient from '../../api/client';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { Checkbox, ErrorState, SkeletonStatGrid, StatCard } from '../../components/ui';
import { useT, formatNumber } from '../../i18n';
import ClassSectionPicker from '../subject-attendance/ClassSectionPicker';

interface SummaryRow {
  id: string;
  studentId: string;
  name: string;
  rollNumber: string | null;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  total: number;
  percentage: number | null;
  chronic: boolean;
}

interface MonthlySummary {
  month: string;
  className: string;
  sectionName: string;
  threshold: number;
  workingDays: number;
  students: SummaryRow[];
  totals: {
    present: number;
    absent: number;
    late: number;
    halfDay: number;
    total: number;
    percentage: number | null;
    studentCount: number;
    chronicCount: number;
  };
}

const currentMonth = () => new Date().toISOString().slice(0, 7);
const pct = (p: number | null) => (p === null ? '—' : `${p}%`);

/**
 * Monthly summary (GET /attendance/summary) — SA/A/T/ACC. TEACHER picks from
 * their own class/timetable sections; the backend enforces the same scope.
 */
export function AttendanceMonthlySummary({ isTeacher }: { isTeacher: boolean }) {
  const t = useT();
  const [month, setMonth] = useState(currentMonth());
  const [className, setClassName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [chronicOnly, setChronicOnly] = useState(false);
  const onClassChange = useCallback((c: string, s: string) => {
    setClassName(c);
    setSectionName(s);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance-summary', month, className, sectionName],
    queryFn: async (): Promise<MonthlySummary> =>
      (await apiClient.get('/attendance/summary', { params: { month, className, sectionName } })).data.data,
    enabled: !!month && !!className && !!sectionName,
  });

  const rows = (data?.students ?? []).filter((r) => !chronicOnly || r.chronic);

  const columns: Column<SummaryRow>[] = [
    { key: 'rollNumber', header: t('Roll'), accessor: 'rollNumber', sortable: true, hideOnMobile: true, exportValue: (r) => r.rollNumber ?? '' },
    {
      key: 'name',
      header: t('Student'),
      accessor: 'name',
      primary: true,
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div>
            <div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>
            <div className="text-xs text-slate-500">{r.studentId}</div>
          </div>
          {r.chronic && (
            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-[10px] font-bold uppercase">
              {t('Chronic')}
            </span>
          )}
        </div>
      ),
      exportValue: (r) => r.name,
    },
    { key: 'studentId', header: t('Student ID'), accessor: 'studentId', defaultHidden: true },
    { key: 'present', header: t('Present'), accessor: 'present', align: 'right', sortable: true },
    { key: 'absent', header: t('Absent'), accessor: 'absent', align: 'right', sortable: true },
    { key: 'late', header: t('Late'), accessor: 'late', align: 'right', sortable: true, hideOnMobile: true },
    { key: 'halfDay', header: t('Half day'), accessor: 'halfDay', align: 'right', sortable: true, hideOnMobile: true },
    { key: 'total', header: t('Days marked'), accessor: 'total', align: 'right', sortable: true, hideOnMobile: true },
    {
      key: 'percentage',
      header: t('Attendance %'),
      accessor: 'percentage',
      align: 'right',
      sortable: true,
      render: (r) => (
        <span className={r.chronic ? 'text-rose-700 dark:text-rose-400 font-bold' : r.percentage === null ? 'text-slate-500' : 'text-slate-900 dark:text-white'}>
          {pct(r.percentage)}
        </span>
      ),
      exportValue: (r) => r.percentage ?? '',
    },
    { key: 'chronic', header: t('Below 75%'), defaultHidden: true, exportValue: (r) => (r.chronic ? 'Yes' : 'No'), render: (r) => (r.chronic ? t('Yes') : t('No')) },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 rounded-2xl flex flex-wrap items-end gap-3 border border-slate-200/60 dark:border-white/5">
        <ClassSectionPicker isTeacher={isTeacher} className={className} sectionName={sectionName} onChange={onClassChange} idPrefix="att-summary" />
        <div className="flex flex-col">
          <label htmlFor="att-summary-month" className="field-label">{t('Month')}</label>
          <input
            id="att-summary-month"
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="input-field py-2 min-w-[160px]"
          />
        </div>
        <Checkbox label={t('Chronic absentees only (<75%)')} checked={chronicOnly} onChange={(e) => setChronicOnly(e.target.checked)} />
      </div>

      {isLoading && className && sectionName ? (
        <SkeletonStatGrid />
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t('Students')} value={formatNumber(data.totals.studentCount)} icon={<Users />} tone="info" />
          <StatCard label={t('Class attendance')} value={pct(data.totals.percentage)} icon={<Percent />} tone="success" />
          <StatCard label={t('Days with records')} value={formatNumber(data.workingDays)} icon={<CalendarDays />} tone="neutral" />
          <StatCard
            label={t('Chronic absentees')}
            value={formatNumber(data.totals.chronicCount)}
            icon={<AlertTriangle />}
            tone={data.totals.chronicCount ? 'danger' : 'neutral'}
            hint={t('Below {n}%', { n: data.threshold })}
          />
        </div>
      ) : null}

      {isError ? (
        <div className="glass-card rounded-2xl">
          <ErrorState message={t('Could not load the monthly summary.')} onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-4">
          <DataTable
            data={rows}
            columns={columns}
            isLoading={isLoading && !!className && !!sectionName}
            exportFileName={`attendance-summary-${className}-${sectionName}-${month}`}
            emptyTitle={chronicOnly ? t('No chronic absentees this month') : t('No students in this section')}
            emptyDescription={t('Attendance % = (present + late + ½ half-day) ÷ days marked.')}
          />
        </div>
      )}
    </div>
  );
}
