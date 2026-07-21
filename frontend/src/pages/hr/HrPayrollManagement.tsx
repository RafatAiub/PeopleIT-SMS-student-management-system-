import React, { useState, useEffect } from 'react';
import { Users, Plus, DollarSign, Landmark, CheckCircle, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column } from '../../components/DataTable/DataTable';

interface StaffProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  joiningDate: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  status: 'Active' | 'Inactive';
}

interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  role: string;
  month: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netPayout: number;
  status: 'Pending' | 'Paid';
  processedDate?: string;
}

export default function HrPayrollManagement() {
  const [activeTab, setActiveTab] = useState<'directory' | 'payroll'>('directory');
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [totalStaff, setTotalStaff] = useState(0);
  const [payrollList, setPayrollList] = useState<PayrollRecord[]>([]);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  // Modals state
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  
  // New Staff form state
  const [newStaff, setNewStaff] = useState<Omit<StaffProfile, 'id'>>({
    name: '',
    role: 'Teacher',
    email: '',
    phone: '',
    department: 'Science',
    joiningDate: new Date().toISOString().split('T')[0],
    basicSalary: 25000,
    allowances: 3000,
    deductions: 1000,
    status: 'Active',
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
  }, [activeTab, params.page, params.pageSize, debouncedSearch]);

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

      if (activeTab === 'directory') {
        const [staffRes, payrollRes] = await Promise.all([
          apiClient.get(`/hr/staff?${queryParams.toString()}`),
          apiClient.get(`/hr/payroll`)
        ]);
        setStaffList(staffRes.data.data?.staff || staffRes.data.data || []);
        setTotalStaff(staffRes.data.data?.total || staffRes.data.meta?.total || 0);
        setPayrollList(payrollRes.data.data?.payrolls || payrollRes.data.data || []);
      } else {
        const [staffRes, payrollRes] = await Promise.all([
          apiClient.get(`/hr/staff`),
          apiClient.get(`/hr/payroll?${queryParams.toString()}`)
        ]);
        setStaffList(staffRes.data.data?.staff || staffRes.data.data || []);
        setPayrollList(payrollRes.data.data?.payrolls || payrollRes.data.data || []);
        setTotalPayroll(payrollRes.data.data?.total || payrollRes.data.meta?.total || 0);
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
        allowances: 3000,
        deductions: 1000,
        status: 'Active',
      });
    } catch (error: any) {
      console.error('Error adding staff:', error);
      toast.error(error.response?.data?.message || 'Failed to create staff profile.');
    }
  };

  // Open payroll processing modal
  const openPayrollModal = (staff: StaffProfile) => {
    setSelectedStaffForPayroll(staff);
    setCustomBasic(staff.basicSalary);
    setCustomAllowances(staff.allowances);
    setCustomDeductions(staff.deductions);
    setIsPayrollModalOpen(true);
  };

  // Process payroll submit
  const handleProcessPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForPayroll) return;

    // Check if payroll already paid for this month and staff
    const alreadyProcessed = payrollList.some(
      p => p.staffId === selectedStaffForPayroll.id && p.month === payrollMonth
    );
    if (alreadyProcessed) {
      toast.error(`Payroll for ${selectedStaffForPayroll.name} has already been recorded for ${payrollMonth}.`);
      return;
    }

    const payload = {
      staffId: selectedStaffForPayroll.id,
      staffName: selectedStaffForPayroll.name,
      role: selectedStaffForPayroll.role,
      month: payrollMonth,
      basicSalary: customBasic,
      allowances: customAllowances,
      deductions: customDeductions,
      netPayout: calculatedNetPayout,
      status: 'Paid',
      processedDate: new Date().toISOString().split('T')[0],
    };

    try {
      await apiClient.post('/hr/payroll', payload);
      setIsPayrollModalOpen(false);
      toast.success(`Payroll processed and marked as Paid for ${selectedStaffForPayroll.name}.`);
      fetchData();
    } catch (error: any) {
      console.error('Error processing payroll:', error);
      toast.error(error.response?.data?.message || 'Failed to process payroll.');
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
            {staff.name ? staff.name[0] : '?'}
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-white">{staff.name}</div>
            <div className="text-xs text-slate-500">{staff.id}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role & Dept',
      accessor: 'role',
      render: (staff) => (
        <>
          <div className="font-semibold text-slate-800 dark:text-slate-200">{staff.role}</div>
          <div className="text-xs text-slate-500">{staff.department}</div>
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortable: false,
      render: (staff) => (
        <>
          <div className="text-xs text-slate-700 dark:text-slate-300">{staff.email}</div>
          <div className="text-xs text-slate-500">{staff.phone}</div>
        </>
      ),
    },
    {
      key: 'salary',
      header: 'Salary Info (Basic)',
      sortable: false,
      render: (staff) => (
        <>
          <div className="font-bold text-emerald-700 dark:text-emerald-400">৳{staff.basicSalary?.toLocaleString() || 0}</div>
          <div className="text-xs text-slate-500 font-medium">Allowances: ৳{staff.allowances}</div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (staff) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          staff.status === 'Active'
            ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20'
            : 'bg-rose-50 dark:bg-red-500/10 text-rose-700 dark:text-red-400 border border-rose-200 dark:border-red-500/20'
        }`}>
          {staff.status}
        </span>
      ),
    },
    {
      key: 'payrollAction',
      header: 'Actions',
      sortable: false,
      render: (staff) => (
        <button
          onClick={() => openPayrollModal(staff)}
          className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-600/20 hover:bg-blue-100 dark:hover:bg-blue-600/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
        >
          <DollarSign className="w-3.5 h-3.5" />
          Process Payroll
        </button>
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
          <div className="text-xs text-slate-500">{record.role} ({record.staffId})</div>
        </>
      ),
    },
    { key: 'month', header: 'Salary Month', accessor: 'month' },
    {
      key: 'basicSalary',
      header: 'Basic Breakdown',
      sortable: false,
      render: (record) => <>৳{record.basicSalary?.toLocaleString() || 0}</>,
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
      render: (record) => <span className="font-bold text-slate-900 dark:text-white">৳{record.netPayout?.toLocaleString() || 0}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (record) => (
        <span className="inline-flex items-center gap-1 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20 px-2 py-1 rounded-full text-xs font-semibold">
          <CheckCircle className="w-3 h-3" />
          {record.status}
        </span>
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

      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading...</div>
      ) : activeTab === 'directory' ? (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm p-4">
            <DataTable
              data={staffList}
              columns={staffColumns}
              isLoading={loading}
              searchPlaceholder="Search by ID, name or department..."
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
            <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 flex items-center justify-between bg-white dark:bg-transparent shadow-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Staff Count</p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{staffList.length}</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 flex items-center justify-between bg-white dark:bg-transparent shadow-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Payouts Processed (This Month)</p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  ৳{payrollList.filter(p => p.month === 'June 2026').reduce((sum, r) => sum + r.netPayout, 0).toLocaleString()}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Landmark className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 flex items-center justify-between bg-white dark:bg-transparent shadow-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Pending Approvals</p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {staffList.length - payrollList.filter(p => p.month === 'June 2026').length}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <RefreshCw className="w-5 h-5 animate-spin-slow" />
              </div>
            </div>
          </div>

          {/* Payroll Distribution List */}
          <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
            <div className="p-4 border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-transparent">
              <h3 className="text-md font-semibold text-slate-900 dark:text-white">Salary Release Ledger</h3>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                Active Cycle: June/July 2026
              </span>
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
              <button onClick={() => setIsStaffModalOpen(false)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
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
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Basic Salary (৳)</label>
                  <input
                    type="number"
                    value={newStaff.basicSalary}
                    onChange={e => setNewStaff(prev => ({ ...prev, basicSalary: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Allowances (৳)</label>
                  <input
                    type="number"
                    value={newStaff.allowances}
                    onChange={e => setNewStaff(prev => ({ ...prev, allowances: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Deductions (৳)</label>
                  <input
                    type="number"
                    value={newStaff.deductions}
                    onChange={e => setNewStaff(prev => ({ ...prev, deductions: Number(e.target.value) }))}
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

      {/* Payroll Payout Modal with dynamic net calculation */}
      {isPayrollModalOpen && selectedStaffForPayroll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Process Monthly Payroll</h3>
              <button onClick={() => setIsPayrollModalOpen(false)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleProcessPayroll} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Staff Member</p>
                <div className="text-slate-900 dark:text-white font-medium text-base mt-1">{selectedStaffForPayroll.name}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{selectedStaffForPayroll.role} &bull; {selectedStaffForPayroll.id}</div>
              </div>

              <div className="border-t border-slate-100 dark:border-white/5 pt-4 grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Payout Month</label>
                  <select
                    value={payrollMonth}
                    onChange={e => setPayrollMonth(e.target.value)}
                    className="input-field"
                  >
                    <option value="June 2026" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">June 2026</option>
                    <option value="July 2026" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">July 2026</option>
                    <option value="August 2026" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">August 2026</option>
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
                  <div className="text-[10px] text-slate-500 mt-1">Formula: Basic + Allowance - Deduction</div>
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
                  Approve &amp; Pay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
