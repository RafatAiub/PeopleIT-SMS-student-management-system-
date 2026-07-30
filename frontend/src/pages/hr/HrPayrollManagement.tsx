import React, { useState, useEffect } from 'react';
import { Users, Plus, DollarSign, Landmark, CheckCircle, RefreshCw, X, Edit2, UserCheck, UserX, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { KpiCard } from '../../components/Charts/KpiCard';
import { ConfirmModal } from '../../components/common/ConfirmModal';

interface StaffProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  employeeId?: string | null;
  joiningDate: string | null;
  baseSalary: number;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

interface StaffSummary {
  totalStaff: number;
  activeCount: number;
  inactiveCount: number;
  totalMonthlyPayroll: number;
  byDepartment: { department: string; count: number }[];
}

interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  designation: string | null;
  payPeriod: string;
  baseSalary: number;
  allowances: number;
  deductions: number;
  netAmount: number;
  status: 'PAID' | 'UNPAID' | 'PENDING';
  paidAt?: string | null;
}

interface PayrollSummary {
  totalStaff: number;
  pendingCount: number;
  paidThisMonthTotal: number;
  currentPeriod: string;
}

interface NewStaffForm {
  name: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  joiningDate: string;
  basicSalary: number;
}

const PAY_PERIOD_OPTIONS = ['June 2026', 'July 2026', 'August 2026'];

