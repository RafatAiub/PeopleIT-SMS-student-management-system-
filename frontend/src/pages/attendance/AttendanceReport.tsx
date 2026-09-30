import React, { useState, useEffect } from 'react';
import { FileBarChart } from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { DataTable, Column } from '../../components/DataTable/DataTable';

interface StudentSheetRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  rollNumber: string | null;
  attendanceMap: Record<string, { status: string }>;
}

interface ReportRow {
  id: string;
  studentId: string;
  name: string;
  rollNumber: string | null;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  percentage: number;
}

const AttendanceReport = () => {
  const [sections, setSections] = useState<any[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get('/academics/sections').then((res) => setSections(res.data.data || [])).catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) { setRows([]); return; }
    setLoading(true);
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    apiClient.get('/attendance/sheet/weekly', { params: { className: section.class?.name, sectionName: section.name, startDate, endDate } })
      .then((res) => {
        const sheet: StudentSheetRow[] = res.data.data || [];
        setRows(sheet.map((s) => {
          const statuses = Object.values(s.attendanceMap || {}).map((v) => v.status);
          const totalDays = statuses.length;
          const presentDays = statuses.filter((st) => st === 'PRESENT' || st === 'LATE').length;
          const absentDays = statuses.filter((st) => st === 'ABSENT').length;
          return {
            id: s.id,
            studentId: s.studentId,
            name: `${s.firstName} ${s.lastName}`,
            rollNumber: s.rollNumber,
            totalDays,
            presentDays,
            absentDays,
            percentage: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
          };
        }));
      })
      .catch((error) => { console.error(error); toast.error('Failed to load attendance report'); setRows([]); })
      .finally(() => setLoading(false));
  }, [sectionId, sections]);

  const columns: Column<ReportRow>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{rows.findIndex((r) => r.id === row.id) + 1}</span>,
    },
    {
      key: 'student', header: 'Student',
      render: (row) => (
        <div>
          <Link to="/students" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">{row.name}</Link>
          <div className="text-xs text-slate-500 dark:text-slate-400">GR Number: {row.studentId}</div>
        </div>
      ),
    },
    { key: 'rollNo', header: 'Roll No.', render: (row) => row.rollNumber || '—' },
    { key: 'totalDays', header: 'Total Days', accessor: 'totalDays' },
    { key: 'presentDays', header: 'Present Days', accessor: 'presentDays' },
    { key: 'absentDays', header: 'Absent Days', accessor: 'absentDays' },
    { key: 'percentage', header: 'Percentage', render: (row) => `${row.percentage}%` },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <FileBarChart className="w-5 h-5" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Attendance Report</h2>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">View Attendance Report</h3>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class Section</label>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input-field">
            <option value="">-- Select Class Section --</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.class?.name} - {s.name}</option>)}
          </select>
        </div>

        <DataTable
          data={rows}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search students..."
          emptyTitle="No data"
          emptyDescription="Select a class section to view its attendance report."
        />
      </div>
    </div>
  );
};

export default AttendanceReport;
