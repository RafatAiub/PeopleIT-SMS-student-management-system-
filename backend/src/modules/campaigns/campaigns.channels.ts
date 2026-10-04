import { CampaignChannel } from '@prisma/client';
import { env } from '../../config/env';

// =============================================================================
// Which campaign channels can really transmit in this deployment.
// =============================================================================
// Reuses the exact env gates the notification pipeline uses (sms.channel.ts,
// utils/mailer.ts) — no new variables. A channel that is not configured runs
// the campaign in DEMO mode: recipients are resolved and counted as
// "would send", nothing leaves the server, and the campaign is marked isDemo.

export interface ChannelConfig {
  SMS: boolean;
  EMAIL: boolean;
  IN_APP: boolean;
}

export function channelConfig(): ChannelConfig {
  return {
    // Greenweb gateway — see utils/sms.service.ts.
    SMS: env.SMS_ENABLED && !!env.GREENWEB_API_TOKEN,
    // Real SMTP only; the jsonTransport fallback renders but never delivers.
    EMAIL: env.EMAIL_ENABLED && !!env.SMTP_HOST,
    // In-app writes a Notification row — needs no provider.
    IN_APP: true,
  };
}

export function isDemoChannel(channel: CampaignChannel): boolean {
  return !channelConfig()[channel];
}
