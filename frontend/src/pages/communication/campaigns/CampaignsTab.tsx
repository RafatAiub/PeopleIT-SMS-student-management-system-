import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { ErrorState, Button, Select } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { useTableParams } from '@/hooks/useTableParams';
import { useT, formatDate } from '@/i18n';
import { useCampaigns } from './campaigns.queries';
import { CampaignStatusBadge, ChannelBadge } from './campaigns.badges';
import CampaignComposer from './CampaignComposer';
import CampaignDetailDrawer from './CampaignDetailDrawer';
import type { Campaign, CampaignChannel, CampaignDetail, CampaignStatus } from './campaigns.types';

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const CHANNEL_OPTIONS: { value: CampaignChannel; label: string }[] = [
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'IN_APP', label: 'In-app' },
];

function excerpt(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function CampaignsTab() {
  const t = useT();
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();
  const { data, isLoading, isError, refetch } = useCampaigns({
    page: params.page,
    pageSize: params.pageSize,
    search: debouncedSearch,
    status: (params.filters.status || '') as CampaignStatus | '',
    channel: (params.filters.channel || '') as CampaignChannel | '',
  });

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingCampaign(null);
    setComposerOpen(true);
  };
  const openEdit = (campaign: CampaignDetail) => {
    setDetailId(null);
    setEditingCampaign(campaign);
    setComposerOpen(true);
  };

  const columns: Column<Campaign>[] = [
    {
      key: 'body',
      header: t('Message'),
      primary: true,
      render: (c) => (
        <div className="min-w-0">
          {c.subject && <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{c.subject}</p>}
          <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{excerpt(c.body)}</p>
        </div>
      ),
    },
    { key: 'channel', header: t('Channel'), render: (c) => <ChannelBadge channel={c.channel} /> },
    { key: 'status', header: t('Status'), render: (c) => <CampaignStatusBadge status={c.status} /> },
    { key: 'recipientCount', header: t('Recipients'), accessor: 'recipientCount', align: 'right' },
    {
      key: 'counts',
      header: t('Sent / Failed'),
      hideOnMobile: true,
      render: (c) => `${c.successCount} / ${c.failureCount}`,
    },
    {
      key: 'demo',
      header: t('Demo'),
      hideOnMobile: true,
      render: (c) =>
        c.isDemo ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 rounded">
            {t('Demo')}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'when',
      header: t('Scheduled / Sent'),
      hideOnMobile: true,
      render: (c) => (c.sentAt ? formatDate(c.sentAt, true) : c.scheduledAt ? formatDate(c.scheduledAt, true) : '—'),
    },
    {
      key: 'createdBy',
      header: t('Created by'),
      hideOnMobile: true,
      render: (c) => `${c.createdBy.firstName} ${c.createdBy.lastName}`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
          {t('New campaign')}
        </Button>
      </div>

      {isError ? (
        <ErrorState message={t('Could not load campaigns.')} onRetry={() => refetch()} />
      ) : (
      <DataTable
        data={data?.campaigns ?? []}
        columns={columns}
        isLoading={isLoading}
        serverPagination
        totalCount={data?.total ?? 0}
        page={params.page}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSize={params.pageSize}
        serverSearch
        onSearch={setSearch}
        searchPlaceholder={t('Search campaigns by subject or message…')}
        onRowClick={(c) => setDetailId(c.id)}
        emptyTitle={t('No campaigns yet')}
        emptyDescription={t('Create your first campaign to message students, guardians or staff.')}
        emptyAction={
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            {t('New campaign')}
          </Button>
        }
        toolbar={
          <>
            <Select
              aria-label={t('Filter by status')}
              value={params.filters.status || ''}
              onChange={(e) => setFilter('status', e.target.value)}
              placeholder={t('All statuses')}
              options={STATUS_OPTIONS}
              className="w-auto min-w-36"
            />
            <Select
              aria-label={t('Filter by channel')}
              value={params.filters.channel || ''}
              onChange={(e) => setFilter('channel', e.target.value)}
              placeholder={t('All channels')}
              options={CHANNEL_OPTIONS}
              className="w-auto min-w-32"
            />
          </>
        }
      />
      )}


      <CampaignComposer isOpen={composerOpen} onClose={() => setComposerOpen(false)} campaign={editingCampaign} />
      <CampaignDetailDrawer campaignId={detailId} onClose={() => setDetailId(null)} onEdit={openEdit} />
    </div>
  );
}
