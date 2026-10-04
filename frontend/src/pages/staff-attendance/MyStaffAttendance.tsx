import React, { useState } from 'react';
import { Percent, CheckCircle2, XCircle, CalendarOff } from 'lucide-react';
import { ErrorState, PageHeader, Skeleton, SkeletonStatGrid, StatCard } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT, formatDate, formatNumber } from '@/i18n';
import { currentMonth, useMyStaffAttendance } from './staffAttendance.queries';
import { formatTime, percentTone, staffStatusOption } from './staffStatus';

/** Staff self-view (ADMIN, TEACHER, ACCOUNTANT, LIBRARIAN, TRANSPORT_OFFICER, MANAGEMENT). */
export default function MyStaffAttendance() {
  const t = useT();
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading, isError, refetch } = useMyStaffAttendance(month);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={t('My Attendance')}
        description={t('Your staff attendance record, including QR check-in and check-out times.')}
        actions={
          <input
            type="month"
            aria-label={t('Month')}
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="input-field py-2"
          />
        }
      />
      {isLoading ? (
        <>
          <SkeletonStatGrid />
          <Skeleton className="h-64 rounded-2xl" />
        </>
      ) : isError ? (
        <div className="glass-card rounded-2xl">
          <ErrorState message={t('Could not load your attendance.')} onRetry={() => refetch()} />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label={t('Attendance')}
              value={<span className={percentTone(data.percentage)}>{data.percentage === null ? '—' : `${data.percentage}%`}</span>}
              icon={<Percent />}
              tone="info"
            />
            <StatCard label={t('Present')} value={formatNumber(data.counts.present + data.counts.late)} icon={<CheckCircle2 />} tone="success" hint={t('incl. late')} />
            <StatCard label={t('Absent')} value={formatNumber(data.counts.absent)} icon={<XCircle />} tone="danger" />
            <StatCard label={t('Leave')} value={formatNumber(data.counts.leave)} icon={<CalendarOff />} tone="accent" />
          </div>
          <div className="glass-card rounded-2xl p-4">
            {data.days.length === 0 ? (
              <EmptyState compact title={t('Nothing marked this month')} />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {data.days.map((d) => {
                  const opt = staffStatusOption(d.status);
                  return (
                    <li key={d.date} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{formatDate(d.date)}</span>
                      <span className="text-xs text-slate-500">{d.checkIn ? `${formatTime(d.checkIn)} – ${formatTime(d.checkOut)}` : ''}</span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${opt?.pillClass ?? ''}`}>{opt ? t(opt.label) : d.status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
