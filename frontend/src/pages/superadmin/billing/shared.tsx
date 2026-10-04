import React, { useState } from 'react';
import { MoreVertical, Ban } from 'lucide-react';
import {
  BILLING_CYCLE_LABELS,
  type BillingCycle,
  type Plan,
  type PlanPrice,
  type SubscriptionStatus,
  type SubscriptionPayment,
  type SubscriptionPaymentStatus,
} from '@/api/billing.api';

// =============================================================================
// Shared types, badges and small building blocks used by both the Plans and
// Subscriptions tabs of the super-admin billing portal.
// =============================================================================

export const CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

// Months billed per cycle — drives the per-month equivalent and the "save X%"
// comparison shown against the monthly price on each plan card.
export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: BadgeVariant }> = {
  TRIALING: { label: 'Trialing', variant: 'info' },
  ACTIVE: { label: 'Active', variant: 'success' },
  GRACE: { label: 'Grace period', variant: 'warning' },
  EXPIRED: { label: 'Expired', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'danger' },
};

export const PAYMENT_STATUS_BADGE: Record<SubscriptionPaymentStatus, { label: string; variant: BadgeVariant }> = {
  INITIATED: { label: 'Initiated', variant: 'info' },
  PENDING: { label: 'Pending', variant: 'warning' },
  SUCCESS: { label: 'Paid', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  REFUNDED: { label: 'Refunded', variant: 'info' },
};

export const paymentMethodLabel = (p: SubscriptionPayment) =>
  p.isManualOverride ? 'Manual override' : p.generatedBySuperAdmin ? 'Payment link' : 'Online (SSLCommerz)';

// ── Plan pricing helpers ────────────────────────────────────────────────

// Amount for a cycle, as a number — plan.prices only carries the *active*
// price row per cycle, so at most one match.
export const priceFor = (plan: Plan, cycle: BillingCycle): PlanPrice | undefined =>
  plan.prices.find((p) => p.billingCycle === cycle);

export const amountOf = (price: PlanPrice) => (typeof price.amount === 'string' ? Number(price.amount) : price.amount);

/** Per-month equivalent, so cycles of different lengths are comparable. */
export const perMonth = (price: PlanPrice) => amountOf(price) / CYCLE_MONTHS[price.billingCycle];

/**
 * Discount a longer cycle gives against 12x / 3x the monthly price. Returns
 * null when there's no monthly price to compare against, or no real saving.
 */
export const savingVsMonthly = (plan: Plan, price: PlanPrice): number | null => {
  const monthly = priceFor(plan, 'MONTHLY');
  if (!monthly || price.billingCycle === 'MONTHLY') return null;
  const expected = amountOf(monthly) * CYCLE_MONTHS[price.billingCycle];
  if (expected <= 0) return null;
  const pct = Math.round((1 - amountOf(price) / expected) * 100);
  return pct > 0 ? pct : null;
};

/** Cheapest per-month equivalent across every priced cycle — the "from" price. */
export const entryPrice = (plan: Plan): PlanPrice | null => {
  if (plan.prices.length === 0) return null;
  return plan.prices.reduce((best, p) => (perMonth(p) < perMonth(best) ? p : best));
};

export const subscriberCount = (plan: Plan) => plan._count?.subscriptions ?? 0;

export { BILLING_CYCLE_LABELS };

// ── Small presentational building blocks ────────────────────────────────

export const CHIP_TONES = {
  neutral: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
  success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
  info: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10',
  warning: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
} as const;

export const StatChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: keyof typeof CHIP_TONES;
}> = ({ icon, label, value, hint, tone = 'neutral' }) => (
  <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-3.5 flex items-center gap-3">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${CHIP_TONES[tone]}`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
        {value}
        {hint && <span className="ml-1.5 text-[11px] font-medium text-slate-400">{hint}</span>}
      </p>
    </div>
  </div>
);

export interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown under the label when the item is disabled — explains why. */
  disabledReason?: string;
}

/** Kebab overflow menu — closes on outside click, Escape, or item activation. */
export const CardMenu: React.FC<{ items: MenuItem[]; label: string }> = ({ items, label }) => {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-60 z-20 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-900 shadow-sm p-1"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                item.disabled
                  ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                  : item.danger
                    ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <span className="mt-0.5 flex-shrink-0">{item.disabled ? <Ban className="w-4 h-4" /> : item.icon}</span>
              <span className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                {item.disabled && item.disabledReason && (
                  <span className="block text-[11px] leading-snug mt-0.5">{item.disabledReason}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  tone?: 'neutral' | 'blue' | 'amber';
  children: React.ReactNode;
}> = ({ icon, title, tone = 'neutral', children }) => {
  const toneCls =
    tone === 'blue'
      ? 'border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5'
      : tone === 'amber'
        ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5'
        : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-950/40';
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${toneCls}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
};
