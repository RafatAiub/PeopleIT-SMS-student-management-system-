import { CampaignChannel, EmailPriority, NotificationChannel, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { sendSms } from '../../utils/sms.service';
import { sendEmail } from '../email/sender';
import { buildEmailLayout } from '../email/layout';
import { paragraph } from '../email/components';
import { unsubscribeUrl } from '../email/unsubscribe';
import {
  AddressedRecipient,
  addressRecipients,
  loadTeacherScope,
  normalizeAudience,
  resolveRecipients,
} from './campaigns.audience';
import { isDemoChannel } from './campaigns.channels';
import { countSmsSegments, personalize } from './smsSegments';

// =============================================================================
// Campaign runner — sends a claimed (status SENDING) campaign in batches.
// =============================================================================
// Runs in-process (setImmediate / the scheduler tick), never through BullMQ,
// so campaigns keep working while Redis is down — the same reasoning as
// holidays/holiday.scheduler.ts.
//
// Idempotency: every (campaign x address) claims one NotificationDelivery row
// keyed `campaign:<id>:<address>`. A crash mid-send followed by a resume skips
// every address already SENT, so nobody gets the message twice.

export const BATCH_SIZE = 50;
export const CAMPAIGN_TEMPLATE_PREFIX = 'CAMPAIGN:';
const DEMO_REASON = 'demo mode — provider not configured, nothing transmitted';

const running = new Set<string>();

export function campaignTemplateKey(campaignId: string): string {
  return `${CAMPAIGN_TEMPLATE_PREFIX}${campaignId}`;
}

export function campaignDedupeKey(campaignId: string, address: string): string {
  return `campaign:${campaignId}:${address}`;
}

interface SendOutcome {
  ok: boolean;
  providerRef?: string;
  notificationId?: string;
  error?: string;
}

async function transmit(
  channel: CampaignChannel,
  institutionId: string,
  campaign: { id: string; subject: string | null },
  to: AddressedRecipient,
  body: string,
  institution: { name: string; logoUrl: string | null; color: string | null },
): Promise<SendOutcome> {
  try {
    if (channel === 'SMS') {
      const result = await sendSms(to.address, body);
      return result.success ? { ok: true, providerRef: result.message.slice(0, 190) } : { ok: false, error: result.message };
    }
    if (channel === 'EMAIL') {
      // Owner decision §3: campaigns are the one place List-Unsubscribe (RFC
      // 8058, one-click) belongs — never on receipts/OTPs/invites.
      const unsubUrl = unsubscribeUrl({ email: to.address, institutionId });
      const html = buildEmailLayout({
        preheader: body.slice(0, 150),
        heading: campaign.subject || 'Message from your school',
        bodyHtml: paragraph(body),
        institution,
        footerExtra: `<a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe from these emails</a>`,
      });
      const result = await sendEmail({
        to: to.address,
        toName: to.name,
        subject: campaign.subject || 'Message from your school',
        html,
        text: body,
        template: 'campaign',
        priority: EmailPriority.P2_BULK,
        institutionId,
        fromName: institution.name,
        tags: [`campaign:${campaign.id}`],
        idempotencyKey: `campaign:${campaign.id}:${to.address}`,
        listUnsubscribe: { url: unsubUrl },
      });
      if (result.status === 'SENT') return { ok: true, providerRef: result.logId };
      return { ok: false, error: result.error ?? result.status };
    }
    const created = await prisma.notification.create({
      data: {
        institutionId,
        recipientUserId: to.address,
        type: 'CAMPAIGN',
        title: campaign.subject || 'New message',
        body,
        data: { campaignId: campaign.id, link: '/notifications' },
      },
      select: { id: true },
    });
    return { ok: true, providerRef: created.id, notificationId: created.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Processes one recipient; returns whether it counts as delivered ("would send" in demo). */
async function processRecipient(params: {
  campaign: { id: string; institutionId: string; channel: CampaignChannel; subject: string | null; body: string };
  institutionName: string;
  institutionBranding: { name: string; logoUrl: string | null; color: string | null };
  recipient: AddressedRecipient;
  demo: boolean;
  usage: Prisma.UsageRecordCreateManyInput[];
}): Promise<boolean> {
  const { campaign, recipient, demo } = params;
  const dedupeKey = campaignDedupeKey(campaign.id, recipient.address);

  const delivery = await prisma.notificationDelivery.upsert({
    where: { dedupeKey },
    create: {
      institutionId: campaign.institutionId,
      channel: campaign.channel as NotificationChannel,
      recipient: recipient.address,
      templateKey: campaignTemplateKey(campaign.id),
      dedupeKey,
      status: 'QUEUED',
    },
    update: {},
    select: { id: true, status: true },
  });

  // Already handled by an earlier (crashed / resumed) run.
  if (delivery.status === 'SENT') return true;
  if (delivery.status === 'SKIPPED' && demo) return true;

  if (demo) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'SKIPPED', error: DEMO_REASON },
    });
    return true;
  }

  // Claim: QUEUED/FAILED -> attempt. updateMany with a status guard so two
  // processes resuming the same campaign never both send.
  const claimed = await prisma.notificationDelivery.updateMany({
    where: { id: delivery.id, status: { in: ['QUEUED', 'FAILED', 'SKIPPED'] } },
    data: { status: 'QUEUED', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return false;

  const body = personalize(campaign.body, { name: recipient.name, institution: params.institutionName });
  const outcome = await transmit(campaign.channel, campaign.institutionId, campaign, recipient, body, params.institutionBranding);

  if (outcome.ok) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'SENT',
        providerRef: outcome.providerRef ?? null,
        notificationId: outcome.notificationId ?? null,
        error: null,
      },
    });
    if (campaign.channel === 'SMS' || campaign.channel === 'EMAIL') {
      params.usage.push({
        institutionId: campaign.institutionId,
        metric: campaign.channel,
        quantity: campaign.channel === 'SMS' ? Math.max(1, countSmsSegments(body).segments) : 1,
        meta: { campaignId: campaign.id, source: 'campaign' },
      });
    }
    return true;
  }

  await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: { status: 'FAILED', error: (outcome.error ?? 'unknown error').slice(0, 2000) },
  });
  return false;
}

