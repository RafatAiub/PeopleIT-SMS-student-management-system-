import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layers, ClipboardCheck, FileEdit, CalendarClock, Sparkles } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { DashboardSkeleton } from '../../components/common/DashboardSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader, StatCard, ErrorState, Button, AiGeneratedNotice, IncompleteNotice } from '../../components/ui';

interface TeacherSection {
  id: string;
  name: string;
  class: { name: string } | null;
}

const TeacherDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const sectionsQuery = useQuery({
    queryKey: ['attendance', 'my-sections'],
    queryFn: async () => (await apiClient.get<{ data: TeacherSection[] }>('/attendance/my-sections')).data.data ?? [],
  });

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'mine', user?.id],
    queryFn: async () =>
      (await apiClient.get('/assignments', { params: { createdByUserId: user?.id, page: 1, pageSize: 5 } })).data,
    enabled: !!user?.id,
  });

  const insightsQuery = useQuery({
    queryKey: ['ai', 'dashboard-insights'],
    queryFn: async () => (await apiClient.get('/ai/dashboard-insights')).data.data,
    retry: false,
  });

  if (sectionsQuery.isLoading) return <DashboardSkeleton />;
  if (sectionsQuery.isError) {
    return <ErrorState onRetry={() => sectionsQuery.refetch()} message="Could not load your sections." />;
  }

  const sections = sectionsQuery.data ?? [];
  const assignments = assignmentsQuery.data?.data ?? [];
  const assignmentsTotal = assignmentsQuery.data?.meta?.total ?? assignments.length;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user?.firstName ?? ''}`} description="Your class sections, timetable, and academic activity for today." />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="My Sections" value={sections.length} icon={<Layers />} tone="primary" hint="Sections you are class teacher for" />
        <StatCard
          label="My Assignments"
          value={assignmentsQuery.isError ? '—' : assignmentsTotal}
          icon={<FileEdit />}
          tone="info"
          hint="Classwork you've created"
          to="/lecture"
        />
        <StatCard label="Attendance" value="Take now" icon={<ClipboardCheck />} tone="success" to="/attendance" hint="Mark today's attendance" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button leftIcon={<ClipboardCheck className="w-4 h-4" />} onClick={() => navigate('/attendance')}>Take Attendance</Button>
        <Button leftIcon={<FileEdit className="w-4 h-4" />} variant="secondary" onClick={() => navigate('/results')}>Enter Marks</Button>
        <Button leftIcon={<CalendarClock className="w-4 h-4" />} variant="secondary" onClick={() => navigate('/timetables')}>View Timetable</Button>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">My Sections</h3>
        {sections.length === 0 ? (
          <EmptyState title="No sections assigned" description="You are not the class teacher for any section yet." icon={<Layers className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sections.map((s) => (
              <div key={s.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{s.class?.name ?? '—'} · {s.name}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => navigate('/attendance')}>Attendance</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">AI Insights</h3>
        </div>
        {insightsQuery.isLoading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : insightsQuery.isError || !insightsQuery.data ? (
          <IncompleteNotice reason="AI insights could not be generated for your classes right now." />
        ) : (
          <AiGeneratedNotice>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
              {insightsQuery.data.summary ?? 'No summary available.'}
            </p>
          </AiGeneratedNotice>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
