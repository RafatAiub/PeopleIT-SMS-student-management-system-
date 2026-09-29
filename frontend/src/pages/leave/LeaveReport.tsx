import React, { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { useLeaveTypes, useLeaveReport } from '@/hooks/useLeave';
import { ApplicantFilter, type UserOption } from './ApplicantFilter';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 3 + i);

export default function LeaveReport() {
  const [applicant, setApplicant] = useState<UserOption | null>(null);
  const [year, setYear] = useState(CURRENT_YEAR);

  // Every active leave type gets its own "Used" column — generalizes the
  // fixed CL/LWP columns from the reference design to whatever leave types
  // this institution has configured in Leave Settings.
  const { data: leaveTypes = [] } = useLeaveTypes(false);
  const { data: report, isLoading } = useLeaveReport(applicant?.id, year);

  const usedByTypeLookup = useMemo(() => {
    if (!report) return new Map<number, Map<string, number>>();
    const byMonth = new Map<number, Map<string, number>>();
    for (const m of report.months) {
      const byType = new Map<string, number>();
      for (const t of m.usedByType) byType.set(t.leaveTypeId, t.days);
      byMonth.set(m.month, byType);
    }
    return byMonth;
  }, [report]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Leave Report</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Monthly leave usage for a teacher or staff member against the standard 2-day monthly allowance.
        </p>
      </div>

      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-xs p-4 flex flex-wrap items-center gap-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Staff</label>
          <ApplicantFilter
            value={applicant}
            onChange={setApplicant}
            excludeRoles={['STUDENT', 'GUARDIAN']}
            placeholder="Search teacher or staff..."
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 cursor-pointer transition-colors"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {!applicant ? (
        <EmptyState
          icon={<CalendarClock className="w-8 h-8" />}
          title="Select a staff member"
          description="Search and pick a teacher or staff member above to see their monthly leave report."
        />
      ) : isLoading ? (
        <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-xs p-8 text-center text-sm text-slate-500">
          Loading report…
        </div>
      ) : report ? (
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 shadow-xs">
          <div className="px-4 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {applicant.firstName} {applicant.lastName} — {report.year}
            </h3>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  <th rowSpan={2} className="px-3 py-2 text-left border-b border-slate-200 dark:border-white/10">No.</th>
                  <th rowSpan={2} className="px-3 py-2 text-left border-b border-slate-200 dark:border-white/10">Month</th>
                  <th rowSpan={2} className="px-3 py-2 text-left border-b border-slate-200 dark:border-white/10">Allocated</th>
                  <th colSpan={leaveTypes.length + 1} className="px-3 py-2 text-center border-b border-l border-slate-200 dark:border-white/10">Used</th>
                  <th rowSpan={2} className="px-3 py-2 text-left border-b border-l border-slate-200 dark:border-white/10">Remaining</th>
                </tr>
                <tr className="text-[11px] uppercase text-slate-400 dark:text-slate-500">
                  {leaveTypes.map((t) => (
                    <th key={t.id} className="px-3 py-1.5 text-left border-b border-l border-slate-200 dark:border-white/10">{t.name}</th>
                  ))}
                  <th className="px-3 py-1.5 text-left border-b border-l border-slate-200 dark:border-white/10 font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.months.map((m) => {
                  const byType = usedByTypeLookup.get(m.month) ?? new Map<string, number>();
                  return (
                    <tr key={m.month} className="border-b border-slate-100 dark:border-white/5">
                      <td className="px-3 py-2 text-slate-500">{m.month}</td>
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{m.monthLabel}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{m.allocatedDays}</td>
                      {leaveTypes.map((t) => (
                        <td key={t.id} className="px-3 py-2 border-l border-slate-100 dark:border-white/5 text-slate-600 dark:text-slate-400">
                          {byType.get(t.id) ?? '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2 border-l border-slate-100 dark:border-white/5 font-semibold text-slate-800 dark:text-slate-200">
                        {m.usedTotal || '-'}
                      </td>
                      <td className={`px-3 py-2 border-l border-slate-100 dark:border-white/5 font-semibold ${m.remainingDays === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {m.remainingDays}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
