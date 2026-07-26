import React, { useState, useEffect } from 'react';
import { ListOrdered, Search, Filter, Shield, Activity, User, Building2, ChevronLeft, ChevronRight, Clock, ArrowUpRight } from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

export const AuditLogsPortal: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [meta, setMeta] = useState<any>({ total: 0, totalPages: 1, actionBreakdown: [] });

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/institution/super-admin/audit-logs', {
        params: {
          page,
          pageSize: 12,
          action: actionFilter,
          search: searchQuery.trim(),
        },
      });
      setLogs(res.data.data || []);
      if (res.data.meta) {
        setMeta(res.data.meta);
      }
    } catch (err: any) {
      console.error('Failed to fetch audit logs', err);
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [page, actionFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchAuditLogs();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const getActionBadge = (action: string) => {
    if (action.includes('CREATE')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
    }
    if (action.includes('UPDATE') || action.includes('EDIT')) {
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20';
    }
    if (action.includes('DELETE') || action.includes('REVOKE')) {
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20';
    }
    if (action.includes('SUPPORT')) {
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-white/10';
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="glass-card p-6 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-teal-400" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
              <ListOrdered className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">System Audit Logs</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Real-time security trail and mutation tracking across all institutions and support sessions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 font-mono text-xs font-bold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-500" /> {meta.total || 0} Total Recorded Events
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Action Distribution</span>
            <Shield className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="space-y-2">
            {meta.actionBreakdown?.slice(0, 4).map((b: any, i: number) => {
              const percentage = Math.round((b.count / (meta.total || 1)) * 100);
              return (
                <div key={b.action} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono truncate max-w-[180px]">{b.action}</span>
                    <span className="text-slate-500 font-mono">{b.count} ({percentage}%)</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(!meta.actionBreakdown || meta.actionBreakdown.length === 0) && (
              <p className="text-xs text-slate-500 italic">No event statistics available yet.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-2">Audit Policy Status</span>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl flex items-center gap-3">
              <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Strict Audit Middleware Active</p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">All tenant API requests logged with IP and actor metadata.</p>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs text-slate-500">
            <span>Log Retention Policy:</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">Immutable / Unlimited</span>
          </div>
        </div>

        <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-2">Quick Search Tip</span>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Use the search bar to filter audit events by user email, institution name, resource type, or specific action names like <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-blue-500 font-mono">SUPPORT_SESSION</code>.
            </p>
          </div>
          <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs text-slate-500">
            <span>Active Support Sessions:</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">Monitored</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Header */}
      <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search email, action, institution..."
              className="input-field pl-10 text-xs py-2"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="input-field text-xs py-2 w-full sm:w-56"
            >
              <option value="ALL">All Action Types</option>
              <option value="CREATE">CREATE Operations</option>
              <option value="UPDATE">UPDATE Operations</option>
              <option value="DELETE">DELETE Operations</option>
              <option value="SUPPORT">Support Access Sessions</option>
              <option value="LOGIN">User Logins</option>
            </select>
          </div>
        </div>

        {/* Audit Logs Table */}
        <div className="overflow-x-auto border border-slate-200 dark:border-white/10 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-white/5">
                <th className="p-4 pl-6">Timestamp</th>
                <th className="p-4">Actor User</th>
                <th className="p-4">Institution</th>
                <th className="p-4">Action Type</th>
                <th className="p-4">Resource</th>
                <th className="p-4 pr-6">IP / Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
                      <span>Loading audit logs...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500 italic">
                    No audit log entries found matching criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="p-4 pl-6 font-mono text-slate-500 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-slate-900 dark:text-white">
                      {log.user ? (
                        <div>
                          <p>{log.user.firstName} {log.user.lastName}</p>
                          <p className="text-[10px] font-normal text-slate-400 font-mono">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">System Process</span>
                      )}
                    </td>
                    <td className="p-4">
                      {log.institution ? (
                        <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                          {log.institution.name} ({log.institution.slug})
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Global Platform</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase font-mono border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {log.resource || 'System'}
                    </td>
                    <td className="p-4 pr-6 font-mono text-slate-500 text-[11px]">
                      {log.ipAddress || '127.0.0.1'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 text-xs">
          <span className="text-slate-500">
            Page {meta.page} of {meta.totalPages} ({meta.total} Total Audit Records)
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 disabled:opacity-40 font-bold flex items-center gap-1 min-h-[36px]"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 disabled:opacity-40 font-bold flex items-center gap-1 min-h-[36px]"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLogsPortal;
