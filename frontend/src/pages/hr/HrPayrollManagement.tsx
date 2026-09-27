import React, { useState } from 'react';
import { Users, DollarSign, Layers, BarChart3 } from 'lucide-react';
import { PageHeader, Tabs } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import StaffTab from './StaffTab';
import PayrollTab from './PayrollTab';
import SalaryComponentsTab from './SalaryComponentsTab';
import PayrollReportTab from './PayrollReportTab';
import type { StaffProfile } from './hr.types';

type HrTab = 'staff' | 'payroll' | 'components' | 'report';

export default function HrPayrollManagement() {
  const { user } = useAuthStore();
  // ACCOUNTANT has read-only access to staff, payroll, salary components and
  // the payroll report (backend `ADMIN_AND_ACCOUNTANT_READ` on the GET routes
  // only) — every write route is SUPER_ADMIN/ADMIN-only.
  const canWrite = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<HrTab>('staff');
  const [payrollPreset, setPayrollPreset] = useState<StaffProfile | null>(null);

  const openPayrollFor = (staff: StaffProfile) => {
    setPayrollPreset(staff);
    setActiveTab('payroll');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR & Payroll Management"
        description="Manage staff records, departments, and payroll distributions."
      />

      <Tabs
        tabs={[
          { id: 'staff', label: 'Staff', icon: <Users className="w-4 h-4" /> },
          { id: 'payroll', label: 'Payroll', icon: <DollarSign className="w-4 h-4" /> },
          { id: 'components', label: 'Salary Components', icon: <Layers className="w-4 h-4" /> },
          { id: 'report', label: 'Payroll Report', icon: <BarChart3 className="w-4 h-4" /> },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as HrTab)}
      />

      {activeTab === 'staff' && <StaffTab canWrite={canWrite} onOpenPayroll={openPayrollFor} />}
      {activeTab === 'payroll' && (
        <PayrollTab
          canWrite={canWrite}
          presetStaff={payrollPreset}
          onConsumePreset={() => setPayrollPreset(null)}
        />
      )}
      {activeTab === 'components' && <SalaryComponentsTab canWrite={canWrite} />}
      {activeTab === 'report' && <PayrollReportTab />}
    </div>
  );
}
