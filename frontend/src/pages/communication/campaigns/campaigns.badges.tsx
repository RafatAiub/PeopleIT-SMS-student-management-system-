import React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui';
import type { CampaignChannel, CampaignStatus, DeliveryStatus } from './campaigns.types';

// The shared <StatusBadge> component's status map doesn't cover every
// campaign/delivery status (SCHEDULED, SENDING, FAILED, QUEUED, SKIPPED), and
// it lives under src/components/** which this task may not edit — so
// campaigns use their own small badge mapping instead.

const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SCHEDULED: { label: 'Scheduled', variant: 'warning' },
  SENDING: { label: 'Sending', variant: 'info' },
  SENT: { label: 'Sent', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
};

export const CampaignStatusBadge: React.FC<{ status: CampaignStatus }> = ({ status }) => {
  const s = CAMPAIGN_STATUS[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; variant: BadgeVariant }> = {
  QUEUED: { label: 'Queued', variant: 'neutral' },
  SENT: { label: 'Sent', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  SKIPPED: { label: 'Skipped', variant: 'warning' },
};

export const DeliveryStatusBadge: React.FC<{ status: DeliveryStatus }> = ({ status }) => {
  const s = DELIVERY_STATUS[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

const CHANNEL_LABEL: Record<CampaignChannel, string> = { SMS: 'SMS', EMAIL: 'Email', IN_APP: 'In-app' };

export const ChannelBadge: React.FC<{ channel: CampaignChannel }> = ({ channel }) => (
  <Badge variant="accent">{CHANNEL_LABEL[channel] ?? channel}</Badge>
);
