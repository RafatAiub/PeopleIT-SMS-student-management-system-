import React, { useState } from 'react';
import { LifeBuoy, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Checkbox, DescriptionList, Drawer, ErrorState, PageHeader, Select, SkeletonText } from '@/components/ui';
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
  useTicket,
  useTicketMutations,
  useTickets,
  type TicketPriority,
  type TicketStatus,
  type TicketSummary,
} from './support.api';
import { NewTicketModal } from './NewTicketModal';
import { TicketThread } from './TicketThread';

const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN'];

const TicketDrawer: React.FC<{ id: string | null; onClose: () => void }> = ({ id, onClose }) => {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const isManager = !!user && MANAGER_ROLES.includes(user.role);
  const query = useTicket(id);
  const { reply, update } = useTicketMutations();
  const ticket = query.data;
  const isCreator = ticket?.createdBy.id === user?.id;

  const change = async (body: { status?: TicketStatus; priority?: TicketPriority }) => {
    if (!ticket) return;
    try {
      await update.mutateAsync({ id: ticket.id, ...body });
      toast.success(t('Ticket updated'));
    } catch (err) {
      toast.error(errMsg(err, t('Could not update the ticket')));
    }
  };

  return (
    <Drawer isOpen={!!id} onClose={onClose} title={ticket?.subject ?? t('Ticket')} width="lg">
      {query.isLoading ? (
        <SkeletonText lines={6} />
      ) : query.isError || !ticket ? (
        <ErrorState message={errMsg(query.error, t('Could not load the ticket.'))} onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-5">
          <DescriptionList
            items={[
              { label: t('Status'), value: <Badge variant={STATUS_VARIANT[ticket.status]}>{t(STATUS_LABEL[ticket.status])}</Badge> },
              { label: t('Priority'), value: <Badge variant={PRIORITY_VARIANT[ticket.priority]}>{t(PRIORITY_LABEL[ticket.priority])}</Badge> },
              { label: t('Opened by'), value: personName(ticket.createdBy) },
              { label: t('Opened'), value: formatDate(ticket.createdAt, true) },
            ]}
          />
          {isManager ? (
            <div className="flex flex-wrap gap-3">
              <Select
                label={t('Status')}
                value={ticket.status}
                onChange={(e) => change({ status: e.target.value as TicketStatus })}
                options={TICKET_STATUSES.map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))}
                containerClassName="w-44"
                disabled={update.isPending}
              />
              <Select
                label={t('Priority')}
                value={ticket.priority}
                onChange={(e) => change({ priority: e.target.value as TicketPriority })}
                options={TICKET_PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))}
                containerClassName="w-44"
                disabled={update.isPending}
              />
            </div>
          ) : (
            isCreator && (
              <div className="flex gap-2">
                {ticket.status === 'CLOSED' || ticket.status === 'RESOLVED' ? (
                  <Button size="sm" variant="outline" isLoading={update.isPending} onClick={() => change({ status: 'OPEN' })}>
                    {t('Reopen ticket')}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" isLoading={update.isPending} onClick={() => change({ status: 'CLOSED' })}>
                    {t('Close ticket')}
                  </Button>
                )}
              </div>
            )
          )}
          <TicketThread
            ticket={ticket}
            viewerId={user?.id}
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
 * Support tickets for the signed-in user's institution. Route: /support
 * (all roles — SUPER_ADMIN/ADMIN see every ticket of the institution, others their own).
 */
const SupportTickets: React.FC = () => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const isManager = !!role && MANAGER_ROLES.includes(role);
  const tp = useTableParams(10);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useTickets({ page: tp.params.page, pageSize: tp.params.pageSize, status, priority, search: tp.debouncedSearch, mine });

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
    {
      key: 'status',
      header: t('Status'),
      render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{t(STATUS_LABEL[r.status])}</Badge>,
      exportValue: (r) => r.status,
    },
    {
      key: 'priority',
      header: t('Priority'),
      render: (r) => <Badge variant={PRIORITY_VARIANT[r.priority]}>{t(PRIORITY_LABEL[r.priority])}</Badge>,
      exportValue: (r) => r.priority,
    },
    { key: 'updatedAt', header: t('Last activity'), hideOnMobile: true, render: (r) => formatDate(r.updatedAt, true), exportValue: (r) => r.updatedAt },
  ];

  const newButton = (
    <Button variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
      {t('New ticket')}
    </Button>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Support')}
        description={isManager ? t('Tickets raised by anyone in your institution.') : t('Ask the PeopleNIT team for help and follow the conversation here.')}
        actions={newButton}
      />
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
          exportFileName="support-tickets"
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
              {isManager && <Checkbox label={t('Only mine')} checked={mine} onChange={(e) => { setMine(e.target.checked); tp.setPage(1); }} />}
            </div>
          }
          actions={[{ label: t('Open'), icon: 'view', onClick: (r) => setOpenId(r.id) }]}
          emptyTitle={t('No tickets')}
          emptyDescription={t('Stuck on something? Open a ticket and the PeopleNIT team will reply here.')}
          emptyAction={
            <Button size="sm" variant="gradient" leftIcon={<LifeBuoy className="w-4 h-4" />} onClick={() => setCreating(true)}>
              {t('New ticket')}
            </Button>
          }
        />
      )}
      <NewTicketModal isOpen={creating} onClose={() => setCreating(false)} onCreated={(tk) => setOpenId(tk.id)} />
      <TicketDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};

export default SupportTickets;
