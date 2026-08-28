import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../config/prisma';
import { addGracePeriod, applyHardSuspend } from '../modules/billing/subscriptionLifecycle';
import * as billingRepository from '../modules/billing/billing.repository';

/**
 * Subscription lifecycle scan — idempotent, safe to run repeatedly and
 * callable directly (e.g. from tests) independent of the BullMQ wiring.
 *
 *   TRIALING -> EXPIRED   (trial lapsed, never paid)
 *   ACTIVE   -> GRACE     (period lapsed, grace window starts)
 *   GRACE    -> EXPIRED + Institution.isActive = false (grace lapsed, hard suspend)
 *   INITIATED SubscriptionPayment older than 24h -> FAILED (stale pending-payment cleanup)
 */
export async function runSubscriptionLifecycleScan(): Promise<{ transitioned: number }> {
  const now = new Date();
  let transitioned = 0;

  // TRIALING -> EXPIRED. Deliberately a plain status update, no
  // Institution.isActive flip — see the reconciliation note on
  // computeEffectiveSubscriptionState in subscriptionLifecycle.ts for why.
  const trialExpired = await prisma.subscription.updateMany({
    where: { status: 'TRIALING', trialEndsAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  transitioned += trialExpired.count;

  // ACTIVE -> GRACE. updateMany can't reference each row's own
  // currentPeriodEnd to derive graceEndsAt, so loop individually — fine at
  // this table's expected scale (one row per institution, not per-student).
  const nowGrace = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
    select: { id: true, currentPeriodEnd: true },
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
  }

  // GRACE -> EXPIRED + Institution.isActive = false
  const expiring = await prisma.subscription.findMany({
    where: { status: 'GRACE', graceEndsAt: { lt: now } },
    select: { id: true, institutionId: true },
  });

  if (expiring.length) {
    for (const sub of expiring) {
      await applyHardSuspend(sub.institutionId, sub.id);
    }
    transitioned += expiring.length;
  }

  // Stale INITIATED SubscriptionPayments (older than 24h) -> FAILED, so a
  // never-completed super-admin-generated or tenant self-checkout payment
  // link doesn't linger forever as a "pending payment" nudge.
  const staleCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stalePaymentsFailed = await billingRepository.markStaleInitiatedPaymentsFailed(staleCutoff);

  logger.info('Subscription lifecycle scan complete', {
    transitioned,
    trialExpired: trialExpired.count,
    movedToGrace: nowGrace.length,
    hardSuspended: expiring.length,
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
  {
    connection: {
      url: env.REDIS_URL,
      maxRetriesPerRequest: null,
    } as any,
  },
);

billingWorker.on('completed', (job) => {
  logger.info(`Billing job ${job.id} completed successfully`);
});

billingWorker.on('failed', (job, err) => {
  logger.error(`Billing job ${job?.id} failed`, { error: err.message });
});
