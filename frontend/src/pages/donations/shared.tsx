import React from 'react';
import { Badge } from '@/components/ui';
import { formatCurrency, useLocale, useT } from '@/i18n';
import { FUND_TYPE_LABEL, type DonationStatus, type DueState, type FundType } from './donations.api';

/** Bangla twin when the dashboard is in Bangla and one exists. */
export function useBi() {
  const { lang } = useLocale();
  return React.useCallback((en: string | null | undefined, bn?: string | null) => (lang === 'bn' && bn ? bn : en ?? ''), [lang]);
}

export const FundTypeBadge: React.FC<{ type: FundType }> = ({ type }) => {
  const { lang } = useLocale();
  const label = lang === 'bn' ? FUND_TYPE_LABEL[type].bn : FUND_TYPE_LABEL[type].en;
  return <Badge variant={type === 'ZAKAT' ? 'primary' : type === 'SADAQAH' ? 'accent' : 'neutral'}>{label}</Badge>;
};

const STATUS_VARIANT: Record<DonationStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  REFUNDED: 'neutral',
};
const STATUS_LABEL: Record<DonationStatus, string> = { PAID: 'Paid', PENDING: 'Pending', FAILED: 'Failed', REFUNDED: 'Refunded' };

export const DonationStatusBadge: React.FC<{ status: DonationStatus }> = ({ status }) => {
  const t = useT();
  return <Badge variant={STATUS_VARIANT[status]} dot>{t(STATUS_LABEL[status])}</Badge>;
};

const DUE_VARIANT: Record<DueState, 'danger' | 'warning' | 'info' | 'neutral'> = { overdue: 'danger', due: 'warning', upcoming: 'info', inactive: 'neutral' };
const DUE_LABEL: Record<DueState, string> = { overdue: 'Overdue', due: 'Due this month', upcoming: 'Paid this month', inactive: 'Paused / cancelled' };

export const DueBadge: React.FC<{ state: DueState }> = ({ state }) => {
  const t = useT();
  return <Badge variant={DUE_VARIANT[state]}>{t(DUE_LABEL[state])}</Badge>;
};

export const Money: React.FC<{ value: number | null | undefined; className?: string }> = ({ value, className }) => (
  <span className={className ?? 'tabular-nums'}>{formatCurrency(value ?? 0)}</span>
);

/** A thin goal progress bar (brand fill, never white-on-orange text). */
export const GoalBar: React.FC<{ progress: number | null; label: string }> = ({ progress, label }) =>
  progress == null ? null : (
    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={label}>
      <div className="h-full rounded-full bg-primary-600" style={{ width: `${progress}%` }} />
    </div>
  );

/** yyyy-mm-dd for <input type="date"> from an ISO string or Date. */
export function toDateInput(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
