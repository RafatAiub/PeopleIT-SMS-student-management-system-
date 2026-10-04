import React, { useState, useEffect } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { useT } from '../../i18n';
import { dayLabel, formatTime12, type PeriodDef } from './timetableSettings';
import type { RoutineEntry } from './types';

interface TimetableMobileDayViewProps {
  days: string[];
  periods: PeriodDef[];
  routine: Record<string, Record<string, RoutineEntry>>;
  isEditor: boolean;
  loading: boolean;
  onDelete: (entry: RoutineEntry) => void;
  onMoveEdit: (day: string, startTime: string, entry?: RoutineEntry) => void;
}

/** Day-by-day list (tabs per day) — the mobile alternative to the wide grid. */
export default function TimetableMobileDayView({ days, periods, routine, isEditor, loading, onDelete, onMoveEdit }: TimetableMobileDayViewProps) {
  const t = useT();
  const [activeDay, setActiveDay] = useState(days[0] || '');

  useEffect(() => {
    if (days.length > 0 && !days.includes(activeDay)) setActiveDay(days[0]);
  }, [days, activeDay]);

  if (loading) {
    return (
      <div className="md:hidden space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card p-4"><Skeleton className="h-14" /></div>
        ))}
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-4">
      <Tabs
        tabs={days.map((d) => ({ id: d, label: dayLabel(d) }))}
        value={activeDay}
        onChange={setActiveDay}
        variant="pills"
        label={t('Select day')}
        idPrefix="timetable-day"
      />

      {days.map((day) => (
        <TabPanel key={day} id={day} value={activeDay} idPrefix="timetable-day" className="space-y-2">
          {periods.length === 0 ? (
            <EmptyState compact title={t('No periods configured')} description={t('Add a period row from Timetable settings.')} />
          ) : (
            periods.map((period) => {
              if (period.isBreak) {
                return (
                  <div key={period.id} className="glass-card p-3 flex items-center justify-between opacity-60">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{period.label}</span>
                    <span className="text-[11px] text-slate-400">{formatTime12(period.start)}–{formatTime12(period.end)}</span>
                  </div>
                );
              }
              const entry = routine[day]?.[period.start];
              return (
                <div key={period.id} className="glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{period.label}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">{formatTime12(period.start)}–{formatTime12(period.end)}</div>
                    </div>
                    {entry && isEditor && (
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Move or edit')} title={t('Move / Edit')} onClick={() => onMoveEdit(day, period.start, entry)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Remove')} title={t('Remove')} onClick={() => onDelete(entry)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {entry ? (
                    <div className="mt-3 p-3 rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/20">
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{entry.subject}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {entry.className ? `${entry.className} - ${entry.sectionName}` : entry.teacher}
                      </p>
                    </div>
                  ) : isEditor ? (
                    <button
                      type="button"
                      onClick={() => onMoveEdit(day, period.start)}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-300 border border-dashed border-primary-300 dark:border-primary-500/30 rounded-xl py-2.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('Add period')}
                    </button>
                  ) : (
                    <p className="mt-3 text-xs italic text-slate-400 dark:text-slate-500">{t('Free')}</p>
                  )}
                </div>
              );
            })
          )}
        </TabPanel>
      ))}
    </div>
  );
}
