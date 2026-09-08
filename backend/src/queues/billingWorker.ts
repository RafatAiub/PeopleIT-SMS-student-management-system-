import { Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { prisma } from '../config/prisma';
import { createBullWorkerConnection } from '../config/redis';
import { addGracePeriod, applyHardSuspend } from '../modules/billing/subscriptionLifecycle';
import * as billingRepository from '../modules/billing/billing.repository';
import { notifySubscriptionEvent, formatDate } from '../modules/billing/billing.notifications';
import type { SubscriptionNotificationInput } from '../modules/billing/billing.notifications';

/** Whole days from `from` until `target`, floor-clamped at 0. */
function daysUntil(target: Date, from: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

const TRIAL_ENDING_WINDOW_DAYS = 3;

/**
 * Subscription lifecycle scan — idempotent, safe to run repeatedly and
 * callable directly (e.g. from tests) independent of the BullMQ wiring.
 *
 *   TRIALING -> EXPIRED   (trial lapsed, never paid)          -> notify admin (SUBSCRIPTION_TRIAL_EXPIRED)
 *   ACTIVE   -> GRACE     (period lapsed, grace window starts) -> notify admin (SUBSCRIPTION_GRACE)
 *   GRACE    -> EXPIRED + Institution.isActive = false         -> notify admin + super (SUBSCRIPTION_SUSPENDED)
 *   TRIALING ending within 3 days                              -> notify admin (SUBSCRIPTION_TRIAL_ENDING), one-shot
 *   INITIATED SubscriptionPayment older than 24h -> FAILED     (stale pending-payment cleanup)
 *
 * Notifications are de-duplicated by a stable contextId, so re-running the
 * scan never re-sends; they are dispatched together at the end of the scan.
 */
export async function runSubscriptionLifecycleScan(): Promise<{ transitioned: number }> {
  const now = new Date();
  let transitioned = 0;

  // Notifications are collected and dispatched together at the end of the scan
  // rather than fired mid-loop: the scan job only "completes" once they have
  // actually been dispatched, and one failed emit cannot abort the status
  // transitions that already happened.
  const notifications: SubscriptionNotificationInput[] = [];

  // ── TRIALING -> EXPIRED. Fetch the affected rows first so each institute
  // admin can be notified; the status write stays a bulk updateMany. No
  // Institution.isActive flip here — see subscriptionLifecycle.ts.
  const trialLapsed = await prisma.subscription.findMany({
    where: { status: 'TRIALING', trialEndsAt: { lt: now } },
    select: { id: true, institutionId: true, trialEndsAt: true },
  });
  if (trialLapsed.length) {
    await prisma.subscription.updateMany({
      where: { id: { in: trialLapsed.map((s) => s.id) } },
      data: { status: 'EXPIRED' },
    });
    transitioned += trialLapsed.length;
    for (const sub of trialLapsed) {
      // A lapsed trial goes straight to EXPIRED with no grace window and no
      // Institution.isActive flip (see subscriptionLifecycle.ts), so this is
      // NOT a SUBSCRIPTION_GRACE — that copy promises a countdown that does
      // not exist here.
      notifications.push({
        type: 'SUBSCRIPTION_TRIAL_EXPIRED',
        institutionId: sub.institutionId,
        contextId: `${sub.id}:trial-lapsed`,
        vars: { endedOn: formatDate(sub.trialEndsAt) },
      });
    }
  }

  // ── ACTIVE -> GRACE.
  const nowGrace = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
    select: { id: true, institutionId: true, currentPeriodEnd: true },
  });
  if (nowGrace.length) {
    await Promise.all(
      nowGrace.map((sub) => {
        const graceEndsAt = addGracePeriod(sub.currentPeriodEnd as Date);
        return prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'GRACE', graceEndsAt },
        });
      }),
    );
    transitioned += nowGrace.length;
    for (const sub of nowGrace) {
      const graceEndsAt = addGracePeriod(sub.currentPeriodEnd as Date);
      notifications.push({
        type: 'SUBSCRIPTION_GRACE',
        institutionId: sub.institutionId,
        contextId: `${sub.id}:grace:${(sub.currentPeriodEnd as Date).toISOString()}`,
        vars: { daysRemaining: daysUntil(graceEndsAt, now), graceEndsAt: formatDate(graceEndsAt) },
      });
    }
  }

  // ── GRACE -> EXPIRED + Institution.isActive = false
  const expiring = await prisma.subscription.findMany({
    where: { status: 'GRACE', graceEndsAt: { lt: now } },
    select: { id: true, institutionId: true, graceEndsAt: true },
  });
  if (expiring.length) {
    for (const sub of expiring) {
      await applyHardSuspend(sub.institutionId, sub.id);
      notifications.push({
        type: 'SUBSCRIPTION_SUSPENDED',
        institutionId: sub.institutionId,
        audience: 'both',
        contextId: `${sub.id}:suspended:${formatDate(sub.graceEndsAt)}`,
        vars: {},
      });
    }
    transitioned += expiring.length;
  }

  // ── Proactive: TRIALING subs ending within the warning window. One-shot per
  // subscription via a fixed contextId (a trial ends exactly once).
  const trialEndingSoon = await prisma.subscription.findMany({
    where: {
      status: 'TRIALING',
      trialEndsAt: {
        gte: now,
        lt: new Date(now.getTime() + TRIAL_ENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true, institutionId: true, trialEndsAt: true },
  });
  for (const sub of trialEndingSoon) {
    notifications.push({
      type: 'SUBSCRIPTION_TRIAL_ENDING',
      institutionId: sub.institutionId,
      contextId: `${sub.id}:trial-ending`,
      vars: {
        daysRemaining: daysUntil(sub.trialEndsAt as Date, now),
        periodEnd: formatDate(sub.trialEndsAt),
      },
    });
  }

  // ── Stale INITIATED SubscriptionPayments (older than 24h) -> FAILED.
  const staleCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stalePaymentsFailed = await billingRepository.markStaleInitiatedPaymentsFailed(staleCutoff);

  // Dispatch every notification the transitions above produced. Each is
  // isolated so one failure neither aborts the others nor fails the scan —
  // the status changes are already committed.
  await Promise.all(
    notifications.map((n) =>
      notifySubscriptionEvent(n).catch((error) => {
        logger.error('Failed to emit subscription lifecycle notification', {
          type: n.type,
          institutionId: n.institutionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    ),
  );

  logger.info('Subscription lifecycle scan complete', {
    transitioned,
    trialExpired: trialLapsed.length,
    movedToGrace: nowGrace.length,
    hardSuspended: expiring.length,
    trialEndingWarned: trialEndingSoon.length,
    stalePaymentsFailed,
  });

  return { transitioned };
}

export const billingWorker = new Worker(
  'subscriptionBilling',
  async (job: Job) => {
    logger.info(`Processing billing job ${job.id}`, { name: job.name });
    return runSubscriptionLifecycleScan();
  },
  { connection: createBullWorkerConnection('subscriptionBilling') },
);

billingWorker.on('completed', (job) => {
  logger.info(`Billing job ${job.id} completed successfully`);
});

billingWorker.on('failed', (job, err) => {
  logger.error(`Billing job ${job?.id} failed`, { error: err.message });
});
