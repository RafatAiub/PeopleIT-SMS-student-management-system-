import { NotificationChannel } from '@prisma/client';
import { NotificationChannelAdapter } from './channel.types';
import { inAppChannel } from './inApp.channel';
import { emailChannel } from './email.channel';
import { smsChannel } from './sms.channel';

const ADAPTERS: Partial<Record<NotificationChannel, NotificationChannelAdapter>> = {
  [NotificationChannel.IN_APP]: inAppChannel,
  [NotificationChannel.EMAIL]: emailChannel,
  [NotificationChannel.SMS]: smsChannel,
};

/**
 * Resolves the adapter for a channel. Returns undefined for a channel that has
 * no adapter registered yet, so the worker records SKIPPED instead of crashing
 * on a job for a channel this deployment does not implement.
 */
export function channelFor(channel: NotificationChannel): NotificationChannelAdapter | undefined {
  return ADAPTERS[channel];
}

/** Registered at module load so PR-by-PR channel additions are one-line. */
export function registerChannel(adapter: NotificationChannelAdapter): void {
  ADAPTERS[adapter.channel] = adapter;
}

export * from './channel.types';
