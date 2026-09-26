import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Users, Download, GraduationCap, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader, Button, Select, Skeleton, SkeletonStatGrid, ErrorState, StatCard } from '../../components/ui';
import { ReportCardDrawer } from './marks/ReportCardDrawer';
import { computeGpa } from './gradePoints';

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

  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [reportCardOpen, setReportCardOpen] = useState(false);

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

  const fetchReportCardBlob = async (studentId: string, examId: string): Promise<Blob> => {
    const res = await apiClient.get(`/results/${studentId}/report-card`, {
      params: { examId },
      responseType: 'blob',
    });
    return new Blob([res.data], { type: 'application/pdf' });
  };

  // Group results by exam, newest first. There is no date field on the
  // response shape, so we approximate "newest" via a natural-order
  // descending sort on the exam name (e.g. "Term 2" before "Term 1").
  const examGroups = useMemo<ExamGroup[]>(() => {
    const map = new Map<string, ExamGroup>();
    results.forEach((r) => {
      const examId = r.exam?.id || r.examId;
      if (!map.has(examId)) {
        map.set(examId, { examId, examName: r.exam?.name || 'Exam', records: [] });
      }
      map.get(examId)!.records.push(r);
    });
    return Array.from(map.values()).sort((a, b) => b.examName.localeCompare(a.examName, undefined, { numeric: true }));
  }, [results]);

  // Keep the exam picker in sync with whichever exams are actually present
  // for the selected child — default to the most recent, and reset if the
  // previously selected exam falls outside the new set (e.g. after
  // switching children).
  useEffect(() => {
    if (examGroups.length === 0) {
      setSelectedExamId(null);
      return;
    }
    if (!selectedExamId || !examGroups.some((g) => g.examId === selectedExamId)) {
      setSelectedExamId(examGroups[0].examId);
    }
  }, [examGroups, selectedExamId]);

  const selectedGroup = examGroups.find((g) => g.examId === selectedExamId) || null;

  const summary = useMemo(() => {
    if (!selectedGroup) return null;
    const totalObtained = selectedGroup.records.reduce((sum, r) => sum + Number(r.marksObtained), 0);
    const totalPossible = selectedGroup.records.reduce((sum, r) => sum + Number(r.maxMarks), 0);
    const percentage = totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100) : null;
    const gpa = computeGpa(selectedGroup.records.map((r) => r.grade));
    return { totalObtained, totalPossible, percentage, gpa };
  }, [selectedGroup]);

  const selectedChild = isGuardian ? children.find((c) => c.id === selectedChildId) : null;

  if (isGuardian && childrenLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <SkeletonStatGrid count={3} />
      </div>
    );
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

  return (
    <div className="space-y-6">
      <PageHeader title="My Exam Results" description="View your exam marks, grades and report cards." />

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <Button
              key={child.id}
              type="button"
              size="sm"
              variant={selectedChildId === child.id ? 'primary' : 'secondary'}
              onClick={() => setSelectedChildId(child.id)}
            >
              {child.firstName} {child.lastName}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full sm:w-64" />
          <SkeletonStatGrid count={3} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="glass-card p-8">
          <ErrorState message="Something went wrong while fetching your exam results." onRetry={fetchResults} />
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
        <>
          {/* Exam picker */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <Select
              label="Exam"
              value={selectedExamId ?? ''}
              onChange={(e) => setSelectedExamId(e.target.value)}
              options={examGroups.map((g) => ({ value: g.examId, label: g.examName }))}
              containerClassName="w-full sm:w-64"
            />
            {selectedGroup && (
              <Button
                type="button"
                variant="primary"
                onClick={() => setReportCardOpen(true)}
                leftIcon={<Download className="w-4 h-4" />}
                className="sm:mb-0"
              >
                Download Report Card
              </Button>
            )}
          </div>

          {selectedGroup && summary && (
            <>
              {/* GPA / totals summary — computed on-screen from the grades
                  shown below using the standard NCTB grade-point scale; the
                  backend has no GPA field, so this is never sent anywhere,
                  only ever a re-derived display of the real marks/grades on
                  this page. */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <StatCard
                  label="Total Marks"
                  value={`${summary.totalObtained}/${summary.totalPossible}`}
                  icon={<BookOpen />}
                  tone="info"
                  hint={summary.percentage !== null ? `${summary.percentage}%` : undefined}
                />
                <StatCard
                  label="Subjects Graded"
                  value={selectedGroup.records.length}
                  icon={<GraduationCap />}
                  tone="primary"
                />
                <StatCard
                  label="GPA"
                  value={summary.gpa !== null ? summary.gpa.toFixed(2) : '—'}
                  icon={<Trophy />}
                  tone="success"
                  hint="Calculated from grades shown below"
                />
              </div>

              {/* Subject cards — mobile-first; a wide table doesn't fit at
                  360px width. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedGroup.records
                  .slice()
                  .sort((a, b) => a.subject.localeCompare(b.subject))
                  .map((r) => (
                    <div key={r.id} className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">{r.subject}</h3>
                        {r.grade ? <StatusBadge status={r.grade} /> : <span className="text-slate-400 dark:text-slate-600 text-xs">—</span>}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">{Number(r.marksObtained)}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">/ {Number(r.maxMarks)}</span>
                      </div>
                      {r.highestMarkInSubject !== null && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Highest in class:{' '}
                          <span
                            className={
                              Number(r.marksObtained) > 0 && Number(r.marksObtained) === r.highestMarkInSubject
                                ? 'font-bold text-emerald-600 dark:text-emerald-400'
                                : 'font-semibold text-slate-700 dark:text-slate-300'
                            }
                          >
                            {r.highestMarkInSubject}
                          </span>
                        </p>
                      )}
                      {r.remarks && <p className="text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-white/5 pt-2">{r.remarks}</p>}
                    </div>
                  ))}
              </div>
            </>
          )}
        </>
      )}

      {selectedGroup && (
        <ReportCardDrawer
          isOpen={reportCardOpen}
          onClose={() => setReportCardOpen(false)}
          title={`Report Card — ${selectedGroup.examName}`}
          description={selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : undefined}
          fileName={`report-card-${selectedGroup.records[0]?.studentId || 'me'}.pdf`}
          fetchBlob={() => fetchReportCardBlob(selectedGroup.records[0].studentId, selectedGroup.examId)}
        />
      )}
    </div>
  );
};

export default MyExamResults;
