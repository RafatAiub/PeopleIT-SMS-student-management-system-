import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, DollarSign, Landmark, CheckCircle, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';

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
  const [payrollList, setPayrollList] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');

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
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [staffRes, payrollRes] = await Promise.all([
        apiClient.get('/hr/staff'),
        apiClient.get('/hr/payroll')
      ]);
      setStaffList(staffRes.data.data || []);
      setPayrollList(payrollRes.data.data || []);
    } catch (error) {
      console.error('Failed to fetch HR data:', error);
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

  // Filter staff based on search term
  const filteredStaff = staffList.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">HR &amp; Payroll Management</h2>
          <p className="text-slate-400 mt-1">Manage staff records, contracts, departments, and payroll distributions.</p>
        </div>
        {activeTab === 'directory' && (
          <button
            onClick={() => setIsStaffModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-500/20 text-sm font-medium self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Add Staff Profile
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          onClick={() => setActiveTab('directory')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'directory'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4.5 h-4.5" />
            Staff Directory
          </div>
        </button>
        <button
          onClick={() => setActiveTab('payroll')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'payroll'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-4.5 h-4.5" />
            Payroll Payouts
          </div>
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-10">Loading...</div>
      ) : activeTab === 'directory' ? (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="glass p-4 rounded-2xl flex items-center justify-between border border-white/5">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by ID, name or department..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
            </div>
          </div>

          {/* Directory Table */}
          <div className="glass rounded-2xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/40 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Staff Member</th>
                    <th className="px-6 py-4 font-medium">Role &amp; Dept</th>
                    <th className="px-6 py-4 font-medium">Contact</th>
                    <th className="px-6 py-4 font-medium">Salary Info (Basic)</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredStaff.map(staff => (
                    <tr key={staff.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                            {staff.name ? staff.name[0] : '?'}
                          </div>
                          <div>
                            <div className="font-medium text-white">{staff.name}</div>
                            <div className="text-xs text-slate-500">{staff.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-200">{staff.role}</div>
                        <div className="text-xs text-slate-500">{staff.department}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-slate-300">{staff.email}</div>
                        <div className="text-xs text-slate-500">{staff.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-emerald-400">৳{staff.basicSalary?.toLocaleString() || 0}</div>
                        <div className="text-xs text-slate-500">Allowances: ৳{staff.allowances}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          staff.status === 'Active'
                            ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {staff.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openPayrollModal(staff)}
                          className="inline-flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          Process Payroll
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredStaff.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No staff members found matching search parameters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick summaries cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass p-5 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Total Staff Count</p>
                <h3 className="text-2xl font-bold text-white mt-1">{staffList.length}</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="glass p-5 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Payouts Processed (This Month)</p>
                <h3 className="text-2xl font-bold text-white mt-1">
                  ৳{payrollList.filter(p => p.month === 'June 2026').reduce((sum, r) => sum + r.netPayout, 0).toLocaleString()}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Landmark className="w-5 h-5" />
              </div>
            </div>

            <div className="glass p-5 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Pending Approvals</p>
                <h3 className="text-2xl font-bold text-white mt-1">
                  {staffList.length - payrollList.filter(p => p.month === 'June 2026').length}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <RefreshCw className="w-5 h-5 animate-spin-slow" />
              </div>
            </div>
          </div>

          {/* Payroll Distribution List */}
          <div className="glass rounded-2xl overflow-hidden border border-white/5">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-md font-semibold text-white">Salary Release Ledger</h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700">
                Active Cycle: June/July 2026
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/40 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Payee Name</th>
                    <th className="px-6 py-4 font-medium">Salary Month</th>
                    <th className="px-6 py-4 font-medium">Basic Breakdown</th>
                    <th className="px-6 py-4 font-medium">Allowances / Deductions</th>
                    <th className="px-6 py-4 font-medium">Net Paid</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payrollList.map(record => (
                    <tr key={record.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-white">{record.staffName}</div>
                          <div className="text-xs text-slate-500">{record.role} ({record.staffId})</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-300">{record.month}</td>
                      <td className="px-6 py-4">৳{record.basicSalary?.toLocaleString() || 0}</td>
                      <td className="px-6 py-4">
                        <span className="text-emerald-400">+৳{record.allowances}</span>
                        <span className="text-slate-500"> / </span>
                        <span className="text-rose-400">-৳{record.deductions}</span>
                      </td>
                      <td className="px-6 py-4 font-bold text-white">৳{record.netPayout?.toLocaleString() || 0}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-1 rounded-full text-xs font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {payrollList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No payroll payouts released yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Staff profile add Modal */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/50">
              <h3 className="text-lg font-semibold text-white">Add New Staff Profile</h3>
              <button onClick={() => setIsStaffModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddStaff} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newStaff.name}
                    onChange={e => setNewStaff(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter staff full name"
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Role *</label>
                  <select
                    value={newStaff.role}
                    onChange={e => setNewStaff(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="Teacher">Teacher</option>
                    <option value="Senior Teacher">Senior Teacher</option>
                    <option value="IT Administrator">IT Administrator</option>
                    <option value="Librarian">Librarian</option>
                    <option value="Support Staff">Support Staff</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Department *</label>
                  <select
                    value={newStaff.department}
                    onChange={e => setNewStaff(prev => ({ ...prev, department: e.target.value }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="Science">Science</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="English">English</option>
                    <option value="Administration">Administration</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Email *</label>
                  <input
                    type="email"
                    required
                    value={newStaff.email}
                    onChange={e => setNewStaff(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="name@school.edu"
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={newStaff.phone}
                    onChange={e => setNewStaff(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+880 1711-xxxxxx"
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Basic Salary (৳)</label>
                  <input
                    type="number"
                    value={newStaff.basicSalary}
                    onChange={e => setNewStaff(prev => ({ ...prev, basicSalary: Number(e.target.value) }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Allowances (৳)</label>
                  <input
                    type="number"
                    value={newStaff.allowances}
                    onChange={e => setNewStaff(prev => ({ ...prev, allowances: Number(e.target.value) }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Deductions (৳)</label>
                  <input
                    type="number"
                    value={newStaff.deductions}
                    onChange={e => setNewStaff(prev => ({ ...prev, deductions: Number(e.target.value) }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Joining Date</label>
                  <input
                    type="date"
                    value={newStaff.joiningDate}
                    onChange={e => setNewStaff(prev => ({ ...prev, joiningDate: e.target.value }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm"
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
          <div className="glass border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/50">
              <h3 className="text-lg font-semibold text-white">Process Monthly Payroll</h3>
              <button onClick={() => setIsPayrollModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleProcessPayroll} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Staff Member</p>
                <div className="text-white font-medium text-base mt-1">{selectedStaffForPayroll.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{selectedStaffForPayroll.role} &bull; {selectedStaffForPayroll.id}</div>
              </div>

              <div className="border-t border-white/5 pt-4 grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Payout Month</label>
                  <select
                    value={payrollMonth}
                    onChange={e => setPayrollMonth(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="June 2026">June 2026</option>
                    <option value="July 2026">July 2026</option>
                    <option value="August 2026">August 2026</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Basic Salary (৳)</label>
                  <input
                    type="number"
                    value={customBasic}
                    onChange={e => setCustomBasic(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1 block">Allowances (৳)</label>
                    <input
                      type="number"
                      value={customAllowances}
                      onChange={e => setCustomAllowances(Number(e.target.value) || 0)}
                      className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1 block">Deductions (৳)</label>
                    <input
                      type="number"
                      value={customDeductions}
                      onChange={e => setCustomDeductions(Number(e.target.value) || 0)}
                      className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                <div className="mt-2 bg-slate-950/40 border border-white/5 p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-300">Net Calculated Payout:</span>
                    <span className="text-lg font-bold text-emerald-400">৳{calculatedNetPayout.toLocaleString()}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Formula: Basic + Allowance - Deduction</div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsPayrollModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
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
