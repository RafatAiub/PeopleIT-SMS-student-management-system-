import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { TasksPanel } from './TaskList';

/** Admissions follow-up tasks assigned to the signed-in staff member (the daily digest links here). */
export default function MyTasksPage() {
  const t = useT();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const manager = role === 'ADMIN' || role === 'SUPER_ADMIN';
  return (
    <div className="space-y-6">
      <PageHeader title={t('My admission tasks')} description={t('Follow-ups assigned to you. Tick a task when it is done.')} />
      <TasksPanel onOpenEnquiry={manager ? (id) => navigate(`/admissions/enquiries?tab=board&enquiry=${encodeURIComponent(id)}`) : undefined} />
    </div>
  );
}
