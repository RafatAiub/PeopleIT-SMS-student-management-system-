// "Grade Sheet Upload" tab — selectors, max-marks-per-subject, view mode
// switcher/search, the marks grid itself, and the template/upload/save
// action footer.
import React from 'react';
import { ShieldAlert, BookOpenCheck, Users, Info, LayoutGrid, BookOpen, Table as TableIcon, Search, Save } from 'lucide-react';
import { Button } from '../../../components/ui';
import { MarksToolbar } from './MarksToolbar';
import { MarksGrid } from './MarksGrid';
import { UseMarksData } from './useMarksData';

interface UploadTabProps {
  data: UseMarksData;
}

export const UploadTab: React.FC<UploadTabProps> = ({ data }) => {
  const {
    isTeacher,
    hasAssignments,
    availableSubjects,
    focusedSubject,
    setFocusedSubject,
    subjectFillCounts,
    students,
    getSubjectMaxMarksInputValue,
    handleSubjectMaxMarksChange,
    handleSubjectMaxMarksBlur,
    selectedExamName,
    selectedClass,
    selectedSection,
    isSeniorClass,
    selectedDepartment,
    entryMode,
    setEntryMode,
    searchQuery,
    setSearchQuery,
    downloadTemplate,
    handleCSVImport,
    fillEmptyWithZero,
    handleSave,
    loading,
    sheetHasErrors,
  } = data;

  if (!hasAssignments && isTeacher) {
    return (
      <div className="glass-card p-8 rounded-2xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-500" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Assigned Sections</h3>
        <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md leading-relaxed">
          You are not assigned to any sections as class teacher. You cannot upload results until a section is assigned to you.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="glass-card p-4 rounded-2xl flex flex-wrap items-center gap-4 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-xs">
        <MarksToolbar
          data={data}
          extra={
            <div className="flex flex-col">
              <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Focus Subject</label>
              <div className="relative">
                <select
                  value={focusedSubject}
                  onChange={(e) => setFocusedSubject(e.target.value)}
                  className="input-field pr-10 min-w-[160px]"
                >
                  <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    All Subjects ({availableSubjects.length})
                  </option>
                  {availableSubjects.map((sub) => (
                    <option key={sub} value={sub} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                      {sub} ({subjectFillCounts[sub] || 0}/{students.length})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          }
        />
      </div>

      {/* Max Marks per Subject — each subject can have a different max
          (e.g. ICT out of 50, others out of 100), so this is the single
          place to configure it per subject rather than one shared value. */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Max Marks per Subject</label>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {availableSubjects.map((sub) => (
            <div
              key={sub}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-white/10 flex-shrink-0"
            >
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{sub}</span>
              <input
                type="number"
                min={1}
                value={getSubjectMaxMarksInputValue(sub)}
                onChange={(e) => handleSubjectMaxMarksChange(sub, e.target.value)}
                onBlur={(e) => handleSubjectMaxMarksBlur(sub, e.target.value)}
                className="input-field w-16 text-center text-xs px-1.5 py-1"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Context strip + guidance */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
            <BookOpenCheck className="w-3.5 h-3.5" />
            {selectedExamName || 'No exam selected'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/20">
            <Users className="w-3.5 h-3.5" />
            {selectedClass} - Section {selectedSection}
          </span>
          {isSeniorClass && selectedDepartment !== 'None' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10">
              {selectedDepartment}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          Saved marks are instantly visible to the student and their guardian in their own portals.
        </div>
      </div>

      {/* Responsive View Mode Switcher + Mobile Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200/60 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setEntryMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              entryMode === 'cards'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Student Cards (Mobile Easy)</span>
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('subject')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              entryMode === 'subject'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Single Subject Focus</span>
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('matrix')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              entryMode === 'matrix'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Full Table Matrix</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search student or roll..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>

      <MarksGrid data={data} />

      {/* Action Footer */}
      {students.length > 0 && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-2xl border border-slate-200/50 dark:border-white/5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={downloadTemplate} className="px-4 py-2">
              Download Template (CSV)
            </Button>

            <label className="flex items-center gap-2 border border-primary-200 dark:border-primary-500/30 bg-primary-50 dark:bg-primary-600/10 hover:bg-primary-100 dark:hover:bg-primary-600/20 text-primary-600 dark:text-primary-400 font-semibold py-2 px-4 rounded-xl transition-all text-xs sm:text-sm cursor-pointer">
              <span>Upload Excel/CSV</span>
              <input type="file" accept=".csv, .xlsx, .xls" onChange={handleCSVImport} className="hidden" />
            </label>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fillEmptyWithZero}
              title="Fill empty score cells with 0"
              className="px-3 py-2"
            >
              Fill Empty with 0
            </Button>
          </div>

          <Button
            type="button"
            variant="gradient"
            onClick={handleSave}
            isLoading={loading}
            disabled={sheetHasErrors}
            title={sheetHasErrors ? 'Fix the highlighted invalid marks before saving' : undefined}
            className="w-full sm:w-auto justify-center py-2.5 px-6"
          >
            {!loading && <Save className="w-4 h-4" />}
            <span>{loading ? 'Saving Grade Sheet...' : 'Save Grade Sheet'}</span>
          </Button>
        </div>
      )}
    </>
  );
};
