// =============================================================================
// Support tickets — pure access/status rules (no prisma). Unit-tested.
// =============================================================================

export type TicketStatusValue = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

/** Tenant roles that see and manage every ticket of their institution. */
export const TENANT_TICKET_MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function isTenantTicketManager(role: string): boolean {
  return (TENANT_TICKET_MANAGER_ROLES as readonly string[]).includes(role);
}

/** A tenant user sees a ticket when they manage tickets or opened it themselves. */
export function canViewTenantTicket(viewer: { userId: string; role: string }, ticket: { createdByUserId: string }): boolean {
  return isTenantTicketManager(viewer.role) || ticket.createdByUserId === viewer.userId;
}

/**
 * What a tenant user may change. Managers: status + priority. The ticket's
 * creator (non-manager): may only close their own ticket or reopen it.
 * Returns an error message, or null when allowed.
 */
export function tenantUpdateError(
  viewer: { userId: string; role: string },
  ticket: { createdByUserId: string; status: TicketStatusValue },
  change: { status?: TicketStatusValue; priority?: string },
): string | null {
  if (isTenantTicketManager(viewer.role)) return null;
  if (ticket.createdByUserId !== viewer.userId) return 'You can only update tickets you opened';
  if (change.priority !== undefined) return 'Only an administrator can change the priority';
  if (change.status !== undefined && change.status !== 'CLOSED' && change.status !== 'OPEN') {
    return 'You can close or reopen your ticket; other status changes are made by support';
  }
  return null;
}

/**
 * Status after a new message. A requester replying on a resolved/closed
 * ticket reopens it; platform support replying to an OPEN ticket moves it to
 * IN_PROGRESS. Otherwise unchanged.
 */
export function statusAfterReply(current: TicketStatusValue, author: 'requester' | 'support'): TicketStatusValue {
  if (author === 'requester' && (current === 'RESOLVED' || current === 'CLOSED')) return 'OPEN';
  if (author === 'support' && current === 'OPEN') return 'IN_PROGRESS';
  return current;
}