/**
 * Sends a campaign that has already been claimed (status SENDING). Safe to
 * call repeatedly: an in-process guard stops concurrent runs, and delivery
 * dedupe makes a re-run after a crash resume rather than repeat.
 */
export async function runCampaign(campaignId: string): Promise<void> {
  if (running.has(campaignId)) return;
  running.add(campaignId);

  try {
    const campaign = await prisma.messageCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        institutionId: true,
        channel: true,
        subject: true,
        body: true,
        audience: true,
        status: true,
        createdByUserId: true,
        createdBy: { select: { role: true } },
        institution: { select: { name: true, logoUrl: true, themeColor: true } },
      },
    });
    if (!campaign || campaign.status !== 'SENDING') return;

    const demo = isDemoChannel(campaign.channel);
    const audience = normalizeAudience(campaign.audience);
    const scope =
      campaign.createdBy.role === 'TEACHER'
        ? await loadTeacherScope(campaign.institutionId, campaign.createdByUserId)
        : undefined;

    const people = await resolveRecipients(campaign.institutionId, audience, scope);
    const { addressed } = addressRecipients(campaign.channel, people);

    await prisma.messageCampaign.update({
      where: { id: campaign.id },
      data: { recipientCount: addressed.length, isDemo: demo, successCount: 0, failureCount: 0 },
    });

    let success = 0;
    let failure = 0;
    let cancelled = false;

    for (let i = 0; i < addressed.length; i += BATCH_SIZE) {
      // Honour a cancel issued mid-send between batches.
      const current = await prisma.messageCampaign.findUnique({
        where: { id: campaign.id },
        select: { status: true },
      });
      if (!current || current.status !== 'SENDING') {
        cancelled = true;
        break;
      }

      const usage: Prisma.UsageRecordCreateManyInput[] = [];
      const results = await Promise.all(
        addressed.slice(i, i + BATCH_SIZE).map((recipient) =>
          processRecipient({
            campaign,
            institutionName: campaign.institution.name,
            institutionBranding: { name: campaign.institution.name, logoUrl: campaign.institution.logoUrl, color: campaign.institution.themeColor },
            recipient,
            demo,
            usage,
          }).catch(
            (error) => {
              logger.error('Campaign recipient failed', {
                campaignId: campaign.id,
                error: error instanceof Error ? error.message : String(error),
              });
              return false;
            },
          ),
        ),
      );
      for (const ok of results) {
        if (ok) success++;
        else failure++;
      }

      if (usage.length) {
        await prisma.usageRecord.createMany({ data: usage }).catch((error) => {
          logger.error('Failed to record campaign usage', {
            campaignId: campaign.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      await prisma.messageCampaign.update({
        where: { id: campaign.id },
        data: { successCount: success, failureCount: failure },
      });
    }

    if (cancelled) {
      await prisma.messageCampaign.updateMany({
        where: { id: campaign.id },
        data: { successCount: success, failureCount: failure },
      });
      logger.info('Campaign stopped (cancelled mid-send)', { campaignId: campaign.id, success, failure });
      return;
    }

    const finalStatus = addressed.length > 0 && success === 0 ? 'FAILED' : 'SENT';
    await prisma.messageCampaign.updateMany({
      where: { id: campaign.id, status: 'SENDING' },
      data: { status: finalStatus, sentAt: new Date(), successCount: success, failureCount: failure },
    });

    logger.info(demo ? '[DEMO] Campaign processed — nothing transmitted' : 'Campaign sent', {
      campaignId: campaign.id,
      channel: campaign.channel,
      recipients: addressed.length,
      success,
      failure,
    });
  } catch (error) {
    logger.error('Campaign run crashed', {
      campaignId,
      error: error instanceof Error ? error.message : String(error),
    });
    await prisma.messageCampaign
      .updateMany({ where: { id: campaignId, status: 'SENDING' }, data: { status: 'FAILED' } })
      .catch(() => undefined);
  } finally {
    running.delete(campaignId);
  }
}

/** Fire-and-forget: the HTTP request returns immediately, the send continues in-process. */
export function runCampaignInBackground(campaignId: string): void {
  setImmediate(() => {
    runCampaign(campaignId).catch(() => undefined);
  });
}

export function isRunning(campaignId: string): boolean {
  return running.has(campaignId);
}
