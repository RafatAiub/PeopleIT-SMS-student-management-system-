import React, { useState, useEffect } from 'react';
import { FileDown, Search } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

interface StudentOption {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
}

/**
 * Original single-student flow: search a student by name/ID, pick an exam,
 * download their report card. Restored verbatim (same endpoints, same
 * debounce, same forced-download behaviour) alongside the newer "By class"
 * marksheet view in GenerateResultByClass.tsx — the two are presented as
 * tabs in GenerateResult.tsx rather than one replacing the other.
 */
const GenerateResultSingleStudent = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [downloading, setDownloading] = useState(false);

  const fetchExams = async () => {
    try {
      const res = await apiClient.get('/results');
      const examsData = res.data.data || [];
      setExams(examsData);
      if (examsData.length > 0) setSelectedExamId(examsData[0].id);
    } catch (err) {
      console.error('Failed to fetch exams', err);
      toast.error('Failed to load exam list');
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  // Debounced student search — mirrors the search-driven list fetch already
  // used elsewhere (e.g. StudentList.tsx), just scoped to a single-student
  // picker here rather than a paginated table.
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setStudentOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setStudentsLoading(true);
      try {
        const res = await apiClient.get('/students', { params: { search: query, pageSize: 20 } });
        setStudentOptions(res.data.data || []);
      } catch (err) {
        console.error('Failed to search students', err);
      } finally {
        setStudentsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const downloadReportCard = async () => {
    if (!selectedStudentId || !selectedExamId) return;
    setDownloading(true);
    try {
      const res = await apiClient.get(`/results/${selectedStudentId}/report-card`, {
        params: { examId: selectedExamId },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-card-${selectedStudentId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Report card not available for this exam yet');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="glass-card p-6 rounded-2xl max-w-xl space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Search Student</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or student ID..."
            className="input-field pl-10"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Student</label>
        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="input-field cursor-pointer"
          disabled={studentsLoading || studentOptions.length === 0}
        >
          <option value="">
            {studentsLoading ? 'Searching…' : studentOptions.length === 0 ? 'Type at least 2 characters to search' : '-- Select Student --'}
          </option>
          {studentOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentId})</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-400">Exam</label>
        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          className="input-field cursor-pointer"
        >
          {exams.length === 0 ? (
            <option value="">No exams available</option>
          ) : (
            exams.map((exam) => (
              <option key={exam.id} value={exam.id}>{exam.name}</option>
            ))
          )}
        </select>
      </div>

      <div className="pt-2 flex justify-end">
        <Button
          type="button"
          variant="gradient"
          onClick={downloadReportCard}
          isLoading={downloading}
          disabled={!selectedStudentId || !selectedExamId || downloading}
        >
          <FileDown className="w-4 h-4" />
          {downloading ? 'Preparing…' : 'Download Report Card'}
        </Button>
      </div>
    </div>
  );
};

export default GenerateResultSingleStudent;
