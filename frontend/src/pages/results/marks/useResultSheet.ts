// "Complete Result Sheet" tab's data — split out of useMarksData.ts (which
// was over 1000 lines) since this slice only needs the current
// exam/class/section selection and doesn't touch the marks-entry roster or
// grid state at all. GET /results/results-list is the same endpoint
// useMarksData's own existing-marks overlay uses; this just requests the
// whole class/section instead of overlaying onto a blank grid.
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import apiClient from '../../../api/client';

interface UseResultSheetParams {
  classesMeta: any[];
  selectedExam: string;
  selectedClass: string;
  selectedSection: string;
  activeTab: 'upload' | 'sheet' | 'marksheet';
}

export function useResultSheet({ classesMeta, selectedExam, selectedClass, selectedSection, activeTab }: UseResultSheetParams) {
  const [completeResults, setCompleteResults] = useState<any[]>([]);
  const [completeResultsLoading, setCompleteResultsLoading] = useState(false);
  const [completeResultsError, setCompleteResultsError] = useState(false);
  const [resultSheetClassTeacher, setResultSheetClassTeacher] = useState<string>('Not Assigned');

  const fetchCompleteResultSheet = async () => {
    if (!selectedExam) return;

    const cls = classesMeta.find((c: any) => c.name === selectedClass);
    let sec = null;
    if (cls) {
      try {
        const sectionsRes = await apiClient.get(`/students/meta/sections?classId=${cls.id}`);
        const sectionsList = sectionsRes.data.data || [];
        sec = sectionsList.find((s: any) => s.name === selectedSection);
      } catch (err) {
        console.error(err);
      }
    }

    if (sec) {
      if (sec.classTeacher?.user) {
        setResultSheetClassTeacher(`${sec.classTeacher.user.firstName} ${sec.classTeacher.user.lastName} (${sec.classTeacher.user.email})`);
      } else {
        setResultSheetClassTeacher('Not Assigned');
      }
    } else {
      setResultSheetClassTeacher('Not Assigned');
    }

    try {
      setCompleteResultsLoading(true);
      setCompleteResultsError(false);
      const queryParams = new URLSearchParams();
      queryParams.append('examId', selectedExam);
      if (cls) queryParams.append('classId', cls.id);
      if (sec) queryParams.append('sectionId', sec.id);
      queryParams.append('pageSize', '1000');

      const res = await apiClient.get(`/results/results-list?${queryParams.toString()}`);
      setCompleteResults(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch complete result sheet', err);
      setCompleteResultsError(true);
      setCompleteResults([]);
      toast.error('Failed to load the complete result sheet.');
    } finally {
      setCompleteResultsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sheet') {
      fetchCompleteResultSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedExam, selectedClass, selectedSection, classesMeta]);

  // Construct complete result matrix
  const uniqueSubjects = Array.from(new Set(completeResults.map((r) => r.subject)));

  const studentRowsMap: Record<
    string,
    {
      studentId: string;
      rollNumber: string;
      firstName: string;
      lastName: string;
      scores: Record<string, number>;
      maxMarks: Record<string, number>;
      totalObtained: number;
      totalPossible: number;
    }
  > = {};

  completeResults.forEach((record) => {
    const student = record.student;
    if (!student) return;

    if (!studentRowsMap[student.id]) {
      studentRowsMap[student.id] = {
        studentId: student.studentId,
        rollNumber: student.rollNumber || '—',
        firstName: student.firstName,
        lastName: student.lastName,
        scores: {},
        maxMarks: {},
        totalObtained: 0,
        totalPossible: 0,
      };
    }

    const marksVal = Number(record.marksObtained);
    const maxVal = Number(record.maxMarks);

    studentRowsMap[student.id].scores[record.subject] = marksVal;
    studentRowsMap[student.id].maxMarks[record.subject] = maxVal;
    studentRowsMap[student.id].totalObtained += marksVal;
    studentRowsMap[student.id].totalPossible += maxVal;
  });

  const studentRows = Object.values(studentRowsMap).sort((a, b) => {
    const rollA = parseInt(a.rollNumber) || 999;
    const rollB = parseInt(b.rollNumber) || 999;
    return rollA - rollB;
  });

  const downloadCSV = () => {
    if (studentRows.length === 0) {
      toast.error('No results found to download.');
      return;
    }

    const headers = ['Roll No', 'Student ID', 'Student Name', ...uniqueSubjects, 'Total Obtained', 'Total Possible', 'Percentage'];

    const rows = studentRows.map((row) => {
      const percentage = row.totalPossible > 0 ? `${Math.round((row.totalObtained / row.totalPossible) * 100)}%` : '—';

      const subjectScores = uniqueSubjects.map((sub) => (row.scores[sub] !== undefined ? row.scores[sub] : '—'));

      return [
        `"${row.rollNumber}"`,
        `"${row.studentId}"`,
        `"${row.firstName} ${row.lastName}"`,
        ...subjectScores,
        row.totalObtained,
        row.totalPossible,
        `"${percentage}"`,
      ];
    });

    const csvContent = '﻿' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Result_Sheet_${selectedClass}_Section_${selectedSection}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    completeResults,
    completeResultsLoading,
    completeResultsError,
    resultSheetClassTeacher,
    uniqueSubjects,
    studentRows,
    downloadCSV,
    fetchCompleteResultSheet,
  };
}
