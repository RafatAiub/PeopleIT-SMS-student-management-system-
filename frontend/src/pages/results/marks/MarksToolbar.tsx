// Shared exam / class / section / department selector bar. The original
// MarksEntry.tsx repeated this exact markup three times (once per tab) with
// no behavioural differences beyond which extra field each tab tacked on —
// consolidated here so there is one place that defines "how do you pick an
// exam + class + section" for the Grade Book Portal.
import React from 'react';
import { UseMarksData } from './useMarksData';

interface MarksToolbarProps {
  data: UseMarksData;
  /** Extra field(s) rendered after Class/Section/Department, e.g. the
   * Focus Subject select on the Upload tab or the Student select on the
   * Student Marksheet tab. */
  extra?: React.ReactNode;
}

export const MarksToolbar: React.FC<MarksToolbarProps> = ({ data, extra }) => {
  const {
    exams,
    selectedExam,
    setSelectedExam,
    isTeacher,
    selectedClass,
    setSelectedClass,
    selectedSection,
    setSelectedSection,
    assignedSections,
    adminClasses,
    adminSections,
    isSeniorClass,
    selectedDepartment,
    setSelectedDepartment,
    DEPARTMENTS,
  } = data;

  return (
    <>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Select Exam</label>
        <div className="relative">
          <select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
            className="input-field pr-10 min-w-[160px]"
          >
            {exams.length > 0 ? (
              exams.map((exam) => (
                <option key={exam.id} value={exam.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {exam.name}
                </option>
              ))
            ) : (
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                No exams available
              </option>
            )}
          </select>
        </div>
      </div>

      {isTeacher ? (
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Assigned Class-Section</label>
          <div className="relative">
            <select
              value={`${selectedClass}-${selectedSection}`}
              onChange={(e) => {
                const [cName, sName] = e.target.value.split('-');
                setSelectedClass(cName);
                setSelectedSection(sName);
              }}
              className="input-field pr-10 min-w-[160px]"
            >
              {assignedSections.map((s) => (
                <option key={s.id} value={`${s.class.name}-${s.name}`} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {s.class.name} - Section {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Class</label>
            <div className="relative">
              <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="input-field pr-10">
                {adminClasses.map((cls) => (
                  <option key={cls.id} value={cls.name} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Section</label>
            <div className="relative">
              <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} className="input-field pr-10">
                {adminSections.map((sec) => (
                  <option key={sec.id} value={sec.name} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {isSeniorClass && (
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Department</label>
          <div className="relative">
            <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)} className="input-field pr-10">
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {extra}
    </>
  );
};
