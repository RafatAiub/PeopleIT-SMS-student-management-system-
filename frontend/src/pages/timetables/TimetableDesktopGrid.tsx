import React from 'react';
import { X, Pencil, Plus } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useT } from '../../i18n';
import { dayLabel, formatTime12, type PeriodDef } from './timetableSettings';
import type { RoutineEntry } from './types';

function EmptyCell({ day, period, isEditor, onAdd }: { day: string; period: PeriodDef; isEditor: boolean; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${day}-${period.start}`, data: { day, period } });
  if (!isEditor) {
    return (
      <div className="h-full w-full flex items-center justify-center opacity-30">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 text-center italic">Free</span>
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      className={`group relative h-full w-full flex items-center justify-center rounded-xl transition-colors ${isOver ? 'bg-primary-100/60 dark:bg-primary-500/10 ring-2 ring-primary-400/50' : 'opacity-40 hover:opacity-100'}`}
    >
      <span className="text-[10px] text-slate-400 dark:text-slate-500 text-center italic group-hover:hidden">{isOver ? 'Drop here' : 'Free'}</span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add period on ${dayLabel(day)} at ${formatTime12(period.start)}`}
        title="Add period"
        className="hidden group-hover:flex items-center gap-1 text-[11px] font-semibold text-primary-700 dark:text-primary-300 bg-white dark:bg-slate-900 border border-primary-200 dark:border-primary-500/30 rounded-lg px-2 py-1 shadow-xs"
      >
        <Plus className="w-3 h-3" /> Add
      </button>
    </div>
  );
}

function PlacedPeriodCard({
  day,
  period,
  entry,
  isEditor,
  onDelete,
  onMoveEdit,
}: {
  day: string;
  period: PeriodDef;
  entry: RoutineEntry;
  isEditor: boolean;
  onDelete: () => void;
  onMoveEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `slot-${entry.id}`,
    data: { type: 'slot' as const, entry, day, period },
  });
  // Filled cells are droppable too — not just empty ones — so dragging a new
  // block onto an occupied period replaces it instead of silently no-oping.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `filled-${day}-${period.start}`, data: { day, period, entry } });
  const setRefs = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  if (!isEditor) {
    return (
      <div className="h-full w-full rounded-xl bg-gradient-to-br from-primary-50 dark:from-primary-500/10 to-primary-100/30 dark:to-primary-500/5 border border-primary-200 dark:border-primary-500/20 shadow-xs flex flex-col items-center justify-center p-2 group hover:border-primary-400/30 transition-all">
        <span className="text-xs font-bold text-blue-700 dark:text-blue-300 text-center leading-tight mb-1">{entry.subject}</span>
        {entry.className ? (
          <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded-md mt-1 border border-slate-200 dark:border-white/5 text-center">
            {entry.className} - {entry.sectionName}
          </span>
        ) : (
          <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded-md mt-1 border border-slate-200 dark:border-white/5 text-center max-w-full truncate">
            {entry.teacher}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setRefs}
      {...listeners}
      {...attributes}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined }}
      className={`group relative h-full w-full rounded-xl bg-gradient-to-br from-primary-50 dark:from-primary-500/10 to-primary-100/30 dark:to-primary-500/5 border shadow-xs flex flex-col items-center justify-center p-2 cursor-grab active:cursor-grabbing select-none touch-none hover:border-primary-400/30 transition-all ${isDragging ? 'opacity-30' : ''} ${isOver ? 'ring-2 ring-amber-400/70 border-amber-400/70' : 'border-primary-200 dark:border-primary-500/20'}`}
      title={isOver ? 'Drop to replace this period' : undefined}
    >
      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onMoveEdit}
          aria-label={`Move or edit ${entry.subject}`}
          title="Move / Edit"
          className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 bg-white/80 dark:bg-slate-900/80 rounded-full p-0.5"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          aria-label={`Remove ${entry.subject}`}
          title="Remove"
          className="text-slate-400 hover:text-red-500 bg-white/80 dark:bg-slate-900/80 rounded-full p-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <span className="text-xs font-bold text-blue-700 dark:text-blue-300 text-center leading-snug mb-1 break-words">{entry.subject}</span>
      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded-md mt-1 border border-slate-200 dark:border-white/5 text-center max-w-full truncate">
        {entry.teacher}
      </span>
    </div>
  );
}

interface TimetableDesktopGridProps {
  days: string[];
  periods: PeriodDef[];
  routine: Record<string, Record<string, RoutineEntry>>;
  isEditor: boolean;
  loading: boolean;
  onDelete: (entry: RoutineEntry) => void;
  onMoveEdit: (day: string, startTime: string, entry?: RoutineEntry) => void;
}

export default function TimetableDesktopGrid({ days, periods, routine, isEditor, loading, onDelete, onMoveEdit }: TimetableDesktopGridProps) {
  const t = useT();
  const cols = days.length + 1;
  return (
    <div className="hidden md:block glass-card rounded-3xl border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-xs relative bg-white dark:bg-slate-900/10">
      {loading && (
        <div className="absolute inset-0 z-10 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xs flex items-center justify-center">
          <div className="text-blue-600 dark:text-blue-400 animate-pulse font-semibold">{t('Loading Timetable...')}</div>
        </div>
      )}
      <div className="overflow-x-auto">
        <div
          className="min-w-[900px] grid divide-x divide-slate-200 dark:divide-white/5 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/60 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          <div className="p-5 text-center">{t('Time Slot')}</div>
          {days.map((day) => (
            <div key={day} className="p-5 text-center">{dayLabel(day)}</div>
          ))}
        </div>

        <div className="min-w-[900px] divide-y divide-slate-200 dark:divide-white/5">
          {periods.map((period) => (
            <div
              key={period.id}
              className="grid divide-x divide-slate-200 dark:divide-white/5 transition-colors hover:bg-slate-50/30 dark:hover:bg-white/[0.02]"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              <div className="p-4 flex flex-col justify-center items-center bg-slate-50/50 dark:bg-slate-900/20">
                <div className="font-bold text-slate-900 dark:text-white text-xs">{period.label}</div>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 font-medium bg-slate-100 dark:bg-slate-950/50 px-2 py-0.5 rounded-full border border-slate-200 dark:border-white/5">
                  {formatTime12(period.start)} - {formatTime12(period.end)}
                </div>
              </div>

              {days.map((day) => {
                if (period.isBreak) {
                  return (
                    <div key={day} className="p-4 flex items-center justify-center text-xs tracking-widest uppercase italic text-slate-400 dark:text-slate-500 opacity-50 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(226,232,240,0.3)_10px,rgba(226,232,240,0.3)_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.02)_10px,rgba(255,255,255,0.02)_20px)]">
                      {t('Break')}
                    </div>
                  );
                }
                const entry = routine[day]?.[period.start];
                return (
                  <div key={day} className="p-2.5 flex flex-col justify-center min-h-[90px]">
                    {entry ? (
                      <PlacedPeriodCard
                        day={day}
                        period={period}
                        entry={entry}
                        isEditor={isEditor}
                        onDelete={() => onDelete(entry)}
                        onMoveEdit={() => onMoveEdit(day, period.start, entry)}
                      />
                    ) : (
                      <EmptyCell day={day} period={period} isEditor={isEditor} onAdd={() => onMoveEdit(day, period.start)} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
