import React, { useState, useEffect } from 'react';
import { Calendar, Users, UserCheck, ShieldAlert, Coins } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { AttendanceRegisterSheet, AttendanceStatus, StudentRecord } from './AttendanceRegisterSheet';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

const CLASSES = [
  'KG', 'Nursery', 'Junior One',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
];

const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const AttendanceEntry = () => {
  const { user } = useAuthStore();
  const isStudent = user?.role === 'STUDENT';
  const isTeacher = user?.role === 'TEACHER';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isGuardian = user?.role === 'GUARDIAN';
  const isAccountant = user?.role === 'ACCOUNTANT';

  // State for Admin/Teacher operations
  const [selectedClass, setSelectedClass] = useState('Class 8');
  const [selectedSection, setSelectedSection] = useState('A');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [weeklyAttendance, setWeeklyAttendance] = useState<Record<string, Record<string, { status: AttendanceStatus; notes?: string }>>>({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Teacher specific state
  const [assignedSections, setAssignedSections] = useState<any[]>([]);
  const [hasAssignments, setHasAssignments] = useState(true);

  // Student specific state
  const [studentHistory, setStudentHistory] = useState<any[]>([]);
  const [studentStats, setStudentStats] = useState<any>(null);
  const [finesDue, setFinesDue] = useState(0);

  // Admin Assign Teacher Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [assignForm, setAssignForm] = useState({
    teacherId: '',
    class: 'Class 8',
    section: 'A'
  });
  const [assigning, setAssigning] = useState(false);

  // Fetch meta info or student records based on role
  const loadInitialMetadata = async () => {
    try {
      setInitialLoading(true);
      if (isStudent) {
        const res = await apiClient.get('/attendance/my-attendance');
        setStudentHistory(res.data.data.attendance || []);
        setStudentStats(res.data.data.statistics || null);
        setFinesDue(res.data.data.finesDue || 0);
      } else if (isTeacher) {
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
      }
    } catch (err) {
      console.error('Failed to load initial metadata', err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadInitialMetadata();
  }, [user]);

  // Load attendance sheet for Teacher/Admin when parameters change
  const fetchAttendanceSheet = async () => {
    if (isStudent || isGuardian || isAccountant || (isTeacher && !hasAssignments)) return;
    try {
      setLoading(true);
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

      // Fetch weekly data concurrently
      fetchWeeklySheet(selectedDate);
    } catch (err) {
      console.error('Failed to fetch attendance sheet', err);
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
  }, [selectedClass, selectedSection, selectedDate, hasAssignments]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setNotes((prev) => ({
      ...prev,
      [studentId]: note
    }));
  };

  const handleWeeklyStatusChange = async (studentId: string, dateStr: string, status: AttendanceStatus, note?: string) => {
    setWeeklyAttendance((prev) => {
      const studentMap = prev[studentId] || {};
      return {
        ...prev,
        [studentId]: {
          ...studentMap,
          [dateStr]: { status, notes: note || undefined },
        },
      };
    });

    try {
      await apiClient.post('/attendance/bulk', {
        date: new Date(dateStr).toISOString(),
        records: [{ studentId, status, notes: note || null }],
      });
      toast.success(`Updated status for ${dateStr}`);
    } catch (err) {
      toast.error('Failed to save status update');
    }
  };

  const handleBatchSetStatus = (status: AttendanceStatus, target: 'ALL' | 'UNMARKED' = 'ALL') => {
    setAttendance((prev) => {
      const next = { ...prev };
      students.forEach((s) => {
        if (target === 'ALL' || !next[s.id]) {
          next[s.id] = status;
        }
      });
      return next;
    });
  };

  const handleResetAttendance = () => {
    const defaultAttendance: Record<string, AttendanceStatus> = {};
    students.forEach((s) => {
      defaultAttendance[s.id] = 'PRESENT';
    });
    setAttendance(defaultAttendance);
  };

  const handleSaveAttendance = async () => {
    setLoading(true);
    try {
      const records = students.map((student) => ({
        studentId: student.id,
        status: attendance[student.id] || 'PRESENT',
        notes: notes[student.id]?.trim() ? notes[student.id].trim() : null
      }));
      await apiClient.post('/attendance/bulk', { date: new Date(selectedDate).toISOString(), records });
      toast.success(`Attendance register submitted successfully for ${selectedClass}-${selectedSection}`);
      fetchAttendanceSheet();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to submit attendance');
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
    setAssigning(true);
    try {
      const metaRes = await apiClient.get('/students/meta/classes');
      const classesMeta = metaRes.data.data || [];
      const cls = classesMeta.find((c: any) => c.name === assignForm.class);

      let sec = null;
      if (cls) {
        const sectionsRes = await apiClient.get(`/students/meta/sections?classId=${cls.id}`);
        const sectionsList = sectionsRes.data.data || [];
        sec = sectionsList.find((s: any) => s.name === assignForm.section);
      }

      if (!sec) {
        throw new Error(`Section ${assignForm.section} under class ${assignForm.class} does not exist. Please seed classes first.`);
      }

      await apiClient.post('/attendance/assign-teacher', {
        teacherId: assignForm.teacherId,
        sectionId: sec.id
      });

      toast.success('Teacher assigned successfully!');
      setIsAssignModalOpen(false);
      setAssignForm({ teacherId: '', class: 'Class 8', section: 'A' });
    } catch (err: any) {
      toast.error(err.message || err.response?.data?.message || 'Failed to assign teacher');
    } finally {
      setAssigning(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-400">
        <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <span>Loading Attendance Register Portal...</span>
      </div>
    );
  }

  // ── 1. STUDENT VIEW ───────────────────────────────────────────────────────
  if (isStudent) {
    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">My Attendance Portal</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Review your attendance stats, history, and absentee fines.</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 rounded-3xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-primary-500"></div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-semibold">Attendance Rate</span>
              <UserCheck className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">{studentStats?.attendancePercentage ?? 100}%</div>
            <div className="text-xs text-slate-500 mt-2">Recommended: 85% and above</div>
          </div>

          <div className="glass-card p-6 rounded-3xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-accent-500"></div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-semibold">Total Days Tracked</span>
              <Calendar className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">{studentStats?.totalDays ?? 0} Days</div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 flex gap-3">
              <span className="text-emerald-600 dark:text-emerald-400">Present: {studentStats?.present ?? 0}</span>
              <span className="text-rose-600 dark:text-rose-400">Absent: {studentStats?.absent ?? 0}</span>
              <span className="text-amber-600 dark:text-amber-400">Late: {studentStats?.late ?? 0}</span>
            </div>
          </div>

          <div className="glass-card p-6 rounded-3xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-rose-500"></div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-semibold">Absentee Fines Due</span>
              <Coins className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            </div>
            <div className="text-3xl font-black text-rose-600 dark:text-rose-400">৳{finesDue}</div>
            <div className="text-xs text-slate-500 mt-2">Calculation: ৳100 per day absent</div>
          </div>
        </div>

        {/* History Table */}
        <div className="glass-card rounded-3xl border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-xs bg-white dark:bg-slate-900/20">
          <div className="p-6 border-b border-slate-200/50 dark:border-white/5">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Attendance Log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Absent Fine Impact</th>
                  <th className="p-4 pr-6">Notes / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-sm text-slate-700 dark:text-slate-300">
                {studentHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500 italic">No attendance records found.</td>
                  </tr>
                ) : (
                  studentHistory.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors">
                      <td className="p-4 pl-6 font-semibold text-slate-900 dark:text-white">
                        {new Date(record.date).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          {
                            PRESENT: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20',
                            ABSENT: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20',
                            LATE: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20',
                            HALF_DAY: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20',
                          }[record.status as string]
                        }`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs">
                        {record.status === 'ABSENT' ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">+ ৳100</span>
                        ) : (
                          <span className="text-slate-500">৳0</span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-xs text-slate-500 dark:text-slate-400">
                        {record.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. GUARDIAN / ACCOUNTANT VIEWS ────────────────────────────────────────
  if (isGuardian) {
    return (
      <div className="glass-card p-10 rounded-2xl border border-slate-200/50 dark:border-white/5 text-center text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
        <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40 text-primary-500" />
        <p>Your linked children's attendance history is available on your Guardian Dashboard.</p>
        <a href="/" className="inline-block mt-4 text-primary-600 dark:text-primary-400 font-semibold text-sm hover:underline">Go to Dashboard →</a>
      </div>
    );
  }
  if (isAccountant) {
    return (
      <div className="glass-card p-10 rounded-2xl border border-slate-200/50 dark:border-white/5 text-center text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
        <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40 text-primary-500" />
        <p>Institution-wide attendance trends are available on the Reports page.</p>
        <a href="/reports" className="inline-block mt-4 text-primary-600 dark:text-primary-400 font-semibold text-sm hover:underline">Go to Reports →</a>
      </div>
    );
  }

  // ── 3. TEACHER / ADMIN VIEW ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            Digital Attendance Register
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Record daily or review full week calendar matrix attendance with holiday protection.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white px-5 py-2.5 rounded-2xl transition-all shadow-lg shadow-primary-500/20 text-xs font-bold active:scale-[0.98]"
          >
            <Users className="w-4 h-4" />
            Assign Class Teacher
          </button>
        )}
      </div>

      {!hasAssignments && isTeacher ? (
        <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
          <ShieldAlert className="w-12 h-12 text-rose-500" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Assigned Sections</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md leading-relaxed">
            You are not assigned to any sections as class teacher. Please contact your institution administrator to assign sections to your account.
          </p>
        </div>
      ) : (
        <>
          {/* Class Parameter Selector Bar */}
          <div className="glass-card p-5 rounded-3xl flex flex-wrap items-center gap-6 border border-slate-200/60 dark:border-white/5 bg-slate-50/80 dark:bg-slate-900/40 shadow-xs no-print">
            {isTeacher ? (
              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Assigned Section</label>
                <select
                  value={`${selectedClass}-${selectedSection}`}
                  onChange={(e) => {
                    const [cName, sName] = e.target.value.split('-');
                    setSelectedClass(cName);
                    setSelectedSection(sName);
                  }}
                  className="input-field py-2 font-bold min-w-[180px]"
                >
                  {assignedSections.map((s) => (
                    <option key={s.id} value={`${s.class.name}-${s.name}`}>
                      {s.class.name} — Section {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Class</label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="input-field py-2 font-bold min-w-[140px]"
                  >
                    {CLASSES.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Section</label>
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="input-field py-2 font-bold min-w-[120px]"
                  >
                    {SECTIONS.map((sec) => (
                      <option key={sec} value={sec}>
                        Section {sec}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="input-field py-2 min-w-[150px] font-bold"
              />
            </div>
          </div>

          {/* Interactive Digital Attendance Register Sheet Component */}
          <AttendanceRegisterSheet
            className={selectedClass}
            sectionName={selectedSection}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            students={students}
            attendance={attendance}
            notes={notes}
            weeklyAttendance={weeklyAttendance}
            onStatusChange={handleStatusChange}
            onNoteChange={handleNoteChange}
            onWeeklyStatusChange={handleWeeklyStatusChange}
            onBatchSetStatus={handleBatchSetStatus}
            onResetAttendance={handleResetAttendance}
            onSave={handleSaveAttendance}
            loading={loading}
            isTeacher={isTeacher}
          />
        </>
      )}

      {/* Admin Assign Teacher Modal */}
      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} className="max-w-md p-8">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                <Users className="w-5 h-5 text-primary-500" />
                Assign Class Teacher
              </h3>
            </div>

            <form onSubmit={handleAssignTeacherSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Select Class Teacher</label>
                <select
                  required
                  value={assignForm.teacherId}
                  onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })}
                  className="input-field py-2.5"
                >
                  <option value="">-- Choose Teacher --</option>
                  {teachersList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Class</label>
                  <select
                    value={assignForm.class}
                    onChange={(e) => setAssignForm({ ...assignForm, class: e.target.value })}
                    className="input-field py-2.5"
                  >
                    {CLASSES.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Section</label>
                  <select
                    value={assignForm.section}
                    onChange={(e) => setAssignForm({ ...assignForm, section: e.target.value })}
                    className="input-field py-2.5"
                  >
                    {SECTIONS.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-slate-100 dark:border-white/5">
                <Button type="button" variant="ghost" onClick={() => setIsAssignModalOpen(false)} className="px-5 py-2.5 text-xs">
                  Cancel
                </Button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 text-xs flex items-center gap-2"
                >
                  {assigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
      </Modal>
    </div>
  );
};

export default AttendanceEntry;
