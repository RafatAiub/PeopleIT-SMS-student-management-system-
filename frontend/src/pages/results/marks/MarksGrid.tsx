// The three marks-entry layouts (Student Cards / Single Subject Focus /
// Full Table Matrix) plus the spreadsheet-style keyboard navigation and
// inline validation shared across all of them.
//
// Keyboard behaviour (score cells only — remarks stays a normal multi-line
// textarea so Enter still inserts a newline there):
//   - Tab / Shift+Tab: native browser tab order (DOM order already runs
//     score → remarks → next subject's score, so no custom handling needed).
//   - Enter or ↓: move to the same subject's cell for the next student.
//   - ↑: move to the same subject's cell for the previous student.
//   - ← / →: move to the previous/next visible subject's cell for the same
//     student, but only when the caret is already at the start/end of the
//     field — otherwise the arrow just moves the caret as normal.
//   - Focusing a score cell selects its whole contents (select-all).
// Score inputs are type="text" inputMode="numeric" rather than type="number"
// specifically so `selectionStart`/`selectionEnd` are reliable across
// browsers for the caret-boundary check above (Firefox does not expose
// selection on <input type="number">) — validation still enforces "digits
// only, within [0, maxMarks]".
import React, { useRef } from 'react';
import { Users } from 'lucide-react';
import { RemarksField } from '../RemarksField';
import { UseMarksData } from './useMarksData';

interface MarksGridProps {
  data: UseMarksData;
}

type NavCtx = {
  orderedStudents: any[];
  orderedSubjects: string[];
};

