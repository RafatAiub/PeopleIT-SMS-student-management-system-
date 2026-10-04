import React, { useState } from 'react';
import { Inbox, Loader2, CheckCircle2, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Checkbox, DescriptionList, Drawer, ErrorState, PageHeader, Select, SkeletonStatGrid, SkeletonText, StatCard } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { formatDate, formatNumber, useT } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { useAuthStore } from '@/store/authStore';
import {
  errMsg,
  personName,
  PRIORITY_LABEL,
  PRIORITY_VARIANT,
  STATUS_LABEL,
  STATUS_VARIANT,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  usePlatformAgents,
  usePlatformTicket,
  usePlatformTicketMutations,
  usePlatformTickets,
  type TicketPriority,
  type TicketStatus,
  type TicketSummary,
} from './support.api';
import { TicketThread } from './TicketThread';

const PlatformTicketDrawer: React.FC<{ id: string | null; onClose: () => void }> = ({ id, onClose }) => {
  const t = useT();
  const userId = useAuthStore((s) => s.user?.id);
  const query = usePlatformTicket(id);
  const agents = usePlatformAgents();
  const { reply, update } = usePlatformTicketMutations();
  const ticket = query.data;

  const change = async (body: { status?: TicketStatus; priority?: TicketPriority; assignedToUserId?: string | null }) => {
    if (!ticket) return;
    try {
      await update.mutateAsync({ id: ticket.id, ...body });
      toast.success(t('Ticket updated'));
    } catch (err) {
      toast.error(errMsg(err, t('Could not update the ticket')));
    }
  };

  return (
    <Drawer isOpen={!!id} onClose={onClose} title={ticket?.subject ?? t('Ticket')} description={ticket?.institution.name} width="xl">
      {query.isLoading ? (
        <SkeletonText lines={6} />
      ) : query.isError || !ticket ? (
        <ErrorState message={errMsg(query.error, t('Could not load the ticket.'))} onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-5">
          <DescriptionList
            items={[
              { label: t('Institution'), value: ticket.institution.name },
              { label: t('Opened by'), value: `${personName(ticket.createdBy)} (${ticket.createdBy.role})` },
              { label: t('Opened'), value: formatDate(ticket.createdAt, true) },
              { label: t('Last activity'), value: formatDate(ticket.updatedAt, true) },
            ]}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label={t('Status')}
              value={ticket.status}
              disabled={update.isPending}
              onChange={(e) => change({ status: e.target.value as TicketStatus })}
              options={TICKET_STATUSES.map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))}
            />
            <Select
              label={t('Priority')}
              value={ticket.priority}
              disabled={update.isPending}
              onChange={(e) => change({ priority: e.target.value as TicketPriority })}
              options={TICKET_PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))}
            />
            <Select
              label={t('Assignee')}
              value={ticket.assignedTo?.id ?? ''}
              disabled={update.isPending || agents.isLoading}
              onChange={(e) => change({ assignedToUserId: e.target.value || null })}
              options={[{ value: '', label: t('Unassigned') }, ...(agents.data ?? []).map((a) => ({ value: a.id, label: personName(a) || a.email }))]}
              helperText={agents.isError ? t('Could not load agents') : undefined}
            />
          </div>
          <TicketThread
            ticket={ticket}
            viewerId={userId}
            isReplying={reply.isPending}
            onReply={async (body) => {
              try {
                await reply.mutateAsync({ id: ticket.id, body });
              } catch (err) {
                toast.error(errMsg(err, t('Could not send the reply')));
                throw err;
              }
            }}
          />
        </div>
      )}
    </Drawer>
  );
};

/**
 * Platform support console — every institution's tickets. Route: /super-admin/support
 * (SUPER_ADMIN only — mirrors /api/v1/support/platform/*).
 */
