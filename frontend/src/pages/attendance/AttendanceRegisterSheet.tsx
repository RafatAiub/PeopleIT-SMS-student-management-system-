import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  List,
  CalendarDays,
  Printer,
  Download,
  Save,
  Keyboard,
  ChevronRight,
  ChevronLeft,
  Lock,
  Smartphone,
  CheckCheck,
  Eraser,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Kbd, Alert } from '../../components/ui';
import { AttendanceStudentRow } from './AttendanceStudentRow';
import { AttendanceDailyTable } from './AttendanceDailyTable';
import { AttendanceWeeklyMatrix, type WeekDayInfo } from './AttendanceWeeklyMatrix';
import { STATUS_BY_KEY } from './attendanceStatus';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY';

export interface StudentRecord {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  rollNumber?: string | number | null;
  status?: AttendanceStatus;
  notes?: string | null;
  recentHistory?: ('PRESENT' | 'ABSENT' | 'LATE')[];
  attendanceMap?: Record<string, { status: AttendanceStatus; notes?: string | null }>;
}

interface AttendanceRegisterSheetProps {
  className: string;
  sectionName: string;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  students: StudentRecord[];
  attendance: Record<string, AttendanceStatus>;
  notes: Record<string, string>;
  weeklyAttendance: Record<string, Record<string, { status: AttendanceStatus; notes?: string }>>;
  onStatusChange: (studentId: string, status: AttendanceStatus) => void;
  onNoteChange: (studentId: string, note: string) => void;
  onWeeklyStatusChange: (studentId: string, dateStr: string, status: AttendanceStatus, note?: string) => void;
  onBatchSetStatus: (status: AttendanceStatus, target?: 'ALL' | 'UNMARKED') => void;
  onResetAttendance: () => void;
  onSave: () => Promise<void>;
  loading: boolean;
  isTeacher?: boolean;
  isDirty?: boolean;
  saveError?: string | null;
}

// 4-state cycle used by the weekly matrix's click-to-cycle cells:
// unmarked → Present → Absent → Late → Half day → Present …
const CYCLE_STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY'];

function nextCycleStatus(current?: AttendanceStatus): AttendanceStatus {
  if (!current) return 'PRESENT';
  const idx = CYCLE_STATUS_ORDER.indexOf(current);
  return CYCLE_STATUS_ORDER[(idx + 1) % CYCLE_STATUS_ORDER.length];
}

const todayStr = () => new Date().toISOString().split('T')[0];

