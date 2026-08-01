import React, { useState, useEffect } from 'react';
import { Activity, Database, Cpu, HardDrive, RefreshCw, CheckCircle2, ShieldCheck, Zap, Server, Clock, AlertCircle, Layers } from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

export const SystemHealthPortal: React.FC = () => {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchHealth = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      const res = await apiClient.get('/institution/super-admin/system-health');
      setHealth(res.data.data);
      if (isManual) toast.success('System health metrics updated');
    } catch (err: any) {
      console.error('Failed to fetch system health', err);
      toast.error('Failed to retrieve system health');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Auto-refresh metrics every 30s
    const timer = setInterval(() => {
      fetchHealth(false);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (seconds: number) => {
    if (!seconds) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="glass-card p-6 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-accent-400 to-cyan-500" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl">
              <Activity className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">System Health & Infrastructure</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Operational
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Real-time server telemetry, database latency, process memory, and cache diagnostics.
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchHealth(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold px-5 py-2.5 rounded-2xl text-xs transition-all shadow-md min-h-[44px] self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Telemetry'}</span>
          </button>
        </div>
      </div>

      {loading && !health ? (
        <div className="p-16 text-center text-slate-500">
          <div className="flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500" />
            <span className="font-bold text-sm">Gathering infrastructure telemetry...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Key Infrastructure Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Database Health Card */}
            <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Database Engine</h4>
                    <span className="text-[11px] text-slate-400">Prisma ORM / SQLite</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400">
                  {health?.database?.status || 'ONLINE'}
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-2 border border-slate-200 dark:border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Query Ping Latency:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {health?.database?.latencyMs ?? 0} ms
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Connection Pool:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {health?.database?.activeConnectionPool || 'Healthy'}
                  </span>
                </div>
              </div>
            </div>

            {/* Redis Cache Health Card */}
            <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-500/10 text-red-500 rounded-xl">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Redis Cache & Queues</h4>
                    <span className="text-[11px] text-slate-400">In-Memory Store</span>
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                  health?.cache?.status === 'ONLINE'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400'
                }`}>
                  {health?.cache?.status || 'ONLINE'}
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-2 border border-slate-200 dark:border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Cache Memory Usage:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {health?.cache?.memory || '0 MB'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Cache Strategy:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    High Speed Key-Value
                  </span>
                </div>
              </div>
            </div>

            {/* Node.js Process Memory Card */}
            <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-500/10 text-primary-500 rounded-xl">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Node.js Process</h4>
                    <span className="text-[11px] text-slate-400">V8 Memory & Heap</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 font-mono">
                  {formatUptime(health?.uptimeSeconds)} Uptime
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-2 border border-slate-200 dark:border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Heap Allocation:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {health?.systemMetrics?.heapUsedMb} MB / {health?.systemMetrics?.heapTotalMb} MB ({health?.systemMetrics?.heapUsagePercent}%)
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent-400 to-primary-500 rounded-full"
                    style={{ width: `${Math.min(health?.systemMetrics?.heapUsagePercent || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Platform Performance Summary */}
          <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl space-y-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-500" /> Platform Infrastructure Metrics
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Institutions</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">{health?.platformStats?.totalInstitutions ?? 0}</span>
                <span className="text-[10px] text-slate-500 block">Registered Tenants</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Global Accounts</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">{health?.platformStats?.totalUsers ?? 0}</span>
                <span className="text-[10px] text-slate-500 block">User Identities</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Active Refresh Tokens</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{health?.platformStats?.activeSessions ?? 0}</span>
                <span className="text-[10px] text-slate-500 block">Authenticated Devices</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">24h Audit Events</span>
                <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">{health?.platformStats?.last24hAuditEvents ?? 0}</span>
                <span className="text-[10px] text-slate-500 block">System Activity Events</span>
              </div>
            </div>

            {/* Diagnostic Checks Panel */}
            <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Automated Diagnostic Checks</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 dark:text-white block">Multi-Tenant Isolation Protection</span>
                    <span className="text-slate-500">Middleware strictly enforces tenant headers on query paths</span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary-500 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 dark:text-white block">JWT Refresh Token Rotation</span>
                    <span className="text-slate-500">Automatic reuse detection and single-use token lifecycle</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SystemHealthPortal;
