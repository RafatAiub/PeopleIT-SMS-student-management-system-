import React from 'react';
import { Table, TableHead, TableHeaderCell, TableRow, TableCell } from '../../components/ui/Table';
import { STATUS_OPTIONS } from './attendanceStatus';
import type { AttendanceStatus, StudentRecord } from './AttendanceRegisterSheet';
import { cn } from '../../lib/cn';

interface AttendanceDailyTableProps {
  students: StudentRecord[];
  attendance: Record<string, AttendanceStatus>;
  activeRowIndex: number;
  onFocusRow: (index: number) => void;
  onStatusChange: (studentId: string, status: AttendanceStatus) => void;
  /** Bound to the <tbody> so the caller can scroll the active row into view by index. */
  bodyRef?: React.Ref<HTMLTableSectionElement>;
}

/** Daily register table view — one row per student, P/A/L/H buttons per row. */
export const AttendanceDailyTable: React.FC<AttendanceDailyTableProps> = ({
  students,
  attendance,
  activeRowIndex,
  onFocusRow,
  onStatusChange,
  bodyRef,
}) => (
  <Table>
    <TableHead>
      <TableHeaderCell className="w-12 text-center">#</TableHeaderCell>
      <TableHeaderCell className="w-20">Roll</TableHeaderCell>
      <TableHeaderCell>Student Details</TableHeaderCell>
      <TableHeaderCell className="text-center">Attendance Status</TableHeaderCell>
    </TableHead>
    <tbody ref={bodyRef} className="divide-y divide-slate-100 dark:divide-white/5" role="rowgroup" aria-label="Attendance register grid">
      {students.map((student, idx) => {
        const currentStatus = attendance[student.id];
        const fullName = `${student.firstName} ${student.lastName}`;
        const isActive = idx === activeRowIndex;

        return (
          <TableRow
            key={student.id}
            index={idx}
            data-row-index={idx}
            tabIndex={0}
            onFocus={() => onFocusRow(idx)}
            role="row"
            aria-selected={isActive}
            className={cn(isActive && 'outline-none ring-2 ring-inset ring-primary-500')}
          >
            <TableCell className="text-center font-mono text-xs text-slate-400 font-bold">{idx + 1}</TableCell>
            <TableCell className="font-mono font-bold text-xs">{student.rollNumber || '—'}</TableCell>
            <TableCell className="font-bold text-slate-900 dark:text-white">{fullName}</TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center gap-1.5" role="group" aria-label={`Mark attendance for ${fullName}`}>
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={currentStatus === opt.value}
                    aria-label={`Mark ${fullName} ${opt.label.toLowerCase()}`}
                    title={`${opt.label} (${opt.key})`}
                    onClick={() => onStatusChange(student.id, opt.value)}
                    className={cn(
                      'w-8 h-8 rounded-xl text-[11px] font-black transition-all',
                      currentStatus === opt.value ? opt.activeClass : opt.idleClass
                    )}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </tbody>
  </Table>
);
