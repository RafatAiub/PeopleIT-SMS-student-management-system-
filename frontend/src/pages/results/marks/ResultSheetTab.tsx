// "Complete Result Sheet" tab — one wide read-only table of every student x
// subject for the selected exam/class/section, plus CSV export.
import React from 'react';
import { MarksToolbar } from './MarksToolbar';
import { UseMarksData } from './useMarksData';

interface ResultSheetTabProps {
  data: UseMarksData;
}

export const ResultSheetTab: React.FC<ResultSheetTabProps> = ({ data }) => {
  const {
    downloadCSV,
    studentRows,
    resultSheetClassTeacher,
    uniqueSubjects,
    completeResultsLoading,
    completeResultsError,
    fetchCompleteResultSheet,
    selectedClass,
    selectedSection,
  } = data;

  return (
    <>
      <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center justify-between gap-6 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-xs">
        <div className="flex flex-wrap items-center gap-6">
          <MarksToolbar data={data} />
        </div>

        <button
          onClick={downloadCSV}
          disabled={studentRows.length === 0}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-sm active:scale-[0.98] text-sm"
        >
          Download CSV Sheet
        </button>
      </div>

      {/* Info Card displaying Who Made the Result */}
      <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/20 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-slate-500 dark:text-slate-400 text-xs font-bold block mb-1">Result Author (Class Teacher Assigned)</span>
          <span className="text-slate-900 dark:text-white font-semibold text-sm">
            {resultSheetClassTeacher !== 'Not Assigned' ? resultSheetClassTeacher : '⚠️ No Class Teacher Assigned'}
          </span>
        </div>
        <div className="text-right">
          <span className="text-slate-500 dark:text-slate-400 text-xs font-bold block mb-1">Total Tracked Subjects</span>
          <span className="text-blue-600 dark:text-blue-400 font-extrabold text-sm">{uniqueSubjects.length} Subjects</span>
        </div>
      </div>

      {/* Grid Table */}
      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium pl-8">Student Info</th>
                <th className="px-6 py-4 font-medium">Roll No</th>
                {uniqueSubjects.map((sub) => (
                  <th key={sub} className="px-6 py-4 font-medium text-center">
                    {sub}
                  </th>
                ))}
                <th className="px-6 py-4 font-medium text-center">Total Score</th>
                <th className="px-6 py-4 font-medium text-center pr-8">Percentage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {completeResultsLoading ? (
                <tr>
                  <td colSpan={uniqueSubjects.length + 4} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      Loading complete class results...
                    </div>
                  </td>
                </tr>
              ) : completeResultsError ? (
                <tr>
                  <td colSpan={uniqueSubjects.length + 4} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <p>Failed to load the complete result sheet.</p>
                      <button
                        onClick={fetchCompleteResultSheet}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : studentRows.length === 0 ? (
                <tr>
                  <td colSpan={uniqueSubjects.length + 4} className="px-6 py-12 text-center text-slate-500 italic">
                    No examination results found for {selectedClass} Section {selectedSection}.
                  </td>
                </tr>
              ) : (
                studentRows.map((row) => {
                  const pct = row.totalPossible > 0 ? Math.round((row.totalObtained / row.totalPossible) * 100) : null;
                  return (
                    <tr key={row.studentId} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4 pl-8">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {row.firstName} {row.lastName}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">{row.studentId}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">{row.rollNumber}</td>
                      {uniqueSubjects.map((sub) => (
                        <td key={sub} className="px-6 py-4 text-center font-medium">
                          {row.scores[sub] !== undefined ? (
                            <span className="text-slate-800 dark:text-slate-200">
                              {row.scores[sub]}
                              <span className="text-slate-500 text-xs">/{row.maxMarks[sub]}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-6 py-4 text-center font-bold text-slate-800 dark:text-slate-200">
                        {row.totalObtained}
                        <span className="text-slate-500 text-xs">/{row.totalPossible}</span>
                      </td>
                      <td className="px-6 py-4 text-center font-extrabold text-blue-600 dark:text-blue-400 pr-8">{pct !== null ? `${pct}%` : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
