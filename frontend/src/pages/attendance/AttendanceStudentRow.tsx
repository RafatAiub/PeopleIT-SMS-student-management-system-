import React from 'react';
import { STATUS_OPTIONS } from './attendanceStatus';
import type { AttendanceStatus, StudentRecord } from './AttendanceRegisterSheet';
import { cn } from '../../lib/cn';

interface AttendanceStudentRowProps {
  student: StudentRecord;
  status?: AttendanceStatus;
  note: string;
  isActive: boolean;
  onFocusRow: () => void;
  onStatusChange: (status: AttendanceStatus) => void;
  onNoteChange: (note: string) => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}

/**
 * One student's card in the mobile/touch "cards" register view. Works at
 * 360px width: student info stacks above a full-width 4-way segmented
 * control (P/A/L/H), never scrolls horizontally.
 */
export const AttendanceStudentRow: React.FC<AttendanceStudentRowProps> = ({
  student,
  status,
  note,
  isActive,
  onFocusRow,
  onStatusChange,
  onNoteChange,
  rowRef,
}) => {
  const fullName = `${student.firstName} ${student.lastName}`;

  return (
    <div
      ref={rowRef}
      role="row"
      tabIndex={0}
      onFocus={onFocusRow}
      aria-label={`${fullName}, roll ${student.rollNumber || 'N/A'}, currently ${status || 'unmarked'}`}
      className={cn(
        'glass-card p-4 rounded-2xl border transition-all relative flex flex-col justify-between gap-3 outline-none',
        isActive && 'ring-2 ring-primary-500',
        status === 'PRESENT'
          ? 'border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-500/5'
          : status === 'ABSENT'
          ? 'border-rose-500/50 bg-rose-50/20 dark:bg-rose-500/5'
          : status === 'LATE'
          ? 'border-amber-500/50 bg-amber-50/20 dark:bg-amber-500/5'
          : status === 'HALF_DAY'
          ? 'border-blue-500/50 bg-blue-50/20 dark:bg-blue-500/5'
          : 'border-slate-200/60 dark:border-white/5'
      )}
    >
      {/* Student Info Header */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-tr from-primary-500 to-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md">
            {student.firstName[0]}
            {student.lastName[0]}
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">{fullName}</h4>
            <div className="text-[11px] text-slate-400 font-mono truncate">
              Roll: #{student.rollNumber || 'N/A'} • ID: {student.studentId}
            </div>
          </div>
        </div>

        <span
          className={cn(
            'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
            status
              ? STATUS_OPTIONS.find((o) => o.value === status)?.pillClass
              : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          )}
        >
          {status || 'UNMARKED'}
        </span>
      </div>

      {/* Full-width 4-way segmented control — 44px+ touch targets, no horizontal scroll */}
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`Mark attendance for ${fullName}`}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={status === opt.value}
            aria-label={`Mark ${fullName} ${opt.label.toLowerCase()}`}
            title={`${opt.label} (${opt.key})`}
            onClick={() => onStatusChange(opt.value)}
            className={cn(
              'h-11 rounded-xl text-[11px] font-extrabold transition-all flex flex-col items-center justify-center leading-tight active:scale-95',
              status === opt.value ? opt.activeClass : opt.idleClass
            )}
          >
            <span>{opt.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Touch Input Remark */}
      <input
        type="text"
        placeholder="Remark / Note..."
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        aria-label={`Note for ${fullName}`}
        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400"
      />
    </div>
  );
};