export const MarksGrid: React.FC<MarksGridProps> = ({ data }) => {
  const {
    entryMode,
    loading,
    rosterError,
    fetchStudentsAndMarks,
    filteredStudents,
    displayedSubjects,
    students,
    marks,
    savedMarkKeys,
    aiGeneratedKeys,
    generatingFor,
    getSubjectMaxMarks,
    getScoreError,
    getRemarksRows,
    handleScoreChange,
    handleRemarksChange,
    handleGenerateComment,
    studentTotalMap,
    subjectFillCounts,
    selectedSubjectFocus,
    setSelectedSubjectFocus,
    availableSubjects,
  } = data;

  const scoreRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const cellKey = (subject: string, studentId: string) => `${subject}::${studentId}`;

  const focusCell = (subject: string, studentId: string) => {
    const el = scoreRefs.current.get(cellKey(subject, studentId));
    if (el) {
      el.focus();
      el.select();
    }
  };

  const registerScoreRef = (subject: string, studentId: string) => (el: HTMLInputElement | null) => {
    const k = cellKey(subject, studentId);
    if (el) scoreRefs.current.set(k, el);
    else scoreRefs.current.delete(k);
  };

  const handleScoreKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    subject: string,
    studentId: string,
    ctx: NavCtx
  ) => {
    const { orderedStudents, orderedSubjects } = ctx;
    const studentIndex = orderedStudents.findIndex((s) => s.id === studentId);
    const subjectIndex = orderedSubjects.indexOf(subject);
    const input = e.currentTarget;

    switch (e.key) {
      case 'Enter':
      case 'ArrowDown':
        e.preventDefault();
        if (studentIndex >= 0 && studentIndex < orderedStudents.length - 1) {
          focusCell(subject, orderedStudents[studentIndex + 1].id);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (studentIndex > 0) {
          focusCell(subject, orderedStudents[studentIndex - 1].id);
        }
        break;
      case 'ArrowLeft':
        if (input.selectionStart === 0 && input.selectionEnd === 0) {
          if (subjectIndex > 0) {
            e.preventDefault();
            focusCell(orderedSubjects[subjectIndex - 1], studentId);
          }
        }
        break;
      case 'ArrowRight':
        if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
          if (subjectIndex >= 0 && subjectIndex < orderedSubjects.length - 1) {
            e.preventDefault();
            focusCell(orderedSubjects[subjectIndex + 1], studentId);
          }
        }
        break;
      default:
        break;
    }
  };

  const ScoreInput: React.FC<{
    subject: string;
    student: any;
    ctx: NavCtx;
    className: string;
  }> = ({ subject, student, ctx, className }) => {
    const cellId = `${subject}:${student.id}`;
    const scoreVal = marks[subject]?.[student.id]?.score || '';
    const isSaved = savedMarkKeys.has(cellId) && scoreVal !== '';
    const isEdited = scoreVal !== '' && !isSaved;
    const error = getScoreError(subject, student.id);

    return (
      <div className="flex flex-col gap-0.5">
        <input
          ref={registerScoreRef(subject, student.id)}
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={scoreVal}
          onChange={(e) => handleScoreChange(subject, student.id, e.target.value.replace(/[^0-9.]/g, ''))}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => handleScoreKeyDown(e, subject, student.id, ctx)}
          aria-invalid={error ? true : undefined}
          title={error ?? (isSaved ? 'Saved' : isEdited ? 'Not yet saved' : undefined)}
          className={`${className} ${
            error
              ? 'border-red-500 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-500/40 bg-red-50/50 dark:bg-red-500/10'
              : isSaved
              ? 'border-emerald-400 dark:border-emerald-500/60 ring-1 ring-emerald-200 dark:ring-emerald-500/20 bg-emerald-50/30'
              : isEdited
              ? 'border-amber-400 dark:border-amber-500/60 ring-1 ring-amber-200 dark:ring-amber-500/20 bg-amber-50/30'
              : ''
          }`}
        />
        {error && <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 leading-tight">{error}</span>}
      </div>
    );
  };

  const loadingBlock = (colSpan?: number) =>
    colSpan ? (
      <tr>
        <td colSpan={colSpan} className="px-6 py-12 text-center text-slate-500">
          Loading students...
        </td>
      </tr>
    ) : (
      <div className="glass-card p-12 text-center text-slate-500">Loading students...</div>
    );

  const errorBlock = (colSpan?: number) => {
    const body = (
      <div className="space-y-3">
        <p>Failed to load students for this class/section.</p>
        <button
          onClick={fetchStudentsAndMarks}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all"
        >
          Retry
        </button>
      </div>
    );
    return colSpan ? (
      <tr>
        <td colSpan={colSpan} className="px-6 py-12 text-center text-slate-500">
          {body}
        </td>
      </tr>
    ) : (
      <div className="glass-card p-12 text-center text-slate-500 space-y-3">{body}</div>
    );
  };

  const emptyBlock = (colSpan?: number) =>
    colSpan ? (
      <tr>
        <td colSpan={colSpan} className="px-6 py-12 text-center text-slate-500">
          No students found.
        </td>
      </tr>
    ) : (
      <div className="glass-card p-12 text-center text-slate-500 flex flex-col items-center gap-2">
        <Users className="w-8 h-8 text-slate-400" />
        No students found.
      </div>
    );

  // ── Student Cards — also used as the mobile fallback for Matrix mode ────
  const renderStudentCards = (subjectsToShow: string[]) => {
    const ctx: NavCtx = { orderedStudents: filteredStudents, orderedSubjects: subjectsToShow };
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredStudents.map((student) => {
          const summary = studentTotalMap[student.id] || { totalObtained: 0, totalMax: 0, filledCount: 0 };
          return (
            <div key={student.id} className="glass-card rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-base">
                      {student.firstName} {student.lastName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/20">
                      Roll #{student.rollNumber || '?'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ID: {student.studentId}</div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Marks</span>
                  <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                    {summary.totalObtained} <span className="text-xs font-medium text-slate-400">/ {summary.totalMax}</span>
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                {subjectsToShow.map((sub) => {
                  const generatingKey = `${sub}:${student.id}`;
                  return (
                    <div key={sub} className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/40 dark:border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{sub}</span>
                        <span className="text-[11px] text-slate-500">Max: {getSubjectMaxMarks(sub)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <label htmlFor={undefined} className="sr-only">
                          {sub} score for {student.firstName} {student.lastName}
                        </label>
                        <div className="flex-shrink-0">
                          <ScoreInput subject={sub} student={student} ctx={ctx} className="input-field w-20 text-center font-bold py-1.5 text-sm" />
                        </div>

                        <RemarksField
                          value={marks[sub]?.[student.id]?.remarks || ''}
                          aiGenerated={aiGeneratedKeys.has(generatingKey)}
                          generating={generatingFor === generatingKey}
                          rows={getRemarksRows(marks[sub]?.[student.id]?.remarks || '')}
                          onChange={(val) => handleRemarksChange(sub, student.id, val)}
                          onGenerate={() => handleGenerateComment(sub, student.id, marks[sub]?.[student.id]?.score)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Single Subject Focus ────────────────────────────────────────────────
  const renderSubjectFocus = () => {
    const sub = selectedSubjectFocus || availableSubjects[0];
    const ctx: NavCtx = { orderedStudents: filteredStudents, orderedSubjects: [sub] };
    return (
      <div className="space-y-4">
        <div className="glass-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-slate-200/50 dark:border-white/5">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Selected Subject:</label>
            <select
              value={selectedSubjectFocus}
              onChange={(e) => setSelectedSubjectFocus(e.target.value)}
              className="input-field min-w-[180px] font-bold text-blue-600 dark:text-blue-400"
            >
              {availableSubjects.map((s) => (
                <option key={s} value={s} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {s} ({subjectFillCounts[s] || 0}/{students.length} filled)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const idx = availableSubjects.indexOf(selectedSubjectFocus);
                if (idx > 0) setSelectedSubjectFocus(availableSubjects[idx - 1]);
              }}
              disabled={availableSubjects.indexOf(selectedSubjectFocus) <= 0}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
            >
              ‹
            </button>
            <span className="text-xs font-semibold text-slate-500">
              {availableSubjects.indexOf(selectedSubjectFocus) + 1} of {availableSubjects.length}
            </span>
            <button
              type="button"
              onClick={() => {
                const idx = availableSubjects.indexOf(selectedSubjectFocus);
                if (idx < availableSubjects.length - 1) setSelectedSubjectFocus(availableSubjects[idx + 1]);
              }}
              disabled={availableSubjects.indexOf(selectedSubjectFocus) >= availableSubjects.length - 1}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
            >
              ›
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {loading
            ? loadingBlock()
            : rosterError
            ? errorBlock()
            : filteredStudents.length === 0
            ? emptyBlock()
            : filteredStudents.map((student) => {
                const generatingKey = `${sub}:${student.id}`;
                return (
                  <div
                    key={student.id}
                    className="glass-card p-3.5 rounded-2xl border border-slate-200/60 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {student.rollNumber || '?'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {student.firstName} {student.lastName}
                        </div>
                        <div className="text-xs text-slate-500">{student.studentId}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-1 max-w-xl">
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <ScoreInput subject={sub} student={student} ctx={ctx} className="input-field w-20 text-center font-bold py-2 text-sm" />
                        <span className="text-xs text-slate-400 font-medium">/ {getSubjectMaxMarks(sub)}</span>
                      </div>

                      <RemarksField
                        value={marks[sub]?.[student.id]?.remarks || ''}
                        aiGenerated={aiGeneratedKeys.has(generatingKey)}
                        generating={generatingFor === generatingKey}
                        rows={getRemarksRows(marks[sub]?.[student.id]?.remarks || '')}
                        onChange={(val) => handleRemarksChange(sub, student.id, val)}
                        onGenerate={() => handleGenerateComment(sub, student.id, marks[sub]?.[student.id]?.score)}
                        textareaClassName="input-field flex-1 text-xs py-2 resize-y leading-snug"
                      />
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    );
  };

  // ── Full Table Matrix (desktop) + card fallback (mobile, <640px) ───────
  const renderMatrix = () => {
    const ctx: NavCtx = { orderedStudents: filteredStudents, orderedSubjects: displayedSubjects };
    const colSpan = 1 + displayedSubjects.length * 2;
    return (
      <>
        <div className="hidden sm:block glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-xs bg-white dark:bg-transparent">
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300 border-separate border-spacing-0">
              <thead className="sticky top-0 z-20 text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-30 px-6 py-4 font-medium align-bottom bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-white/10"
                  >
                    Student
                  </th>
                  {displayedSubjects.map((sub) => (
                    <th key={sub} colSpan={2} className="px-4 py-2 font-medium text-center border-l border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900">
                      <div>{sub}</div>
                      <div className="mt-0.5 font-normal normal-case text-[11px] text-slate-400 dark:text-slate-500">
                        {subjectFillCounts[sub] || 0}/{students.length} filled
                      </div>
                    </th>
                  ))}
                </tr>
                <tr>
                  {displayedSubjects.map((sub) => (
                    <React.Fragment key={sub}>
                      <th className="px-3 py-2 font-medium text-center border-l border-b border-slate-200 dark:border-white/10 w-24 bg-slate-50 dark:bg-slate-900">
                        Score
                      </th>
                      <th className="px-3 py-2 font-medium text-center min-w-[220px] border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900">
                        Remarks
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {loading
                  ? loadingBlock(colSpan)
                  : rosterError
                  ? errorBlock(colSpan)
                  : filteredStudents.length === 0
                  ? emptyBlock(colSpan)
                  : filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="sticky left-0 z-10 px-6 py-4 bg-white dark:bg-slate-950">
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">
                              {student.firstName} {student.lastName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {student.studentId} • Roll {student.rollNumber || '?'}
                            </div>
                          </div>
                        </td>
                        {displayedSubjects.map((sub) => {
                          const generatingKey = `${sub}:${student.id}`;
                          return (
                            <React.Fragment key={sub}>
                              <td className="px-3 py-4 border-l border-slate-200 dark:border-white/10">
                                <ScoreInput subject={sub} student={student} ctx={ctx} className="input-field w-16 text-center font-semibold" />
                              </td>
                              <td className="px-3 py-4">
                                <RemarksField
                                  value={marks[sub]?.[student.id]?.remarks || ''}
                                  aiGenerated={aiGeneratedKeys.has(generatingKey)}
                                  generating={generatingFor === generatingKey}
                                  rows={getRemarksRows(marks[sub]?.[student.id]?.remarks || '')}
                                  onChange={(val) => handleRemarksChange(sub, student.id, val)}
                                  onGenerate={() => handleGenerateComment(sub, student.id, marks[sub]?.[student.id]?.score)}
                                  textareaClassName="input-field flex-1 text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 min-w-[150px] resize-y leading-snug"
                                />
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile (<640px): the wide grid doesn't fit at 360px width, so
            Matrix mode falls back to the same labelled per-student cards as
            Student Cards mode, scoped to whichever subjects are focused. */}
        <div className="sm:hidden space-y-4">
          {loading ? loadingBlock() : rosterError ? errorBlock() : filteredStudents.length === 0 ? emptyBlock() : renderStudentCards(displayedSubjects)}
        </div>
      </>
    );
  };

  if (entryMode === 'cards') {
    return (
      <div className="space-y-4">
        {loading ? loadingBlock() : rosterError ? errorBlock() : filteredStudents.length === 0 ? emptyBlock() : renderStudentCards(displayedSubjects)}
      </div>
    );
  }

  if (entryMode === 'subject') {
    return renderSubjectFocus();
  }

  return renderMatrix();
};
