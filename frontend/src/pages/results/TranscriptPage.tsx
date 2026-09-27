import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Search } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { ErrorState, Input, PageHeader, Select, Skeleton, Tabs } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useT } from '../../i18n';
import { useTranscript } from './insights.queries';
import { TranscriptDocument } from './TranscriptDocument';
import { ProgressReport } from './ProgressReport';

interface StudentLite {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
}

const label = (s: StudentLite) =>
  `${s.firstName} ${s.lastName} · ${s.studentId}${s.class ? ` · ${s.class.name}${s.section ? ` ${s.section.name}` : ''}` : ''}`;

/** Staff picker: debounced search over GET /students (SA/A/T). */
const StaffStudentPicker: React.FC<{ value: string; onChange: (id: string) => void }> = ({ value, onChange }) => {
  const t = useT();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(h);
  }, [search]);
  const students = useQuery({
    queryKey: ['transcript-student-search', debounced],
    queryFn: async (): Promise<StudentLite[]> => {
      const { data } = await apiClient.get('/students', { params: { page: 1, pageSize: 25, search: debounced || undefined } });
      return data.data ?? [];
    },
  });
  const options = (students.data ?? []).map((s) => ({ value: s.id, label: label(s) }));
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: t('Selected student') });
  return (
    <div className="grid gap-3 sm:grid-cols-2 items-end">
      <Input
        label={t('Find student')}
        placeholder={t('Name, student ID or roll')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<Search className="w-4 h-4" />}
      />
      <Select
        label={t('Student')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={students.isLoading ? t('Loading…') : t('Select student')}
        options={options}
        error={students.isError ? t('Could not load students') : undefined}
      />
    </div>
  );
};

/** Guardian picker: linked children (GET /guardians/me/students). */
const GuardianChildPicker: React.FC<{ value: string; onChange: (id: string) => void }> = ({ value, onChange }) => {
  const t = useT();
  const children = useQuery({
    queryKey: ['guardian-my-students'],
    queryFn: async (): Promise<StudentLite[]> => (await apiClient.get('/guardians/me/students')).data.data ?? [],
  });
  useEffect(() => {
    if (!value && children.data && children.data.length > 0) onChange(children.data[0].id);
  }, [children.data, value, onChange]);
  if (children.isLoading) return <Skeleton className="h-10 w-72" />;
  if (children.isError) return <ErrorState compact onRetry={() => children.refetch()} />;
  if ((children.data ?? []).length === 0) return <EmptyState compact title={t('No linked children')} description={t('Ask the school to link your child to your account.')} />;
  return (
    <Select
      label={t('Child')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={(children.data ?? []).map((s) => ({ value: s.id, label: label(s) }))}
      containerClassName="max-w-md"
    />
  );
};

const TranscriptTab: React.FC<{ studentId: string }> = ({ studentId }) => {
  const t = useT();
  const q = useTranscript(studentId);
  if (q.isLoading) return <Skeleton className="h-[480px] w-full max-w-[210mm] mx-auto" />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  if (q.data.sessions.length === 0) {
    return <EmptyState icon={<GraduationCap className="w-6 h-6" />} title={t('No exam results yet')} description={t('The transcript fills in as marks are recorded.')} />;
  }
  return (
    <div>
      <p className="no-print text-xs text-slate-500 dark:text-slate-400 mb-2">{t('To save as PDF, click Print and choose "Save as PDF".')}</p>
      <TranscriptDocument data={q.data} />
    </div>
  );
};

/**
 * Route: /results/transcript (?studentId=) — SUPER_ADMIN, ADMIN, TEACHER,
 * STUDENT (own record), GUARDIAN (linked children). Backend enforces the
 * same ownership rules.
 */
const TranscriptPage: React.FC = () => {
  const t = useT();
  const { user } = useAuthStore();
  const role = user?.role;
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'transcript' | 'progress'>(params.get('tab') === 'progress' ? 'progress' : 'transcript');
  const [picked, setPicked] = useState(params.get('studentId') ?? '');

  const studentId = role === 'STUDENT' ? 'me' : picked || null;

  const choose = (id: string) => {
    setPicked(id);
    const next = new URLSearchParams(params);
    if (id) next.set('studentId', id);
    else next.delete('studentId');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Transcript & progress')}
        description={t('All exams across sessions, with a printable transcript and subject-wise progress.')}
        breadcrumbs={[{ label: t('Results'), to: '/results' }, { label: t('Transcript & progress') }]}
      />

      {role !== 'STUDENT' && (
        <div className="glass-card p-4 no-print">
          {role === 'GUARDIAN' ? <GuardianChildPicker value={picked} onChange={choose} /> : <StaffStudentPicker value={picked} onChange={choose} />}
        </div>
      )}

      <div className="no-print">
        <Tabs
          label={t('Transcript and progress tabs')}
          variant="underline"
          value={tab}
          onChange={(id) => setTab(id as 'transcript' | 'progress')}
          tabs={[
            { id: 'transcript', label: t('Transcript') },
            { id: 'progress', label: t('Progress report') },
          ]}
        />
      </div>

      {!studentId ? (
        <EmptyState icon={<GraduationCap className="w-6 h-6" />} title={t('Select a student')} description={t('Choose a student to see their transcript and progress.')} />
      ) : tab === 'transcript' ? (
        <TranscriptTab studentId={studentId} />
      ) : (
        <ProgressReport studentId={studentId} />
      )}
    </div>
  );
};

export default TranscriptPage;
