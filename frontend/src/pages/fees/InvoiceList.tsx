import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, DollarSign, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';

const InvoiceList = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  const [newInvoice, setNewInvoice] = useState({
    studentId: '',
    feeCategoryId: '',
    totalAmount: 0,
    dueDate: new Date().toISOString().split('T')[0],
  });

  const [paymentAmount, setPaymentAmount] = useState(0);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/fees/invoices');
      setInvoices(response.data.data || []);
    } catch (error) {
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
    } catch (error) {
      console.error('Failed to fetch dependencies', error);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchDependencies();
  }, []);

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvoice.studentId || !newInvoice.feeCategoryId) {
      toast.error(error.response?.data?.message || 'Please select a student and a fee category');
      return;
    }
    try {
      await apiClient.post('/fees/invoices', {
        studentId: newInvoice.studentId,
        dueDate: new Date(newInvoice.dueDate).toISOString(),
        items: [
          {
            feeCategoryId: newInvoice.feeCategoryId,
            description: 'Generated Invoice Item',
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
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to generate invoice');
    }
  };

  const openPaymentModal = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.dueAmount);
    setIsPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      await apiClient.post(`/fees/invoices/${selectedInvoice.id}/payments/offline`, {
        amount: paymentAmount,
        method: 'CASH'
      });
      setIsPaymentModalOpen(false);
      toast.success('Payment recorded successfully');
      fetchInvoices();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record payment');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Fee Invoices</h2>
          <p className="text-slate-400 mt-1">Manage student fee collections and invoices.</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-500/20 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Generate Invoice
        </button>
      </div>

      <div className="glass rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search invoices by number or student..." 
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/40 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium">Invoice No</th>
                <th className="px-6 py-4 font-medium">Student Info</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    Loading invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No invoices found.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice: any) => (
                  <tr key={invoice.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{invoice.invoiceNumber}</td>
                    <td className="px-6 py-4">
                      <div className="text-white">{invoice.student?.firstName} {invoice.student?.lastName}</div>
                      <div className="text-xs text-slate-500">Student</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">৳ {invoice.totalAmount}</div>
                      {invoice.dueAmount > 0 && <div className="text-xs text-rose-400">Due: ৳ {invoice.dueAmount}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        invoice.status === 'PAID' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' : 
                        invoice.status === 'OVERDUE' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {invoice.status !== 'PAID' && (
                          <button 
                            onClick={() => openPaymentModal(invoice)}
                            className="inline-flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          >
                            <DollarSign className="w-3.5 h-3.5" /> Record Payment
                          </button>
                        )}
                        <button className="text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium flex items-center justify-end gap-1">
                          <FileText className="w-4 h-4" /> View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/50">
              <h3 className="text-lg font-semibold text-white">Generate Invoice</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleGenerateInvoice} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Select Student *</label>
                  <select
                    required
                    value={newInvoice.studentId}
                    onChange={e => setNewInvoice(prev => ({ ...prev, studentId: e.target.value }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">-- Choose Student --</option>
                    {students.map(st => (
                      <option key={st.id} value={st.id}>{st.firstName} {st.lastName}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Fee Category *</label>
                  <select
                    required
                    value={newInvoice.feeCategoryId}
                    onChange={e => {
                      const cat = categories.find(c => c.id === e.target.value);
                      setNewInvoice(prev => ({ ...prev, feeCategoryId: e.target.value, totalAmount: cat ? cat.amount : 0 }));
                    }}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">-- Choose Fee Category --</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name} (৳ {cat.amount})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Total Amount (৳) *</label>
                  <input
                    type="number"
                    required
                    value={newInvoice.totalAmount}
                    onChange={e => setNewInvoice(prev => ({ ...prev, totalAmount: Number(e.target.value) }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={newInvoice.dueDate}
                    onChange={e => setNewInvoice(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm"
                >
                  Generate Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPaymentModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/50">
              <h3 className="text-lg font-semibold text-white">Record Payment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Student & Invoice Info</p>
                <div className="text-white font-medium text-base mt-1">{selectedInvoice.student?.firstName} {selectedInvoice.student?.lastName}</div>
                <div className="text-xs text-slate-400 mt-0.5">Invoice: {selectedInvoice.invoiceNumber} &bull; Due: ৳{selectedInvoice.dueAmount}</div>
              </div>

              <div className="border-t border-white/5 pt-4">
                <label className="text-xs text-slate-400 font-medium mb-1 block">Payment Amount (৳)</label>
                <input
                  type="number"
                  required
                  max={selectedInvoice.dueAmount}
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(Number(e.target.value) || 0)}
                  className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-4 rounded-xl transition-all text-sm"
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
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceList;
