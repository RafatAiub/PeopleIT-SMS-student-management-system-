import React, { useState } from 'react';
import { ClipboardCheck, BarChart3 } from 'lucide-react';
import { PageHeader, Tabs } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import SubjectMarkPanel from './SubjectMarkPanel';
import SubjectReportPanel from './SubjectReportPanel';
import SubjectAttendanceMyView from './SubjectAttendanceMyView';

/**
 * SUPER_ADMIN / ADMIN / TEACHER mark and report; STUDENT / GUARDIAN get the
 * per-subject self view (mirrors /subject-attendance requireRole lists).
 */
export default function SubjectAttendancePage() {
  const t = useT();
  const { user } = useAuthStore();
  const role = user?.role;
  const [tab, setTab] = useState<'mark' | 'report'>('mark');

  if (role === 'STUDENT' || role === 'GUARDIAN') return <SubjectAttendanceMyView mode={role === 'STUDENT' ? 'student' : 'guardian'} />;

  const isTeacher = role === 'TEACHER';
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Subject Attendance')}
        description={t('Period-wise attendance per subject, and each student’s attendance % by subject.')}
      />
      <Tabs
        tabs={[
          { id: 'mark', label: t('Take attendance'), icon: <ClipboardCheck className="w-4 h-4" /> },
          { id: 'report', label: t('Subject report'), icon: <BarChart3 className="w-4 h-4" /> },
        ]}
        value={tab}
        onChange={(id) => setTab(id as 'mark' | 'report')}
      />
      {tab === 'mark' ? <SubjectMarkPanel isTeacher={isTeacher} /> : <SubjectReportPanel isTeacher={isTeacher} />}
    </div>
  );
}
