import { EmailSuppressionReason, EmailSuppressionScope } from '@prisma/client';
import { normalizeEmail } from './mask';
import * as repo from './repository';

// =============================================================================
// Suppression policy
//   ALL  scope — never email this address again (hard bounce, spam complaint,
//                blocked, invalid, or a manual admin block). Blocks EVERY send,
//                including P0 security mail: a permanently-bad address cannot
//                receive a password reset either, and retrying it only harms
//                sender reputation with Brevo.
//   BULK scope — this address unsubscribed from broadcast mail only. Blocks
//                P2_BULK sends (campaigns, mass reminders) but never receipts,
//                OTPs, invites or any other transactional/security mail.
// =============================================================================

export interface SuppressionCheck {
  suppressed: boolean;
  reason?: EmailSuppressionReason;
  scope?: EmailSuppressionScope;
}

export async function checkSuppressed(email: string, opts: { isBulk: boolean }): Promise<SuppressionCheck> {
  const rows = await repo.findSuppressions(normalizeEmail(email));
  if (rows.length === 0) return { suppressed: false };

  const all = rows.find((r) => r.scope === 'ALL');
  if (all) return { suppressed: true, reason: all.reason, scope: 'ALL' };

  if (opts.isBulk) {
    const bulk = rows.find((r) => r.scope === 'BULK');
    if (bulk) return { suppressed: true, reason: bulk.reason, scope: 'BULK' };
  }

  return { suppressed: false };
}

export async function suppress(params: {
  email: string;
  scope: EmailSuppressionScope;
  reason: EmailSuppressionReason;
  source: string;
  institutionId?: string | null;
  note?: string | null;
}) {
  return repo.upsertSuppression({ ...params, email: normalizeEmail(params.email) });
}

export async function unsuppress(email: string, scope?: EmailSuppressionScope) {
  return repo.removeSuppression(normalizeEmail(email), scope);
}

export async function listSuppressed(params: { page: number; pageSize: number; search?: string }) {
  const [items, total] = await repo.listSuppressions(params);
  return { items, total };
}
