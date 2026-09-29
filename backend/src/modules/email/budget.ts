import { EmailPriority } from '@prisma/client';
import { getRedis } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import * as repo from './repository';

// =============================================================================
// Daily send budget (owner decision §4.2): Brevo free plan caps at
// EMAIL_DAILY_LIMIT (default 300) emails/day TOTAL, across every institution.
// Counted per UTC calendar day, in Redis, with a DB-count fallback if Redis is
// unreachable.
//
//   P0_SECURITY      — always allowed. Never deferred. Counted for reporting
//                       only; it can push the day's total past the nominal
//                       cap (better to slightly exceed Brevo's limit — worst
//                       case a late send queues behind provider throttling —
//                       than to silently drop a password reset).
//   P1_TRANSACTIONAL — allowed while the NON-reserved pool (limit - 50) has
//                       room — i.e. up to (limit - 50).
//   P2_BULK          — shares that same pool with P1, but stops earlier:
//                       P2 is deferred to next UTC midnight once usedToday
//                       reaches (limit - 50 - EMAIL_P1_HEADROOM), leaving
//                       that headroom band exclusively for P1. P1 itself
//                       keeps sending up to the full (limit - 50).
//
// Worked example with defaults (limit=300, P0 reserve=50, P1 headroom=50):
//   used 0..199   -> P0 ✓, P1 ✓, P2 ✓
//   used 200..249 -> P0 ✓, P1 ✓, P2 ✗ (deferred — P1 headroom band)
//   used 250+     -> P0 ✓, P1 ✗ (deferred), P2 ✗ (deferred)
// =============================================================================

const RESERVED_FOR_P0 = 50;

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC, since Date#toISOString is always UTC)
}

export function nextUtcMidnight(from = new Date()): Date {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1, 0, 0, 0, 0));
  return next;
}

function secondsUntil(target: Date): number {
  return Math.max(1, Math.ceil((target.getTime() - Date.now()) / 1000));
}

function redisKey(d = new Date()): string {
  return `email:budget:${todayKey(d)}`;
}

export interface BudgetDecision {
  allowed: boolean;
  notBefore?: Date;
  /** Best-effort visibility into how the decision was reached — surfaced on the admin status screen. */
  source: 'redis' | 'db-fallback';
}

/** The count-threshold `priority` may reserve up to (inclusive). P0 has no ceiling. */
function thresholdFor(priority: EmailPriority, pooledLimit: number): number {
  if (priority === EmailPriority.P2_BULK) {
    return Math.max(pooledLimit - env.EMAIL_P1_HEADROOM, 0);
  }
  // P1_TRANSACTIONAL (and anything else non-P0) gets the full pool, including
  // the headroom band P2 is excluded from.
  return pooledLimit;
}

/**
 * Atomically reserves one slot for `priority`, or reports that the send must
 * be deferred. P0 always returns allowed:true (see module doc).
 */
export async function reserveBudgetSlot(priority: EmailPriority): Promise<BudgetDecision> {
  const limit = env.EMAIL_DAILY_LIMIT;
  const pooledLimit = Math.max(limit - RESERVED_FOR_P0, 0);
  const threshold = thresholdFor(priority, pooledLimit);

  try {
    const redis = getRedis();
    const key = redisKey();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, secondsUntil(nextUtcMidnight()) + 300);
    }

    if (priority === EmailPriority.P0_SECURITY) {
      return { allowed: true, source: 'redis' };
    }

    if (count <= threshold) {
      return { allowed: true, source: 'redis' };
    }

    // Over budget — release the slot we just reserved and defer.
    await redis.decr(key);
    return { allowed: false, notBefore: nextUtcMidnight(), source: 'redis' };
  } catch (error) {
    logger.warn('Email budget: Redis unavailable, falling back to a DB count (best-effort, non-atomic)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return dbFallbackDecision(priority, threshold);
  }
}

async function dbFallbackDecision(priority: EmailPriority, threshold: number): Promise<BudgetDecision> {
  try {
    const todayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const sentToday = await repo.countSentSince(todayStart);

    if (priority === EmailPriority.P0_SECURITY) return { allowed: true, source: 'db-fallback' };
    if (sentToday < threshold) return { allowed: true, source: 'db-fallback' };
    return { allowed: false, notBefore: nextUtcMidnight(), source: 'db-fallback' };
  } catch (error) {
    // Both Redis and the DB are unreachable — fail open for P0 only; a
    // non-security send in this state would land with no record of budget
    // usage anyway, so defer it rather than risk silently blowing the quota.
    logger.error('Email budget: DB fallback also failed — deferring all non-P0 mail', {
      error: error instanceof Error ? error.message : String(error),
    });
    return priority === EmailPriority.P0_SECURITY
      ? { allowed: true, source: 'db-fallback' }
      : { allowed: false, notBefore: nextUtcMidnight(), source: 'db-fallback' };
  }
}

/** Read-only snapshot for the admin status screen — does not reserve anything. */
export async function budgetSnapshot(): Promise<{
  limit: number;
  reservedForP0: number;
  p1HeadroomOverP2: number;
  usedToday: number;
  remaining: number;
  p2RemainingBeforeDefer: number;
}> {
  const limit = env.EMAIL_DAILY_LIMIT;
  let usedToday = 0;
  try {
    const redis = getRedis();
    const raw = await redis.get(redisKey());
    usedToday = raw ? Number(raw) : 0;
  } catch {
    const todayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    usedToday = await repo.countSentSince(todayStart).catch(() => 0);
  }
  const pooledLimit = Math.max(limit - RESERVED_FOR_P0, 0);
  const p2Threshold = thresholdFor(EmailPriority.P2_BULK, pooledLimit);
  return {
    limit,
    reservedForP0: RESERVED_FOR_P0,
    p1HeadroomOverP2: env.EMAIL_P1_HEADROOM,
    usedToday,
    remaining: Math.max(limit - usedToday, 0),
    p2RemainingBeforeDefer: Math.max(p2Threshold - usedToday, 0),
  };
}
