import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { getSystemActorUserId } from '../../utils/systemActor';

// =============================================================================
// Subscription Lifecycle — pure state-computation + the hard-suspend side
// effect, shared by:
//   - billing.service.ts (getMySubscription: live per-request display)
//   - tenant.middleware.ts (setTenant: live per-request paywall enforcement)
//   - queues/billingWorker.ts (background lifecycle scan)
//
// Kept dependency-light on purpose: only `@prisma/client` types, ../../config/
// prisma, ../../utils/logger, ../../utils/systemActor. Do NOT import from
// billing.service.ts or billingWorker.ts here — both of those import FROM
// this module, so the reverse would create a cycle.
// =============================================================================

export const GRACE_PERIOD_DAYS = 7;

export type BannerLevel = 'none' | 'trial-ending' | 'renewal-due' | 'grace';

export interface SubscriptionLifecycleInput {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
}

export interface EffectiveSubscriptionState {
  effectiveStatus: SubscriptionStatus;
  daysRemaining: number;
  bannerLevel: BannerLevel;
  effectiveGraceEndsAt: Date | null;
  /** true for GRACE / EXPIRED / CANCELLED */
  isPaywalled: boolean;
  /**
   * true only when EXPIRED is newly detected THIS call (grace window just
   * lapsed) and wasn't already the stored status — see the reconciliation
   * note on computeEffectiveSubscriptionState below for why the TRIALING
   * branch never sets this to true.
   */
  requiresHardSuspend: boolean;
}

/** Whole-day difference between `target` and `from` (positive = in the future), floor-clamped at 0. */
function daysUntil(target: Date, from: Date): number {
  const diffMs = target.getTime() - from.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

/** Adds the grace window on top of a lapsed billing period end date. */
export function addGracePeriod(periodEnd: Date): Date {
  const result = new Date(periodEnd);
  result.setDate(result.getDate() + GRACE_PERIOD_DAYS);
  return result;
}

/**
 * Computes the LIVE effective state of a subscription as of `now`, without
 * mutating anything. Used both for per-request display (getMySubscription)
 * and for per-request paywall enforcement (tenant.middleware.ts), so a
 * lapsed subscription is reflected immediately rather than only after the
 * next background billingWorker scan (which remains the authoritative writer
 * of Subscription.status / Institution.isActive for the general case).
 *
 * ── TRIALING→EXPIRED hard-suspend reconciliation ──────────────────────────
 * The pre-existing billingWorker's TRIALING→EXPIRED transition is a plain
 * `Subscription.status` update with NO `Institution.isActive` flip — only
 * GRACE→EXPIRED hard-suspends the institution (see billingWorker.ts history).
 * To keep this live-compute path consistent with that established
 * background-job behavior, a lapsed trial (TRIALING branch below) is
 * reported as `effectiveStatus: 'EXPIRED'` / `isPaywalled: true` (so the
 * tenant admin UI can show a paywall banner immediately and
 * getMySubscription reflects it), but `requiresHardSuspend: false` —
 * it deliberately does NOT flip Institution.isActive or invoke
 * applyHardSuspend. Only ACTIVE/GRACE subscriptions whose grace window has
 * fully lapsed trigger `requiresHardSuspend: true`. A lapsed-trial
 * institution therefore stays logged-in-and-reachable (paywalled at the
 * application/UI level) until either it pays or the background worker's own
 * (unchanged) TRIALING→EXPIRED step runs — it is never hard-suspended by
 * this live path. This mirrors current production behavior exactly; no
 * regression, no new behavior invented here.
 */
export function computeEffectiveSubscriptionState(
  sub: SubscriptionLifecycleInput,
  now: Date = new Date(),
): EffectiveSubscriptionState {
  if (sub.status === 'TRIALING') {
    if (sub.trialEndsAt && sub.trialEndsAt < now) {
      return {
        effectiveStatus: 'EXPIRED',
        daysRemaining: 0,
        bannerLevel: 'grace',
        effectiveGraceEndsAt: null,
        isPaywalled: true,
        requiresHardSuspend: false, // see reconciliation note above
      };
    }

    const daysRemaining = sub.trialEndsAt ? daysUntil(sub.trialEndsAt, now) : 0;
    return {
      effectiveStatus: 'TRIALING',
      daysRemaining,
      bannerLevel: daysRemaining <= 3 ? 'trial-ending' : 'none',
      effectiveGraceEndsAt: null,
      isPaywalled: false,
      requiresHardSuspend: false,
    };
  }

  if (sub.status === 'ACTIVE') {
    if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
      const graceEndsAt = addGracePeriod(sub.currentPeriodEnd);
      if (graceEndsAt < now) {
        return {
          effectiveStatus: 'EXPIRED',
          daysRemaining: 0,
          bannerLevel: 'grace',
          effectiveGraceEndsAt: graceEndsAt,
          isPaywalled: true,
          requiresHardSuspend: true,
        };
      }

      return {
        effectiveStatus: 'GRACE',
        daysRemaining: daysUntil(graceEndsAt, now),
        bannerLevel: 'grace',
        effectiveGraceEndsAt: graceEndsAt,
        isPaywalled: true,
        requiresHardSuspend: false,
      };
    }

    const daysRemaining = sub.currentPeriodEnd ? daysUntil(sub.currentPeriodEnd, now) : 0;
    return {
      effectiveStatus: 'ACTIVE',
      daysRemaining,
      bannerLevel: daysRemaining <= 5 ? 'renewal-due' : 'none',
      effectiveGraceEndsAt: null,
      isPaywalled: false,
      requiresHardSuspend: false,
    };
  }

  if (sub.status === 'GRACE') {
    const graceEndsAt = sub.graceEndsAt ?? (sub.currentPeriodEnd ? addGracePeriod(sub.currentPeriodEnd) : now);
    if (graceEndsAt < now) {
      return {
        effectiveStatus: 'EXPIRED',
        daysRemaining: 0,
        bannerLevel: 'grace',
        effectiveGraceEndsAt: graceEndsAt,
        isPaywalled: true,
        requiresHardSuspend: true,
      };
    }

    return {
      effectiveStatus: 'GRACE',
      daysRemaining: daysUntil(graceEndsAt, now),
      bannerLevel: 'grace',
      effectiveGraceEndsAt: graceEndsAt,
      isPaywalled: true,
      requiresHardSuspend: false,
    };
  }

  // EXPIRED / CANCELLED — terminal, date-independent. Institution is
  // presumably already isActive=false via a prior hard-suspend by this
  // point, so no repeat write is needed here.
  return {
    effectiveStatus: sub.status,
    daysRemaining: 0,
    bannerLevel: 'grace',
    effectiveGraceEndsAt: sub.graceEndsAt,
    isPaywalled: true,
    requiresHardSuspend: false,
  };
}

