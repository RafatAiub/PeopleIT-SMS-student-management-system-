import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../config/prisma';
import { getSystemActorUserId } from '../utils/systemActor';

const GRACE_PERIOD_DAYS = 7;

/**
 * Subscription lifecycle scan — idempotent, safe to run repeatedly and
 * callable directly (e.g. from tests) independent of the BullMQ wiring.
 *
 *   TRIALING -> EXPIRED   (trial lapsed, never paid)
 *   ACTIVE   -> GRACE     (period lapsed, grace window starts)
 *   GRACE    -> EXPIRED + Institution.isActive = false (grace lapsed, hard suspend)
 */
export async function runSubscriptionLifecycleScan(): Promise<{ transitioned: number }> {
  const now = new Date();
  let transitioned = 0;

  // TRIALING -> EXPIRED
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
        const graceEndsAt = new Date(sub.currentPeriodEnd as Date);
        graceEndsAt.setDate(graceEndsAt.getDate() + GRACE_PERIOD_DAYS);
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
    // AuditLog.userId is a required (non-nullable) FK — resolve a fallback
    // "system actor" (earliest SUPER_ADMIN) once for the whole batch. If
    // none exists, the audit write is skipped for that row (logged as a
    // warning); the Subscription.status/Institution.isActive transition
    // itself remains the source of truth either way.
    const systemActorId = await getSystemActorUserId();

    for (const sub of expiring) {
      await prisma.$transaction(async (tx) => {
        const updateResult = await tx.subscription.updateMany({
          where: { id: sub.id, status: 'GRACE' },
          data: { status: 'EXPIRED' },
        });
        if (updateResult.count !== 1) return;

        await tx.institution.update({ where: { id: sub.institutionId }, data: { isActive: false } });

        if (systemActorId) {
          await tx.auditLog.create({
            data: {
              institutionId: sub.institutionId,
              userId: systemActorId,
              action: 'AUTO_SUSPEND',
              resource: 'Institution',
              resourceId: sub.institutionId,
              metadata: { reason: 'Subscription grace period expired' },
            },
          });
        } else {
          logger.warn('Skipped AUTO_SUSPEND audit log: no SUPER_ADMIN user exists to act as system actor', {
            institutionId: sub.institutionId,
          });
        }
      });
    }
    transitioned += expiring.length;
  }

  logger.info('Subscription lifecycle scan complete', {
    transitioned,
    trialExpired: trialExpired.count,
    movedToGrace: nowGrace.length,
    hardSuspended: expiring.length,
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
