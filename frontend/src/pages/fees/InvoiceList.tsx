import React, { useState, useEffect } from 'react';
import { FileText, Plus, DollarSign, X, Layers, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { DataTable, Column } from '../../components/DataTable/DataTable';

const InvoiceList = () => {
  const [activeTab, setActiveTab] = useState<'invoices' | 'categories'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [students, setStudents] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams();

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Form states
  const [newInvoice, setNewInvoice] = useState({
    studentId: '',
    feeCategoryId: '',
    totalAmount: 0,
    dueDate: new Date().toISOString().split('T')[0],
  });

  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    amount: 0,
    frequency: 'MONTHLY' as 'MONTHLY' | 'TERM' | 'ONE_TIME' | 'ANNUAL',
  });

  const [paymentAmount, setPaymentAmount] = useState(0);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });
      if (debouncedSearch && activeTab === 'invoices') {
        queryParams.append('search', debouncedSearch);
      }

      const response = await apiClient.get(`/fees/invoices?${queryParams.toString()}`);
      setInvoices(response.data.data || []);
      setTotalInvoices(response.data.meta?.total || 0);
    } catch (error: any) {
      console.error('Failed to fetch invoices', error);
      toast.error(error.response?.data?.message || 'Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [stdRes, catRes] = await Promise.all([
        apiClient.get('/students'),
        apiClient.get('/fees/categories').catch(() => ({ data: { data: [] } }))
      ]);
      setStudents(stdRes.data.data || []);
      setCategories(catRes.data.data || []);
    } catch (error: any) {
      console.error('Failed to fetch dependencies', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'invoices') {
      fetchInvoices();
    }
  }, [activeTab, params.page, params.pageSize, debouncedSearch]);

  useEffect(() => {
    fetchDependencies();
  }, []);

  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({});

  const validateInvoiceField = (name: string, value: any): string => {
    if (name === 'studentId' && !value) return 'Please select a student';
    if (name === 'feeCategoryId' && !value) return 'Please select a fee category';
    if (name === 'totalAmount' && (!value || Number(value) <= 0)) return 'Amount must be greater than ৳ 0';
    if (name === 'dueDate' && !value) return 'Due date is required';
    return '';
  };

  const handleInvoiceBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInvoiceErrors(prev => ({ ...prev, [name]: validateInvoiceField(name, value) }));
  };

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    const fieldsToValidate = ['studentId', 'feeCategoryId', 'totalAmount', 'dueDate'];
    const nextErrors: Record<string, string> = {};
    for (const field of fieldsToValidate) {
      const err = validateInvoiceField(field, (newInvoice as any)[field]);
      if (err) nextErrors[field] = err;
    }
    if (Object.keys(nextErrors).length > 0) {
      setInvoiceErrors(nextErrors);
      const firstInvalidField = fieldsToValidate.find((f) => nextErrors[f]);
      if (firstInvalidField) {
        (e.target as HTMLFormElement).querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
      }
      toast.error('Please fix the highlighted fields');
      return;
    }

    try {
      await apiClient.post('/fees/invoices', {
        studentId: newInvoice.studentId,
        dueDate: new Date(newInvoice.dueDate).toISOString(),
        items: [
          {
            feeCategoryId: newInvoice.feeCategoryId,
            description: categories.find(c => c.id === newInvoice.feeCategoryId)?.name || 'Fee Item',
            amount: newInvoice.totalAmount
          }
        ]
      });
      setIsAddModalOpen(false);
      toast.success('Invoice generated successfully');
      fetchInvoices();
      setNewInvoice({
        studentId: '',
        feeCategoryId: '',
        totalAmount: 0,
        dueDate: new Date().toISOString().split('T')[0],
      });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to generate invoice');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.name || newCategory.amount <= 0) {
      toast.error('Please enter a category name and a positive amount');
      return;
    }
    try {
      await apiClient.post('/fees/categories', {
        name: newCategory.name,
        description: newCategory.description,
        amount: Number(newCategory.amount),
        frequency: newCategory.frequency,
      });
      setIsCategoryModalOpen(false);
      toast.success('Fee category created successfully');
      fetchDependencies();
      setNewCategory({
        name: '',
        description: '',
        amount: 0,
        frequency: 'MONTHLY',
      });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create fee category');
    }
  };

  const openPaymentModal = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(Number(invoice.dueAmount));
    setIsPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const dueAmount = Number(selectedInvoice.dueAmount);
    if (dueAmount <= 0 || selectedInvoice.status === 'PAID') {
      toast.error('This invoice is already fully paid');
      return;
    }
    if (!paymentAmount || paymentAmount <= 0) {
      toast.error('Payment amount must be greater than ৳ 0');
      return;
    }
    if (paymentAmount > dueAmount) {
      toast.error(`Payment amount cannot exceed the due amount of ৳ ${dueAmount}`);
      return;
    }

    try {
      await apiClient.post(`/fees/invoices/${selectedInvoice.id}/payments/offline`, {
        amount: Number(paymentAmount),
        method: 'CASH'
      });
      setIsPaymentModalOpen(false);
      toast.success('Payment recorded successfully');
      fetchInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to record payment');
    }
  };

  const invoiceColumns: Column<any>[] = [
    { key: 'invoiceNo', header: 'Invoice No', accessor: 'invoiceNo', render: (invoice) => invoice.invoiceNo || invoice.invoiceNumber },
    {
      key: 'student',
      header: 'Student Info',
      sortable: false,
      render: (invoice) => (
        <>
          <div className="text-slate-850 dark:text-white font-medium">{invoice.student?.firstName} {invoice.student?.lastName}</div>
          <div className="text-xs text-slate-500">ID: {invoice.student?.studentId}</div>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: false,
      render: (invoice) => (
        <>
          <div className="font-semibold text-slate-900 dark:text-white tabular-nums">৳ {invoice.totalAmount}</div>
          {Number(invoice.dueAmount) > 0 && <div className="text-xs text-rose-600 dark:text-rose-400 tabular-nums">Due: ৳ {invoice.dueAmount}</div>}
        </>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      sortable: false,
      render: (invoice) => new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (invoice) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          invoice.status === 'PAID' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' :
          invoice.status === 'OVERDUE' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20' :
          'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
        }`}>
          {invoice.status}
        </span>
      ),
    },
    {
      key: 'paymentAction',
      header: 'Actions',
      sortable: false,
      render: (invoice) => (
        invoice.status !== 'PAID' && Number(invoice.dueAmount) > 0 ? (
          <button
            onClick={() => openPaymentModal(invoice)}
            className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-100 dark:hover:bg-emerald-600/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          >
            <DollarSign className="w-3.5 h-3.5" /> Record Payment
          </button>
        ) : null
      ),
    },
  ];

  const categoryColumns: Column<any>[] = [
    {
      key: 'name',
      header: 'Category Name',
      accessor: 'name',
      render: (cat) => (
        <span className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          {cat.name}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortable: false,
      render: (cat) => <span className="text-slate-500 dark:text-slate-400 max-w-xs truncate block">{cat.description || 'N/A'}</span>,
    },
    {
      key: 'frequency',
      header: 'Frequency',
      accessor: 'frequency',
      render: (cat) => (
        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-transparent">
          {cat.frequency}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Default Amount',
      sortable: false,
      render: (cat) => <span className="font-semibold text-slate-900 dark:text-white tabular-nums">৳ {cat.amount}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (cat) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cat.isActive !== false ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'}`}>
          {cat.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Fees & Billing</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Manage invoice collections, payments, and fee structures.</p>
        </div>
        
        <div className="flex items-center gap-2">
          {activeTab === 'invoices' ? (
            <button
              onClick={() => { setInvoiceErrors({}); setIsAddModalOpen(true); }}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Generate Invoice
            </button>
          ) : (
            <button 
              onClick={() => setIsCategoryModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add Category
            </button>
          )}
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-white/5">
        <button
          onClick={() => { setActiveTab('invoices'); setSearch(''); }}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-semibold text-sm transition-all ${
            activeTab === 'invoices'
              ? 'border-blue-500 text-blue-500 dark:text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Invoices
        </button>
        <button
          onClick={() => { setActiveTab('categories'); setSearch(''); }}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-semibold text-sm transition-all ${
            activeTab === 'categories'
              ? 'border-blue-500 text-blue-500 dark:text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Fee Categories
        </button>
      </div>

      {/* Main card panel */}
      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-sm p-4">
        {activeTab === 'invoices' ? (
          <DataTable
            data={invoices}
            columns={invoiceColumns}
            isLoading={loading}
            searchPlaceholder="Search by invoice number or student..."
            serverSearch
            onSearch={setSearch}
            serverPagination
            totalCount={totalInvoices}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyTitle="No invoices found"
            emptyDescription="Generate an invoice to get started."
          />
        ) : (
          <DataTable
            data={categories}
            columns={categoryColumns}
            searchPlaceholder="Search categories..."
            emptyTitle="No fee categories created yet"
            emptyDescription="Add a fee category to start generating invoices."
          />
        )}
      </div>

      {/* Modal: Generate Invoice */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Generate Student Invoice</h3>
              <button onClick={() => setIsAddModalOpen(false)} aria-label="Close" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleGenerateInvoice} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Select Student *</label>
                  <select
                    name="studentId"
                    required
                    value={newInvoice.studentId}
                    onChange={e => { setNewInvoice(prev => ({ ...prev, studentId: e.target.value })); if (invoiceErrors.studentId) setInvoiceErrors(prev => ({ ...prev, studentId: '' })); }}
                    onBlur={handleInvoiceBlur}
                    className={`input-field ${invoiceErrors.studentId ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                  >
                    <option value="" className="bg-white dark:bg-slate-900 text-slate-950 dark:text-white">-- Choose Student --</option>
                    {students.map(st => (
                      <option key={st.id} value={st.id} className="bg-white dark:bg-slate-900 text-slate-950 dark:text-white">{st.firstName} {st.lastName} (ID: {st.studentId})</option>
                    ))}
                  </select>
                  {invoiceErrors.studentId && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{invoiceErrors.studentId}</p>}
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Fee Category *</label>
                  <select
                    name="feeCategoryId"
                    required
                    value={newInvoice.feeCategoryId}
                    onChange={e => {
                      const cat = categories.find(c => c.id === e.target.value);
                      setNewInvoice(prev => ({ ...prev, feeCategoryId: e.target.value, totalAmount: cat ? Number(cat.amount) : 0 }));
                      if (invoiceErrors.feeCategoryId) setInvoiceErrors(prev => ({ ...prev, feeCategoryId: '' }));
                    }}
                    onBlur={handleInvoiceBlur}
                    className={`input-field ${invoiceErrors.feeCategoryId ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                  >
                    <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">-- Choose Fee Category --</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{cat.name} (৳ {cat.amount})</option>
                    ))}
                  </select>
                  {invoiceErrors.feeCategoryId && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{invoiceErrors.feeCategoryId}</p>}
                </div>
                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Total Amount (৳) *</label>
                  <input
                    type="number"
                    name="totalAmount"
                    required
                    value={newInvoice.totalAmount}
                    onChange={e => { setNewInvoice(prev => ({ ...prev, totalAmount: Number(e.target.value) })); if (invoiceErrors.totalAmount) setInvoiceErrors(prev => ({ ...prev, totalAmount: '' })); }}
                    onBlur={handleInvoiceBlur}
                    className={`input-field ${invoiceErrors.totalAmount ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                  />
                  {invoiceErrors.totalAmount && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{invoiceErrors.totalAmount}</p>}
                </div>
                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Due Date *</label>
                  <input
                    type="date"
                    name="dueDate"
                    required
                    value={newInvoice.dueDate}
                    onChange={e => { setNewInvoice(prev => ({ ...prev, dueDate: e.target.value })); if (invoiceErrors.dueDate) setInvoiceErrors(prev => ({ ...prev, dueDate: '' })); }}
                    onBlur={handleInvoiceBlur}
                    className={`input-field ${invoiceErrors.dueDate ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                  />
                  {invoiceErrors.dueDate && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{invoiceErrors.dueDate}</p>}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm"
                >
                  Generate Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Fee Category */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Fee Category</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} aria-label="Close" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateCategory} className="p-6 space-y-4">
              <div>
                <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tuition Fee Q1, Exam Fee"
                  value={newCategory.name}
                  onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Description</label>
                <textarea
                  placeholder="Optional brief description..."
                  value={newCategory.description}
                  onChange={e => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                  className="input-field h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Amount (৳) *</label>
                  <input
                    type="number"
                    required
                    value={newCategory.amount}
                    onChange={e => setNewCategory(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Billing Frequency *</label>
                  <select
                    value={newCategory.frequency}
                    onChange={e => setNewCategory(prev => ({ ...prev, frequency: e.target.value as any }))}
                    className="input-field"
                  >
                    <option value="MONTHLY" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Monthly</option>
                    <option value="TERM" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Term-based</option>
                    <option value="ONE_TIME" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">One Time</option>
                    <option value="ANNUAL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Annual</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm"
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Payment */}
      {isPaymentModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Record Offline Payment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} aria-label="Close" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {Number(selectedInvoice.dueAmount) <= 0 || selectedInvoice.status === 'PAID' ? (
              // Defensive fallback: covers stale UI state where this modal is somehow opened
              // for an invoice that is already fully paid (e.g. list not yet refetched after
              // another user recorded the final payment).
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Student & Invoice Info</p>
                  <div className="text-slate-900 dark:text-white font-medium text-base mt-1">{selectedInvoice.student?.firstName} {selectedInvoice.student?.lastName}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Invoice: {selectedInvoice.invoiceNo || selectedInvoice.invoiceNumber}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  This invoice is already fully paid. There is no due amount left to collect.
                </div>
                <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRecordPayment} noValidate className="p-6 space-y-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Student & Invoice Info</p>
                  <div className="text-slate-900 dark:text-white font-medium text-base mt-1">{selectedInvoice.student?.firstName} {selectedInvoice.student?.lastName}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Invoice: {selectedInvoice.invoiceNo || selectedInvoice.invoiceNumber} &bull; Due: ৳ {selectedInvoice.dueAmount}</div>
                </div>

                <div className="border-t border-slate-100 dark:border-white/5 pt-4">
                  <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Payment Amount (৳)</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    max={Number(selectedInvoice.dueAmount)}
                    step="0.01"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(Number(e.target.value) || 0)}
                    className="input-field"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Must be greater than ৳ 0 and no more than the due amount of ৳ {selectedInvoice.dueAmount}.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm"
                  >
                    Record Payment
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceList;