const PlatformSupportConsole: React.FC = () => {
  const t = useT();
  const tp = useTableParams(20);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = usePlatformTickets({ page: tp.params.page, pageSize: tp.params.pageSize, status, priority, search: tp.debouncedSearch, assignedToMe });
  const counts = query.data?.counts;

  const columns: Column<TicketSummary>[] = [
    {
      key: 'subject',
      header: t('Subject'),
      primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{r.subject}</p>
          <p className="text-xs text-slate-500">
            {personName(r.createdBy)} · {t('{n} replies', { n: formatNumber(r._count.messages) })}
          </p>
        </div>
      ),
      exportValue: (r) => r.subject,
    },
    { key: 'institution', header: t('Institution'), render: (r) => r.institution?.name ?? '—', exportValue: (r) => r.institution?.name ?? '' },
    { key: 'status', header: t('Status'), render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{t(STATUS_LABEL[r.status])}</Badge>, exportValue: (r) => r.status },
    { key: 'priority', header: t('Priority'), render: (r) => <Badge variant={PRIORITY_VARIANT[r.priority]}>{t(PRIORITY_LABEL[r.priority])}</Badge>, exportValue: (r) => r.priority },
    { key: 'assignee', header: t('Assignee'), hideOnMobile: true, render: (r) => personName(r.assignedTo) || <span className="text-slate-400">—</span>, exportValue: (r) => personName(r.assignedTo) },
    { key: 'updatedAt', header: t('Last activity'), hideOnMobile: true, render: (r) => formatDate(r.updatedAt, true), exportValue: (r) => r.updatedAt },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t('Support console')} description={t('Tickets from every institution on the platform.')} breadcrumbs={[{ label: t('Super admin') }, { label: t('Support') }]} />
      {query.isLoading && !counts ? (
        <SkeletonStatGrid count={4} />
      ) : counts ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t('Open')} value={formatNumber(counts.OPEN)} icon={<Inbox />} tone="info" onClick={() => { setStatus('OPEN'); tp.setPage(1); }} />
          <StatCard label={t('In progress')} value={formatNumber(counts.IN_PROGRESS)} icon={<Loader2 />} tone="warning" onClick={() => { setStatus('IN_PROGRESS'); tp.setPage(1); }} />
          <StatCard label={t('Resolved')} value={formatNumber(counts.RESOLVED)} icon={<CheckCircle2 />} tone="success" onClick={() => { setStatus('RESOLVED'); tp.setPage(1); }} />
          <StatCard label={t('Closed')} value={formatNumber(counts.CLOSED)} icon={<Archive />} tone="neutral" onClick={() => { setStatus('CLOSED'); tp.setPage(1); }} />
        </div>
      ) : null}
      {query.isError && !query.data ? (
        <ErrorState message={errMsg(query.error, t('Could not load tickets.'))} onRetry={() => query.refetch()} />
      ) : (
        <DataTable
          data={query.data?.items ?? []}
          columns={columns}
          isLoading={query.isLoading}
          serverSearch
          onSearch={tp.setSearch}
          searchPlaceholder={t('Search tickets...')}
          serverPagination
          totalCount={query.data?.meta.total ?? 0}
          page={tp.params.page}
          pageSize={tp.params.pageSize}
          onPageChange={tp.setPage}
          onPageSizeChange={tp.setPageSize}
          onRowClick={(r) => setOpenId(r.id)}
          exportFileName="platform-support-tickets"
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={t('Status')}
                value={status}
                onChange={(e) => { setStatus(e.target.value); tp.setPage(1); }}
                options={[{ value: '', label: t('All statuses') }, ...TICKET_STATUSES.map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))]}
                containerClassName="w-40"
              />
              <Select
                aria-label={t('Priority')}
                value={priority}
                onChange={(e) => { setPriority(e.target.value); tp.setPage(1); }}
                options={[{ value: '', label: t('All priorities') }, ...TICKET_PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))]}
                containerClassName="w-40"
              />
              <Checkbox label={t('Assigned to me')} checked={assignedToMe} onChange={(e) => { setAssignedToMe(e.target.checked); tp.setPage(1); }} />
            </div>
          }
          actions={[{ label: t('Open'), icon: 'view', onClick: (r) => setOpenId(r.id) }]}
          emptyTitle={t('No tickets')}
          emptyDescription={t('No institution has raised a ticket matching these filters.')}
        />
      )}
      <PlatformTicketDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};

export default PlatformSupportConsole;
