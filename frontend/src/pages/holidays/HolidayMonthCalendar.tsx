import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit2, Trash2 } from 'lucide-react';
import type { Holiday, HolidayType } from '@/api/holiday.api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_DOT: Record<HolidayType, string> = {
  GOVERNMENT: 'bg-emerald-500',
  SCHOOL: 'bg-sky-500',
  WEEKLY: 'bg-slate-400',
};

const isoDay = (date: string) => date.slice(0, 10);

interface HolidayMonthCalendarProps {
  year: number;
  holidays: Holiday[];
  isAdmin: boolean;
  onEdit: (h: Holiday) => void;
  onDelete: (h: Holiday) => void;
}

export default function HolidayMonthCalendar({ year, holidays, isAdmin, onEdit, onDelete }: HolidayMonthCalendarProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getFullYear() === year ? now.getMonth() : 0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const key = isoDay(h.date);
      const list = map.get(key) ?? [];
      list.push(h);
      map.set(key, list);
    }
    return map;
  }, [holidays]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const startWeekday = firstOfMonth.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const list: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < startWeekday; i++) list.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      list.push({ date, day: d });
    }
    return list;
  }, [year, month]);

  const selectedHolidays = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => Math.max(0, m - 1))}
          disabled={month === 0}
          aria-label="Previous month"
          className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{MONTH_NAMES[month]} {year}</h4>
        <button
          type="button"
          onClick={() => setMonth((m) => Math.min(11, m + 1))}
          disabled={month === 11}
          aria-label="Next month"
          className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {WEEKDAY_LABELS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          const dayHolidays = c.date ? byDay.get(c.date) ?? [] : [];
          const isSelected = c.date === selectedDay;
          return (
            <button
              type="button"
              key={i}
              disabled={!c.date}
              onClick={() => c.date && setSelectedDay(isSelected ? null : c.date)}
              className={`aspect-square rounded-lg border text-xs flex flex-col items-center justify-start gap-0.5 pt-1 transition-colors ${
                !c.date
                  ? 'border-transparent'
                  : isSelected
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                    : dayHolidays.length > 0
                      ? 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:border-primary-400'
                      : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              {c.day && <span className="text-slate-700 dark:text-slate-300">{c.day}</span>}
              {dayHolidays.length > 0 && (
                <span className="flex gap-0.5">
                  {dayHolidays.slice(0, 3).map((h) => (
                    <span key={h.id} className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[h.type]}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="glass-card rounded-xl border border-slate-200/50 dark:border-white/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
          {selectedHolidays.length === 0 ? (
            <p className="text-sm text-slate-500">No holidays on this day.</p>
          ) : (
            selectedHolidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[h.type]}`} />
                  <span className="font-medium text-slate-900 dark:text-white truncate">{h.title}</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEdit(h)}
                      aria-label={`Edit ${h.title}`}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(h)}
                      aria-label={`Delete ${h.title}`}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
