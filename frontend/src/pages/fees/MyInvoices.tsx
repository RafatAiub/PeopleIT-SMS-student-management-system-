import React, { useEffect, useState } from 'react';
import { Receipt, CreditCard, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../../components/common/EmptyState';

interface Invoice {
  id: string;
  invoiceNo?: string;
  invoiceNumber?: string;
  totalAmount: number;
  dueAmount: number;
  dueDate: string;
  status: string;
  student?: { firstName: string; lastName: string; studentId: string };
}

interface ChildSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
}

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20',
  OVERDUE: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20',
  PENDING: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20',
};

const MyInvoices: React.FC = () => {
  const { user } = useAuthStore();
  const isGuardian = user?.role === 'GUARDIAN';

  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(isGuardian);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isGuardian) return;
    const fetchChildren = async () => {
      try {
        const res = await apiClient.get('/guardians/me/students');
        const list: ChildSummary[] = res.data.data || [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      } catch (err) {
        console.error('Failed to load linked children', err);
        toast.error('Failed to load your children');
      } finally {
        setChildrenLoading(false);
      }
    };
    fetchChildren();
  }, [isGuardian]);

  const fetchInvoices = async () => {
    if (isGuardian && !selectedChildId) return;
    setLoading(true);
    try {
      const params: Record<string, any> = { pageSize: 100 };
      if (isGuardian && selectedChildId) params.studentId = selectedChildId;
      const res = await apiClient.get('/fees/invoices', { params });
      setInvoices(res.data.data || []);
    } catch (err: any) {
      console.error('Failed to load invoices', err);
      toast.error(err.response?.data?.message || 'Failed to load your invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isGuardian && childrenLoading) return;
    if (isGuardian && children.length === 0) {
      setLoading(false);
      return;
    }
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, childrenLoading]);

  const handlePayOnline = async (invoice: Invoice) => {
    setPayingId(invoice.id);
    try {
      const res = await apiClient.post(`/fees/invoices/${invoice.id}/payments/online`, {
        method: 'BKASH',
        callbackUrl: window.location.href,
      });
      const paymentUrl = res.data?.data?.paymentUrl;
      if (paymentUrl) {
        window.open(paymentUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.success(res.data?.message || 'Payment initiated');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Online payment is not available yet. Please pay at the school office.');
    } finally {
      setPayingId(null);
    }
  };

  if (isGuardian && childrenLoading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your dashboard...</div>;
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title="No linked children found"
          description="Contact your school administrator to link your account to your child's student profile."
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

  const totalDue = invoices.reduce((sum, inv) => sum + Number(inv.dueAmount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isGuardian ? "My Children's Fees" : 'My Fees & Billing'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">View your invoices and pay online.</p>
        </div>
        {totalDue > 0 && (
          <div className="glass-card px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/5">
            <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold uppercase">Total Due: ৳{totalDue.toLocaleString()}</span>
          </div>
        )}
      </div>

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedChildId === child.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Invoice No</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Due Date</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Loading invoices...</td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No invoices found.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{invoice.invoiceNo || invoice.invoiceNumber}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-white tabular-nums">৳ {invoice.totalAmount}</div>
                      {Number(invoice.dueAmount) > 0 && <div className="text-xs text-rose-600 dark:text-rose-400 tabular-nums">Due: ৳ {invoice.dueAmount}</div>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                      {new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[invoice.status] || STATUS_STYLES.PENDING}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {invoice.status !== 'PAID' && (
                        <button
                          onClick={() => handlePayOnline(invoice)}
                          disabled={payingId === invoice.id}
                          className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          {payingId === invoice.id ? 'Processing...' : 'Pay Online'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MyInvoices;
