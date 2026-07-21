import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, TrendingUp, Users, DollarSign, Activity, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';

const Reports = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/reports/dashboard');
      setData(res.data.data);
      setError(false);
    } catch (err: any) {
      console.error('Failed to fetch reports', err);
      setError(true);
      toast.error(err.response?.data?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Fee amounts aren't already 0-100 like attendance %, so normalize each
  // day against the week's max for the bar-height visualization.
  const feeTrendPercents = useMemo(() => {
    const trend: number[] = data?.feeTrend ?? [];
    const max = Math.max(...trend, 1);
    return trend.map((v) => Math.round((v / max) * 100));
  }, [data]);

  if (loading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading reports...</div>;
  }

  if (error) {
    return (
      <div className="glass-card p-10 rounded-2xl border border-rose-200 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3 max-w-lg mx-auto">
        <AlertCircle className="w-10 h-10 text-rose-500" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Couldn't load reports</h3>
        <p className="text-slate-600 dark:text-slate-400 text-sm">Something went wrong while fetching the analytics data.</p>
        <button
          onClick={fetchReports}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">System Reports & Analytics</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Overview of attendance, fees, and performance trends.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Students</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{data?.totalStudents || 0}</h3>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-transparent">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Average Attendance</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{data?.attendanceRate || 0}%</h3>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-transparent">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Revenue</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">${data?.totalRevenue || 0}</h3>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-transparent">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Staff</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{data?.totalTeachers || 0}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Fee Collections
          </h3>
          <div className="h-64 flex items-end justify-between gap-2">
            {feeTrendPercents.map((val, i) => (
              <div key={i} className="w-full bg-blue-100 dark:bg-blue-500/20 rounded-t-sm relative group h-full" title={`৳${(data?.feeTrend?.[i] ?? 0).toLocaleString()}`}>
                <div
                  className="absolute bottom-0 w-full bg-blue-500/50 dark:bg-blue-500/50 rounded-t-sm transition-all"
                  style={{ height: `${val}%` }}
                ></div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Attendance Trends
          </h3>
          <div className="h-64 flex items-end justify-between gap-2">
            {(data?.attendanceTrend ?? []).map((val: number, i: number) => (
              <div key={i} className="w-full bg-emerald-100 dark:bg-emerald-500/20 rounded-t-sm relative group h-full" title={`${val}%`}>
                <div
                  className="absolute bottom-0 w-full bg-emerald-500/50 dark:bg-emerald-500/50 rounded-t-sm transition-all"
                  style={{ height: `${val}%` }}
                ></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
