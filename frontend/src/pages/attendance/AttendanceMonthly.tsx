import React, { useState, useEffect } from 'react';
import { CalendarDays } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';

interface StudentSheetRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  attendanceMap: Record<string, { status: string }>;
}

const STATUS_DOT: Record<string, string> = {
  PRESENT: 'bg-emerald-500',
  ABSENT: 'bg-rose-500',
  HALF_DAY: 'bg-amber-500',
  HOLIDAY: 'bg-sky-500',
  LATE: 'bg-purple-500',
};

const currentMonthStr = () => new Date().toISOString().slice(0, 7);

const AttendanceMonthly = () => {
  const [sections, setSections] = useState<any[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const [rows, setRows] = useState<StudentSheetRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get('/academics/sections').then((res) => setSections(res.data.data || [])).catch((e) => console.error(e));
  }, []);

  const daysInMonth = () => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };

  useEffect(() => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) { setRows([]); return; }
    const [y, m] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    setLoading(true);
    apiClient.get('/attendance/sheet/weekly', { params: { className: section.class?.name, sectionName: section.name, startDate, endDate } })
      .then((res) => setRows(res.data.data || []))
      .catch((error) => { console.error(error); toast.error('Failed to load attendance'); setRows([]); })
      .finally(() => setLoading(false));
  }, [sectionId, month, sections]);

  const days = Array.from({ length: sectionId ? daysInMonth() : 0 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <CalendarDays className="w-5 h-5" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Attendance</h2>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Attendance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class Section</label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input-field">
              <option value="">-- Select Class Section --</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.class?.name} - {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input-field" />
          </div>
        </div>

        {sectionId && (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {Object.entries({ PRESENT: 'Present', ABSENT: 'Absent', HALF_DAY: 'Half Day', HOLIDAY: 'Holiday', LATE: 'Leave' }).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[k]}`} /> {label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-500">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-white/20" /> No Record
            </span>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : !sectionId ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Select a class section and month to view attendance.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase sticky left-0 bg-white dark:bg-surface-900">Student Details</th>
                  {days.map((d) => <th key={d} className="px-1.5 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-surface-900 whitespace-nowrap">
                      <div className="font-medium text-slate-900 dark:text-white">{row.firstName} {row.lastName}</div>
                    </td>
                    {days.map((d) => {
                      const key = `${month}-${String(d).padStart(2, '0')}`;
                      const status = row.attendanceMap?.[key]?.status;
                      return (
                        <td key={d} className="px-1.5 py-2 text-center">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${status ? STATUS_DOT[status] || 'bg-slate-300' : 'bg-slate-200 dark:bg-white/10'}`} title={status || 'No Record'} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={days.length + 1} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No students in this class section.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceMonthly;
