import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, ShieldAlert, UserCheck, ClipboardCheck, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { AttendanceRegisterSheet, AttendanceStatus, StudentRecord } from './AttendanceRegisterSheet';
import { AttendanceMyView, type AttendanceHistoryRecord } from './AttendanceMyView';
import { AssignTeacherModal } from './AssignTeacherModal';
import { PageHeader, Select, Button, Skeleton, Tabs } from '../../components/ui';
import { AttendanceMonthlySummary } from './AttendanceMonthlySummary';
import { ErrorState } from '../../components/ui/Feedback';
import { useClassSectionMeta } from '../../utils/classSections';

const todayStr = () => new Date().toISOString().split('T')[0];

interface ChildSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
}

const AttendanceEntry = () => {
  const { user } = useAuthStore();
  const isStudent = user?.role === 'STUDENT';
  const isTeacher = user?.role === 'TEACHER';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isGuardian = user?.role === 'GUARDIAN';
  const isAccountant = user?.role === 'ACCOUNTANT';

  // State for Admin/Teacher operations
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  // Register (daily keyboard sheet) vs Monthly summary. Register state lives
  // in this component, so switching tabs never loses unsaved marks.
  const [activeView, setActiveView] = useState<'register' | 'summary'>('register');

  // Real institution classes/sections for the ADMIN picker. TEACHER uses
  // `assignedSections` from /attendance/my-sections instead, unchanged.
  const { classes: adminClasses, sections: adminSections } = useClassSectionMeta(selectedClass);

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [weeklyAttendance, setWeeklyAttendance] = useState<Record<string, Record<string, { status: AttendanceStatus; notes?: string }>>>({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sheetError, setSheetError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Baseline snapshot taken right after a successful fetch/save — used to
  // detect unsaved edits for the beforeunload / switch-away guard.
  const baselineRef = useRef<{ attendance: Record<string, AttendanceStatus>; notes: Record<string, string> }>({
    attendance: {},
    notes: {},
  });

  const isDirty = useMemo(
    () => JSON.stringify(attendance) !== JSON.stringify(baselineRef.current.attendance) || JSON.stringify(notes) !== JSON.stringify(baselineRef.current.notes),
    [attendance, notes]
  );

  // Warn on tab close / refresh while there are unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const confirmDiscardIfDirty = (message: string) => {
    if (!isDirty) return true;
    return window.confirm(message);
  };

  // Teacher specific state
  const [assignedSections, setAssignedSections] = useState<any[]>([]);
  const [hasAssignments, setHasAssignments] = useState(true);

  // Student / Guardian "My attendance" state
  const [myRecords, setMyRecords] = useState<AttendanceHistoryRecord[]>([]);
  const [finesDue, setFinesDue] = useState(0);
  const [myAttendanceLoading, setMyAttendanceLoading] = useState(true);
  const [myAttendanceError, setMyAttendanceError] = useState(false);

  // Guardian child switcher
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(isGuardian);

  // Admin Assign Teacher Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [assignForm, setAssignForm] = useState({ teacherId: '', class: '', section: '' });
  const [assigning, setAssigning] = useState(false);
  // Separate class/section lookup for the Assign Teacher modal (assignForm.class
  // can differ from the page-level selectedClass filter).
  const { classes: assignModalClasses, sections: assignModalSections } = useClassSectionMeta(assignForm.class);

  // Fetch meta info or student records based on role
  const loadInitialMetadata = async () => {
    try {
      setInitialLoading(true);
      if (isTeacher) {
        const res = await apiClient.get('/attendance/my-sections');
        const sections = res.data.data || [];
        setAssignedSections(sections);
        if (sections.length > 0) {
          setSelectedClass(sections[0].class.name);
          setSelectedSection(sections[0].name);
          setHasAssignments(true);
        } else {
          setHasAssignments(false);
        }
      } else if (isAdmin) {
        const res = await apiClient.get('/users?role=TEACHER&pageSize=100');
        setTeachersList(res.data.data || []);
      } else if (isGuardian) {
        try {
          setChildrenLoading(true);
          const res = await apiClient.get('/guardians/me/students');
          const list: ChildSummary[] = res.data.data || [];
          setChildren(list);
          if (list.length > 0) setSelectedChildId(list[0].id);
        } catch (err) {
          console.error('Failed to load linked children', err);
          toast.error('Failed to load your children');
        } finally {
          setChildrenLoading(false);
        }
      }
    } catch (err) {
      console.error('Failed to load initial metadata', err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadInitialMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Default the ADMIN class/section selects to the institution's first
  // real class/section once loaded, and keep the section in sync whenever
  // the selected class's section list changes.
  useEffect(() => {
    if (!isAdmin) return;
    if (!selectedClass && adminClasses.length > 0) {
      setSelectedClass(adminClasses[0].name);
    }
  }, [isAdmin, adminClasses, selectedClass]);

  useEffect(() => {
    if (!isAdmin) return;
    if (adminSections.length > 0 && !adminSections.some((s) => s.name === selectedSection)) {
      setSelectedSection(adminSections[0].name);
    }
  }, [isAdmin, adminSections, selectedSection]);

  // Same defaulting for the Assign Class Teacher modal's own class/section pickers.
  useEffect(() => {
    if (!assignForm.class && assignModalClasses.length > 0) {
      setAssignForm((prev) => ({ ...prev, class: assignModalClasses[0].name }));
    }
  }, [assignModalClasses, assignForm.class]);

  useEffect(() => {
    if (assignModalSections.length > 0 && !assignModalSections.some((s) => s.name === assignForm.section)) {
      setAssignForm((prev) => ({ ...prev, section: assignModalSections[0].name }));
    }
  }, [assignModalSections, assignForm.section]);

  // Load attendance sheet for Teacher/Admin when parameters change
  const fetchAttendanceSheet = async () => {
    if (isStudent || isGuardian || isAccountant || (isTeacher && !hasAssignments)) return;
    if (isAdmin && (!selectedClass || !selectedSection)) return;
    try {
      setLoading(true);
      setSheetError(false);
      const res = await apiClient.get(
        `/attendance/sheet?className=${encodeURIComponent(selectedClass)}&sectionName=${encodeURIComponent(selectedSection)}&date=${selectedDate}`
      );
      const sheetData = res.data.data || [];
      setStudents(sheetData);

      const initialAttendance: Record<string, AttendanceStatus> = {};
      const initialNotes: Record<string, string> = {};

      sheetData.forEach((student: any) => {
        initialAttendance[student.id] = student.status || 'PRESENT';
        initialNotes[student.id] = student.notes || '';
      });

      setAttendance(initialAttendance);
      setNotes(initialNotes);
      baselineRef.current = { attendance: initialAttendance, notes: initialNotes };
      setSaveError(null);

      // Fetch weekly data concurrently
      fetchWeeklySheet(selectedDate);
    } catch (err) {
      console.error('Failed to fetch attendance sheet', err);
      setSheetError(true);
      toast.error('Failed to load attendance sheet');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklySheet = async (refDate: string) => {
    try {
      const ref = new Date(refDate);
      const validRef = isNaN(ref.getTime()) ? new Date() : ref;
      const dayOfWeek = validRef.getDay();
      const distanceToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(validRef);
      monday.setDate(validRef.getDate() + distanceToMon);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const startDateStr = monday.toISOString().split('T')[0];
      const endDateStr = sunday.toISOString().split('T')[0];

      const res = await apiClient.get(
        `/attendance/sheet/weekly?className=${encodeURIComponent(selectedClass)}&sectionName=${encodeURIComponent(selectedSection)}&startDate=${startDateStr}&endDate=${endDateStr}`
      );
      const sheetData = res.data.data || [];
      const weeklyMap: Record<string, Record<string, { status: AttendanceStatus; notes?: string }>> = {};

      sheetData.forEach((s: any) => {
        weeklyMap[s.id] = s.attendanceMap || {};
      });

      setWeeklyAttendance(weeklyMap);
    } catch (err) {
      console.error('Failed to fetch weekly attendance sheet', err);
    }
  };

  useEffect(() => {
    fetchAttendanceSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSection, selectedDate, hasAssignments]);

  // Student's own history, or a guardian's selected child's history — same
  // response shape from the backend ({ attendance, statistics, finesDue }).
  const fetchMyAttendance = async () => {
    if (!isStudent && !(isGuardian && selectedChildId)) return;
    try {
      setMyAttendanceLoading(true);
      setMyAttendanceError(false);
      const url = isStudent ? '/attendance/my-attendance' : `/attendance/child/${selectedChildId}`;
      const res = await apiClient.get(url);
      setMyRecords(res.data.data.attendance || []);
      setFinesDue(res.data.data.finesDue || 0);
    } catch (err) {
      console.error('Failed to load attendance history', err);
      setMyAttendanceError(true);
    } finally {
      setMyAttendanceLoading(false);
    }
  };

  useEffect(() => {
    if (isStudent) {
      fetchMyAttendance();
    } else if (isGuardian) {
      if (childrenLoading) return;
      if (!selectedChildId) {
        setMyAttendanceLoading(false);
        return;
      }
      fetchMyAttendance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, isGuardian, selectedChildId, childrenLoading]);

  const handleSetSelectedDate = (date: string) => {
    if (date > todayStr()) {
      toast.error('Cannot select a future date!');
      return;
    }
    if (!confirmDiscardIfDirty('You have unsaved attendance changes for this date. Discard them and switch date?')) return;
    setSelectedDate(date);
  };

  const handleClassChange = (name: string) => {
    if (!confirmDiscardIfDirty('You have unsaved attendance changes. Discard them and switch class?')) return;
    setSelectedClass(name);
  };

  const handleSectionChange = (name: string) => {
    if (!confirmDiscardIfDirty('You have unsaved attendance changes. Discard them and switch section?')) return;
    setSelectedSection(name);
  };

  const handleTeacherSectionChange = (value: string) => {
    if (!confirmDiscardIfDirty('You have unsaved attendance changes. Discard them and switch section?')) return;
    const [cName, sName] = value.split('-');
    setSelectedClass(cName);
    setSelectedSection(sName);
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    if (selectedDate > todayStr()) {
      toast.error('Cannot mark attendance for future dates!');
      return;
    }
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleNoteChange = (studentId: string, note: string) => {
    if (selectedDate > todayStr()) {
      toast.error('Cannot add notes for future dates!');
      return;
    }
    setNotes((prev) => ({ ...prev, [studentId]: note }));
  };

  const handleWeeklyStatusChange = async (studentId: string, dateStr: string, status: AttendanceStatus, note?: string) => {
    if (dateStr > todayStr()) {
      toast.error('Cannot mark attendance for future dates!');
      return;
    }
    setWeeklyAttendance((prev) => {
      const studentMap = prev[studentId] || {};
      return { ...prev, [studentId]: { ...studentMap, [dateStr]: { status, notes: note || undefined } } };
    });

    try {
      await apiClient.post('/attendance/bulk', {
        date: new Date(dateStr).toISOString(),
        records: [{ studentId, status, notes: note || null }],
      });
      toast.success(`Updated status for ${dateStr}`);
      if (dateStr === selectedDate) {
        baselineRef.current = { ...baselineRef.current, attendance: { ...baselineRef.current.attendance, [studentId]: status } };
      }
    } catch {
      toast.error('Failed to save status update');
    }
  };

  const handleBatchSetStatus = (status: AttendanceStatus, target: 'ALL' | 'UNMARKED' = 'ALL') => {
    if (selectedDate > todayStr()) {
      toast.error('Cannot mark attendance for future dates!');
      return;
    }
    setAttendance((prev) => {
      const next = { ...prev };
      students.forEach((s) => {
        if (target === 'ALL' || !next[s.id]) next[s.id] = status;
      });
      return next;
    });
  };

  // "Clear" — unmark every student for this date (local, unsaved state only).
  const handleClearAttendance = () => {
    if (selectedDate > todayStr()) {
      toast.error('Cannot clear attendance for future dates!');
      return;
    }
    setAttendance({});
  };

  const handleSaveAttendance = async () => {
    if (selectedDate > todayStr()) {
      toast.error('Cannot submit attendance for future dates!');
      return;
    }
    setLoading(true);
    setSaveError(null);
    try {
      const records = students.map((student) => ({
        studentId: student.id,
        status: attendance[student.id] || 'PRESENT',
        notes: notes[student.id]?.trim() ? notes[student.id].trim() : null,
      }));
      await apiClient.post('/attendance/bulk', { date: new Date(selectedDate).toISOString(), records });
      toast.success(`Attendance register submitted successfully for ${selectedClass}-${selectedSection}`);
      fetchAttendanceSheet();
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to submit attendance';
      setSaveError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.teacherId) {
      toast.error('Please select a teacher');
      return;
    }
    const sec = assignModalSections.find((s) => s.name === assignForm.section);
    if (!sec) {
      toast.error(`Section ${assignForm.section} under class ${assignForm.class} does not exist. Please seed classes first.`);
      return;
    }
    setAssigning(true);
    try {
      await apiClient.post('/attendance/assign-teacher', { teacherId: assignForm.teacherId, sectionId: sec.id });
      toast.success('Teacher assigned successfully!');
      setIsAssignModalOpen(false);
      setAssignForm({ teacherId: '', class: '', section: '' });
    } catch (err: any) {
      toast.error(err.message || err.response?.data?.message || 'Failed to assign teacher');
    } finally {
      setAssigning(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  // ── 1. STUDENT VIEW ───────────────────────────────────────────────────────
  if (isStudent) {
    return (
      <div className="max-w-5xl mx-auto">
        <PageHeader title="My Attendance Portal" description="Review your attendance stats, history, and absentee fines." />
        <AttendanceMyView
          records={myRecords}
          finesDue={finesDue}
          isLoading={myAttendanceLoading}
          isError={myAttendanceError}
          onRetry={fetchMyAttendance}
        />
      </div>
    );
  }

  // ── 2. GUARDIAN VIEW ───────────────────────────────────────────────────────
  if (isGuardian) {
    const selectedChild = children.find((c) => c.id === selectedChildId);
    return (
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Child's Attendance" description="Review your child's attendance stats, history, and absentee fines." />
        {childrenLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : children.length === 0 ? (
          <div className="glass-card p-10 rounded-2xl border border-slate-200/50 dark:border-white/5 text-center text-slate-600 dark:text-slate-400">
            <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40 text-primary-500" />
            <p>No linked children were found on your account. Contact your institution administrator.</p>
          </div>
        ) : (
          <AttendanceMyView
            records={myRecords}
            finesDue={finesDue}
            isLoading={myAttendanceLoading}
            isError={myAttendanceError}
            onRetry={fetchMyAttendance}
            headerActions={
              children.length > 1 ? (
                <Select
                  label="Viewing child"
                  value={selectedChildId ?? ''}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                  options={children.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName} (${c.studentId})` }))}
                  containerClassName="max-w-xs"
                />
              ) : selectedChild ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Showing attendance for <span className="font-semibold text-slate-900 dark:text-white">{selectedChild.firstName} {selectedChild.lastName}</span>
                </p>
              ) : null
            }
          />
        )}
      </div>
    );
  }

  if (isAccountant) {
    return (
      <div className="space-y-6">
        <PageHeader title="Monthly Attendance Summary" description="Per-student monthly attendance with chronic-absentee highlighting." />
        <AttendanceMonthlySummary isTeacher={false} />
        <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 text-center text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
          <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40 text-primary-500" />
          <p>Institution-wide attendance trends are available on the Reports page.</p>
          <a href="/reports" className="inline-block mt-4 text-primary-600 dark:text-primary-400 font-semibold text-sm hover:underline">Go to Reports →</a>
        </div>
      </div>
    );
  }

  // ── 3. TEACHER / ADMIN VIEW ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Digital Attendance Register"
        description="Record daily or review full week calendar matrix attendance with holiday protection."
        actions={
          isAdmin ? (
            <Button onClick={() => setIsAssignModalOpen(true)} leftIcon={<Users className="w-4 h-4" />}>
              Assign Class Teacher
            </Button>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { id: 'register', label: 'Daily register', icon: <ClipboardCheck className="w-4 h-4" /> },
          { id: 'summary', label: 'Monthly summary', icon: <BarChart3 className="w-4 h-4" /> },
        ]}
        value={activeView}
        onChange={(id) => setActiveView(id as 'register' | 'summary')}
        className="no-print"
      />

      {activeView === 'summary' ? (
        <AttendanceMonthlySummary isTeacher={isTeacher} />
      ) : !hasAssignments && isTeacher ? (
        <div className="glass-card p-8 rounded-2xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
          <ShieldAlert className="w-12 h-12 text-rose-500" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Assigned Sections</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md leading-relaxed">
            You are not assigned to any sections as class teacher. Please contact your institution administrator to assign sections to your account.
          </p>
        </div>
      ) : sheetError ? (
        <ErrorState title="Failed to load the attendance register" onRetry={fetchAttendanceSheet} />
      ) : (
        <>
          {/* Class / Section / Date toolbar */}
          <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-4 border border-slate-200/60 dark:border-white/5 shadow-xs no-print">
            {isTeacher ? (
              <Select
                label="Assigned section"
                value={`${selectedClass}-${selectedSection}`}
                onChange={(e) => handleTeacherSectionChange(e.target.value)}
                options={assignedSections.map((s) => ({ value: `${s.class.name}-${s.name}`, label: `${s.class.name} — Section ${s.name}` }))}
                containerClassName="min-w-[200px]"
              />
            ) : (
              <>
                <Select
                  label="Class"
                  value={selectedClass}
                  onChange={(e) => handleClassChange(e.target.value)}
                  options={adminClasses.map((cls) => ({ value: cls.name, label: cls.name }))}
                  containerClassName="min-w-[140px]"
                />
                <Select
                  label="Section"
                  value={selectedSection}
                  onChange={(e) => handleSectionChange(e.target.value)}
                  options={adminSections.map((sec) => ({ value: sec.name, label: `Section ${sec.name}` }))}
                  containerClassName="min-w-[140px]"
                />
              </>
            )}

            <div className="flex flex-col">
              <label htmlFor="attendance-date" className="field-label">Date</label>
              <input
                id="attendance-date"
                type="date"
                value={selectedDate}
                onChange={(e) => handleSetSelectedDate(e.target.value)}
                max={todayStr()}
                className="input-field py-2 min-w-[150px] font-bold"
              />
            </div>
          </div>

          <AttendanceRegisterSheet
            className={selectedClass}
            sectionName={selectedSection}
            selectedDate={selectedDate}
            setSelectedDate={handleSetSelectedDate}
            students={students}
            attendance={attendance}
            notes={notes}
            weeklyAttendance={weeklyAttendance}
            onStatusChange={handleStatusChange}
            onNoteChange={handleNoteChange}
            onWeeklyStatusChange={handleWeeklyStatusChange}
            onBatchSetStatus={handleBatchSetStatus}
            onResetAttendance={handleClearAttendance}
            onSave={handleSaveAttendance}
            loading={loading}
            isTeacher={isTeacher}
            isDirty={isDirty}
            saveError={saveError}
          />
        </>
      )}

      {isAdmin && (
        <AssignTeacherModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          teachersList={teachersList}
          classes={assignModalClasses}
          sections={assignModalSections}
          form={assignForm}
          onFormChange={setAssignForm}
          onSubmit={handleAssignTeacherSubmit}
          assigning={assigning}
        />
      )}
    </div>
  );
};

export default AttendanceEntry;
