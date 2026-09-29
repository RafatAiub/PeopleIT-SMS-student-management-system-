import React, { useState, useEffect } from 'react';
import { ListOrdered, Shield, Clock } from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/Display';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { DescriptionList } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { formatDate } from '@/i18n';

interface AuditLogUser {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface AuditLogInstitution {
  name: string;
  slug: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: AuditLogUser | null;
  institution: AuditLogInstitution | null;
}

interface ActionBreakdownItem {
  action: string;
  count: number;
}

interface AuditLogsMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  actionBreakdown: ActionBreakdownItem[];
}

const ACTION_FILTERS = [
  { value: 'ALL', label: 'All action types' },
  { value: 'CREATE', label: 'CREATE operations' },
  { value: 'UPDATE', label: 'UPDATE operations' },
  { value: 'DELETE', label: 'DELETE operations' },
  { value: 'SUPPORT', label: 'Support access sessions' },
  { value: 'LOGIN', label: 'User logins' },
];

const getActionBadgeVariant = (action: string): 'success' | 'info' | 'danger' | 'warning' | 'neutral' => {
  if (action.includes('CREATE')) return 'success';
  if (action.includes('UPDATE') || action.includes('EDIT')) return 'info';
  if (action.includes('DELETE') || action.includes('REVOKE')) return 'danger';
  if (action.includes('SUPPORT')) return 'warning';
  return 'neutral';
};

export const AuditLogsPortal: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const pageSize = 12;
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [meta, setMeta] = useState<AuditLogsMeta>({ total: 0, page: 1, pageSize, totalPages: 1, actionBreakdown: [] });
  const [detailTarget, setDetailTarget] = useState<AuditLogEntry | null>(null);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/institution/super-admin/audit-logs', {
        params: {
          page,
          pageSize,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, actionFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchAuditLogs();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      primary: true,
      render: (log) => (
        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          {formatDate(log.createdAt, true)}
        </div>
      ),
    },
    {
      key: 'user',
      header: 'Actor user',
      render: (log) =>
        log.user ? (
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{log.user.firstName} {log.user.lastName}</p>
            <p className="text-[10px] font-mono text-slate-400">{log.user.email}</p>
          </div>
        ) : (
          <span className="text-slate-400 italic">System process</span>
        ),
    },
    {
      key: 'institution',
      header: 'Institution',
      hideOnMobile: true,
      render: (log) =>
        log.institution ? (
          <span className="font-medium text-blue-600 dark:text-blue-400 font-mono text-xs">
            {log.institution.name} ({log.institution.slug})
          </span>
        ) : (
          <span className="text-slate-400 italic">Global platform</span>
        ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => <Badge variant={getActionBadgeVariant(log.action)}>{log.action}</Badge>,
    },
    {
      key: 'resource',
      header: 'Resource',
      hideOnMobile: true,
      render: (log) => <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 text-xs">{log.resource || 'System'}</span>,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="System audit logs"
        description="Security trail and mutation tracking across all institutions and support sessions."
        actions={
          <Badge variant="info" dot>
            {meta.total || 0} total recorded events
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3">
            <span>Action distribution</span>
            <Shield className="w-4 h-4 text-primary-500" />
          </div>
          <div className="space-y-2">
            {meta.actionBreakdown?.slice(0, 4).map((b) => {
              const percentage = Math.round((b.count / (meta.total || 1)) * 100);
              return (
                <div key={b.action} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono truncate max-w-[180px]">{b.action}</span>
                    <span className="text-slate-500 font-mono">{b.count} ({percentage}%)</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(percentage, 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {(!meta.actionBreakdown || meta.actionBreakdown.length === 0) && (
              <p className="text-xs text-slate-500 italic">No event statistics available yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-2">Audit policy status</span>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl flex items-center gap-3">
            <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Strict audit middleware active</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">All tenant API requests are logged with actor metadata.</p>
            </div>
          </div>
        </Card>

        <Card>
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-2">Search &amp; filters</span>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            The search box matches user email, institution name, action, and resource. Filtering by a specific institution, user or
            date range isn't available yet — the audit-logs endpoint only accepts an action type and a free-text search.
          </p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search email, action, institution…"
          aria-label="Search audit logs"
          containerClassName="flex-1 sm:max-w-xs"
        />
        <Select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          aria-label="Filter by action type"
          containerClassName="w-full sm:w-56"
          options={ACTION_FILTERS}
        />
      </div>

      <DataTable
        data={logs}
        columns={columns}
        isLoading={loading}
        onRowClick={(log) => setDetailTarget(log)}
        serverPagination
        totalCount={meta.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        emptyTitle="No audit log entries found"
        emptyDescription="No events match the current search and filter."
      />

      <Drawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.action}
        description={detailTarget ? formatDate(detailTarget.createdAt, true) : undefined}
        width="lg"
      >
        {detailTarget && (
          <div className="space-y-5">
            <DescriptionList
              columns={1}
              items={[
                { label: 'Actor user', value: detailTarget.user ? `${detailTarget.user.firstName} ${detailTarget.user.lastName} (${detailTarget.user.email})` : 'System process' },
                { label: 'Institution', value: detailTarget.institution ? `${detailTarget.institution.name} (${detailTarget.institution.slug})` : 'Global platform' },
                { label: 'Resource', value: detailTarget.resource },
                { label: 'Resource ID', value: detailTarget.resourceId ? <span className="font-mono text-xs">{detailTarget.resourceId}</span> : null },
                { label: 'IP address', value: detailTarget.ipAddress ? <span className="font-mono text-xs">{detailTarget.ipAddress}</span> : 'Unknown' },
              ]}
            />
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <ListOrdered className="w-3.5 h-3.5" /> Metadata
              </p>
              {detailTarget.metadata && Object.keys(detailTarget.metadata).length > 0 ? (
                <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(detailTarget.metadata, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-400 italic">No metadata recorded for this event.</p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default AuditLogsPortal;
