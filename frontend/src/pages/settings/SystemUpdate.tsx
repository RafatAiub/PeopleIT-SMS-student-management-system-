import React, { useState, useEffect } from 'react';
import { CloudDownload, Package, ListOrdered, ShieldCheck, Database, RefreshCw } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

interface SystemInfo {
  version: string;
  environment: string;
  nodeVersion: string;
  startedAt: string;
  appliedMigrations: number;
  latestMigration: string | null;
  latestMigrationAt: string | null;
}

const formatMigration = (name: string | null) =>
  name ? name.replace(/^\d+_/, '').replace(/_/g, ' ') : '—';

const SystemUpdate = () => {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/system/info');
      setInfo(res.data.data);
    } catch (error) {
      console.error('Failed to load system info', error);
      toast.error('Failed to load system information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfo();
  }, []);

  const rows: { label: string; value: React.ReactNode }[] = info
    ? [
        { label: 'Environment', value: <span className="capitalize">{info.environment}</span> },
        { label: 'Server running since', value: new Date(info.startedAt).toLocaleString('en-GB') },
        { label: 'Runtime', value: `Node.js ${info.nodeVersion}` },
        { label: 'Database migrations applied', value: info.appliedMigrations },
        { label: 'Latest database update', value: <span className="capitalize">{formatMigration(info.latestMigration)}</span> },
        { label: 'Applied on', value: info.latestMigrationAt ? new Date(info.latestMigrationAt).toLocaleString('en-GB') : '—' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
            <CloudDownload className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">System Update</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">See which version of the system is running.</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm">
          <Package className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Current Version</span>
          <span className="font-bold text-slate-900 dark:text-white">{info?.version ?? '…'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">System Status</h3>
            <Button variant="ghost" size="sm" onClick={fetchInfo} isLoading={loading}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
          </div>
          {loading && !info ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : !info ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">System information is unavailable.</p>
          ) : (
            <dl className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">{r.label}</dt>
                  <dd className="font-medium text-slate-900 dark:text-white text-right">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-6 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300">
            Your system is up to date. Updates are installed automatically by the platform team — there is nothing to upload.
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Update Guidelines</h3>
          <ul className="space-y-5 text-sm">
            <li className="flex gap-3">
              <ListOrdered className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Automatic Updates</p>
                <p className="text-slate-600 dark:text-slate-400">New versions are deployed for every school at once, in order — no version is ever skipped.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Verified &amp; Secure</p>
                <p className="text-slate-600 dark:text-slate-400">Every update is reviewed and tested before release. Update files are never uploaded from this page.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Database className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Your Data Is Safe</p>
                <p className="text-slate-600 dark:text-slate-400">Database changes are applied automatically and never remove existing school data.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SystemUpdate;
