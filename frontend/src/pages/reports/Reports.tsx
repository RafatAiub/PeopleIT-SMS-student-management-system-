import React, { useState, useEffect } from 'react';
import { BarChart, TrendingUp, Users, DollarSign, Activity } from 'lucide-react';
import apiClient from '../../api/client';

const Reports = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await apiClient.get('/reports/dashboard');
        setData(res.data.data);
      } catch (err) {
        console.error('Failed to fetch reports', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  if (loading) {
    return <div className="text-slate-400">Loading reports...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">System Reports & Analytics</h2>
        <p className="text-slate-400 mt-1">Overview of attendance, fees, and performance trends.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass p-6 rounded-2xl border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Total Students</p>
              <h3 className="text-2xl font-bold text-white">{data?.totalStudents || 0}</h3>
            </div>
          </div>
        </div>
        <div className="glass p-6 rounded-2xl border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Average Attendance</p>
              <h3 className="text-2xl font-bold text-white">{data?.averageAttendance || 0}%</h3>
            </div>
          </div>
        </div>
        <div className="glass p-6 rounded-2xl border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Total Revenue</p>
              <h3 className="text-2xl font-bold text-white">${data?.totalRevenue || 0}</h3>
            </div>
          </div>
        </div>
        <div className="glass p-6 rounded-2xl border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Active Staff</p>
              <h3 className="text-2xl font-bold text-white">{data?.activeStaff || 0}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-2xl border border-white/5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <BarChart className="w-5 h-5 text-blue-400" />
            Fee Collections
          </h3>
          <div className="h-64 flex items-end justify-between gap-2">
            {[40, 70, 45, 90, 65, 80, 100].map((val, i) => (
              <div key={i} className="w-full bg-blue-500/20 rounded-t-sm relative group">
                <div 
                  className="absolute bottom-0 w-full bg-blue-500/50 rounded-t-sm transition-all"
                  style={{ height: `${val}%` }}
                ></div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="glass p-6 rounded-2xl border border-white/5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <BarChart className="w-5 h-5 text-emerald-400" />
            Attendance Trends
          </h3>
          <div className="h-64 flex items-end justify-between gap-2">
            {[80, 85, 90, 88, 95, 92, 98].map((val, i) => (
              <div key={i} className="w-full bg-emerald-500/20 rounded-t-sm relative group">
                <div 
                  className="absolute bottom-0 w-full bg-emerald-500/50 rounded-t-sm transition-all"
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
