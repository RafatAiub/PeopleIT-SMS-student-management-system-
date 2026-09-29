import React, { useState, useEffect } from 'react';
import { CalendarClock, Clock } from 'lucide-react';
import apiClient from '../../api/client';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

interface Slot {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: string;
  className: string;
  sectionName: string;
}

const TeacherTimetable = () => {
  const [teachers, setTeachers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [teacherUserId, setTeacherUserId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get('/users', { params: { role: 'TEACHER', pageSize: 200 } })
      .then((res) => setTeachers((res.data.data || []).map((u: any) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName }))))
      .catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    if (!teacherUserId) { setSlots([]); return; }
    setLoading(true);
    apiClient.get('/timetables', { params: { teacherUserId, pageSize: 100 } })
      .then((res) => setSlots(res.data.data || []))
      .catch((e) => { console.error(e); setSlots([]); })
      .finally(() => setLoading(false));
  }, [teacherUserId]);

  const byDay = DAYS.map((day) => ({
    day,
    items: slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((d) => d.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <CalendarClock className="w-5 h-5" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">List Teacher Timetable</h2>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <div className="max-w-xs mb-6">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Teacher</label>
          <select value={teacherUserId} onChange={(e) => setTeacherUserId(e.target.value)} className="input-field">
            <option value="">-- Select Teacher --</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : !teacherUserId ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Select a teacher to view their timetable.</p>
        ) : byDay.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No periods scheduled for this teacher yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {byDay.map(({ day, items }) => (
              <div key={day} className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{day.charAt(0) + day.slice(1).toLowerCase()}</span>
                  <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 text-xs font-bold flex items-center justify-center">{items.length}</span>
                </div>
                <div className="p-3 space-y-3">
                  {items.map((slot) => (
                    <div key={slot.id} className="rounded-xl border-l-4 border-primary-500 bg-slate-50 dark:bg-white/5 p-3">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{slot.className} - {slot.sectionName}</div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <Clock className="w-3.5 h-3.5" /> {slot.startTime} – {slot.endTime}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-white text-sm">{slot.subject}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherTimetable;