/**
 * Idempotent hard-suspend: flips the Subscription to EXPIRED and the parent
 * Institution to isActive=false in one transaction, then writes the same
 * AUTO_SUSPEND audit log the background billingWorker's GRACE→EXPIRED step
 * has always written (including its system-actor fallback pattern).
 *
 * TRIALING is included in the status guard so this function is generically
 * safe to call against any lapsed subscription state — but per the
 * reconciliation note on computeEffectiveSubscriptionState above,
 * requiresHardSuspend is never true for the TRIALING branch today, so in
 * practice this is only invoked for ACTIVE/GRACE-derived lapses.
 */
export async function applyHardSuspend(institutionId: string, subscriptionId: string): Promise<void> {
  const systemActorId = await getSystemActorUserId();

  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.subscription.updateMany({
      where: { id: subscriptionId, status: { in: ['ACTIVE', 'GRACE', 'TRIALING'] } },
      data: { status: 'EXPIRED' },
    });

    // Lost the race to a concurrent caller (another request, or the
    // background worker) that already hard-suspended this subscription.
    if (updateResult.count !== 1) {
      return;
    }

    await tx.institution.update({ where: { id: institutionId }, data: { isActive: false } });

    if (systemActorId) {
      await tx.auditLog.create({
        data: {
          institutionId,
          userId: systemActorId,
          action: 'AUTO_SUSPEND',
          resource: 'Institution',
          resourceId: institutionId,
          metadata: { reason: 'Subscription grace period expired' },
        },
      });
    } else {
      logger.warn('Skipped AUTO_SUSPEND audit log: no SUPER_ADMIN user exists to act as system actor', {
        institutionId,
      });
    }
  });
}
