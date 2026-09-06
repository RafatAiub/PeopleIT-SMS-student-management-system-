import type { BillingCycle } from '@prisma/client';
import { logger } from '../../utils/logger';
import { notifySafe } from '../notifications/notifications.service';
import type { NotificationType } from '../notifications/notifications.dto';
import * as billingRepository from './billing.repository';

// ── Template-var formatters ────────────────────────────────────────────────

const CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-yearly',
  YEARLY: 'Yearly',
};

export function formatCycle(cycle: BillingCycle): string {
  return CYCLE_LABELS[cycle] ?? cycle;
}

export function formatMoney(amount: unknown, currency: string): string {
  return `${currency} ${Number(amount).toFixed(2)}`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return 'N/A';
  return new Date(value).toDateString();
}

// =============================================================================
// Platform subscription-billing notifications.
//
// The billing module is the one place notifications are addressed to people
// OTHER than a tenant's own users: the institute admin(s) of the subject
// institution, and (for money-movement events) the super admins, whose own
// User.institutionId is null. The emitted Notification row always carries the
// SUBJECT institution's id — the notifications read path omits the tenant
// filter for a super admin (no req.tenantId) so they still see it.
//
// Fire-and-forget by design: a billing operation (crediting a gateway
// callback, a super-admin override) must never fail or slow down because a
// notification could not be resolved or queued.
// =============================================================================

export type SubscriptionAudience = 'institute-admin' | 'both';

export interface SubscriptionNotificationInput {
  type: NotificationType;
  institutionId: string;
  /** Rendered into the template; {{institutionName}} is auto-injected downstream. */
  vars: Record<string, string | number | null | undefined>;
  /** Idempotency key component — same event for the same object == one send. */
  contextId: string;
  /** 'both' also notifies super admins. Default: institute admin(s) only. */
  audience?: SubscriptionAudience;
  /** Deep-link stored on the notification. Default: '/billing'. */
  link?: string;
}

/**
 * Resolve the audience and emit. Awaitable — used directly by tests and any
 * caller that wants to be sure the enqueue was attempted. The `notify()` call
 * inside is itself non-blocking on delivery (it only queues), so awaiting this
 * costs one or two quick DB lookups, not a network send.
 */
export async function notifySubscriptionEvent(input: SubscriptionNotificationInput): Promise<void> {
  const adminIds = await billingRepository.findAdminUserIdsForInstitution(input.institutionId);
  const superIds =
    input.audience === 'both' ? await billingRepository.findSuperAdminUserIds() : [];
  const recipientUserIds = [...new Set([...adminIds, ...superIds])];

  if (recipientUserIds.length === 0) {
    logger.warn('Subscription notification resolved to no recipients', {
      type: input.type,
      institutionId: input.institutionId,
      audience: input.audience ?? 'institute-admin',
    });
    return;
  }

  notifySafe({
    institutionId: input.institutionId,
    type: input.type,
    recipientUserIds,
    contextId: input.contextId,
    data: { link: input.link ?? '/billing' },
    vars: input.vars,
  });
}

/** Fire-and-forget wrapper — never throws, never awaited by request/worker code. */
export function emitSubscriptionNotification(input: SubscriptionNotificationInput): void {
  notifySubscriptionEvent(input).catch((error) => {
    logger.error('Failed to emit subscription notification', {
      type: input.type,
      institutionId: input.institutionId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
