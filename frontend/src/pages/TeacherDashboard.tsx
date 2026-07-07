import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, Clock } from 'lucide-react';
import { KpiCard } from '../components/Charts/KpiCard';
import apiClient from '../api/client';

const TeacherDashboard = () => {
  const [stats, setStats] = useState({
    myStudents: 0,
    attendanceAvg: 0,
    pendingAssignments: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [studentsRes, insightsRes] = await Promise.all([
          apiClient.get('/students').catch(() => ({ data: { data: [] } })),
          apiClient.get('/ai/dashboard-insights').catch(() => ({ data: { data: { statistics: { attendanceAvg: 0 } } } }))
        ]);

        const students = studentsRes.data?.data || [];
        const attendanceAvg = insightsRes.data?.data?.statistics?.attendanceAvg || 0;

        setStats({
          myStudents: students.length, // Simplified to total students for now
          attendanceAvg: attendanceAvg,
          pendingAssignments: 0 // Assignment module not yet implemented
        });
      } catch (err) {
        console.error('Failed to fetch teacher dashboard stats', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return <div className="text-slate-400 p-8 text-center">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Teacher Dashboard</h2>
          <p className="text-slate-400 mt-1">Your class overview for today.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="My Students"
          value={stats.myStudents}
          trend="up"
          trendValue="Live"
          icon={<Users className="w-6 h-6" />}
          color="indigo"
        />
        <KpiCard
          title="Avg. Attendance"
          value={stats.attendanceAvg}
          trend="up"
          trendValue="Live"
          icon={<CheckCircle className="w-6 h-6" />}
          color="teal"
          suffix="%"
        />
        <KpiCard
          title="Pending Assignments"
          value={stats.pendingAssignments}
          trend="up"
          trendValue="Live"
          icon={<Clock className="w-6 h-6" />}
          color="amber"
        />
      </div>
    </div>
  );
};

export default TeacherDashboard;
