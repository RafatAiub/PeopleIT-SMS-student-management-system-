import React from 'react';
import { cn } from '../../lib/cn';
import { formatDate, formatNumber } from '../../i18n';

export interface HeatmapDay {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** Attendance rate 0–100, or null for no school day / no data. */
  rate: number | null;
  /** Optional detail for the tooltip, e.g. "212 / 240 present". */
  detail?: string;
}

interface AttendanceHeatmapProps {
  days: HeatmapDay[];
  /** Label for screen readers and the header. */
  title?: string;
  className?: string;
  onDayClick?: (day: HeatmapDay) => void;
}

// 5 steps, colour-blind-safe progression (neutral → green), plus red for low.
function cellClass(rate: number | null) {
  if (rate === null) return 'bg-slate-100 dark:bg-white/5';
  if (rate < 60) return 'bg-red-500/80';
  if (rate < 75) return 'bg-amber-400';
  if (rate < 85) return 'bg-emerald-200 dark:bg-emerald-800';
  if (rate < 95) return 'bg-emerald-400 dark:bg-emerald-600';
  return 'bg-emerald-600 dark:bg-emerald-400';
}

/**
 * Calendar heatmap (weeks as columns, Sat→Fri rows — Bangladesh school week).
 * Purely presentational: callers pass real per-day rates.
 */
export const AttendanceHeatmap: React.FC<AttendanceHeatmapProps> = ({ days, title = 'Attendance', className, onDayClick }) => {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  // Bangladesh week starts Saturday: JS getDay() 6 → row 0.
  const rowOf = (iso: string) => (new Date(`${iso}T00:00:00`).getDay() + 1) % 7;
  const columns: (HeatmapDay | null)[][] = [];
  let col: (HeatmapDay | null)[] = Array(7).fill(null);
  sorted.forEach((d, i) => {
    const r = rowOf(d.date);
    if (i > 0 && r === 0) {
      columns.push(col);
      col = Array(7).fill(null);
    }
    col[r] = d;
  });
  columns.push(col);
  const dayLabels = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  return (
    <figure className={cn('min-w-0', className)}>
      <figcaption className="sr-only">{title}</figcaption>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex flex-col gap-1 pt-0.5 text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
          {dayLabels.map((d) => (
            <span key={d} className="h-3.5 leading-3.5">{d}</span>
          ))}
        </div>
        <div className="flex gap-1" role="grid" aria-label={title}>
          {columns.map((c, ci) => (
            <div key={ci} className="flex flex-col gap-1" role="row">
              {c.map((d, ri) =>
                d ? (
                  <button
                    key={ri}
                    type="button"
                    role="gridcell"
                    onClick={onDayClick ? () => onDayClick(d) : undefined}
                    title={`${formatDate(d.date)} — ${d.rate === null ? 'No data' : `${formatNumber(Math.round(d.rate))}%`}${d.detail ? ` (${d.detail})` : ''}`}
                    aria-label={`${formatDate(d.date)}: ${d.rate === null ? 'no data' : `${Math.round(d.rate)} percent`}`}
                    className={cn('w-3.5 h-3.5 rounded-[3px] transition-transform hover:scale-125 focus-visible:scale-125', cellClass(d.rate), !onDayClick && 'cursor-default')}
                  />
                ) : (
                  <span key={ri} className="w-3.5 h-3.5" aria-hidden />
                )
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span>Low</span>
        {[50, 70, 80, 90, 100].map((r) => (
          <span key={r} className={cn('w-3 h-3 rounded-[3px]', cellClass(r))} aria-hidden />
        ))}
        <span>High</span>
      </div>
    </figure>
  );
};
