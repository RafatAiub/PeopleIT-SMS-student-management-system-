import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, Plus, X, GraduationCap, UserCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const TIME_SLOTS = [
  { start: '09:00 AM', end: '09:45 AM', label: 'Period 1' },
  { start: '09:45 AM', end: '10:30 AM', label: 'Period 2' },
  { start: '10:30 AM', end: '11:15 AM', label: 'Period 3' },
  { start: '11:15 AM', end: '11:30 AM', label: 'Tiffin Break', isBreak: true },
  { start: '11:30 AM', end: '12:15 PM', label: 'Period 4' },
  { start: '12:15 PM', end: '01:00 PM', label: 'Period 5' },
];

const CLASSES = [
  'KG', 'Nursery', 'Junior One',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
];

const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

// Convert 12hr time to 24hr for the backend matching
const to24 = (timeStr: string) => {
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') {
    hours = '00';
  }
  if (modifier === 'PM') {
    hours = parseInt(hours, 10) + 12 + '';
  }
  return `${hours.padStart(2, '0')}:${minutes}`;
};

const TimetableGrid = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isTeacher = user?.role === 'TEACHER';
  const isStudent = user?.role === 'STUDENT';
  
  const [selectedClass, setSelectedClass] = useState('Class 8');
  const [selectedSection, setSelectedSection] = useState('A');
  const [routine, setRoutine] = useState<Record<string, Record<string, { subject: string; teacher: string; className?: string; sectionName?: string }>>>({});
  const [loading, setLoading] = useState(true);

  const [teachers, setTeachers] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    day: 'Saturday',
    period: 'Period 1',
    subject: '',
    teacherUserId: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchTimetables = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      let queryParams = '';
      if (isAdmin) {
        queryParams = `?className=${encodeURIComponent(selectedClass)}&sectionName=${encodeURIComponent(selectedSection)}`;
      } else if (isTeacher) {
        queryParams = `?teacherUserId=${user.id}`;
      } else if (isStudent) {
        queryParams = `?studentUserId=${user.id}`;
      }

      const response = await apiClient.get(`/timetables${queryParams}`);
      const slots = Array.isArray(response.data.data) ? response.data.data : [];
      
      const formattedRoutine: any = {};
      
      slots.forEach((slot: any) => {
        // Convert MONDAY to Monday
        const dayFormatted = slot.dayOfWeek.charAt(0).toUpperCase() + slot.dayOfWeek.slice(1).toLowerCase();
        
        // Find matching period label
        const timeSlotInfo = TIME_SLOTS.find(ts => to24(ts.start) === slot.startTime);
        
        if (timeSlotInfo) {
          if (!formattedRoutine[dayFormatted]) formattedRoutine[dayFormatted] = {};
          
          formattedRoutine[dayFormatted][timeSlotInfo.label] = {
            subject: slot.subject,
            teacher: slot.teacher?.user ? `${slot.teacher.user.firstName} ${slot.teacher.user.lastName}` : 'Unassigned',
            className: slot.className,
            sectionName: slot.sectionName
          };
        }
      });
      
      setRoutine(formattedRoutine);
    } catch (error) {
      console.error('Failed to fetch timetables', error);
      toast.error('Failed to load timetables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimetables();
    
    if (isAdmin) {
      apiClient.get('/users?role=TEACHER&pageSize=100')
        .then(res => setTeachers(res.data.data || []))
        .catch(console.error);
    }
  }, [selectedClass, selectedSection, user]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const slotInfo = TIME_SLOTS.find(s => s.label === formData.period);

      await apiClient.post('/timetables', {
        branchId: 'clbranch00000000000000000',
        className: selectedClass,
        sectionName: selectedSection,
        dayOfWeek: formData.day.toUpperCase(),
        startTime: slotInfo ? to24(slotInfo.start) : '09:00',
        endTime: slotInfo ? to24(slotInfo.end) : '09:45',
        subject: formData.subject,
        teacherUserId: formData.teacherUserId,
      });
      toast.success('Schedule added successfully!');
      setIsAddModalOpen(false);
      fetchTimetables();
      setFormData({ ...formData, subject: '', teacherUserId: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add schedule');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            {isAdmin && 'Class Routine Timetable'}
            {isTeacher && 'My Teaching Schedule'}
            {isStudent && 'My Class Schedule'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {isAdmin && 'Generate and view class routines across the institution.'}
            {isTeacher && 'View your assigned classes and teaching slots.'}
            {isStudent && 'View your daily class routine and subject teachers.'}
          </p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Add Slot Mapping
          </button>
        )}
      </div>

      {/* Selectors Bar - Admin Only */}
      {isAdmin && (
        <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-6 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-sm">
          <div className="flex flex-col flex-1 min-w-[200px] max-w-xs">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" /> Select Class
            </label>
            <div className="relative">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="input-field pr-10"
              >
                {CLASSES.map(cls => <option key={cls} value={cls} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{cls}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col flex-1 min-w-[200px] max-w-xs">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider flex items-center gap-1.5">
              <UserCircle className="w-3.5 h-3.5" /> Select Section
            </label>
            <div className="relative">
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="input-field pr-10"
              >
                {SECTIONS.map(sec => <option key={sec} value={sec} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{sec}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Timetable Grid View */}
      <div className="glass-card rounded-3xl border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-sm relative bg-white dark:bg-slate-900/10">
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm flex items-center justify-center">
            <div className="text-blue-600 dark:text-blue-400 animate-pulse font-semibold">Loading Timetable...</div>
          </div>
        )}
        <div className="overflow-x-auto">
          <div className="min-w-[900px] grid grid-cols-7 divide-x divide-slate-200 dark:divide-white/5 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/60 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            <div className="p-5 text-center">Time Slot</div>
            {DAYS.map(day => (
              <div key={day} className="p-5 text-center">{day}</div>
            ))}
          </div>

          <div className="min-w-[900px] divide-y divide-slate-200 dark:divide-white/5">
            {TIME_SLOTS.map(slot => (
              <div key={slot.label} className={`grid grid-cols-7 divide-x divide-slate-200 dark:divide-white/5 transition-colors hover:bg-slate-50/30 dark:hover:bg-white/[0.02] ${slot.isBreak ? 'bg-slate-100/50 dark:bg-slate-950/60 text-slate-400 dark:text-slate-500 font-semibold' : ''}`}>
                {/* Time Info */}
                <div className="p-4 flex flex-col justify-center items-center bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="font-bold text-slate-900 dark:text-white text-xs">{slot.label}</div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 font-medium bg-slate-100 dark:bg-slate-950/50 px-2 py-0.5 rounded-full border border-slate-200 dark:border-white/5">{slot.start} - {slot.end}</div>
                </div>

                {/* Day Columns */}
                {DAYS.map(day => {
                  if (slot.isBreak) {
                    return (
                      <div key={day} className="p-4 flex items-center justify-center text-xs tracking-widest uppercase italic text-slate-400 dark:text-slate-500 opacity-50 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(226,232,240,0.3)_10px,rgba(226,232,240,0.3)_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.02)_10px,rgba(255,255,255,0.02)_20px)]">
                        Break
                      </div>
                    );
                  }
                  
                  const period = routine[day]?.[slot.label];
                  return (
                    <div key={day} className="p-2.5 flex flex-col justify-center min-h-[90px]">
                      {period ? (
                        <div className="h-full w-full rounded-xl bg-gradient-to-br from-blue-50 dark:from-blue-500/10 to-indigo-50/30 dark:to-indigo-500/5 border border-blue-200 dark:border-blue-500/20 shadow-sm flex flex-col items-center justify-center p-2 group hover:border-blue-400/30 transition-all">
                          <span className="text-xs font-bold text-blue-700 dark:text-blue-300 text-center leading-tight mb-1">{period.subject}</span>
                          
                          {/* Admin/Student shows Teacher name. Teacher shows Class name */}
                          {isTeacher ? (
                            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded-md mt-1 border border-slate-200 dark:border-white/5 text-center">
                              {period.className} - {period.sectionName}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded-md mt-1 border border-slate-200 dark:border-white/5 text-center max-w-full truncate">
                              {period.teacher}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="h-full w-full flex items-center justify-center opacity-30">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 text-center italic">Free</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden shadow-blue-500/10">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                Add Class Schedule
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Day</label>
                  <select 
                    value={formData.day}
                    onChange={e => setFormData({ ...formData, day: e.target.value })}
                    className="input-field"
                  >
                    {DAYS.map(d => <option key={d} value={d} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{d}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Period</label>
                  <select 
                    value={formData.period}
                    onChange={e => setFormData({ ...formData, period: e.target.value })}
                    className="input-field"
                  >
                    {TIME_SLOTS.filter(s => !s.isBreak).map(s => (
                      <option key={s.label} value={s.label} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Subject Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Mathematics"
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Teacher Name</label>
                <select 
                  required
                  value={formData.teacherUserId}
                  onChange={e => setFormData({ ...formData, teacherUserId: e.target.value })}
                  className="input-field"
                >
                  <option value="" disabled className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Select a teacher</option>
                  {teachers.map((t: any) => (
                    <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{t.firstName} {t.lastName}</option>
                  ))}
                </select>
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-[0.98]"
                >
                  {submitting ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimetableGrid;
