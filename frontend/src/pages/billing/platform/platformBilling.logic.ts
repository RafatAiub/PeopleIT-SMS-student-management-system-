// =============================================================================
// P1 platform billing — pure UI logic (no React). Tested by
// __tests__/platform-billing-logic.test.ts (self-running).
// =============================================================================

import type { AccessLevel, InvoiceStatus, PlatformStatus } from '@/api/platformBilling.api';

export type BannerKind = 'none' | 'due' | 'overdue' | 'restricted';

/**
 * Which app-wide banner a school user sees.
 *   restricted — the school is RESTRICTED by platform billing (every role)
 *   overdue    — ADMIN, an unpaid bill is past its due day
 *   due        — ADMIN, a bill is unpaid (from the 1st), dismissible per day
 * DISABLED never shows a banner: those users are sent to /account-disabled.
 */
export function bannerKind(status: PlatformStatus | undefined | null): BannerKind {
  if (!status || !status.hasProfile) return 'none';
  if (status.accessLevel === 'DISABLED') return 'none';
  if (status.accessLevel === 'RESTRICTED' && status.reason === 'PLATFORM_BILLING') return 'restricted';
  if (!status.isAdmin || !status.summary || status.summary.unpaidCount === 0) return 'none';
  return status.summary.overdueCount > 0 ? 'overdue' : 'due';
}

/** Only the soft "due" banner can be dismissed, and only for the rest of the day. */
export function isDismissible(kind: BannerKind): boolean {
  return kind === 'due';
}

/** Local calendar day key used to remember a per-day dismissal. */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isDismissedToday(stored: string | null, now: Date = new Date()): boolean {
  return stored === dayKey(now);
}

export function shouldShowDisabledScreen(level: AccessLevel | undefined, role: string | undefined, pathname: string): boolean {
  if (level !== 'DISABLED' || !role || role === 'SUPER_ADMIN') return false;
  return !DISABLED_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Paths a DISABLED school's ADMIN may still open (pay and get receipts). */
export const DISABLED_ALLOWED_PATHS = ['/account-disabled', '/billing'];

export function invoiceStatusVariant(status: InvoiceStatus): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'OVERDUE':
      return 'danger';
    case 'PARTIAL':
      return 'warning';
    case 'DUE':
      return 'info';
    default:
      return 'neutral';
  }
}

export function accessVariant(level: AccessLevel): 'success' | 'warning' | 'danger' {
  return level === 'ACTIVE' ? 'success' : level === 'RESTRICTED' ? 'warning' : 'danger';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function shortPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return `${MONTHS[Number(m[2]) - 1].slice(0, 3)} ${m[1].slice(2)}`;
}

/** YYYY-MM of today in Asia/Dhaka (UTC+6, no DST). */
export function currentPeriod(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Paisa-safe sum of taka amounts. */
export function sumTaka(values: number[]): number {
  return values.reduce((s, v) => s + Math.round(v * 100), 0) / 100;
}

/** "Rate × students" explanation for a PER_STUDENT invoice. */
export function computationText(inv: { pricingModel: string; studentCount: number | null; rate: number | null; total: number }, fmt: (n: number) => string): string | null {
  if (inv.pricingModel === 'PER_STUDENT' && inv.studentCount !== null && inv.rate !== null) {
    return `${inv.studentCount} × ${fmt(inv.rate)}`;
  }
  if (inv.pricingModel === 'FLAT' && inv.rate !== null) return `${fmt(inv.rate)} / month`;
  return null;
}

/** Line preview for the owner's invoice editor (quantity × unit, paisa-safe). */
export function lineTotals(lines: Array<{ quantity: number; unitPrice: number }>): { subtotal: number; discount: number; total: number } {
  let pos = 0;
  let neg = 0;
  for (const l of lines) {
    const a = Math.round(Math.round(l.unitPrice * 100) * (Number(l.quantity) || 0));
    if (a >= 0) pos += a;
    else neg -= a;
  }
  return { subtotal: pos / 100, discount: neg / 100, total: Math.max(0, pos - neg) / 100 };
}

/** Preview of a profile's monthly amount (mirrors the server; the server is authoritative). */
export function previewMonthly(p: { pricingModel: string; flatAmount: number | null; perStudentRate: number | null; minimumCharge: number; discountType: string | null; discountValue: number | null }, students: number): number {
  let gross = p.pricingModel === 'FLAT' ? Math.round((p.flatAmount ?? 0) * 100) : students * Math.round((p.perStudentRate ?? 0) * 100);
  if (p.pricingModel === 'PER_STUDENT') gross = Math.max(gross, Math.round(p.minimumCharge * 100));
  let disc = 0;
  if (p.discountType === 'PERCENT' && p.discountValue) disc = Math.round((gross * Math.min(100, p.discountValue)) / 100);
  if (p.discountType === 'FIXED' && p.discountValue) disc = Math.round(p.discountValue * 100);
  return Math.max(0, gross - Math.min(gross, disc)) / 100;
}
