import React, { useState } from 'react';
import { ClipboardCheck, BarChart3 } from 'lucide-react';
import { PageHeader, Tabs } from '@/components/ui';
import { useT } from '@/i18n';
import StaffAttendanceRegister from './StaffAttendanceRegister';
import StaffAttendanceReport from './StaffAttendanceReport';

/** SUPER_ADMIN / ADMIN — matches the backend's requireRole on /staff-attendance. */
export default function StaffAttendancePage() {
  const t = useT();
  const [tab, setTab] = useState<'register' | 'report'>('register');
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Staff Attendance')}
        description={t('Daily staff register with approved-leave suggestions, QR check-in times and a monthly report.')}
      />
      <Tabs
        tabs={[
          { id: 'register', label: t('Daily register'), icon: <ClipboardCheck className="w-4 h-4" /> },
          { id: 'report', label: t('Monthly report'), icon: <BarChart3 className="w-4 h-4" /> },
        ]}
        value={tab}
        onChange={(id) => setTab(id as 'register' | 'report')}
      />
      {tab === 'register' ? <StaffAttendanceRegister /> : <StaffAttendanceReport />}
    </div>
  );
}
