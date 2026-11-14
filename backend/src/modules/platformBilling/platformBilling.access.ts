import { prisma } from '../../config/prisma';
import { getAccessLevel, type AccessLevel, type AccessReason } from '../billing/accessLevel';
import { computePlatformAccess, daysPastDue, UNPAID_STATUSES, type AccessSource, type PlatformAccessLevel } from './platformBilling.logic';

// =============================================================================
// P1: the platform-billing side of the access decision, cached briefly.
//
// tenant.middleware.ts asks this on every tenant request, so the result is
// cached in-process for CACHE_TTL_MS per institution. Every write that can
// change it (payment credited, override set/lifted, profile saved, invoice
// waived/cancelled/generated, the daily overdue scan) calls
// invalidatePlatformAccess(), so in a single-instance deployment a change is
// visible immediately; with several instances it is visible within the TTL.
// =============================================================================

export const CACHE_TTL_MS = 30_000;

export interface PlatformAccessState {
  hasProfile: boolean;
  billingActive: boolean;
  level: PlatformAccessLevel;
  source: AccessSource;
  override: PlatformAccessLevel | null;
  overrideReason: string | null;
  overrideKeep: boolean;
  autoRestrictAfterDays: number | null;
  /** Days the oldest unpaid invoice is past due (null when none is). */
  maxDaysOverdue: number | null;
}

const NO_PROFILE: PlatformAccessState = {
  hasProfile: false,
  billingActive: false,
  level: 'ACTIVE',
  source: 'NONE',
  override: null,
  overrideReason: null,
  overrideKeep: false,
  autoRestrictAfterDays: null,
  maxDaysOverdue: null,
};

const cache = new Map<string, { state: PlatformAccessState; expiresAt: number }>();

export function invalidatePlatformAccess(institutionId?: string): void {
  if (institutionId) cache.delete(institutionId);
  else cache.clear();
}

/** Uncached computation (used by the cache and by tests). */
export async function computePlatformAccessState(institutionId: string, now: Date = new Date()): Promise<PlatformAccessState> {
  const profile = await prisma.institutionBillingProfile.findUnique({
    where: { institutionId },
    select: {
      isActive: true,
      accessOverride: true,
      overrideReason: true,
      overrideKeep: true,
      autoRestrictAfterDays: true,
    },
  });
  if (!profile) return NO_PROFILE;

  const oldest = await prisma.platformInvoice.findFirst({
    where: { institutionId, status: { in: UNPAID_STATUSES } },
    orderBy: { dueDate: 'asc' },
    select: { dueDate: true },
  });
  const past = oldest ? daysPastDue(oldest.dueDate, now) : null;
  const maxDaysOverdue = past !== null && past > 0 ? past : null;

  const { level, source } = computePlatformAccess({
    billingActive: profile.isActive,
    override: profile.accessOverride,
    autoRestrictAfterDays: profile.autoRestrictAfterDays,
    maxDaysOverdue,
  });

  return {
    hasProfile: true,
    billingActive: profile.isActive,
    level,
    source,
    override: profile.accessOverride,
    overrideReason: profile.overrideReason,
    overrideKeep: profile.overrideKeep,
    autoRestrictAfterDays: profile.autoRestrictAfterDays,
    maxDaysOverdue,
  };
}

/**
 * The level the tenant middleware enforces for this school right now
 * (institution switch + platform regime or legacy subscription), with the
 * reason — what GET /billing/platform/status reports to every role.
 */
export async function getFinalAccess(institutionId: string, now: Date = new Date()): Promise<{ accessLevel: AccessLevel; reason: AccessReason | null }> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { isActive: true, subscription: { select: { status: true, trialEndsAt: true, currentPeriodEnd: true, graceEndsAt: true } } },
  });
  const platform = await getPlatformAccessState(institutionId, now);
  const accessLevel = getAccessLevel(institution, institution?.subscription, now, platform);
  if (accessLevel === 'ACTIVE') return { accessLevel, reason: null };
  const reason: AccessReason = !institution?.isActive ? 'SUSPENDED' : platform.hasProfile ? 'PLATFORM_BILLING' : 'SUBSCRIPTION';
  return { accessLevel, reason };
}

export async function getPlatformAccessState(institutionId: string, now: Date = new Date()): Promise<PlatformAccessState> {
  const hit = cache.get(institutionId);
  if (hit && hit.expiresAt > Date.now()) return hit.state;
  const state = await computePlatformAccessState(institutionId, now);
  cache.set(institutionId, { state, expiresAt: Date.now() + CACHE_TTL_MS });
  // Keep the map bounded (one entry per active tenant; trim if it ever grows).
  if (cache.size > 5000) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return state;
}
