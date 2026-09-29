import crypto from 'crypto';

// =============================================================================
// Address hashing/masking for EmailLog. We keep a searchable, non-reversible
// hash (toHash) plus a display-safe masked form (toMasked) — the plain
// address is never persisted on the log row.
// =============================================================================

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

/** "habib@example.com" -> "ha***@example.com". Single-char local parts mask to "*@…". */
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  if (at <= 0) return '***';
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length - 1 > 0 ? 2 : 1));
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}
