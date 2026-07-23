import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, Save, ShieldAlert, Users, UserCheck, Plus } from 'lucide-react';
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
  const isGuardian = user?.role === 'GUARDIAN';
  const isAccountant = user?.role === 'ACCOUNTANT';

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
      if (isStudent || isGuardian) {
        // Student/Guardian now have a dedicated read-only portal at
        // /attendance/portal (see the redirect below) — no fetch needed here.
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
      // GUARDIAN/ACCOUNTANT: no dedicated view built here yet — fall through
      // to the message screen below rather than firing a staff-only request.
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
    return <div className="text-slate-400 p-8 text-center">Loading Attendance Portal...</div>;
  }

  // ── 1 & 2. STUDENT / GUARDIAN — read-only attendance portal ───────────────
  // These roles now have a dedicated page at /attendance/portal (built to
  // the current API contract, including the institution's optional fee
  // policy) — redirect there instead of rendering the old hardcoded-fines UI.
  if (isStudent || isGuardian) {
    return <Navigate to="/attendance/portal" replace />;
  }

  if (isAccountant) {
    return (
      <div className="glass-card p-10 rounded-2xl border border-slate-200/50 dark:border-white/5 text-center text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
        <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>Institution-wide attendance trends are available on the Reports page.</p>
        <a href="/reports" className="inline-block mt-4 text-blue-600 dark:text-blue-400 font-semibold text-sm hover:underline">Go to Reports →</a>
      </div>
    );
  }

  // ── 3. TEACHER / ADMIN VIEW ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Attendance Register</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Select class parameters to record daily attendance.</p>
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
        <div className="glass-card p-8 rounded-3xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
          <ShieldAlert className="w-12 h-12 text-rose-500" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Assigned Sections</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md leading-relaxed">
            You are not assigned to any sections as class teacher. Please contact your institution administrator to assign sections to your account.
          </p>
        </div>
      ) : (
        <>
          {/* Selectors Bar */}
          <div className="glass-card p-5 rounded-3xl flex flex-wrap items-center gap-6 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-sm">
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
                    className="input-field py-2.5 min-w-[160px]"
                  >
                    {assignedSections.map(s => (
                      <option key={s.id} value={`${s.class.name}-${s.name}`}>
                        {s.class.name} - Section {s.name}
                      </option>
                    ))}
                  </select>
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
                      className="input-field py-2.5 min-w-[140px]"
                    >
                      {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-slate-500 font-semibold mb-1.5">Select Section</label>
                  <div className="relative">
                    <select
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      className="input-field py-2.5 min-w-[120px]"
                    >
                      {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                    </select>
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
                  className="input-field min-w-[150px]"
                />
              </div>
            </div>
          </div>

          {/* Attendance Sheet Grid */}
          <div className="glass-card rounded-3xl overflow-hidden border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/20 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium pl-8">Student Info</th>
                    <th className="px-6 py-4 font-medium">Roll No</th>
                    <th className="px-6 py-4 text-center font-medium pr-8">Attendance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
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
                      <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                        <td className="px-6 py-4 pl-8">
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{student.firstName} {student.lastName}</div>
                            <div className="text-xs text-slate-500 font-mono">{student.studentId}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">{student.rollNumber || '—'}</td>
                        <td className="px-6 py-4 pr-8">
                          <div className="flex items-center justify-center gap-3">
                            {/* Present */}
                            <button
                              onClick={() => handleStatusChange(student.id, 'PRESENT')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                                attendance[student.id] === 'PRESENT'
                                  ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-500/30 shadow-sm'
                                  : 'bg-transparent text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-white/5'
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
                                  ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 shadow-sm'
                                  : 'bg-transparent text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-white/5'
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
                                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 shadow-sm'
                                  : 'bg-transparent text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-white/5'
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
              <div className="p-5 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-white/5 flex items-center justify-end">
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
          <div className="w-full max-w-md bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                <Users className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                Assign Class Teacher
              </h3>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                aria-label="Close"
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleAssignTeacherSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Select Class Teacher</label>
                <div className="relative">
                  <select
                    required
                    value={assignForm.teacherId}
                    onChange={e => setAssignForm({ ...assignForm, teacherId: e.target.value })}
                    className="input-field appearance-none pr-10"
                  >
                    <option value="">-- Choose Teacher --</option>
                    {teachersList.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName} ({t.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Class</label>
                  <div className="relative">
                    <select
                      value={assignForm.class}
                      onChange={e => setAssignForm({ ...assignForm, class: e.target.value })}
                      className="input-field appearance-none pr-10"
                    >
                      {CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Section</label>
                  <div className="relative">
                    <select
                      value={assignForm.section}
                      onChange={e => setAssignForm({ ...assignForm, section: e.target.value })}
                      className="input-field appearance-none pr-10"
                    >
                      {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-xs font-bold"
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
