import React, { useState } from 'react';
import { Users, Percent, CalendarOff, AlertTriangle } from 'lucide-react';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { Drawer, ErrorState, Skeleton, SkeletonStatGrid, StatCard } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT, formatDate, formatNumber } from '@/i18n';
import { currentMonth, useStaffDetail, useStaffReport, type StaffReportRow } from './staffAttendance.queries';
import { formatTime, percentTone, staffStatusOption } from './staffStatus';

const pct = (p: number | null) => (p === null ? '—' : `${p}%`);

export default function StaffAttendanceReport() {
  const t = useT();
  const [month, setMonth] = useState(currentMonth());
  const [detailFor, setDetailFor] = useState<StaffReportRow | null>(null);
  const { data, isLoading, isError, refetch } = useStaffReport(month);
  const detail = useStaffDetail(detailFor?.userId ?? null, month);

  const columns: Column<StaffReportRow>[] = [
    {
      key: 'name',
      header: t('Staff'),
      accessor: 'name',
      primary: true,
      sortable: true,
      render: (r) => (
        <>
          <div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>
          <div className="text-xs text-slate-500">{[r.designation || r.role, r.department].filter(Boolean).join(' · ')}</div>
        </>
      ),
      exportValue: (r) => r.name,
    },
    { key: 'department', header: t('Department'), accessor: 'department', defaultHidden: true, exportValue: (r) => r.department ?? '' },
    { key: 'present', header: t('Present'), accessor: 'present', align: 'right', sortable: true },
    { key: 'absent', header: t('Absent'), accessor: 'absent', align: 'right', sortable: true },
    { key: 'late', header: t('Late'), accessor: 'late', align: 'right', sortable: true, hideOnMobile: true },
    { key: 'leave', header: t('Leave'), accessor: 'leave', align: 'right', sortable: true, hideOnMobile: true },
    { key: 'halfDay', header: t('Half day'), accessor: 'halfDay', align: 'right', sortable: true, hideOnMobile: true },
    {
      key: 'percentage',
      header: t('Attendance %'),
      accessor: 'percentage',
      align: 'right',
      sortable: true,
      render: (r) => <span className={percentTone(r.percentage)}>{pct(r.percentage)}</span>,
      exportValue: (r) => r.percentage ?? '',
    },
  ];

  const lowCount = data?.rows.filter((r) => r.percentage !== null && r.percentage < 75).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label htmlFor="staff-report-month" className="field-label">{t('Month')}</label>
          <input
            id="staff-report-month"
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="input-field py-2 min-w-[160px]"
          />
        </div>
        <p className="text-xs text-slate-500 max-w-md">
          {t('Attendance % = (present + late + ½ half-day) ÷ marked working days. Approved leave days are excluded.')}
        </p>
      </div>

      {isLoading ? (
        <SkeletonStatGrid />
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t('Staff')} value={formatNumber(data.totals.staffCount)} icon={<Users />} tone="info" />
          <StatCard label={t('Overall attendance')} value={pct(data.totals.percentage)} icon={<Percent />} tone="success" />
          <StatCard label={t('Leave days')} value={formatNumber(data.totals.leave)} icon={<CalendarOff />} tone="accent" />
          <StatCard label={t('Below 75%')} value={formatNumber(lowCount)} icon={<AlertTriangle />} tone={lowCount ? 'danger' : 'neutral'} />
        </div>
      ) : null}

      {isError ? (
        <div className="glass-card rounded-2xl">
          <ErrorState message={t('Could not load the staff attendance report.')} onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-4">
          <DataTable
            data={data?.rows ?? []}
            columns={columns}
            isLoading={isLoading}
            exportFileName={`staff-attendance-${month}`}
            onRowClick={setDetailFor}
            emptyTitle={t('No staff found')}
            emptyDescription={t('Mark the daily staff register to build this report.')}
          />
        </div>
      )}

      <Drawer
        isOpen={!!detailFor}
        onClose={() => setDetailFor(null)}
        title={detailFor?.name ?? ''}
        description={t('Daily record for {month}', { month })}
        width="md"
      >
        {detail.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : detail.isError ? (
          <ErrorState message={t('Could not load this staff member’s record.')} onRetry={() => detail.refetch()} compact />
        ) : !detail.data || detail.data.days.length === 0 ? (
          <EmptyState compact title={t('Nothing marked this month')} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              {t('Attendance')}: <span className={percentTone(detail.data.percentage)}>{pct(detail.data.percentage)}</span>
            </p>
            {detail.data.approvedLeaves.length > 0 && (
              <div className="text-xs text-violet-700 dark:text-violet-400 space-y-0.5">
                {detail.data.approvedLeaves.map((l, i) => (
                  <p key={i}>{t('Approved leave')}: {formatDate(l.startDate)} – {formatDate(l.endDate)}{l.leaveType ? ` (${l.leaveType})` : ''}</p>
                ))}
              </div>
            )}
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {detail.data.days.map((d) => {
                const opt = staffStatusOption(d.status);
                return (
                  <li key={d.date} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <span>{formatDate(d.date)}</span>
                    <span className="text-xs text-slate-500">{d.checkIn ? `${formatTime(d.checkIn)} – ${formatTime(d.checkOut)}` : ''}</span>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${opt?.pillClass ?? ''}`}>{opt ? t(opt.label) : d.status}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Drawer>
    </div>
  );
}
