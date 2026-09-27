import React, { useState, useEffect } from 'react';
import { CalendarClock, Clock, User } from 'lucide-react';
import apiClient from '../../api/client';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

interface Slot {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: string;
  roomNumber: string | null;
  teacher?: { user?: { firstName: string; lastName: string } } | null;
}

const badgeClass = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400';

const ClassTimetable = () => {
  const [sections, setSections] = useState<any[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get('/academics/sections').then((res) => setSections(res.data.data || [])).catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) { setSlots([]); return; }
    setLoading(true);
    apiClient.get('/timetables', { params: { className: section.class?.name, sectionName: section.name, pageSize: 100 } })
      .then((res) => setSlots(res.data.data || []))
      .catch((e) => { console.error(e); setSlots([]); })
      .finally(() => setLoading(false));
  }, [sectionId, sections]);

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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Class Timetable</h2>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <div className="max-w-xs mb-6">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class Section</label>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input-field">
            <option value="">-- Select Class Section --</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.class?.name} - {s.name}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : !sectionId ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Select a class section to view its timetable.</p>
        ) : byDay.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No periods scheduled for this class section yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {byDay.map(({ day, items }) => (
              <div key={day} className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{day.charAt(0) + day.slice(1).toLowerCase()}</span>
                  <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 text-xs font-bold flex items-center justify-center">{items.length}</span>
                </div>
                <div className="p-3 space-y-3">
                  {items.map((slot) => (
                    <div key={slot.id} className="rounded-xl border border-slate-100 dark:border-white/5 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <Clock className="w-3.5 h-3.5" /> {slot.startTime} – {slot.endTime}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 dark:text-white text-sm">{slot.subject}</span>
                        {slot.roomNumber && <span className={badgeClass}>{slot.roomNumber}</span>}
                      </div>
                      {slot.teacher?.user && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <User className="w-3.5 h-3.5" /> {slot.teacher.user.firstName} {slot.teacher.user.lastName}
                        </div>
                      )}
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

export default ClassTimetable;
