import React, { useEffect, useState } from 'react';
import { BookOpen, Users, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';

interface ExamResult {
  id: string;
  examId: string;
  exam: { id: string; name: string };
  subject: string;
  marksObtained: number;
  maxMarks: number;
  grade: string | null;
  remarks: string | null;
  studentId: string;
  highestMarkInSubject: number | null;
}

interface ChildSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  class: { name: string } | null;
  section: { name: string } | null;
}

interface ExamGroup {
  examId: string;
  examName: string;
  records: ExamResult[];
}

const MyExamResults: React.FC = () => {
  const { user } = useAuthStore();
  const isGuardian = user?.role === 'GUARDIAN';

  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(isGuardian);

  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Load linked children for GUARDIAN role
  useEffect(() => {
    if (!isGuardian) return;
    const fetchChildren = async () => {
      try {
        const res = await apiClient.get('/guardians/me/students');
        const list: ChildSummary[] = res.data.data || [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      } catch (err) {
        console.error('Failed to load linked children', err);
        toast.error('Failed to load your children');
      } finally {
        setChildrenLoading(false);
      }
    };
    fetchChildren();
  }, [isGuardian]);

  const fetchResults = async () => {
    if (isGuardian && !selectedChildId) return;
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, any> = {};
      if (isGuardian && selectedChildId) params.studentId = selectedChildId;
      const res = await apiClient.get('/results/me', { params });
      setResults(res.data.data || []);
    } catch (err: any) {
      console.error('Failed to load exam results', err);
      setError(true);
      toast.error(err.response?.data?.message || 'Failed to load your exam results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isGuardian && childrenLoading) return;
    if (isGuardian && children.length === 0) {
      setLoading(false);
      return;
    }
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, childrenLoading]);

  const downloadReportCard = async (studentId: string, examId: string) => {
    try {
      const res = await apiClient.get(`/results/${studentId}/report-card`, {
        params: { examId },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-card-${studentId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Report card not available for this exam yet');
    }
  };

  if (isGuardian && childrenLoading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your dashboard...</div>;
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title="No linked children found"
          description="Contact your school administrator to link your account to your child's student profile."
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

  // Group results by exam, newest first. There is no date field on the
  // response shape, so we approximate "newest" via a natural-order
  // descending sort on the exam name (e.g. "Term 2" before "Term 1").
  const examGroupsMap = new Map<string, ExamGroup>();
  results.forEach((r) => {
    const examId = r.exam?.id || r.examId;
    if (!examGroupsMap.has(examId)) {
      examGroupsMap.set(examId, { examId, examName: r.exam?.name || 'Exam', records: [] });
    }
    examGroupsMap.get(examId)!.records.push(r);
  });
  const examGroups = Array.from(examGroupsMap.values()).sort((a, b) =>
    b.examName.localeCompare(a.examName, undefined, { numeric: true })
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">My Exam Results</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">View your exam marks, grades and report cards.</p>
      </div>

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedChildId === child.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your exam results...</div>
      ) : error ? (
        <div className="glass-card p-8">
          <EmptyState
            title="Failed to load results"
            description="Something went wrong while fetching your exam results."
            icon={<BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={
              <button
                onClick={fetchResults}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Retry
              </button>
            }
          />
        </div>
      ) : examGroups.length === 0 ? (
        <div className="glass-card p-8">
          <EmptyState
            title="No results yet"
            description="Results will appear here once your teachers publish exam grades."
            icon={<BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          />
        </div>
      ) : (
        examGroups.map((group) => (
          <div
            key={group.examId}
            className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 overflow-hidden"
          >
            <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/50 dark:border-white/5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{group.examName}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {group.records.length} subjects graded
                </p>
              </div>
              <button
                onClick={() => downloadReportCard(group.records[0].studentId, group.examId)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl transition-all shadow-md shadow-indigo-500/20 text-xs font-semibold active:scale-[0.98]"
              >
                <Download className="w-3.5 h-3.5" />
                Download Report Card
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Subject</th>
                    <th className="px-6 py-3 font-medium text-center">Marks</th>
                    <th className="px-6 py-3 font-medium text-center">Grade</th>
                    <th className="px-6 py-3 font-medium text-center">Highest in Class</th>
                    <th className="px-6 py-3 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {group.records.map((r) => (
                    <tr key={r.id}>
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{r.subject}</td>
                      <td className="px-6 py-3 text-center">
                        {Number(r.marksObtained)}/{Number(r.maxMarks)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {r.grade ? (
                          <StatusBadge status={r.grade} />
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {r.highestMarkInSubject !== null ? (
                          <span
                            className={
                              Number(r.marksObtained) > 0 && Number(r.marksObtained) === r.highestMarkInSubject
                                ? 'font-bold text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {r.highestMarkInSubject}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default MyExamResults;
