import { AppError } from '../../utils/AppError';
import { computeEffectiveSubscriptionState, type SubscriptionLifecycleInput } from './subscriptionLifecycle';

// =============================================================================
// P0 — server-side subscription enforcement.
//
// The ONE place that decides how much a school may do, given its institution
// row and subscription. Track P1 extends this (manual Restricted/Disabled set
// by the owner, auto-restrict after N days overdue) — keep every access
// decision here so the middleware and the UI never disagree.
//
//   ACTIVE     — full access. TRIALING (in trial), ACTIVE, and GRACE (the
//                7-day window after a missed renewal) all stay fully usable.
//   RESTRICTED — read-only: GET works, writes return 402 SUBSCRIPTION_INACTIVE
//                except billing/checkout/payment callbacks and auth. Today:
//                the effective subscription is EXPIRED (lapsed trial, or paid
//                period + grace over) or CANCELLED, while the institution
//                itself is still switched on.
//   DISABLED   — the institution is switched off (Institution.isActive=false:
//                platform suspension or the post-grace hard-suspend). Handled
//                by the existing 403 in tenant.middleware.ts.
// =============================================================================

export type AccessLevel = 'ACTIVE' | 'RESTRICTED' | 'DISABLED';

export function getAccessLevel(
  institution: { isActive: boolean } | null | undefined,
  subscription: SubscriptionLifecycleInput | null | undefined,
  now: Date = new Date(),
): AccessLevel {
  if (!institution || !institution.isActive) return 'DISABLED';
  // No subscription row: legacy/onboarding tenants that billing never covered.
  if (!subscription) return 'ACTIVE';
  const { effectiveStatus } = computeEffectiveSubscriptionState(subscription, now);
  if (effectiveStatus === 'EXPIRED' || effectiveStatus === 'CANCELLED') return 'RESTRICTED';
  return 'ACTIVE';
}

/** Methods that never change data — always allowed at RESTRICTED. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * API prefixes a RESTRICTED school may still write to: everything needed to
 * PAY (tenant billing incl. checkout, and the public gateway callbacks) and to
 * sign in/out (login, logout, refresh, me, 2FA, password reset).
 */
const WRITE_EXEMPT_PREFIXES = ['/api/v1/billing', '/api/v1/auth'];

export function isWriteAllowedWhileRestricted(method: string, originalUrl: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return true;
  const path = originalUrl.split('?')[0].toLowerCase();
  return WRITE_EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * 402 Payment Required with a machine-readable code, so every client can show
 * "Subscription expired — pay to continue" (staff) or "School account
 * inactive, contact the school" (students/guardians).
 */
export class SubscriptionInactiveError extends AppError {
  public readonly code = 'SUBSCRIPTION_INACTIVE' as const;
  public readonly accessLevel: AccessLevel;

  constructor(accessLevel: AccessLevel = 'RESTRICTED', message = 'Subscription expired — pay to continue. The school account is read-only until the subscription is renewed.') {
    super(message, 402);
    this.accessLevel = accessLevel;
  }
}