export default function HrPayrollManagement() {
  const [activeTab, setActiveTab] = useState<'directory' | 'payroll'>('directory');
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [staffSummary, setStaffSummary] = useState<StaffSummary | null>(null);
  const [totalStaff, setTotalStaff] = useState(0);
  const [payrollList, setPayrollList] = useState<PayrollRecord[]>([]);
  const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [loading, setLoading] = useState(false);
  const [payPeriodFilter, setPayPeriodFilter] = useState('');

  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  // Modals state
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isEditStaffModalOpen, setIsEditStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffProfile | null>(null);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [staffToToggle, setStaffToToggle] = useState<StaffProfile | null>(null);
  const [togglingStaff, setTogglingStaff] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // New Staff form state
  const [newStaff, setNewStaff] = useState<NewStaffForm>({
    name: '',
    role: 'Teacher',
    email: '',
    phone: '',
    department: 'Science',
    joiningDate: new Date().toISOString().split('T')[0],
    basicSalary: 25000,
  });

  // Edit staff form state
  const [editStaffForm, setEditStaffForm] = useState({
    department: 'Science',
    designation: '',
    baseSalary: 0,
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  });

  // Payroll processing form state
  const [selectedStaffForPayroll, setSelectedStaffForPayroll] = useState<StaffProfile | null>(null);
  const [payrollMonth, setPayrollMonth] = useState('July 2026');
  const [customBasic, setCustomBasic] = useState(0);
  const [customAllowances, setCustomAllowances] = useState(0);
  const [customDeductions, setCustomDeductions] = useState(0);

  // Derived net payout calculation
  const calculatedNetPayout = customBasic + customAllowances - customDeductions;

  useEffect(() => {
    fetchData();
  }, [activeTab, params.page, params.pageSize, debouncedSearch, payPeriodFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });
      if (debouncedSearch && activeTab === 'directory') {
        queryParams.append('search', debouncedSearch);
      }
      if (payPeriodFilter && activeTab === 'payroll') {
        queryParams.append('payPeriod', payPeriodFilter);
      }

      if (activeTab === 'directory') {
        const [staffRes, payrollRes] = await Promise.all([
          apiClient.get(`/hr/staff?${queryParams.toString()}`),
          apiClient.get(`/hr/payroll`)
        ]);
        setStaffList(staffRes.data.data?.staff || staffRes.data.data || []);
        setTotalStaff(staffRes.data.data?.total || staffRes.data.meta?.total || 0);
        setStaffSummary(staffRes.data.summary || null);
        setPayrollList(payrollRes.data.data?.payrolls || payrollRes.data.data || []);
        setPayrollSummary(payrollRes.data.summary || null);
      } else {
        const [staffRes, payrollRes] = await Promise.all([
          apiClient.get(`/hr/staff`),
          apiClient.get(`/hr/payroll?${queryParams.toString()}`)
        ]);
        setStaffList(staffRes.data.data?.staff || staffRes.data.data || []);
        setStaffSummary(staffRes.data.summary || null);
        setPayrollList(payrollRes.data.data?.payrolls || payrollRes.data.data || []);
        setTotalPayroll(payrollRes.data.data?.total || payrollRes.data.meta?.total || 0);
        setPayrollSummary(payrollRes.data.summary || null);
      }
    } catch (error: any) {
      console.error('Failed to fetch HR data:', error);
      toast.error(error.response?.data?.message || 'Failed to load HR & payroll data');
    } finally {
      setLoading(false);
    }
  };

  // Add staff profile
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.email || !newStaff.phone) {
      toast.error('Please fill in all required fields.');
      return;
    }

    try {
      await apiClient.post('/hr/staff', newStaff);
      setIsStaffModalOpen(false);
      toast.success('New staff profile created successfully.');
      fetchData();
      // Reset form
      setNewStaff({
        name: '',
        role: 'Teacher',
        email: '',
        phone: '',
        department: 'Science',
        joiningDate: new Date().toISOString().split('T')[0],
        basicSalary: 25000,
      });
    } catch (error: any) {
      console.error('Error adding staff:', error);
      toast.error(error.response?.data?.message || 'Failed to create staff profile.');
    }
  };

  // Open edit staff modal
  const openEditStaffModal = (staff: StaffProfile) => {
    setEditingStaff(staff);
    setEditStaffForm({
      department: staff.department || 'Science',
      designation: staff.designation || '',
      baseSalary: staff.baseSalary || 0,
      status: staff.status,
    });
    setIsEditStaffModalOpen(true);
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    try {
      await apiClient.patch(`/hr/staff/${editingStaff.id}`, editStaffForm);
      setIsEditStaffModalOpen(false);
      toast.success(`${editingStaff.name}'s profile updated.`);
      fetchData();
    } catch (error: any) {
      console.error('Error updating staff:', error);
      toast.error(error.response?.data?.message || 'Failed to update staff profile.');
    }
  };

  // Activate / deactivate staff
  const handleConfirmToggleStatus = async () => {
    if (!staffToToggle) return;
    setTogglingStaff(true);
    const nextStatus = staffToToggle.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiClient.patch(`/hr/staff/${staffToToggle.id}`, { status: nextStatus });
      toast.success(`${staffToToggle.name} is now ${nextStatus === 'ACTIVE' ? 'active' : 'inactive'}.`);
      setStaffToToggle(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update staff status.');
    } finally {
      setTogglingStaff(false);
    }
  };

  // Open payroll processing modal
  const openPayrollModal = (staff: StaffProfile) => {
    setSelectedStaffForPayroll(staff);
    setCustomBasic(staff.baseSalary || 0);
    setCustomAllowances(0);
    setCustomDeductions(0);
    setIsPayrollModalOpen(true);
  };

  // Process payroll submit — creates an UNPAID record; it moves to PAID via
  // the "Approve & Pay" action in the Salary Release Ledger below.
  const handleProcessPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForPayroll) return;

    const alreadyProcessed = payrollList.some(
      p => p.staffId === selectedStaffForPayroll.id && p.payPeriod === payrollMonth
    );
    if (alreadyProcessed) {
      toast.error(`Payroll for ${selectedStaffForPayroll.name} has already been recorded for ${payrollMonth}.`);
      return;
    }

    const payload = {
      staffId: selectedStaffForPayroll.id,
      payPeriod: payrollMonth,
      allowances: customAllowances,
      deductions: customDeductions,
    };

    try {
      await apiClient.post('/hr/payroll', payload);
      setIsPayrollModalOpen(false);
      toast.success(`Payroll processed for ${selectedStaffForPayroll.name} — pending approval.`);
      fetchData();
    } catch (error: any) {
      console.error('Error processing payroll:', error);
      toast.error(error.response?.data?.message || 'Failed to process payroll.');
    }
  };

  // Approve & pay a pending payroll record
  const handleApprovePayroll = async (record: PayrollRecord) => {
    setApprovingId(record.id);
    try {
      await apiClient.post(`/hr/payroll/${record.id}/pay`);
      toast.success(`Payroll approved and paid for ${record.staffName}.`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to approve payroll.');
    } finally {
      setApprovingId(null);
    }
  };

  const staffColumns: Column<StaffProfile>[] = [
    {
      key: 'name',
      header: 'Staff Member',
      accessor: 'name',
      render: (staff) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-200 dark:border-transparent">
            {staff.name ? staff.name[0].toUpperCase() : '?'}
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-white">{staff.name || 'Unnamed Staff'}</div>
            {staff.employeeId && <div className="text-xs text-slate-500">ID: {staff.employeeId}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'designation',
      header: 'Role & Dept',
      accessor: 'designation',
      render: (staff) => (
        <>
          <div className="font-semibold text-slate-800 dark:text-slate-200">{staff.designation || '—'}</div>
          <div className="text-xs text-slate-500">{staff.department || '—'}</div>
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortable: false,
      render: (staff) => (
        <>
          <div className="text-xs text-slate-700 dark:text-slate-300">{staff.email || '—'}</div>
          <div className="text-xs text-slate-500">{staff.phone || '—'}</div>
        </>
      ),
    },
    {
      key: 'salary',
      header: 'Monthly Base Salary',
      sortable: false,
      render: (staff) => (
        <div className="font-bold text-emerald-700 dark:text-emerald-400">৳{(staff.baseSalary ?? 0).toLocaleString()}</div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (staff) => <StatusBadge status={staff.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (staff) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => openEditStaffModal(staff)}
            title="Edit staff profile"
            aria-label={`Edit ${staff.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setStaffToToggle(staff)}
            title={staff.status === 'ACTIVE' ? 'Deactivate staff' : 'Activate staff'}
            aria-label={staff.status === 'ACTIVE' ? `Deactivate ${staff.name}` : `Activate ${staff.name}`}
            className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors ${
              staff.status === 'ACTIVE' ? 'text-slate-500 hover:text-rose-600 dark:hover:text-red-400' : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'
            }`}
          >
            {staff.status === 'ACTIVE' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          </button>
          <button
            onClick={() => openPayrollModal(staff)}
            className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-600/20 hover:bg-blue-100 dark:hover:bg-blue-600/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
          >
            <DollarSign className="w-3.5 h-3.5" />
            Payroll
          </button>
        </div>
      ),
    },
  ];

  const payrollColumns: Column<PayrollRecord>[] = [
    {
      key: 'staffName',
      header: 'Payee Name',
      accessor: 'staffName',
      render: (record) => (
        <>
          <div className="font-semibold text-slate-900 dark:text-white">{record.staffName}</div>
          <div className="text-xs text-slate-500">{record.designation || '—'}</div>
        </>
      ),
    },
    { key: 'payPeriod', header: 'Salary Month', accessor: 'payPeriod' },
    {
      key: 'baseSalary',
      header: 'Basic Breakdown',
      sortable: false,
      render: (record) => <>৳{record.baseSalary?.toLocaleString() || 0}</>,
    },
    {
      key: 'allowancesDeductions',
      header: 'Allowances / Deductions',
      sortable: false,
      render: (record) => (
        <>
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">+৳{record.allowances}</span>
          <span className="text-slate-500"> / </span>
          <span className="text-rose-700 dark:text-rose-400 font-semibold">-৳{record.deductions}</span>
        </>
      ),
    },
    {
      key: 'netPayout',
      header: 'Net Paid',
      sortable: false,
      render: (record) => <span className="font-bold text-slate-900 dark:text-white">৳{record.netAmount?.toLocaleString() || 0}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (record) => <StatusBadge status={record.status} />,
    },
    {
      key: 'payrollActions',
      header: 'Actions',
      sortable: false,
      render: (record) => (
        record.status === 'UNPAID' ? (
          <button
            onClick={() => handleApprovePayroll(record)}
            disabled={approvingId === record.id}
            className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-100 dark:hover:bg-emerald-600/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {approvingId === record.id ? 'Approving...' : 'Approve & Pay'}
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">HR &amp; Payroll Management</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Manage staff records, contracts, departments, and payroll distributions.</p>
        </div>
        {activeTab === 'directory' && (
          <button
            onClick={() => setIsStaffModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98] self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Add Staff Profile
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10 gap-2">
        <button
          onClick={() => { setActiveTab('directory'); setSearch(''); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'directory'
              ? 'border-blue-500 text-blue-500 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4.5 h-4.5" />
            Staff Directory
          </div>
        </button>
        <button
          onClick={() => { setActiveTab('payroll'); setSearch(''); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'payroll'
              ? 'border-blue-500 text-blue-500 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-4.5 h-4.5" />
            Payroll Payouts
          </div>
        </button>
      </div>

      {loading && !staffSummary && !payrollSummary ? (
        <div className="text-center text-slate-500 py-10">Loading...</div>
      ) : activeTab === 'directory' ? (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Total Staff"
              value={staffSummary?.totalStaff ?? 0}
              trend="up"
              trendValue={`${staffSummary?.activeCount ?? 0} Active / ${staffSummary?.inactiveCount ?? 0} Inactive`}
              icon={<Users className="w-6 h-6" />}
              color="indigo"
            />
            <KpiCard
              title="Active Staff"
              value={staffSummary?.activeCount ?? 0}
              trend="up"
              trendValue={`${staffSummary?.inactiveCount ?? 0} Inactive`}
              icon={<UserCheck className="w-6 h-6" />}
              color="teal"
            />
            <KpiCard
              title="Monthly Payroll Liability"
              value={staffSummary?.totalMonthlyPayroll ?? 0}
              trend="up"
              trendValue="Active Staff Base Salary"
              icon={<Landmark className="w-6 h-6" />}
              color="amber"
              prefix="৳"
            />
            <KpiCard
              title="Departments"
              value={staffSummary?.byDepartment?.length ?? 0}
              trend="up"
              trendValue={staffSummary?.byDepartment?.[0] ? `${staffSummary.byDepartment[0].department}: ${staffSummary.byDepartment[0].count}` : 'No data yet'}
              icon={<Building2 className="w-6 h-6" />}
              color="rose"
            />
          </div>

          <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm p-4">
            <DataTable
              data={staffList}
              columns={staffColumns}
              isLoading={loading}
              searchPlaceholder="Search by name or department..."
              serverSearch
              onSearch={setSearch}
              serverPagination
              totalCount={totalStaff}
              page={params.page}
              pageSize={params.pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              emptyTitle="No staff members found"
              emptyDescription="Try adjusting your search, or add a new staff profile."
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick summaries cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              title="Total Staff Count"
              value={payrollSummary?.totalStaff ?? 0}
              trend="up"
              trendValue="Eligible for Payroll"
              icon={<Users className="w-6 h-6" />}
              color="indigo"
            />
            <KpiCard
              title={`Payouts Processed (${payrollSummary?.currentPeriod ?? 'This Month'})`}
              value={payrollSummary?.paidThisMonthTotal ?? 0}
              trend="up"
              trendValue={payrollSummary?.currentPeriod ?? ''}
              icon={<Landmark className="w-6 h-6" />}
              color="teal"
              prefix="৳"
            />
            <KpiCard
              title="Pending Approvals"
              value={payrollSummary?.pendingCount ?? 0}
              trend={payrollSummary?.pendingCount ? 'down' : 'up'}
              trendValue={payrollSummary?.pendingCount ? 'Awaiting Approve & Pay' : 'All caught up'}
              icon={<RefreshCw className="w-6 h-6" />}
              color="amber"
            />
          </div>

          {/* Payroll Distribution List */}
          <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
            <div className="p-4 border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-transparent">
              <h3 className="text-md font-semibold text-slate-900 dark:text-white">Salary Release Ledger</h3>
              <div className="flex items-center gap-2">
                <label htmlFor="payroll-cycle-filter" className="text-xs text-slate-500 dark:text-slate-400">Cycle</label>
                <select
                  id="payroll-cycle-filter"
                  value={payPeriodFilter}
                  onChange={e => { setPayPeriodFilter(e.target.value); setPage(1); }}
                  className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Cycles</option>
                  {PAY_PERIOD_OPTIONS.map(period => (
                    <option key={period} value={period} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{period}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4">
              <DataTable
                data={payrollList}
                columns={payrollColumns}
                isLoading={loading}
                searchPlaceholder="Search by staff or month..."
                serverSearch
                onSearch={setSearch}
                serverPagination
                totalCount={totalPayroll}
                page={params.page}
                pageSize={params.pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                emptyTitle="No payroll payouts released yet"
                emptyDescription="Process a payroll from the Staff Directory to see it listed here."
              />
            </div>
          </div>
        </div>
      )}

      {/* Staff profile add Modal */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add New Staff Profile</h3>
              <button onClick={() => setIsStaffModalOpen(false)} aria-label="Close" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStaff} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newStaff.name}
                    onChange={e => setNewStaff(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter staff full name"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Role *</label>
                  <select
                    value={newStaff.role}
                    onChange={e => setNewStaff(prev => ({ ...prev, role: e.target.value }))}
                    className="input-field"
                  >
                    <option value="Teacher" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Teacher</option>
                    <option value="Senior Teacher" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Senior Teacher</option>
                    <option value="IT Administrator" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">IT Administrator</option>
                    <option value="Librarian" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Librarian</option>
                    <option value="Support Staff" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Support Staff</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Department *</label>
                  <select
                    value={newStaff.department}
                    onChange={e => setNewStaff(prev => ({ ...prev, department: e.target.value }))}
                    className="input-field"
                  >
                    <option value="Science" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Science</option>
                    <option value="Mathematics" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Mathematics</option>
                    <option value="English" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">English</option>
                    <option value="Administration" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Administration</option>
                    <option value="Maintenance" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Maintenance</option>
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Email *</label>
                  <input
                    type="email"
                    required
                    value={newStaff.email}
                    onChange={e => setNewStaff(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="name@school.edu"
                    className="input-field"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={newStaff.phone}
                    onChange={e => setNewStaff(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+880 1711-xxxxxx"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Base Salary (৳)</label>
                  <input
                    type="number"
                    value={newStaff.basicSalary}
                    onChange={e => setNewStaff(prev => ({ ...prev, basicSalary: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Joining Date</label>
                  <input
                    type="date"
                    value={newStaff.joiningDate}
                    onChange={e => setNewStaff(prev => ({ ...prev, joiningDate: e.target.value }))}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm"
                >
                  Create Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit staff profile Modal */}
      {isEditStaffModalOpen && editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Edit {editingStaff.name}'s Profile</h3>
              <button onClick={() => setIsEditStaffModalOpen(false)} aria-label="Close" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStaff} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Designation</label>
                  <input
                    type="text"
                    value={editStaffForm.designation}
                    onChange={e => setEditStaffForm(prev => ({ ...prev, designation: e.target.value }))}
                    placeholder="e.g. Senior Teacher"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Department</label>
                  <select
                    value={editStaffForm.department}
                    onChange={e => setEditStaffForm(prev => ({ ...prev, department: e.target.value }))}
                    className="input-field"
                  >
                    <option value="Science" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Science</option>
                    <option value="Mathematics" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Mathematics</option>
                    <option value="English" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">English</option>
                    <option value="Administration" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Administration</option>
                    <option value="Maintenance" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Base Salary (৳)</label>
                  <input
                    type="number"
                    value={editStaffForm.baseSalary}
                    onChange={e => setEditStaffForm(prev => ({ ...prev, baseSalary: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Status</label>
                  <select
                    value={editStaffForm.status}
                    onChange={e => setEditStaffForm(prev => ({ ...prev, status: e.target.value as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' }))}
                    className="input-field"
                  >
                    <option value="ACTIVE" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Active</option>
                    <option value="INACTIVE" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Inactive</option>
                    <option value="SUSPENDED" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsEditStaffModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payroll Payout Modal with dynamic net calculation */}
      {isPayrollModalOpen && selectedStaffForPayroll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Process Monthly Payroll</h3>
              <button onClick={() => setIsPayrollModalOpen(false)} aria-label="Close" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessPayroll} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Staff Member</p>
                <div className="text-slate-900 dark:text-white font-medium text-base mt-1">{selectedStaffForPayroll.name}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{selectedStaffForPayroll.designation || '—'}</div>
              </div>

              <div className="border-t border-slate-100 dark:border-white/5 pt-4 grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Payout Month</label>
                  <select
                    value={payrollMonth}
                    onChange={e => setPayrollMonth(e.target.value)}
                    className="input-field"
                  >
                    {PAY_PERIOD_OPTIONS.map(period => (
                      <option key={period} value={period} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{period}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Basic Salary (৳)</label>
                  <input
                    type="number"
                    value={customBasic}
                    onChange={e => setCustomBasic(Number(e.target.value) || 0)}
                    className="input-field"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Allowances (৳)</label>
                    <input
                      type="number"
                      value={customAllowances}
                      onChange={e => setCustomAllowances(Number(e.target.value) || 0)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Deductions (৳)</label>
                    <input
                      type="number"
                      value={customDeductions}
                      onChange={e => setCustomDeductions(Number(e.target.value) || 0)}
                      className="input-field"
                    />
                  </div>
                </div>

                <div className="mt-2 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Net Calculated Payout:</span>
                    <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">৳{calculatedNetPayout.toLocaleString()}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Formula: Basic + Allowance - Deduction. Submits as pending — approve from the Salary Release Ledger to release payment.</div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsPayrollModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm"
                >
                  Process Payroll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!staffToToggle}
        title={staffToToggle?.status === 'ACTIVE' ? 'Deactivate staff member' : 'Activate staff member'}
        message={
          staffToToggle?.status === 'ACTIVE'
            ? `Are you sure you want to deactivate ${staffToToggle?.name}? They will be marked inactive and excluded from active payroll totals.`
            : `Reactivate ${staffToToggle?.name}? They will be marked active again.`
        }
        confirmLabel={staffToToggle?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        variant={staffToToggle?.status === 'ACTIVE' ? 'danger' : 'info'}
        isLoading={togglingStaff}
        onConfirm={handleConfirmToggleStatus}
        onCancel={() => setStaffToToggle(null)}
      />
    </div>
  );
}
