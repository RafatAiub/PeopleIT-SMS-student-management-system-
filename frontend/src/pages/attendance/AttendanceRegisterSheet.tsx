import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  MinusCircle,
  Search,
  Zap,
  LayoutGrid,
  List,
  CalendarDays,
  Printer,
  Download,
  Save,
  Keyboard,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Calendar as CalendarIcon,
  RotateCcw,
  CheckCheck,
  Lock,
  Smartphone,
  Check,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Table, TableHead, TableHeaderCell, TableRow, TableCell } from '../../components/ui/Table';

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

interface WeekDayInfo {
  dateStr: string;
  dayName: string;
  dayNum: number;
  fullDate: Date;
  isHoliday: boolean;
  holidayName: string;
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
}

const CYCLE_STATUS_MAP: Record<string, AttendanceStatus | undefined> = {
  undefined: 'PRESENT',
  PRESENT: 'ABSENT',
  ABSENT: 'PRESENT',
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
  isTeacher
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AttendanceStatus | 'UNMARKED'>('ALL');
  // Default to mobile touch cards on screens <768px, or weekly calendar on larger screens
  const [viewMode, setViewMode] = useState<'cards' | 'weekly' | 'table'>('cards');
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [gridFocus, setGridFocus] = useState<{ studentIndex: number; dayIndex: number } | null>(null);
  const [activeNoteCell, setActiveNoteCell] = useState<{ studentId: string; dateStr: string } | null>(null);

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
      const holidayName = isNationalHoliday
        ? 'National Holiday'
        : isWeekend
        ? 'Government Weekend'
        : '';

      weekDays.push({
        dateStr,
        dayName,
        dayNum,
        fullDate: d,
        isHoliday,
        holidayName
      });
    }
    return weekDays;
  };

  const weekDays = getWeekDays(selectedDate);
  const weekStartDateStr = weekDays[0]?.dateStr;
  const weekEndDateStr = weekDays[6]?.dateStr;
  const selectedDayInfo = weekDays.find((d) => d.dateStr === selectedDate);
  const isSelectedDateHoliday = selectedDayInfo?.isHoliday ?? false;
  const selectedDateHolidayName = selectedDayInfo?.holidayName || 'Holiday';

  // Stats computation
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
  const completionPercentage = totalStudents > 0 ? Math.round((markedCount / totalStudents) * 100) : 0;
  const presentPercentage = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  // Filtered list
  const filteredStudents = students.filter((s) => {
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
    const roll = String(s.rollNumber || '').toLowerCase();
    const sId = String(s.studentId || '').toLowerCase();
    const matchesSearch =
      fullName.includes(searchTerm.toLowerCase()) ||
      roll.includes(searchTerm.toLowerCase()) ||
      sId.includes(searchTerm.toLowerCase());

    const currentStatus = attendance[s.id];
    let matchesFilter = true;
    if (statusFilter === 'UNMARKED') {
      matchesFilter = !currentStatus;
    } else if (statusFilter !== 'ALL') {
      matchesFilter = currentStatus === statusFilter;
    }

    return matchesSearch && matchesFilter;
  });

  // Date Navigation
  const changeWeekByDays = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    const nextDateStr = d.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    if (nextDateStr > todayStr) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(nextDateStr);
    }
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  // Fast 1-Click Status Cycle
  const handleCellCycleStatus = (studentId: string, dateStr: string, currentStatus?: AttendanceStatus) => {
    const nextStatus = CYCLE_STATUS_MAP[String(currentStatus)];
    if (nextStatus) {
      onWeeklyStatusChange(studentId, dateStr, nextStatus);
      if (dateStr === selectedDate) onStatusChange(studentId, nextStatus);
    } else {
      onWeeklyStatusChange(studentId, dateStr, 'PRESENT');
      if (dateStr === selectedDate) onStatusChange(studentId, 'PRESENT');
    }
  };

  // Bulk Mark Day Present
  const handleBulkMarkDayPresent = (dateStr: string) => {
    filteredStudents.forEach((student) => {
      onWeeklyStatusChange(student.id, dateStr, 'PRESENT');
      if (dateStr === selectedDate) {
        onStatusChange(student.id, 'PRESENT');
      }
    });
    toast.success(`Marked all students Present for ${dateStr}! ⚡`);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (students.length === 0) return;
    const csvRows = [
      ['Roll No', 'Student ID', 'Student Name', 'Class', 'Section', 'Date', 'Status', 'Notes']
    ];

    students.forEach((s) => {
      csvRows.push([
        s.rollNumber ? String(s.rollNumber) : 'N/A',
        s.studentId,
        `"${s.firstName} ${s.lastName}"`,
        className,
        sectionName,
        selectedDate,
        attendance[s.id] || 'UNMARKED',
        `"${notes[s.id] || ''}"`
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* ── 📱 MOBILE HORIZONTAL DAY CAROUSEL (SINGLE-THUMB DATE TAP) ───────────── */}
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

      {/* ── 1. DESKTOP DATE & WEEK CONTROLS BAR ───────────────────────────── */}
      <div className="hidden md:flex glass-card p-4 rounded-3xl items-center justify-between gap-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 no-print shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400 tracking-wider uppercase">
              ATTENDANCE REGISTER
            </div>
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

        {/* Week Jump Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeWeekByDays(-7)}
            title="Previous Week"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const todayStr = new Date().toISOString().split('T')[0];
              if (e.target.value > todayStr) {
                toast.error("Cannot select a future date!");
              } else {
                setSelectedDate(e.target.value);
              }
            }}
            max={new Date().toISOString().split('T')[0]}
            className="input-field py-1.5 px-3 text-xs font-semibold max-w-[140px]"
          />

          <button
            onClick={() => changeWeekByDays(7)}
            title="Next Week"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {!isToday && (
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-all"
            >
              This Week
            </button>
          )}
        </div>

        {/* Action Tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            disabled={students.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-bold transition-all disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={handlePrint}
            disabled={students.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-bold transition-all disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* ── 2. TOOLBAR (SEARCH & RESPONSIVE VIEW SWITCHER) ─────────────────── */}
      <div className="glass-card p-3 md:p-4 rounded-3xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border border-slate-200/60 dark:border-white/5 bg-white/80 dark:bg-slate-900/50 no-print">
        {/* Search & Filter */}
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student profile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-9 py-2 text-xs w-full"
            />
          </div>

          {/* Quick Mark All Present button */}
          <button
            type="button"
            disabled={isSelectedDateHoliday || selectedDate > new Date().toISOString().split('T')[0]}
            onClick={() => {
              onBatchSetStatus('PRESENT', 'ALL');
              toast.success('Marked all students Present! ⚡');
            }}
            className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed disabled:hover:bg-slate-300 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all whitespace-nowrap"
          >
            <CheckCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Mark All Present</span>
          </button>
        </div>

        {/* 📱 Mobile Responsive View Switcher (Cards | Weekly | Table) */}
        <div className="flex items-center justify-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/60 dark:border-white/5">
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'cards'
                ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
            title="Mobile Touch Cards View"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'weekly'
                ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
            title="Weekly Calendar Matrix View"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Weekly</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'table'
                ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
            title="Daily Register Table View"
          >
            <List className="w-3.5 h-3.5" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* ── 3. MAIN ATTENDANCE VIEW CONTENT ─────────────────────────────── */}
      {loading ? (
        <div className="glass-card p-12 rounded-3xl border border-slate-200/60 dark:border-white/5 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-slate-500">Loading Register...</span>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="glass-card p-10 rounded-3xl border border-slate-200/60 dark:border-white/5 text-center text-slate-500 text-xs italic">
          No students found matching current search.
        </div>
      ) : isSelectedDateHoliday && viewMode !== 'weekly' ? (
        /* ── HOLIDAY LOCK — attendance entry disabled for this date ────── */
        <div className="glass-card p-10 rounded-3xl border border-purple-200 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-950/20 text-center flex flex-col items-center justify-center space-y-3">
          <Lock className="w-10 h-10 text-purple-500" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedDateHolidayName}</h3>
          <p className="text-slate-600 dark:text-slate-400 text-xs max-w-sm leading-relaxed">
            {selectedDate} is marked as a holiday. Attendance cannot be recorded for this date. Switch to the Weekly view or pick a working day to continue.
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        /* ══════════════════════════════════════════════════════════════════ */
        /* ── A. 📱 MOBILE-FIRST TOUCH CARDS VIEW (44PX+ THUMB TARGETS) ──── */
        /* ══════════════════════════════════════════════════════════════════ */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 no-print">
          {filteredStudents.map((student) => {
            const currentStatus = attendance[student.id];
            const currentNote = notes[student.id] || '';

            return (
              <div
                key={student.id}
                className={`glass-card p-4 rounded-3xl border transition-all relative flex flex-col justify-between space-y-3 ${
                  currentStatus === 'PRESENT'
                    ? 'border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-500/5 ring-1 ring-emerald-500/20'
                    : currentStatus === 'ABSENT'
                    ? 'border-rose-500/50 bg-rose-50/20 dark:bg-rose-500/5 ring-1 ring-rose-500/20'
                    : 'border-slate-200/60 dark:border-white/5 bg-white dark:bg-slate-900/40'
                }`}
              >
                {/* Student Info Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-500 to-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                      {student.firstName[0]}
                      {student.lastName[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                        {student.firstName} {student.lastName}
                      </h4>
                      <div className="text-[11px] text-slate-400 font-mono">Roll: #{student.rollNumber || 'N/A'} • ID: {student.studentId}</div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      currentStatus === 'PRESENT'
                        ? 'bg-emerald-500 text-white'
                        : currentStatus === 'ABSENT'
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {currentStatus || 'UNMARKED'}
                  </span>
                </div>

                {/* ⚡ 44px+ Touch Buttons for Present and Absent */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onStatusChange(student.id, 'PRESENT')}
                    className={`h-11 rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                      currentStatus === 'PRESENT'
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 scale-[1.02]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-100 active:scale-95'
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Present</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onStatusChange(student.id, 'ABSENT')}
                    className={`h-11 rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                      currentStatus === 'ABSENT'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 scale-[1.02]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-rose-100 active:scale-95'
                    }`}
                  >
                    <X className="w-4 h-4 stroke-[3]" />
                    <span>Absent</span>
                  </button>
                </div>

                {/* Touch Input Remark */}
                <input
                  type="text"
                  placeholder="Remark / Note..."
                  value={currentNote}
                  onChange={(e) => onNoteChange(student.id, e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400"
                />
              </div>
            );
          })}
        </div>
      ) : viewMode === 'weekly' ? (
        /* ══════════════════════════════════════════════════════════════════ */
        /* ── B. WEEKLY CALENDAR MATRIX VIEW ──────────────────────────────── */
        /* ══════════════════════════════════════════════════════════════════ */
        <div className="glass-card rounded-3xl border border-slate-200/70 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900/60 shadow-xl relative">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300">
                  <th className="py-4 px-5 min-w-[200px] font-bold text-xs uppercase tracking-wider bg-slate-100/90 dark:bg-slate-800/90 sticky left-0 z-20 shadow-xs border-r border-slate-200 dark:border-white/10">
                    <span>Student Profile</span>
                  </th>

                  {weekDays.map((day) => {
                    const isSelectedDateCol = day.dateStr === selectedDate;
                    return (
                      <th
                        key={day.dateStr}
                        className={`py-3 px-2 text-center min-w-[120px] border-r border-slate-200/60 dark:border-white/5 transition-all ${
                          day.isHoliday
                            ? 'bg-purple-50/80 dark:bg-purple-950/30 text-purple-950 dark:text-purple-300'
                            : isSelectedDateCol
                            ? 'bg-primary-50 dark:bg-primary-600/20 text-primary-900 dark:text-white font-extrabold ring-2 ring-primary-500 inset-0'
                            : 'hover:bg-slate-100/60 dark:hover:bg-white/5'
                        }`}
                      >
                        <div onClick={() => setSelectedDate(day.dateStr)} className="cursor-pointer">
                          <div className="text-sm font-black tracking-tight">{day.dayNum}</div>
                          <div className="text-[11px] font-bold uppercase opacity-75">{day.dayName}</div>
                        </div>

                        {day.isHoliday ? (
                          <div className="mt-1 flex items-center justify-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            <Lock className="w-2.5 h-2.5" />
                            <span>Holiday</span>
                          </div>
                        ) : day.dateStr > new Date().toISOString().split('T')[0] ? (
                          <div className="mt-1 flex items-center justify-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                            <Lock className="w-2.5 h-2.5 opacity-60" />
                            <span>Locked</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleBulkMarkDayPresent(day.dateStr)}
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
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-xs">
                {filteredStudents.map((student) => {
                  const studentWeeklyMap = weeklyAttendance[student.id] || {};

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.01]">
                      <td className="py-3 px-5 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/10">
                        <div className="font-bold text-slate-900 dark:text-white text-xs">
                          {student.firstName} {student.lastName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">Roll: #{student.rollNumber || 'N/A'}</div>
                      </td>

                      {weekDays.map((day) => {
                        const dayRecord = studentWeeklyMap[day.dateStr] || (day.dateStr === selectedDate ? { status: attendance[student.id], notes: notes[student.id] } : undefined);
                        const status = dayRecord?.status;
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isFuture = day.dateStr > todayStr;

                        if (day.isHoliday) {
                          return (
                            <td key={day.dateStr} className="py-3 px-2 text-center border-r bg-purple-50/30 dark:bg-purple-950/10 text-purple-600">
                              <Lock className="w-3.5 h-3.5 mx-auto opacity-60" />
                            </td>
                          );
                        }

                        if (isFuture) {
                          return (
                            <td key={day.dateStr} className="py-3 px-2 text-center border-r bg-slate-50/30 dark:bg-slate-900/10 text-slate-400 dark:text-slate-600" title="Future Date">
                              <Lock className="w-3.5 h-3.5 mx-auto opacity-30" />
                            </td>
                          );
                        }

                        return (
                          <td
                            key={day.dateStr}
                            onClick={() => handleCellCycleStatus(student.id, day.dateStr, status)}
                            className="py-2 px-2 text-center border-r transition-all cursor-pointer hover:bg-slate-100/50"
                          >
                            {status === 'PRESENT' ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </span>
                            ) : status === 'ABSENT' ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400">
                                <X className="w-3.5 h-3.5 stroke-[3]" />
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
      ) : (
        /* ══════════════════════════════════════════════════════════════════ */
        /* ── C. DAILY REGISTER TABLE VIEW ───────────────────────────────── */
        /* ══════════════════════════════════════════════════════════════════ */
        <Table>
          <TableHead>
            <TableHeaderCell className="w-12 text-center">#</TableHeaderCell>
            <TableHeaderCell className="w-20">Roll</TableHeaderCell>
            <TableHeaderCell>Student Details</TableHeaderCell>
            <TableHeaderCell className="text-center">Attendance Status</TableHeaderCell>
          </TableHead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {filteredStudents.map((student, idx) => {
              const currentStatus = attendance[student.id];

              return (
                <TableRow key={student.id} index={idx}>
                  <TableCell className="text-center font-mono text-xs text-slate-400 font-bold">{idx + 1}</TableCell>
                  <TableCell className="font-mono font-bold text-xs">{student.rollNumber || '—'}</TableCell>
                  <TableCell className="font-bold text-slate-900 dark:text-white">
                    {student.firstName} {student.lastName}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => onStatusChange(student.id, 'PRESENT')}
                        title="Mark Present"
                        className={`p-2 rounded-xl transition-all ${
                          currentStatus === 'PRESENT'
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                        }`}
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onStatusChange(student.id, 'ABSENT')}
                        title="Mark Absent"
                        className={`p-2 rounded-xl transition-all ${
                          currentStatus === 'ABSENT'
                            ? 'bg-rose-500 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                        }`}
                      >
                        <X className="w-4 h-4 stroke-[3]" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}

      {/* ── 4. 📱 STICKY FLOATING MOBILE BOTTOM ACTION BAR ──────────────────── */}
      {students.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-t border-slate-200 dark:border-white/10 shadow-2xl no-print md:sticky md:bottom-6 md:rounded-3xl md:border md:m-0">
          <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
              <span className="text-emerald-600 font-bold">{presentCount} Present</span>
              <span className="text-rose-600 font-bold">{absentCount} Absent</span>
              {unmarkedCount > 0 && <span className="text-amber-600 font-bold">({unmarkedCount} Unmarked)</span>}
            </div>

            <button
              onClick={onSave}
              disabled={loading || isSelectedDateHoliday}
              title={isSelectedDateHoliday ? `${selectedDate} is a holiday — attendance cannot be submitted` : undefined}
              className="w-full md:w-auto h-12 md:h-11 flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-700 dark:disabled:to-slate-700 disabled:cursor-not-allowed text-white font-extrabold py-3 px-8 rounded-2xl transition-all shadow-lg shadow-primary-500/25 active:scale-95 text-sm"
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
