import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Wallet, UserMinus, CalendarClock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import { billingApi, formatCurrency, type BillingAnalytics } from '@/api/billing.api';

// =============================================================================
// AnalyticsTab — MRR / revenue / churn for the super-admin billing portal.
// Split into its own module and lazy-loaded so `recharts` only ships in a
// separate async chunk fetched when this tab is opened.
// =============================================================================

const CHURN_WINDOW_OPTIONS = [30, 60, 90] as const;

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  extra?: React.ReactNode;
}> = ({ icon, label, value, color, extra }) => (
  <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-5">
    <div className="flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 truncate">{value}</p>
        {extra}
      </div>
    </div>
  </div>
);

const AnalyticsTab: React.FC = () => {
  const [analytics, setAnalytics] = useState<BillingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [churnWindowDays, setChurnWindowDays] = useState<number>(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await billingApi.getAnalytics({ churnWindowDays });
        if (!cancelled) setAnalytics(data);
      } catch {
        if (!cancelled) toast.error('Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [churnWindowDays]);

  const totalRevenue = useMemo(
    () => (analytics?.revenueByPlan ?? []).reduce((sum, i) => sum + Number(i.totalRevenue), 0),
    [analytics],
  );
  const chartData = useMemo(
    () => (analytics?.revenueByPlan ?? []).map((i) => ({ name: i.planName, revenue: Number(i.totalRevenue) })),
    [analytics],
  );

  if (loading && !analytics) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          ))}
        </div>
        <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={<DollarSign className="w-5 h-5" />}
          color="bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400"
          label="MRR"
          value={formatCurrency(analytics?.mrr ?? 0)}
        />
        <StatTile
          icon={<Wallet className="w-5 h-5" />}
          color="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
          label="Total revenue"
          value={formatCurrency(totalRevenue)}
        />
        <StatTile
          icon={<UserMinus className="w-5 h-5" />}
          color="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
          label="Churned"
          value={String(analytics?.churnCount ?? 0)}
          extra={
            <select
              value={churnWindowDays}
              onChange={(e) => setChurnWindowDays(Number(e.target.value))}
              aria-label="Churn window in days"
              className="mt-1.5 text-[11px] font-medium bg-transparent border border-slate-200 dark:border-white/10 rounded-lg px-1.5 py-0.5 text-slate-500 dark:text-slate-400"
            >
              {CHURN_WINDOW_OPTIONS.map((d) => (
                <option key={d} value={d}>Last {d} days</option>
              ))}
            </select>
          }
        />
        <StatTile
          icon={<CalendarClock className="w-5 h-5" />}
          color="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          label="Upcoming renewals"
          value={String(analytics?.upcomingRenewals.count ?? 0)}
        />
      </div>

      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-6">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Revenue by plan</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-12">No successful payments recorded yet.</p>
        ) : (
          <div
            className="h-72"
            role="img"
            aria-label={`Total revenue by plan: ${chartData.map((d) => `${d.name} ${formatCurrency(d.revenue)}`).join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-white/10" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-slate-500 dark:fill-slate-400" />
                <YAxis tick={{ fontSize: 12 }} className="fill-slate-500 dark:fill-slate-400" />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(148,163,184,0.3)' }}
                />
                <Bar dataKey="revenue" fill="#4F46E5" radius={[6, 6, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsTab;
