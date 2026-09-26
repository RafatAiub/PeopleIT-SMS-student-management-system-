// "Student Marksheet" tab — one student's own per-subject marks for the
// selected exam, plus a report card preview/download.
import React, { useState } from 'react';
import { Award, Users, Download } from 'lucide-react';
import { DataTable } from '../../../components/DataTable/DataTable';
import { EmptyState } from '../../../components/common/EmptyState';
import { Button } from '../../../components/ui';
import { MarksToolbar } from './MarksToolbar';
import { ReportCardDrawer } from './ReportCardDrawer';
import { MarksheetRow, UseMarksData } from './useMarksData';

interface StudentMarksheetTabProps {
  data: UseMarksData;
}

export const StudentMarksheetTab: React.FC<StudentMarksheetTabProps> = ({ data }) => {
  const {
    students,
    selectedStudentId,
    setSelectedStudentId,
    rosterError,
    fetchStudentsAndMarks,
    selectedExam,
    marksheetError,
    fetchMarksheet,
    selectedStudent,
    selectedExamName,
    selectedClass,
    selectedSection,
    marksheetRows,
    marksheetColumns,
    marksheetLoading,
    fetchReportCardBlob,
  } = data;

  const [reportCardOpen, setReportCardOpen] = useState(false);

  return (
    <>
      <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-6 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-xs">
        <MarksToolbar
          data={data}
          extra={
            <div className="flex flex-col">
              <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1.5">Student</label>
              <div className="relative">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  disabled={students.length === 0}
                  className="input-field pr-10 min-w-[240px]"
                >
                  {students.length > 0 ? (
                    students.map((s: any) => (
                      <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                        {s.firstName} {s.lastName} ({s.studentId}) • Roll {s.rollNumber || '?'}
                      </option>
                    ))
                  ) : (
                    <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                      No students found
                    </option>
                  )}
                </select>
              </div>
            </div>
          }
        />
      </div>

      {rosterError ? (
        <div className="glass-card p-8">
          <EmptyState
            title="Failed to load students"
            description="Something went wrong while fetching the student roster for this class/section."
            icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={
              <button
                onClick={fetchStudentsAndMarks}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Retry
              </button>
            }
          />
        </div>
      ) : students.length === 0 ? (
        <div className="glass-card p-8">
          <EmptyState
            title="No students found"
            description={`No students found under ${selectedClass} Section ${selectedSection}.`}
            icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          />
        </div>
      ) : !selectedExam ? (
        <div className="glass-card p-8">
          <EmptyState
            title="Select an exam"
            description="Choose an exam above to view this student's marksheet."
            icon={<Award className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          />
        </div>
      ) : marksheetError ? (
        <div className="glass-card p-8">
          <EmptyState
            title="Failed to load marksheet"
            description="Something went wrong while fetching the marksheet for this exam/class/section."
            icon={<Award className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={
              <button
                onClick={fetchMarksheet}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Retry
              </button>
            }
          />
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-xs p-5">
          {selectedStudent && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedStudent.studentId} • Roll {selectedStudent.rollNumber || '?'} • {selectedExamName || 'No exam selected'} • {selectedClass} - Section {selectedSection}
                </p>
              </div>
              {marksheetRows.length > 0 && (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-slate-500 dark:text-slate-400 text-xs font-bold block mb-1">Total</span>
                    <span className="text-blue-600 dark:text-blue-400 font-extrabold text-sm">
                      {marksheetRows.reduce((sum, r) => sum + r.marksObtained, 0)}
                      <span className="text-slate-500 text-xs">/{marksheetRows.reduce((sum, r) => sum + r.maxMarks, 0)}</span>
                    </span>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setReportCardOpen(true)} className="text-xs">
                    <Download className="w-3.5 h-3.5" />
                    Download Report Card
                  </Button>
                </div>
              )}
            </div>
          )}
          <DataTable<MarksheetRow>
            data={marksheetRows}
            columns={marksheetColumns}
            isLoading={marksheetLoading}
            searchPlaceholder="Search subject..."
            pageSize={25}
            emptyTitle="No results yet"
            emptyDescription={`No marks have been recorded for ${selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : 'this student'} in ${selectedExamName || 'this exam'} yet.`}
          />
        </div>
      )}

      {selectedStudent && (
        <ReportCardDrawer
          isOpen={reportCardOpen}
          onClose={() => setReportCardOpen(false)}
          title={`Report Card — ${selectedStudent.firstName} ${selectedStudent.lastName}`}
          description={selectedExamName || undefined}
          fileName={`report-card-${selectedStudent.studentId || selectedStudent.id}.pdf`}
          fetchBlob={() => fetchReportCardBlob(selectedStudent.id, selectedExam)}
        />
      )}
    </>
  );
};
