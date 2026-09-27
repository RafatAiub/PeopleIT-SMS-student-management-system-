import React, { useState, useEffect } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
type Day = typeof DAYS[number];

interface PeriodRow {
  key: number;
  subjectName: string;
  teacherId: string;
  startTime: string;
  endTime: string;
  roomNumber: string;
}

let rowKeySeq = 0;
const emptyRow = (): PeriodRow => ({ key: rowKeySeq++, subjectName: '', teacherId: '', startTime: '', endTime: '', roomNumber: '' });

const CreateTimetable = () => {
  const [sections, setSections] = useState<any[]>([]);
  const [classes, setClasses] = useState<{ id: string; branchId: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [activeDay, setActiveDay] = useState<Day>('MONDAY');
  const [rowsByDay, setRowsByDay] = useState<Record<Day, PeriodRow[]>>(() =>
    DAYS.reduce((acc, d) => ({ ...acc, [d]: d === 'MONDAY' ? [emptyRow()] : [] }), {} as Record<Day, PeriodRow[]>),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get('/academics/sections').then((res) => setSections(res.data.data || [])).catch((e) => console.error(e));
    apiClient.get('/students/meta/classes').then((res) => setClasses(res.data.data || [])).catch((e) => console.error(e));
    apiClient.get('/curriculum/subjects/catalog').then((res) => setSubjects(res.data.data || [])).catch((e) => console.error(e));
    apiClient.get('/users', { params: { role: 'TEACHER', pageSize: 200 } })
      .then((res) => setTeachers((res.data.data || []).map((u: any) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName }))))
      .catch((e) => console.error(e));
  }, []);

  const selectedSection = sections.find((s) => s.id === sectionId);
  const selectedBranchId = classes.find((c) => c.id === selectedSection?.class?.id)?.branchId;

  const updateRow = (day: Day, key: number, patch: Partial<PeriodRow>) => {
    setRowsByDay((prev) => ({ ...prev, [day]: prev[day].map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  };

  const addRow = (day: Day) => setRowsByDay((prev) => ({ ...prev, [day]: [...prev[day], emptyRow()] }));
  const removeRow = (day: Day, key: number) => setRowsByDay((prev) => ({ ...prev, [day]: prev[day].filter((r) => r.key !== key) }));

  const handleSubmit = async () => {
    if (!selectedSection || !selectedBranchId) {
      toast.error('Please select a class section');
      return;
    }
    const jobs: Promise<any>[] = [];
    let hasAny = false;
    for (const day of DAYS) {
      for (const row of rowsByDay[day]) {
        if (!row.subjectName && !row.teacherId && !row.startTime && !row.endTime) continue;
        if (!row.subjectName || !row.startTime || !row.endTime) {
          toast.error(`${day.charAt(0) + day.slice(1).toLowerCase()}: subject, start and end time are required for every period`);
          return;
        }
        hasAny = true;
        jobs.push(
          apiClient.post('/timetables', {
            branchId: selectedBranchId,
            dayOfWeek: day,
            startTime: row.startTime,
            endTime: row.endTime,
            className: selectedSection.class?.name,
            sectionName: selectedSection.name,
            subject: row.subjectName,
            roomNumber: row.roomNumber || undefined,
            teacherUserId: row.teacherId || undefined,
          }),
        );
      }
    }
    if (!hasAny) {
      toast.error('Add at least one period');
      return;
    }
    setSubmitting(true);
    try {
      await Promise.all(jobs);
      toast.success('Timetable created successfully');
      setRowsByDay(DAYS.reduce((acc, d) => ({ ...acc, [d]: d === 'MONDAY' ? [emptyRow()] : [] }), {} as Record<Day, PeriodRow[]>));
      setActiveDay('MONDAY');
    } catch (error: any) {
      console.error('Failed to create timetable', error);
      toast.error(error.response?.data?.message || 'Failed to create timetable');
    } finally {
      setSubmitting(false);
    }
  };

  const rows = rowsByDay[activeDay];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <CalendarClock className="w-5 h-5" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Create Timetable</h2>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class Section <span className="text-rose-500">*</span></label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input-field">
              <option value="">-- Select Class Section --</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.class?.name} - {s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 dark:bg-white/5 p-1">
          {DAYS.map((day) => (
            <button key={day} type="button" onClick={() => setActiveDay(day)}
              className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                activeDay === day ? 'bg-white dark:bg-surface-900 text-primary-700 dark:text-primary-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}>
              {day.charAt(0) + day.slice(1).toLowerCase()}
              {rowsByDay[day].length > 0 && <span className="ml-1.5 text-xs opacity-70">({rowsByDay[day].length})</span>}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                <th className="pb-2 pr-3">Subject *</th>
                <th className="pb-2 pr-3">Teacher</th>
                <th className="pb-2 pr-3">Start Time *</th>
                <th className="pb-2 pr-3">End Time *</th>
                <th className="pb-2 pr-3">Room</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-slate-100 dark:border-white/5">
                  <td className="py-2 pr-3">
                    <select value={row.subjectName} onChange={(e) => updateRow(activeDay, row.key, { subjectName: e.target.value })} className="input-field">
                      <option value="">Select Subject</option>
                      {subjects.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select value={row.teacherId} onChange={(e) => updateRow(activeDay, row.key, { teacherId: e.target.value })} className="input-field">
                      <option value="">Select Teacher</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3"><input type="time" value={row.startTime} onChange={(e) => updateRow(activeDay, row.key, { startTime: e.target.value })} className="input-field" /></td>
                  <td className="py-2 pr-3"><input type="time" value={row.endTime} onChange={(e) => updateRow(activeDay, row.key, { endTime: e.target.value })} className="input-field" /></td>
                  <td className="py-2 pr-3"><input type="text" value={row.roomNumber} onChange={(e) => updateRow(activeDay, row.key, { roomNumber: e.target.value })} placeholder="Room" className="input-field" /></td>
                  <td className="py-2">
                    <button type="button" onClick={() => removeRow(activeDay, row.key)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={() => addRow(activeDay)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/20 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-primary-400 hover:text-primary-600">
            <Plus className="w-4 h-4" /> Add Period
          </button>
          <Button variant="gradient" onClick={handleSubmit} isLoading={submitting}>{submitting ? 'Submitting…' : 'Submit'}</Button>
        </div>
      </div>
    </div>
  );
};

export default CreateTimetable;
