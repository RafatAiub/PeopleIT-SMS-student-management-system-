import React, { useState } from 'react';
import { Send, Pencil, Ban, Trash2 } from 'lucide-react';
import { Alert, Button, DescriptionList, Drawer, ErrorState, Select, Skeleton, SkeletonStatGrid, StatCard } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate, formatNumber } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import {
  useCampaign,
  useCampaignDeliveries,
  useCancelCampaign,
  useDeleteCampaign,
  useSendCampaign,
} from './campaigns.queries';
import { CampaignStatusBadge, ChannelBadge, DeliveryStatusBadge } from './campaigns.badges';
import type { CampaignDetail, Delivery, DeliveryStatus } from './campaigns.types';

interface CampaignDetailDrawerProps {
  campaignId: string | null;
  onClose: () => void;
  onEdit: (campaign: CampaignDetail) => void;
}

export default function CampaignDetailDrawer({ campaignId, onClose, onEdit }: CampaignDetailDrawerProps) {
  const t = useT();
  const { data: campaign, isLoading, isError, refetch } = useCampaign(campaignId ?? undefined, { poll: true });

  const { params, setPage, setFilter } = useTableParams();
  const { data: deliveriesData, isLoading: deliveriesLoading } = useCampaignDeliveries(campaignId ?? undefined, {
    page: params.page,
    pageSize: params.pageSize,
    status: (params.filters.status || '') as DeliveryStatus | '',
  });

  const sendMutation = useSendCampaign();
  const cancelMutation = useCancelCampaign();
  const deleteMutation = useDeleteCampaign();
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);

  const canEdit = campaign && ['DRAFT', 'SCHEDULED'].includes(campaign.status);
  const canSend = campaign?.status === 'DRAFT';
  const canCancel = campaign && ['DRAFT', 'SCHEDULED', 'SENDING'].includes(campaign.status);
  const canDelete = campaign && ['DRAFT', 'SENT', 'FAILED', 'CANCELLED'].includes(campaign.status);

  const columns: Column<Delivery>[] = [
    { key: 'recipient', header: t('Recipient'), accessor: 'recipient', primary: true },
    { key: 'status', header: t('Status'), render: (r) => <DeliveryStatusBadge status={r.status} /> },
    { key: 'error', header: t('Error'), render: (r) => r.error || '—', hideOnMobile: true },
    { key: 'attempts', header: t('Attempts'), accessor: 'attempts', align: 'right', hideOnMobile: true },
    { key: 'updatedAt', header: t('Updated'), render: (r) => formatDate(r.updatedAt, true) },
  ];

  const handleConfirm = async () => {
    if (!campaign || !confirmAction) return;
    if (confirmAction === 'cancel') await cancelMutation.mutateAsync(campaign.id);
    else await deleteMutation.mutateAsync(campaign.id).then(() => onClose());
    setConfirmAction(null);
  };

  return (
    <Drawer isOpen={!!campaignId} onClose={onClose} title={t('Campaign')} width="xl">
      {isLoading ? (
        <div className="space-y-4">
          <SkeletonStatGrid count={3} />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError || !campaign ? (
        <ErrorState message={t('Could not load this campaign.')} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <CampaignStatusBadge status={campaign.status} />
            <ChannelBadge channel={campaign.channel} />
            {campaign.isDemo && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 rounded">
                {t('Demo')}
              </span>
            )}
          </div>

          {campaign.demo && (
            <Alert tone="warning" title={t('Demo mode')}>
              {t('Provider not configured — recipients were counted but nothing was really sent.')}
            </Alert>
          )}

          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t('Recipients')} value={formatNumber(campaign.recipientCount)} tone="primary" />
            <StatCard label={t('Delivered')} value={formatNumber(campaign.successCount)} tone="success" />
            <StatCard label={t('Failed')} value={formatNumber(campaign.failureCount)} tone="danger" />
          </div>

          <DescriptionList
            columns={2}
            items={[
              { label: t('Created by'), value: `${campaign.createdBy.firstName} ${campaign.createdBy.lastName}` },
              { label: t('Created'), value: formatDate(campaign.createdAt, true) },
              ...(campaign.subject ? [{ label: t('Subject'), value: campaign.subject }] : []),
              ...(campaign.scheduledAt ? [{ label: t('Scheduled for'), value: formatDate(campaign.scheduledAt, true) }] : []),
              ...(campaign.sentAt ? [{ label: t('Sent at'), value: formatDate(campaign.sentAt, true) }] : []),
              ...(campaign.sms
                ? [
                    {
                      label: t('SMS segments'),
                      value: `${formatNumber(campaign.sms.segments)} (${campaign.sms.encoding === 'UNICODE' ? t('Bangla/Unicode') : t('GSM')})`,
                    },
                  ]
                : []),
            ]}
          />

          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('Message')}</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-white/8 p-3">
              {campaign.body}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('Delivery breakdown')}</p>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {(['QUEUED', 'SENT', 'FAILED', 'SKIPPED'] as const).map((key) => (
                <div key={key} className="rounded-lg border border-slate-200 dark:border-white/8 py-2">
                  <p className="font-semibold text-slate-900 dark:text-slate-50 tabular-nums">{formatNumber(campaign.deliveryStats[key])}</p>
                  <p className="text-slate-500 dark:text-slate-400">{t(key.charAt(0) + key.slice(1).toLowerCase())}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button type="button" variant="outline" size="sm" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onEdit(campaign)}>
                {t('Edit')}
              </Button>
            )}
            {canSend && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                leftIcon={<Send className="w-3.5 h-3.5" />}
                isLoading={sendMutation.isPending}
                onClick={() => sendMutation.mutate({ id: campaign.id, scheduledAt: null })}
              >
                {t('Send now')}
              </Button>
            )}
            {canCancel && (
              <Button type="button" variant="secondary" size="sm" leftIcon={<Ban className="w-3.5 h-3.5" />} onClick={() => setConfirmAction('cancel')}>
                {t('Cancel campaign')}
              </Button>
            )}
            {canDelete && (
              <Button type="button" variant="danger-soft" size="sm" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmAction('delete')}>
                {t('Delete')}
              </Button>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">{t('Delivery log')}</p>
            <DataTable
              data={deliveriesData?.deliveries ?? []}
              columns={columns}
              isLoading={deliveriesLoading}
              serverPagination
              totalCount={deliveriesData?.total ?? 0}
              page={params.page}
              onPageChange={setPage}
              pageSize={params.pageSize}
              emptyTitle={t('No delivery attempts yet')}
              emptyDescription={t('Delivery attempts appear here once the campaign starts sending.')}
              toolbar={
                <Select
                  aria-label={t('Filter by status')}
                  value={params.filters.status || ''}
                  onChange={(e) => setFilter('status', e.target.value)}
                  placeholder={t('All statuses')}
                  options={[
                    { value: 'QUEUED', label: t('Queued') },
                    { value: 'SENT', label: t('Sent') },
                    { value: 'FAILED', label: t('Failed') },
                    { value: 'SKIPPED', label: t('Skipped') },
                  ]}
                  className="w-auto min-w-36"
                />
              }
            />
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmAction}
        title={confirmAction === 'cancel' ? t('Cancel campaign?') : t('Delete campaign?')}
        message={
          confirmAction === 'cancel'
            ? t('The campaign will stop sending at its next batch boundary. This cannot be undone.')
            : t('This permanently deletes the campaign. This cannot be undone.')
        }
        confirmLabel={confirmAction === 'cancel' ? t('Cancel campaign') : t('Delete')}
        variant="danger"
        isLoading={cancelMutation.isPending || deleteMutation.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </Drawer>
  );
}
