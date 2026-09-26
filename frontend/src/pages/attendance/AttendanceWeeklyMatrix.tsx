import React from 'react';
import { Lock, Zap, Check, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { AttendanceStatus, StudentRecord } from './AttendanceRegisterSheet';

export interface WeekDayInfo {
  dateStr: string;
  dayName: string;
  dayNum: number;
  fullDate: Date;
  isHoliday: boolean;
  holidayName: string;
}

interface AttendanceWeeklyMatrixProps {
  students: StudentRecord[];
  weekDays: WeekDayInfo[];
  selectedDate: string;
  attendance: Record<string, AttendanceStatus>;
  notes: Record<string, string>;
  weeklyAttendance: Record<string, Record<string, { status: AttendanceStatus; notes?: string }>>;
  gridFocus: { studentIndex: number; dayIndex: number } | null;
  onSetSelectedDate: (date: string) => void;
  onCellCycleStatus: (studentId: string, dateStr: string, currentStatus?: AttendanceStatus) => void;
  onBulkMarkDayPresent: (dateStr: string) => void;
  onFocusCell: (studentIndex: number, dayIndex: number) => void;
  bodyRef?: React.Ref<HTMLTableSectionElement>;
}

/** Weekly calendar matrix — students × 7 days, click/keyboard to cycle status. */
export const AttendanceWeeklyMatrix: React.FC<AttendanceWeeklyMatrixProps> = ({
  students,
  weekDays,
  selectedDate,
  attendance,
  notes,
  weeklyAttendance,
  gridFocus,
  onSetSelectedDate,
  onCellCycleStatus,
  onBulkMarkDayPresent,
  onFocusCell,
  bodyRef,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="glass-card rounded-2xl border border-slate-200/70 dark:border-white/10 overflow-hidden shadow-sm relative">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[700px]" role="grid" aria-label="Weekly attendance matrix">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300">
              <th className="py-4 px-5 min-w-[200px] font-bold text-xs uppercase tracking-wider bg-slate-100/90 dark:bg-slate-800/90 sticky left-0 top-0 z-20 shadow-xs border-r border-slate-200 dark:border-white/10">
                <span>Student Profile</span>
              </th>

              {weekDays.map((day, dayIndex) => {
                const isSelectedDateCol = day.dateStr === selectedDate;
                const isFocusedCol = gridFocus?.dayIndex === dayIndex;
                return (
                  <th
                    key={day.dateStr}
                    className={cn(
                      'py-3 px-2 text-center min-w-[120px] border-r border-slate-200/60 dark:border-white/5 transition-all',
                      day.isHoliday
                        ? 'bg-purple-50/80 dark:bg-purple-950/30 text-purple-950 dark:text-purple-300'
                        : isSelectedDateCol
                        ? 'bg-primary-50 dark:bg-primary-600/20 text-primary-900 dark:text-white font-extrabold ring-2 ring-primary-500 inset-0'
                        : 'hover:bg-slate-100/60 dark:hover:bg-white/5',
                      isFocusedCol && 'outline outline-2 outline-primary-500'
                    )}
                  >
                    <div onClick={() => onSetSelectedDate(day.dateStr)} className="cursor-pointer">
                      <div className="text-sm font-black tracking-tight">{day.dayNum}</div>
                      <div className="text-[11px] font-bold uppercase opacity-75">{day.dayName}</div>
                    </div>

                    {day.isHoliday ? (
                      <div className="mt-1 flex items-center justify-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Holiday</span>
                      </div>
                    ) : day.dateStr > todayStr ? (
                      <div className="mt-1 flex items-center justify-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                        <Lock className="w-2.5 h-2.5 opacity-60" />
                        <span>Locked</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onBulkMarkDayPresent(day.dateStr)}
                        aria-label={`Mark all students present for ${day.dateStr}`}
                        className="mt-1 w-full text-[9px] font-bold px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center gap-1"
                      >
                        <Zap className="w-2.5 h-2.5" />
                        Fill Day
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={bodyRef} className="divide-y divide-slate-100 dark:divide-white/5 text-xs">
            {students.map((student, studentIndex) => {
              const studentWeeklyMap = weeklyAttendance[student.id] || {};
              const fullName = `${student.firstName} ${student.lastName}`;

              return (
                <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.01]">
                  <td className="py-3 px-5 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/10">
                    <div className="font-bold text-slate-900 dark:text-white text-xs">{fullName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">Roll: #{student.rollNumber || 'N/A'}</div>
                  </td>

                  {weekDays.map((day, dayIndex) => {
                    const dayRecord =
                      studentWeeklyMap[day.dateStr] ||
                      (day.dateStr === selectedDate ? { status: attendance[student.id], notes: notes[student.id] } : undefined);
                    const status = dayRecord?.status;
                    const isFuture = day.dateStr > todayStr;
                    const isFocused = gridFocus?.studentIndex === studentIndex && gridFocus?.dayIndex === dayIndex;
                    const cellLabel = `${fullName}, ${day.dateStr}: ${status || 'unmarked'}`;

                    if (day.isHoliday) {
                      return (
                        <td
                          key={day.dateStr}
                          role="gridcell"
                          tabIndex={0}
                          data-row-index={studentIndex}
                          data-day-index={dayIndex}
                          aria-label={`${cellLabel} (holiday)`}
                          onFocus={() => onFocusCell(studentIndex, dayIndex)}
                          className={cn(
                            'py-3 px-2 text-center border-r bg-purple-50/30 dark:bg-purple-950/10 text-purple-600 outline-none',
                            isFocused && 'ring-2 ring-inset ring-primary-500'
                          )}
                        >
                          <Lock className="w-3.5 h-3.5 mx-auto opacity-60" />
                        </td>
                      );
                    }

                    if (isFuture) {
                      return (
                        <td
                          key={day.dateStr}
                          role="gridcell"
                          tabIndex={0}
                          data-row-index={studentIndex}
                          data-day-index={dayIndex}
                          aria-label={`${cellLabel} (future date, locked)`}
                          onFocus={() => onFocusCell(studentIndex, dayIndex)}
                          title="Future Date"
                          className={cn(
                            'py-3 px-2 text-center border-r bg-slate-50/30 dark:bg-slate-900/10 text-slate-400 dark:text-slate-600 outline-none',
                            isFocused && 'ring-2 ring-inset ring-primary-500'
                          )}
                        >
                          <Lock className="w-3.5 h-3.5 mx-auto opacity-30" />
                        </td>
                      );
                    }

                    return (
                      <td
                        key={day.dateStr}
                        role="gridcell"
                        tabIndex={0}
                        data-row-index={studentIndex}
                        data-day-index={dayIndex}
                        aria-label={cellLabel}
                        onFocus={() => onFocusCell(studentIndex, dayIndex)}
                        onClick={() => {
                          onFocusCell(studentIndex, dayIndex);
                          onCellCycleStatus(student.id, day.dateStr, status);
                        }}
                        className={cn(
                          'py-2 px-2 text-center border-r transition-all cursor-pointer hover:bg-slate-100/50 outline-none',
                          isFocused && 'ring-2 ring-inset ring-primary-500'
                        )}
                      >
                        {status === 'PRESENT' ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        ) : status === 'ABSENT' ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400">
                            <X className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        ) : status === 'LATE' ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black">
                            L
                          </span>
                        ) : status === 'HALF_DAY' ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-black">
                            H
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
