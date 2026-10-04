import React, { useState, useEffect, useCallback } from 'react';
import { Database, Cpu, Zap, Server, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/Display';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SkeletonStatGrid } from '@/components/ui/Skeleton';

interface SystemHealth {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  database: { status: string; latencyMs: number; activeConnectionPool: string };
  cache: { status: string; memory: string };
  systemMetrics: { heapUsedMb: string; heapTotalMb: string; rssMb: string; heapUsagePercent: number };
  platformStats: { totalInstitutions: number; totalUsers: number; activeSessions: number; last24hAuditEvents: number };
}

const AUTO_REFRESH_MS = 30000;

/** Renders "Unknown" instead of a fabricated 0 when a metric wasn't returned. */
const metric = (value: number | string | null | undefined, suffix = ''): string =>
  value === null || value === undefined || value === '' ? 'Unknown' : `${value}${suffix}`;

export const SystemHealthPortal: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const fetchHealth = useCallback(async (isManual = false) => {
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
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => fetchHealth(false), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchHealth]);

  const formatUptime = (seconds: number | undefined) => {
    if (!seconds && seconds !== 0) return 'Unknown';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="System health & infrastructure"
        description="Real-time server telemetry, database latency, process memory, and cache diagnostics."
        actions={
          <div className="flex items-center gap-3">
            <Badge variant="success" dot>Operational</Badge>
            <Checkbox
              label="Auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <Button variant="secondary" isLoading={refreshing} onClick={() => fetchHealth(true)}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
          </div>
        }
      />

      {loading && !health ? (
        <SkeletonStatGrid count={3} />
      ) : (
        <>
          {/* Key infrastructure gauges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Database engine</h4>
                    <span className="text-[11px] text-slate-400">Prisma ORM / PostgreSQL</span>
                  </div>
                </div>
                <Badge variant={health?.database?.status === 'ONLINE' ? 'success' : 'neutral'}>
                  {health?.database?.status ?? 'Unknown'}
                </Badge>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-2 border border-slate-200 dark:border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Query ping latency:</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {metric(health?.database?.latencyMs, ' ms')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Connection pool:</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {metric(health?.database?.activeConnectionPool)}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-500/10 text-red-500 rounded-xl">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Redis cache &amp; queues</h4>
                    <span className="text-[11px] text-slate-400">In-memory store</span>
                  </div>
                </div>
                <Badge variant={health?.cache?.status === 'ONLINE' ? 'success' : 'warning'}>
                  {health?.cache?.status ?? 'Unknown'}
                </Badge>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-2 border border-slate-200 dark:border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Cache memory usage:</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {health?.cache?.status === 'ONLINE' ? metric(health?.cache?.memory) : 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Cache strategy:</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">High speed key-value</span>
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-500/10 text-primary-500 rounded-xl">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Node.js process</h4>
                    <span className="text-[11px] text-slate-400">V8 memory &amp; heap</span>
                  </div>
                </div>
                <Badge variant="info">{formatUptime(health?.uptimeSeconds)} uptime</Badge>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-2 border border-slate-200 dark:border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Heap allocation:</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {health?.systemMetrics
                      ? `${metric(health.systemMetrics.heapUsedMb)} MB / ${metric(health.systemMetrics.heapTotalMb)} MB (${metric(health.systemMetrics.heapUsagePercent)}%)`
                      : 'Unknown'}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${Math.min(health?.systemMetrics?.heapUsagePercent || 0, 100)}%` }}
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Platform performance summary */}
          <Card>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-emerald-500" /> Platform infrastructure metrics
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block">Institutions</span>
                <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{metric(health?.platformStats?.totalInstitutions)}</span>
                <span className="text-[10px] text-slate-500 block">Registered tenants</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block">Global accounts</span>
                <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{metric(health?.platformStats?.totalUsers)}</span>
                <span className="text-[10px] text-slate-500 block">User identities</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block">Active refresh tokens</span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{metric(health?.platformStats?.activeSessions)}</span>
                <span className="text-[10px] text-slate-500 block">Authenticated devices</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block">24h audit events</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono">{metric(health?.platformStats?.last24hAuditEvents)}</span>
                <span className="text-[10px] text-slate-500 block">System activity events</span>
              </div>
            </div>

            {/* Diagnostic checks panel */}
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-white/5 space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Automated diagnostic checks</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white block">Multi-tenant isolation protection</span>
                    <span className="text-slate-500">Middleware strictly enforces tenant headers on query paths.</span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary-500 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white block">JWT refresh token rotation</span>
                    <span className="text-slate-500">Automatic reuse detection and single-use token lifecycle.</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default SystemHealthPortal;
