import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, XCircle, Clock, ChevronDown, Save, ShieldAlert, BadgeAlert, Coins, Users, UserCheck, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';

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

  // State for Admin/Teacher operations
  const [selectedClass, setSelectedClass] = useState('Class 8');
  const [selectedSection, setSelectedSection] = useState('A');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY'>>({});
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
        // Load student attendance history and absentees fines
        const res = await apiClient.get('/attendance/my-attendance');
        setStudentHistory(res.data.data.attendance || []);
        setStudentStats(res.data.data.statistics || null);
        setFinesDue(res.data.data.finesDue || 0);
      } else if (isTeacher) {
        // Fetch teacher's assigned sections
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
        // Admins can fetch all teachers for the assigner modal
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
    if (isStudent || (isTeacher && !hasAssignments)) return;
    try {
      setLoading(true);
      const res = await apiClient.get(
        `/attendance/sheet?className=${encodeURIComponent(selectedClass)}&sectionName=${encodeURIComponent(selectedSection)}&date=${selectedDate}`
      );
      const sheetData = res.data.data || [];
      setStudents(sheetData);

      const initialAttendance: Record<string, 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY'> = {};
      sheetData.forEach((student: any) => {
        initialAttendance[student.id] = student.status || 'PRESENT';
      });
      setAttendance(initialAttendance);
    } catch (err) {
      console.error('Failed to fetch attendance sheet', err);
      toast.error('Failed to load attendance sheet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceSheet();
  }, [selectedClass, selectedSection, selectedDate, hasAssignments]);

  const handleStatusChange = (studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY') => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleSaveAttendance = async () => {
    setLoading(true);
    try {
      const records = students.map(student => ({
        studentId: student.id,
        status: attendance[student.id]
      }));
      await apiClient.post('/attendance/bulk', { date: new Date(selectedDate).toISOString(), records });
      toast.success(`Attendance submitted successfully for ${selectedClass}-${selectedSection}`);
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
      // 1. Fetch sections metadata to find the database ID of the selected class & section
      // In this codebase we fetch metadata from `/students/meta/classes` to get list
      const metaRes = await apiClient.get('/students/meta/classes');
      const classesMeta = metaRes.data.data || [];
      const cls = classesMeta.find((c: any) => c.name === assignForm.class);
      const sec = cls?.sections.find((s: any) => s.name === assignForm.section);

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
    return <div className="text-slate-400 p-8 text-center">Loading Attendance Portal...</div>;
  }

  // ── 1. STUDENT VIEW ───────────────────────────────────────────────────────
  if (isStudent) {
    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight">My Attendance Portal</h2>
            <p className="text-slate-400 mt-1">Review your attendance stats, history, and absentee fines.</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass p-6 rounded-3xl border border-white/5 bg-slate-900/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-semibold">Attendance Rate</span>
              <UserCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-3xl font-black text-white">{studentStats?.attendancePercentage ?? 100}%</div>
            <div className="text-xs text-slate-500 mt-2">Recommended: 85% and above</div>
          </div>

          <div className="glass p-6 rounded-3xl border border-white/5 bg-slate-900/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-semibold">Total Days Tracked</span>
              <Calendar className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-black text-white">{studentStats?.totalDays ?? 0} Days</div>
            <div className="text-xs text-slate-400 mt-2 flex gap-3">
              <span className="text-emerald-400">Present: {studentStats?.present ?? 0}</span>
              <span className="text-rose-400">Absent: {studentStats?.absent ?? 0}</span>
              <span className="text-amber-400">Late: {studentStats?.late ?? 0}</span>
            </div>
          </div>

          <div className="glass p-6 rounded-3xl border border-white/5 bg-slate-900/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-rose-500"></div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-semibold">Absentee Fines Due</span>
              <Coins className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-3xl font-black text-rose-400">৳{finesDue}</div>
            <div className="text-xs text-slate-500 mt-2">Calculation: ৳100 per day absent</div>
          </div>
        </div>

        {/* History Table */}
        <div className="glass rounded-3xl border border-white/5 overflow-hidden shadow-xl bg-slate-900/20">
          <div className="p-6 border-b border-white/5">
            <h3 className="text-lg font-bold text-white">Attendance Log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-slate-900/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Absent Fine Impact</th>
                  <th className="p-4 pr-6">Notes / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                {studentHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500 italic">No attendance records found.</td>
                  </tr>
                ) : (
                  studentHistory.map(record => (
                    <tr key={record.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="p-4 pl-6 font-semibold text-white">
                        {new Date(record.date).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          {
                            PRESENT: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                            ABSENT: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
                            LATE: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                            HALF_DAY: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                          }[record.status as string]
                        }`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs">
                        {record.status === 'ABSENT' ? (
                          <span className="text-rose-400 font-bold">+ ৳100</span>
                        ) : (
                          <span className="text-slate-500">৳0</span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-xs text-slate-400">
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

  // ── 2. TEACHER / ADMIN VIEW ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Attendance Register</h2>
          <p className="text-slate-400 mt-1">Select class parameters to record daily attendance.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-3 rounded-2xl transition-all shadow-lg shadow-blue-500/20 text-sm font-bold active:scale-[0.98]"
          >
            Assign Class Teacher
          </button>
        )}
      </div>

      {!hasAssignments && isTeacher ? (
        <div className="glass p-8 rounded-3xl border border-rose-500/10 bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
          <ShieldAlert className="w-12 h-12 text-rose-500" />
          <h3 className="text-lg font-bold text-white">No Assigned Sections</h3>
          <p className="text-slate-400 text-sm max-w-md leading-relaxed">
            You are not assigned to any sections as class teacher. Please contact your institution administrator to assign sections to your account.
          </p>
        </div>
      ) : (
        <>
          {/* Selectors Bar */}
          <div className="glass p-5 rounded-3xl flex flex-wrap items-center gap-6 border border-white/5 bg-slate-900/30">
            {isTeacher ? (
              <div className="flex flex-col">
                <label className="text-xs text-slate-500 font-semibold mb-1.5">Assigned Class-Section</label>
                <div className="relative">
                  <select
                    value={`${selectedClass}-${selectedSection}`}
                    onChange={(e) => {
                      const [cName, sName] = e.target.value.split('-');
                      setSelectedClass(cName);
                      setSelectedSection(sName);
                    }}
                    className="bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 min-w-[160px]"
                  >
                    {assignedSections.map(s => (
                      <option key={s.id} value={`${s.class.name}-${s.name}`}>
                        {s.class.name} - Section {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-500 font-semibold mb-1.5">Select Class</label>
                  <div className="relative">
                    <select
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 min-w-[140px]"
                    >
                      {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-slate-500 font-semibold mb-1.5">Select Section</label>
                  <div className="relative">
                    <select
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      className="bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none pr-10 min-w-[120px]"
                    >
                      {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col">
              <label className="text-xs text-slate-500 font-semibold mb-1.5">Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-w-[150px]"
                />
              </div>
            </div>
          </div>

          {/* Attendance Sheet Grid */}
          <div className="glass rounded-3xl overflow-hidden border border-white/5 bg-slate-900/20 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/40 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium pl-8">Student Info</th>
                    <th className="px-6 py-4 font-medium">Roll No</th>
                    <th className="px-6 py-4 text-center font-medium pr-8">Attendance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          Loading class sheet...
                        </div>
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-500 italic">
                        No students found under {selectedClass} Section {selectedSection}. Please add students or configure class parameters.
                      </td>
                    </tr>
                  ) : (
                    students.map((student) => (
                      <tr key={student.id} className="hover:bg-white/[0.01] transition-colors">
                        <td className="px-6 py-4 pl-8">
                          <div>
                            <div className="font-semibold text-white">{student.firstName} {student.lastName}</div>
                            <div className="text-xs text-slate-500 font-mono">{student.studentId}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-sm font-semibold">{student.rollNumber || '—'}</td>
                        <td className="px-6 py-4 pr-8">
                          <div className="flex items-center justify-center gap-3">
                            {/* Present */}
                            <button
                              onClick={() => handleStatusChange(student.id, 'PRESENT')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                                attendance[student.id] === 'PRESENT'
                                  ? 'bg-teal-500/10 text-teal-400 border-teal-500/30 shadow-lg shadow-teal-500/5'
                                  : 'bg-transparent text-slate-500 border-slate-800 hover:bg-white/5'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Present
                            </button>

                            {/* Late */}
                            <button
                              onClick={() => handleStatusChange(student.id, 'LATE')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                                attendance[student.id] === 'LATE'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-lg shadow-amber-500/5'
                                  : 'bg-transparent text-slate-500 border-slate-800 hover:bg-white/5'
                              }`}
                            >
                              <Clock className="w-4 h-4" />
                              Late
                            </button>

                            {/* Absent */}
                            <button
                              onClick={() => handleStatusChange(student.id, 'ABSENT')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                                attendance[student.id] === 'ABSENT'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-lg shadow-rose-500/5'
                                  : 'bg-transparent text-slate-500 border-slate-800 hover:bg-white/5'
                              }`}
                            >
                              <XCircle className="w-4 h-4" />
                              Absent
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Action Footer */}
            {students.length > 0 && (
              <div className="p-5 bg-slate-900/30 border-t border-white/5 flex items-center justify-end">
                <button
                  onClick={handleSaveAttendance}
                  disabled={loading}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow-xl shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 text-sm"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Submitting...' : 'Save & Submit Attendance'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Admin Assign Teacher Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
              <h3 className="text-xl font-bold text-white flex items-center gap-2.5">
                <Users className="w-5 h-5 text-blue-400" />
                Assign Class Teacher
              </h3>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleAssignTeacherSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Select Class Teacher</label>
                <div className="relative">
                  <select
                    required
                    value={assignForm.teacherId}
                    onChange={e => setAssignForm({ ...assignForm, teacherId: e.target.value })}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium appearance-none pr-10"
                  >
                    <option value="">-- Choose Teacher --</option>
                    {teachersList.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName} ({t.email})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Class</label>
                  <div className="relative">
                    <select
                      value={assignForm.class}
                      onChange={e => setAssignForm({ ...assignForm, class: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium appearance-none pr-10"
                    >
                      {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Section</label>
                  <div className="relative">
                    <select
                      value={assignForm.section}
                      onChange={e => setAssignForm({ ...assignForm, section: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium appearance-none pr-10"
                    >
                      {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 text-xs flex items-center gap-2"
                >
                  {assigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceEntry;
