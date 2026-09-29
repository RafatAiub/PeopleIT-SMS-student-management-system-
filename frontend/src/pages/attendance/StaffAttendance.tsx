import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Check, X, Clock, CalendarOff } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { Badge } from '../../components/ui/Badge';

interface StaffRow {
  id: string;
  designation: string | null;
  user: { firstName: string; lastName: string; avatarUrl: string | null };
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'HOLIDAY' | null;
}

const STATUS_META: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }> = {
  PRESENT: { label: 'Present', variant: 'success' },
  ABSENT: { label: 'Absent', variant: 'danger' },
  HALF_DAY: { label: 'Half Day', variant: 'warning' },
  HOLIDAY: { label: 'Holiday', variant: 'info' },
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const StaffAttendance = () => {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StaffRow[]>([]);
  const [marking, setMarking] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/staff-attendance', { params: { date } });
      setRows(res.data.data || []);
      setSelected([]);
    } catch (error) {
      console.error('Failed to fetch staff attendance', error);
      toast.error('Failed to load staff attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const markStatus = async (status: keyof typeof STATUS_META, staffIds: string[]) => {
    if (staffIds.length === 0) {
      toast.error('Select at least one staff member');
      return;
    }
    setMarking(true);
    try {
      await apiClient.post('/staff-attendance/bulk', {
        date,
        records: staffIds.map((staffId) => ({ staffId, status })),
      });
      toast.success('Attendance marked successfully');
      fetchRows();
    } catch (error: any) {
      console.error('Failed to mark attendance', error);
      toast.error(error.response?.data?.message || 'Failed to mark attendance');
    } finally {
      setMarking(false);
    }
  };

  const columns: Column<StaffRow>[] = [
    {
      key: 'name', header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.user.avatarUrl ? (
            <img src={row.user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
              {row.user.firstName?.[0] || '?'}
            </div>
          )}
          <div>
            <div className="font-medium text-slate-900 dark:text-white">{row.user.firstName} {row.user.lastName}</div>
            {row.designation && <div className="text-xs text-slate-500 dark:text-slate-400">{row.designation}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (row) => row.status ? <Badge variant={STATUS_META[row.status].variant}>{STATUS_META[row.status].label}</Badge> : <Badge variant="neutral">Not Marked</Badge>,
    },
    {
      key: 'action', header: 'Action',
      render: (row) => (
        <div className="flex items-center gap-1">
          {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => (
            <button key={s} type="button" title={STATUS_META[s].label} onClick={() => markStatus(s, [row.id])}
              className={`p-1.5 rounded-lg border text-xs ${row.status === s ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-200 dark:border-white/10 text-slate-500 hover:border-primary-400'}`}>
              {s === 'PRESENT' && <Check className="w-3.5 h-3.5" />}
              {s === 'ABSENT' && <X className="w-3.5 h-3.5" />}
              {s === 'HALF_DAY' && <Clock className="w-3.5 h-3.5" />}
              {s === 'HOLIDAY' && <CalendarOff className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <ClipboardCheck className="w-5 h-5" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Attendance</h2>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-5">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Staff Attendance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400 mr-1">Mark selected ({selected.length}) as:</span>
          {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => (
            <button key={s} type="button" disabled={marking} onClick={() => markStatus(s, selected.map((r) => r.id))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-primary-400 hover:text-primary-600 disabled:opacity-50">
              {s === 'PRESENT' && <Check className="w-4 h-4 text-emerald-500" />}
              {s === 'ABSENT' && <X className="w-4 h-4 text-rose-500" />}
              {s === 'HALF_DAY' && <Clock className="w-4 h-4 text-amber-500" />}
              {s === 'HOLIDAY' && <CalendarOff className="w-4 h-4 text-sky-500" />}
              {STATUS_META[s].label}
            </button>
          ))}
        </div>

        <DataTable
          data={rows}
          columns={columns}
          isLoading={loading}
          selectable
          onSelectionChange={setSelected}
          searchPlaceholder="Search staff..."
          emptyTitle="No active staff"
          emptyDescription="Add staff members from Staff Management first."
        />
      </div>
    </div>
  );
};

export default StaffAttendance;
