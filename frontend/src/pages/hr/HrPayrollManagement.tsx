import React, { useState } from 'react';
import { Users, DollarSign } from 'lucide-react';
import { PageHeader, Tabs } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import StaffTab from './StaffTab';
import PayrollTab from './PayrollTab';
import type { StaffProfile } from './hr.types';

export default function HrPayrollManagement() {
  const { user } = useAuthStore();
  // ACCOUNTANT has read-only access to both staff and payroll (backend
  // `ADMIN_AND_ACCOUNTANT_READ` on the GET routes only) — every write route
  // (create/update staff, process/pay payroll) is ADMIN-only.
  const canWrite = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'staff' | 'payroll'>('staff');
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
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as 'staff' | 'payroll')}
      />

      {activeTab === 'staff' ? (
        <StaffTab canWrite={canWrite} onOpenPayroll={openPayrollFor} />
      ) : (
        <PayrollTab
          canWrite={canWrite}
          presetStaff={payrollPreset}
          onConsumePreset={() => setPayrollPreset(null)}
        />
      )}
    </div>
  );
}
