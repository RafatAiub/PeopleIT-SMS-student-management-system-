import React, { useMemo, useState } from 'react';
import { CalendarDays, UserCheck, Coins, XCircle, Clock3 } from 'lucide-react';
import { StatCard, Skeleton, SkeletonStatGrid } from '../../components/ui';
import { ErrorState } from '../../components/ui/Feedback';
import { EmptyState } from '../../components/common/EmptyState';
import { AttendanceHeatmap, type HeatmapDay } from '../../components/Charts/AttendanceHeatmap';
import { formatDate } from '../../i18n';
import { STATUS_OPTIONS, statusToRate } from './attendanceStatus';

export interface AttendanceHistoryRecord {
  id: string;
  date: string;
  status: string;
  notes?: string | null;
}

interface AttendanceMyViewProps {
  records: AttendanceHistoryRecord[];
  finesDue?: number;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  /** Rendered above the stat cards — e.g. the guardian's child switcher. */
  headerActions?: React.ReactNode;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Read-only "My attendance" view shared by Student and Guardian roles. */
export const AttendanceMyView: React.FC<AttendanceMyViewProps> = ({
  records,
  finesDue = 0,
  isLoading,
  isError,
  onRetry,
  headerActions,
}) => {
  const [month, setMonth] = useState(() => monthKey(new Date()));

  const monthRecords = useMemo(
    () => records.filter((r) => monthKey(new Date(r.date)) === month),
    [records, month]
  );

  const stats = useMemo(() => {
    const totals = { present: 0, absent: 0, late: 0, halfDay: 0 };
    monthRecords.forEach((r) => {
      if (r.status === 'PRESENT') totals.present++;
      else if (r.status === 'ABSENT') totals.absent++;
      else if (r.status === 'LATE') totals.late++;
      else if (r.status === 'HALF_DAY') totals.halfDay++;
    });
    const totalDays = monthRecords.length;
    const percentage = totalDays
      ? Math.round(((totals.present + totals.late + totals.halfDay * 0.5) / totalDays) * 100)
      : 0;
    return { ...totals, totalDays, percentage };
  }, [monthRecords]);

  const heatmapDays: HeatmapDay[] = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const byDate = new Map(monthRecords.map((r) => [r.date.slice(0, 10), r]));
    const out: HeatmapDay[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const record = byDate.get(dateStr);
      out.push({
        date: dateStr,
        rate: record ? statusToRate(record.status) : null,
        detail: record ? record.status : undefined,
      });
    }
    return out;
  }, [month, monthRecords]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonStatGrid count={3} />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState title="Failed to load attendance" onRetry={onRetry} />;
  }

  return (
    <div className="space-y-6">
      {headerActions}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <CalendarDays className="w-4 h-4 text-primary-500" />
          Month
          <input
            type="month"
            value={month}
            max={monthKey(new Date())}
            onChange={(e) => setMonth(e.target.value)}
            className="input-field py-1.5 px-3 text-sm"
            aria-label="Select month"
          />
        </label>
      </div>

      {records.length === 0 ? (
        <EmptyState title="No attendance records found" description="Your attendance history will appear here once your teacher starts marking it." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Attendance rate" value={`${stats.percentage}%`} icon={<UserCheck />} tone="primary" hint="This month" />
            <StatCard label="Days present" value={stats.present} icon={<UserCheck />} tone="success" />
            <StatCard label="Days absent" value={stats.absent} icon={<XCircle />} tone="danger" />
            <StatCard label="Days late" value={stats.late} icon={<Clock3 />} tone="warning" />
          </div>

          {finesDue > 0 && (
            <StatCard label="Absentee fines due" value={`৳${finesDue}`} icon={<Coins />} tone="danger" hint="৳100 per day absent" className="max-w-sm" />
          )}

          <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Attendance heatmap — {month}</h3>
            <AttendanceHeatmap days={heatmapDays} title={`Attendance for ${month}`} />
          </div>

          <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-slate-200/50 dark:border-white/5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Attendance log — {month}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="p-4 pl-6">Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Absent fine impact</th>
                    <th className="p-4 pr-6">Notes / remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-sm text-slate-700 dark:text-slate-300">
                  {monthRecords.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                        No attendance records for this month.
                      </td>
                    </tr>
                  ) : (
                    monthRecords.map((record) => {
                      const opt = STATUS_OPTIONS.find((o) => o.value === record.status);
                      return (
                        <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors">
                          <td className="p-4 pl-6 font-semibold text-slate-900 dark:text-white">{formatDate(record.date)}</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${opt?.pillClass || 'bg-slate-100 text-slate-600'}`}>
                              {opt?.label || record.status}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-xs">
                            {record.status === 'ABSENT' ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold">+ ৳100</span>
                            ) : (
                              <span className="text-slate-500">৳0</span>
                            )}
                          </td>
                          <td className="p-4 pr-6 text-xs text-slate-500 dark:text-slate-400">{record.notes || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
