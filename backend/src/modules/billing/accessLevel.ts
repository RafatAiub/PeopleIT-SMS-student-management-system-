import { AppError } from '../../utils/AppError';
import { computeEffectiveSubscriptionState, type SubscriptionLifecycleInput } from './subscriptionLifecycle';

// =============================================================================
// P0 + P1 — server-side access enforcement.
//
// The ONE place that decides how much a school may do. tenant.middleware.ts,
// GET /billing/subscription and GET /billing/platform/status all call it, so
// the server and the UI never disagree.
//
//   ACTIVE     — full access.
//   RESTRICTED — read-only: GET works, writes return 402 SUBSCRIPTION_INACTIVE
//                except billing/checkout/payment callbacks and auth.
//   DISABLED   — everything returns 402 ACCOUNT_DISABLED except auth and the
//                billing APIs (billing page, checkout, payment callbacks), so a
//                disabled school can still sign in and PAY.
//
// Precedence (P1):
//   1. Institution.isActive=false (platform suspension, or the legacy
//      hard-suspend after grace) → DISABLED. Billing stays reachable.
//   2. The school has a platform billing profile (InstitutionBillingProfile)
//      → its monthly invoices + the owner's override decide (see
//      platformBilling.logic.ts computePlatformAccess). The legacy
//      Plan/Subscription status is ignored for access.
//   3. Otherwise the legacy subscription decides (P0): TRIALING/ACTIVE/GRACE
//      → ACTIVE; lapsed trial, EXPIRED, CANCELLED → RESTRICTED; no
//      subscription row → ACTIVE.
// Plan/PlanFeature entitlements (feature limits) are separate and unchanged.
// SUPER_ADMIN (and support sessions opened by one) is never blocked — the
// middleware skips enforcement for platform staff.
// =============================================================================

export type AccessLevel = 'ACTIVE' | 'RESTRICTED' | 'DISABLED';

/** What the platform-billing regime says about a school (null/absent = no profile). */
export interface PlatformAccessInput {
  hasProfile: boolean;
  level: AccessLevel;
}

export function getAccessLevel(
  institution: { isActive: boolean } | null | undefined,
  subscription: SubscriptionLifecycleInput | null | undefined,
  now: Date = new Date(),
  platform?: PlatformAccessInput | null,
): AccessLevel {
  if (!institution || !institution.isActive) return 'DISABLED';
  if (platform?.hasProfile) return platform.level;
  // No subscription row: legacy/onboarding tenants that billing never covered.
  if (!subscription) return 'ACTIVE';
  const { effectiveStatus } = computeEffectiveSubscriptionState(subscription, now);
  if (effectiveStatus === 'EXPIRED' || effectiveStatus === 'CANCELLED') return 'RESTRICTED';
  return 'ACTIVE';
}

/** Methods that never change data — always allowed at RESTRICTED. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * API prefixes a RESTRICTED or DISABLED school may still use: everything
 * needed to PAY (tenant billing incl. platform invoices and checkout, and the
 * public gateway callbacks) and to sign in/out (login, logout, refresh, me,
 * 2FA, password reset).
 */
const BILLING_AND_AUTH_PREFIXES = ['/api/v1/billing', '/api/v1/auth'];

function matchesPrefix(originalUrl: string): boolean {
  const path = originalUrl.split('?')[0].toLowerCase();
  return BILLING_AND_AUTH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isWriteAllowedWhileRestricted(method: string, originalUrl: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return true;
  return matchesPrefix(originalUrl);
}

/** DISABLED: only billing + auth, any method. */
export function isRequestAllowedWhileDisabled(originalUrl: string): boolean {
  return matchesPrefix(originalUrl);
}

export function isRequestAllowedAt(level: AccessLevel, method: string, originalUrl: string): boolean {
  if (level === 'ACTIVE') return true;
  if (level === 'RESTRICTED') return isWriteAllowedWhileRestricted(method, originalUrl);
  return isRequestAllowedWhileDisabled(originalUrl);
}

/** Why the school is limited — lets the UI word the banner correctly. */
export type AccessReason = 'SUBSCRIPTION' | 'PLATFORM_BILLING' | 'SUSPENDED';

const DEFAULT_MESSAGES: Record<AccessLevel, Record<AccessReason, string>> = {
  ACTIVE: { SUBSCRIPTION: '', PLATFORM_BILLING: '', SUSPENDED: '' },
  RESTRICTED: {
    SUBSCRIPTION:
      'Subscription expired — pay to continue. The school account is read-only until the subscription is renewed.',
    PLATFORM_BILLING: 'Payment overdue — pay now. The school account is read-only until the bill is paid.',
    SUSPENDED: 'The school account is read-only.',
  },
  DISABLED: {
    SUBSCRIPTION: 'Account disabled — pay to reactivate.',
    PLATFORM_BILLING: 'Account disabled — pay to reactivate.',
    SUSPENDED: 'Account disabled — please contact PeopleNIT or pay any outstanding bill to reactivate.',
  },
};

/**
 * 402 Payment Required with a machine-readable code:
 *   SUBSCRIPTION_INACTIVE — RESTRICTED (read-only)
 *   ACCOUNT_DISABLED      — DISABLED (only billing + auth work)
 */
export class SubscriptionInactiveError extends AppError {
  public readonly code: 'SUBSCRIPTION_INACTIVE' | 'ACCOUNT_DISABLED';
  public readonly accessLevel: AccessLevel;
  public readonly reason: AccessReason;

  constructor(accessLevel: AccessLevel = 'RESTRICTED', message?: string, reason: AccessReason = 'SUBSCRIPTION') {
    super(message ?? (DEFAULT_MESSAGES[accessLevel][reason] || DEFAULT_MESSAGES.RESTRICTED.SUBSCRIPTION), 402);
    this.accessLevel = accessLevel;
    this.reason = reason;
    this.code = accessLevel === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'SUBSCRIPTION_INACTIVE';
  }
}