const isTypingTarget = (el: EventTarget | null) => {
  const tag = (el as HTMLElement)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export const AttendanceRegisterSheet: React.FC<AttendanceRegisterSheetProps> = ({
  className,
  sectionName,
  selectedDate,
  setSelectedDate,
  students,
  attendance,
  notes,
  weeklyAttendance,
  onStatusChange,
  onNoteChange,
  onWeeklyStatusChange,
  onBatchSetStatus,
  onResetAttendance,
  onSave,
  loading,
  isTeacher,
  isDirty,
  saveError,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AttendanceStatus | 'UNMARKED'>('ALL');
  // Default to mobile touch cards on screens <768px, or weekly calendar on larger screens
  const [viewMode, setViewMode] = useState<'cards' | 'weekly' | 'table'>('cards');
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [gridFocus, setGridFocus] = useState<{ studentIndex: number; dayIndex: number } | null>(null);

  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const weeklyBodyRef = useRef<HTMLTableSectionElement>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Auto-detect view mode preference based on window width on initial mount
  useEffect(() => {
    if (window.innerWidth >= 768) {
      setViewMode('weekly');
    } else {
      setViewMode('cards');
    }
  }, []);

  // ── Calculate 7 Days of the Week ────────────────────────────────────────
  const getWeekDays = (refDateStr: string): WeekDayInfo[] => {
    const ref = new Date(refDateStr);
    const validRef = isNaN(ref.getTime()) ? new Date() : ref;
    const dayOfWeek = validRef.getDay();
    const distanceToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(validRef);
    monday.setDate(validRef.getDate() + distanceToMon);

    const weekDays: WeekDayInfo[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();

      const dayNumOfWeek = d.getDay();
      const isWeekend = dayNumOfWeek === 5 || dayNumOfWeek === 6; // Friday & Saturday
      const isNationalHoliday =
        dateStr.endsWith('-02-21') ||
        dateStr.endsWith('-03-26') ||
        dateStr.endsWith('-12-16') ||
        dateStr.endsWith('-05-01');

      const isHoliday = isWeekend || isNationalHoliday;
      const holidayName = isNationalHoliday ? 'National Holiday' : isWeekend ? 'Government Weekend' : '';

      weekDays.push({ dateStr, dayName, dayNum, fullDate: d, isHoliday, holidayName });
    }
    return weekDays;
  };

  const weekDays = getWeekDays(selectedDate);
  const weekStartDateStr = weekDays[0]?.dateStr;
  const weekEndDateStr = weekDays[6]?.dateStr;
  const selectedDayInfo = weekDays.find((d) => d.dateStr === selectedDate);
  const isSelectedDateHoliday = selectedDayInfo?.isHoliday ?? false;
  const selectedDateHolidayName = selectedDayInfo?.holidayName || 'Holiday';

  // Live counts
  const totalStudents = students.length;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let halfDayCount = 0;
  let markedCount = 0;

  students.forEach((s) => {
    const st = attendance[s.id];
    if (st === 'PRESENT') presentCount++;
    else if (st === 'ABSENT') absentCount++;
    else if (st === 'LATE') lateCount++;
    else if (st === 'HALF_DAY') halfDayCount++;
    if (st) markedCount++;
  });

  const unmarkedCount = Math.max(0, totalStudents - markedCount);

  // Filtered list
  const filteredStudents = useMemo(
    () =>
      students.filter((s) => {
        const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
        const roll = String(s.rollNumber || '').toLowerCase();
        const sId = String(s.studentId || '').toLowerCase();
        const matchesSearch =
          fullName.includes(searchTerm.toLowerCase()) || roll.includes(searchTerm.toLowerCase()) || sId.includes(searchTerm.toLowerCase());

        const currentStatus = attendance[s.id];
        let matchesFilter = true;
        if (statusFilter === 'UNMARKED') matchesFilter = !currentStatus;
        else if (statusFilter !== 'ALL') matchesFilter = currentStatus === statusFilter;

        return matchesSearch && matchesFilter;
      }),
    [students, searchTerm, statusFilter, attendance]
  );

  // Keep focus indices in range whenever the filtered list changes.
  useEffect(() => {
    setActiveRowIndex((i) => Math.min(i, Math.max(0, filteredStudents.length - 1)));
    setGridFocus((g) => (g ? { ...g, studentIndex: Math.min(g.studentIndex, Math.max(0, filteredStudents.length - 1)) } : g));
  }, [filteredStudents.length]);

  // Date Navigation
  const changeWeekByDays = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    const nextDateStr = d.toISOString().split('T')[0];
    setSelectedDate(nextDateStr > todayStr() ? todayStr() : nextDateStr);
  };

  const isToday = selectedDate === todayStr();

  // Fast 1-Click Status Cycle (weekly matrix cell click)
  const handleCellCycleStatus = (studentId: string, dateStr: string, currentStatus?: AttendanceStatus) => {
    const nextStatus = nextCycleStatus(currentStatus);
    onWeeklyStatusChange(studentId, dateStr, nextStatus);
    if (dateStr === selectedDate) onStatusChange(studentId, nextStatus);
  };

  // Bulk Mark Day Present
  const handleBulkMarkDayPresent = (dateStr: string) => {
    filteredStudents.forEach((student) => {
      onWeeklyStatusChange(student.id, dateStr, 'PRESENT');
      if (dateStr === selectedDate) onStatusChange(student.id, 'PRESENT');
    });
    toast.success(`Marked all students Present for ${dateStr}!`);
  };

  // Export to CSV
  const exportToCSV = async () => {
    if (students.length === 0) return;
    const csvRows = [['Roll No', 'Student ID', 'Student Name', 'Class', 'Section', 'Date', 'Status', 'Notes']];

    students.forEach((s) => {
      csvRows.push([
        s.rollNumber ? String(s.rollNumber) : 'N/A',
        s.studentId,
        `"${s.firstName} ${s.lastName}"`,
        className,
        sectionName,
        selectedDate,
        attendance[s.id] || 'UNMARKED',
        `"${notes[s.id] || ''}"`,
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_${className}_${sectionName}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Attendance CSV exported successfully!');
  };

  const handlePrint = () => window.print();

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  // ↑/↓ move between students, ←/→ move between status options (or columns
  // in the weekly view), P/A/L/H set status & advance, Space toggles
  // present/absent, Ctrl+S saves. Only active for the desktop grid views
  // (table/weekly) — the "cards" view is the touch-first mobile layout.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrlSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's';
      if (ctrlSave) {
        e.preventDefault();
        if (!loading) onSave();
        return;
      }

      if (isTypingTarget(e.target) || isSelectedDateHoliday) return;
      if (viewMode !== 'table' && viewMode !== 'weekly') return;
      if (filteredStudents.length === 0) return;

      const key = e.key;
      const upperKey = key.length === 1 ? key.toUpperCase() : key;

      if (viewMode === 'table') {
        if (key === 'ArrowDown') {
          e.preventDefault();
          setActiveRowIndex((i) => Math.min(i + 1, filteredStudents.length - 1));
        } else if (key === 'ArrowUp') {
          e.preventDefault();
          setActiveRowIndex((i) => Math.max(i - 1, 0));
        } else if (key === ' ') {
          e.preventDefault();
          const student = filteredStudents[activeRowIndex];
          if (student) {
            const cur = attendance[student.id];
            onStatusChange(student.id, cur === 'PRESENT' ? 'ABSENT' : 'PRESENT');
          }
        } else if (STATUS_BY_KEY[upperKey]) {
          e.preventDefault();
          const student = filteredStudents[activeRowIndex];
          if (student) {
            onStatusChange(student.id, STATUS_BY_KEY[upperKey]);
            setActiveRowIndex((i) => Math.min(i + 1, filteredStudents.length - 1));
          }
        }
      } else if (viewMode === 'weekly') {
        const focus = gridFocus ?? { studentIndex: activeRowIndex, dayIndex: weekDays.findIndex((d) => d.dateStr === selectedDate) };
        if (key === 'ArrowDown') {
          e.preventDefault();
          setGridFocus({ ...focus, studentIndex: Math.min(focus.studentIndex + 1, filteredStudents.length - 1) });
        } else if (key === 'ArrowUp') {
          e.preventDefault();
          setGridFocus({ ...focus, studentIndex: Math.max(focus.studentIndex - 1, 0) });
        } else if (key === 'ArrowRight') {
          e.preventDefault();
          setGridFocus({ ...focus, dayIndex: Math.min(focus.dayIndex + 1, 6) });
        } else if (key === 'ArrowLeft') {
          e.preventDefault();
          setGridFocus({ ...focus, dayIndex: Math.max(focus.dayIndex - 1, 0) });
        } else if (key === ' ' || STATUS_BY_KEY[upperKey]) {
          const day = weekDays[focus.dayIndex];
          const student = filteredStudents[focus.studentIndex];
          if (day && student && !day.isHoliday && day.dateStr <= todayStr()) {
            e.preventDefault();
            const studentWeeklyMap = weeklyAttendance[student.id] || {};
            const currentStatus =
              studentWeeklyMap[day.dateStr]?.status ?? (day.dateStr === selectedDate ? attendance[student.id] : undefined);
            const nextStatus = key === ' ' ? (currentStatus === 'PRESENT' ? 'ABSENT' : 'PRESENT') : STATUS_BY_KEY[upperKey];
            onWeeklyStatusChange(student.id, day.dateStr, nextStatus);
            if (day.dateStr === selectedDate) onStatusChange(student.id, nextStatus);
            if (key !== ' ') {
              setGridFocus({ ...focus, studentIndex: Math.min(focus.studentIndex + 1, filteredStudents.length - 1) });
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    viewMode,
    filteredStudents,
    activeRowIndex,
    gridFocus,
    weekDays,
    selectedDate,
    attendance,
    weeklyAttendance,
    loading,
    onSave,
    onStatusChange,
    onWeeklyStatusChange,
    isSelectedDateHoliday,
  ]);

  // Keep the focused row/cell scrolled into view and DOM-focused so keyboard
  // navigation is visible and screen-reader-announced.
  useEffect(() => {
    if (viewMode === 'table') {
      const row = tableBodyRef.current?.querySelector<HTMLElement>(`[data-row-index="${activeRowIndex}"]`);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    } else if (viewMode === 'cards') {
      const card = cardRefs.current[activeRowIndex];
      card?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeRowIndex, viewMode]);

  useEffect(() => {
    if (viewMode !== 'weekly' || !gridFocus) return;
    const cell = weeklyBodyRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${gridFocus.studentIndex}"][data-day-index="${gridFocus.dayIndex}"]`
    );
    cell?.focus({ preventScroll: true });
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [gridFocus, viewMode]);

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* ── MOBILE HORIZONTAL DAY CAROUSEL (SINGLE-THUMB DATE TAP) ───────────── */}
      <div className="block md:hidden no-print">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 px-1 flex items-center justify-between">
          <span>Tap day to view/take attendance:</span>
          <span className="font-mono text-primary-600 dark:text-primary-400">{selectedDate}</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
          {weekDays.map((day) => {
            const isSelected = day.dateStr === selectedDate;
            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => setSelectedDate(day.dateStr)}
                className={`snap-center flex-shrink-0 flex flex-col items-center justify-center min-w-[62px] py-2.5 px-2 rounded-2xl border transition-all text-xs font-bold ${
                  isSelected
                    ? 'bg-gradient-to-b from-primary-600 to-primary-700 text-white border-primary-600 shadow-md scale-105'
                    : day.isHoliday
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/20'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <span className="text-[10px] uppercase opacity-75">{day.dayName}</span>
                <span className="text-base font-black leading-tight my-0.5">{day.dayNum}</span>
                {day.isHoliday && <Lock className="w-2.5 h-2.5 opacity-80" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── DESKTOP DATE & WEEK CONTROLS BAR ───────────────────────────── */}
      <div className="hidden md:flex glass-card p-4 rounded-2xl items-center justify-between gap-4 border border-slate-200/60 dark:border-white/10 no-print shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400 tracking-wider uppercase">ATTENDANCE REGISTER</div>
            <div className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              {weekStartDateStr && weekEndDateStr ? (
                <>
                  {new Date(weekStartDateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })} –{' '}
                  {new Date(weekEndDateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </>
              ) : (
                selectedDate
              )}
              {isToday && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  CURRENT WEEK
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => changeWeekByDays(-7)} title="Previous Week" className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value > todayStr()) toast.error('Cannot select a future date!');
              else setSelectedDate(e.target.value);
            }}
            max={todayStr()}
            aria-label="Selected date"
            className="input-field py-1.5 px-3 text-xs font-semibold max-w-[140px]"
          />

          <button onClick={() => changeWeekByDays(7)} title="Next Week" className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>

          {!isToday && (
            <button onClick={() => setSelectedDate(todayStr())} className="text-xs font-bold px-3 py-2 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-all">
              This Week
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={exportToCSV} disabled={students.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-bold transition-all disabled:opacity-50">
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button onClick={handlePrint} disabled={students.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-bold transition-all disabled:opacity-50">
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* ── TOOLBAR (SEARCH & RESPONSIVE VIEW SWITCHER) ─────────────────── */}
      <div className="glass-card p-3 md:p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border border-slate-200/60 dark:border-white/5 no-print">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student profile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search students"
              className="input-field pl-9 py-2 text-xs w-full"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Filter by status"
            className="input-field py-2 text-xs font-semibold w-auto"
          >
            <option value="ALL">All statuses</option>
            <option value="UNMARKED">Unmarked</option>
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="LATE">Late</option>
            <option value="HALF_DAY">Half day</option>
          </select>

          <button
            type="button"
            disabled={isSelectedDateHoliday || selectedDate > todayStr()}
            onClick={() => {
              onBatchSetStatus('PRESENT', 'ALL');
              toast.success('Marked all students Present!');
            }}
            className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed disabled:hover:bg-slate-300 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all whitespace-nowrap"
          >
            <CheckCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Mark All Present</span>
          </button>

          <button
            type="button"
            disabled={isSelectedDateHoliday || selectedDate > todayStr()}
            onClick={() => {
              onResetAttendance();
              toast.success('Cleared unsaved marks for this date.');
            }}
            title="Unmark all students for this date (does not affect already-saved records until you Save)"
            className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all whitespace-nowrap"
          >
            <Eraser className="w-4 h-4" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>

        <div className="flex items-center justify-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/60 dark:border-white/5">
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'cards' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-xs' : 'text-slate-500 dark:text-slate-400'
            }`}
            title="Mobile Touch Cards View"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'weekly' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-xs' : 'text-slate-500 dark:text-slate-400'
            }`}
            title="Weekly Calendar Matrix View"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Weekly</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'table' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-xs' : 'text-slate-500 dark:text-slate-400'
            }`}
            title="Daily Register Table View"
          >
            <List className="w-3.5 h-3.5" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* ── KEYBOARD SHORTCUTS HINT ──────────────────────────────────────── */}
      {(viewMode === 'table' || viewMode === 'weekly') && (
        <div className="hidden md:flex items-center justify-between gap-3 px-1 no-print">
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <Keyboard className="w-3.5 h-3.5" aria-hidden />
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> Row</span>
            <span className="flex items-center gap-1"><Kbd>←</Kbd><Kbd>→</Kbd> {viewMode === 'weekly' ? 'Day' : 'Option'}</span>
            <span className="flex items-center gap-1"><Kbd>P</Kbd><Kbd>A</Kbd><Kbd>L</Kbd><Kbd>H</Kbd> Set + next</span>
            <span className="flex items-center gap-1"><Kbd>Space</Kbd> Toggle P/A</span>
            <span className="flex items-center gap-1"><Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> Save</span>
          </div>
          <button type="button" onClick={() => setShowKeyboardHelp((v) => !v)} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline shrink-0">
            {showKeyboardHelp ? 'Hide details' : 'More'}
          </button>
        </div>
      )}
      {showKeyboardHelp && (
        <Alert tone="info" title="Keyboard shortcuts">
          <ul className="list-disc list-inside space-y-0.5">
            <li>Arrow Up / Down — move between students</li>
            <li>Arrow Left / Right — move between status options (or day columns in the weekly view)</li>
            <li>P, A, L, H — mark Present, Absent, Late or Half day for the focused row, then advance</li>
            <li>Space — toggle Present/Absent for the focused row</li>
            <li>Ctrl+S — save the register</li>
          </ul>
        </Alert>
      )}

      {saveError && <Alert tone="danger" title="Failed to save attendance">{saveError}</Alert>}
      {isDirty && !loading && <Alert tone="warning" title="Unsaved changes" className="no-print">You have unmarked changes — remember to save before leaving this page.</Alert>}

      {/* ── MAIN ATTENDANCE VIEW CONTENT ─────────────────────────────── */}
      {loading ? (
        <div className="glass-card p-12 rounded-2xl border border-slate-200/60 dark:border-white/5 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-slate-500">Loading Register...</span>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="glass-card p-10 rounded-2xl border border-slate-200/60 dark:border-white/5 text-center text-slate-500 text-xs italic">
          No students found matching current search.
        </div>
      ) : isSelectedDateHoliday && viewMode !== 'weekly' ? (
        <div className="glass-card p-10 rounded-2xl border border-purple-200 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-950/20 text-center flex flex-col items-center justify-center space-y-3">
          <Lock className="w-10 h-10 text-purple-500" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedDateHolidayName}</h3>
          <p className="text-slate-600 dark:text-slate-400 text-xs max-w-sm leading-relaxed">
            {selectedDate} is marked as a holiday. Attendance cannot be recorded for this date. Switch to the Weekly view or pick a working day to continue.
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div
          role="grid"
          aria-label={`Attendance for ${className} section ${sectionName} on ${selectedDate}`}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 no-print"
        >
          {filteredStudents.map((student, idx) => (
            <AttendanceStudentRow
              key={student.id}
              student={student}
              status={attendance[student.id]}
              note={notes[student.id] || ''}
              isActive={idx === activeRowIndex}
              onFocusRow={() => setActiveRowIndex(idx)}
              onStatusChange={(status) => onStatusChange(student.id, status)}
              onNoteChange={(note) => onNoteChange(student.id, note)}
              rowRef={(el) => {
                cardRefs.current[idx] = el;
              }}
            />
          ))}
        </div>
      ) : viewMode === 'weekly' ? (
        <AttendanceWeeklyMatrix
          students={filteredStudents}
          weekDays={weekDays}
          selectedDate={selectedDate}
          attendance={attendance}
          notes={notes}
          weeklyAttendance={weeklyAttendance}
          gridFocus={gridFocus}
          onSetSelectedDate={setSelectedDate}
          onCellCycleStatus={handleCellCycleStatus}
          onBulkMarkDayPresent={handleBulkMarkDayPresent}
          onFocusCell={(studentIndex, dayIndex) => setGridFocus({ studentIndex, dayIndex })}
          bodyRef={weeklyBodyRef}
        />
      ) : (
        <AttendanceDailyTable
          students={filteredStudents}
          attendance={attendance}
          activeRowIndex={activeRowIndex}
          onFocusRow={setActiveRowIndex}
          onStatusChange={onStatusChange}
          bodyRef={tableBodyRef}
        />
      )}

      {/* ── STICKY FLOATING MOBILE BOTTOM ACTION BAR ──────────────────── */}
      {students.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-t border-slate-200 dark:border-white/10 shadow-sm no-print md:sticky md:bottom-6 md:rounded-2xl md:border md:m-0">
          <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
            <div className="hidden sm:flex items-center gap-3 text-xs font-mono">
              <span className="text-emerald-600 font-bold">{presentCount} Present</span>
              <span className="text-rose-600 font-bold">{absentCount} Absent</span>
              <span className="text-amber-600 font-bold">{lateCount} Late</span>
              <span className="text-blue-600 font-bold">{halfDayCount} Half-day</span>
              {unmarkedCount > 0 && <span className="text-slate-500 font-bold">({unmarkedCount} Unmarked)</span>}
            </div>

            <button
              onClick={onSave}
              disabled={loading || isSelectedDateHoliday}
              title={isSelectedDateHoliday ? `${selectedDate} is a holiday — attendance cannot be submitted` : 'Save (Ctrl+S)'}
              className="w-full md:w-auto h-12 md:h-11 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-extrabold py-3 px-8 rounded-2xl transition-all shadow-sm active:scale-95 text-sm"
            >
              <Save className="w-4 h-4" />
              {isSelectedDateHoliday ? 'Holiday — Cannot Submit' : loading ? 'Submitting...' : 'Save & Submit Attendance'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
