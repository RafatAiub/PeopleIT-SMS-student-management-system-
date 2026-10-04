import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit2, Trash2, MapPin, Clock } from 'lucide-react';
import type { EventCategory, SchoolEvent } from '@/api/event.api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CATEGORY_DOT: Record<EventCategory, string> = {
  ACADEMIC: 'bg-indigo-500',
  SPORTS: 'bg-emerald-500',
  CULTURAL: 'bg-fuchsia-500',
  CELEBRATION: 'bg-amber-500',
  COMPETITION: 'bg-orange-500',
  EXAM: 'bg-rose-500',
  MEETING: 'bg-sky-500',
  TRIP: 'bg-teal-500',
  OTHER: 'bg-slate-400',
};

const isoDay = (date: string) => date.slice(0, 10);

interface EventMonthCalendarProps {
  events: SchoolEvent[];
  isAdmin: boolean;
  onEdit: (ev: SchoolEvent) => void;
  onDelete: (ev: SchoolEvent) => void;
  formatTiming: (ev: Pick<SchoolEvent, 'startTime' | 'endTime'>) => string;
}

export default function EventMonthCalendar({ events, isAdmin, onEdit, onDelete, formatTiming }: EventMonthCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, SchoolEvent[]>();
    for (const ev of events) {
      const start = isoDay(ev.startDate);
      const end = isoDay(ev.endDate);
      // Walk every calendar day the event spans so multi-day events show on each day.
      const cursor = new Date(`${start}T00:00:00Z`);
      const endDate = new Date(`${end}T00:00:00Z`);
      let guard = 0;
      while (cursor.getTime() <= endDate.getTime() && guard < 366) {
        const key = cursor.toISOString().slice(0, 10);
        const list = map.get(key) ?? [];
        list.push(ev);
        map.set(key, list);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        guard++;
      }
    }
    return map;
  }, [events]);

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

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };

  const selectedEvents = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={goPrev} aria-label="Previous month" className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{MONTH_NAMES[month]} {year}</h4>
        <button type="button" onClick={goNext} aria-label="Next month" className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {WEEKDAY_LABELS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          const dayEvents = c.date ? byDay.get(c.date) ?? [] : [];
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
                    : dayEvents.length > 0
                      ? 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:border-primary-400'
                      : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              {c.day && <span className="text-slate-700 dark:text-slate-300">{c.day}</span>}
              {dayEvents.length > 0 && (
                <span className="flex gap-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span key={ev.id} className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[ev.category]}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="glass-card rounded-xl border border-slate-200/50 dark:border-white/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No events on this day.</p>
          ) : (
            selectedEvents.map((ev) => (
              <div key={ev.id} className="flex items-start justify-between gap-3 pb-2 border-b border-slate-100 dark:border-white/5 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[ev.category]}`} />
                    <span className="font-medium text-slate-900 dark:text-white truncate">{ev.title}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTiming(ev)}</span>
                    {ev.venue && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.venue}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEdit(ev)}
                      aria-label={`Edit ${ev.title}`}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(ev)}
                      aria-label={`Delete ${ev.title}`}
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
