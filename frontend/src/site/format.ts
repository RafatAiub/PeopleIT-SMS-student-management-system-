/**
 * Value formatters shared by data binding (`_bind.fmt`) and `{{item.x|fmt}}`
 * tokens. Pure (no React) so it is unit-testable.
 */
import { formatSiteDate, formatSiteMoney } from './strings';
import type { SiteLang } from './types';

export const BIND_FORMATS = ['date:long', 'upper', 'bn-digits', 'money'] as const;
export type BindFmt = (typeof BIND_FORMATS)[number];

export const BIND_FORMAT_LABELS: Record<BindFmt, string> = {
  'date:long': 'Date (12 March 2026)',
  upper: 'UPPERCASE',
  'bn-digits': 'Bangla digits (১২৩)',
  money: 'Money (৳1,234)',
};

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function isBindFmt(v: unknown): v is BindFmt {
  return typeof v === 'string' && (BIND_FORMATS as readonly string[]).includes(v);
}

/** Formats one scalar. Unknown formats and unparsable input return the plain string unchanged. */
export function applyFmt(value: unknown, fmt: string | undefined, lang: SiteLang = 'en'): string {
  const raw = value == null ? '' : String(value);
  if (!raw || !isBindFmt(fmt)) return raw;
  switch (fmt) {
    case 'date:long':
      return formatSiteDate(raw, lang, { day: 'numeric', month: 'long', year: 'numeric' }) || raw;
    case 'upper':
      return raw.toUpperCase();
    case 'bn-digits':
      return toBanglaDigits(raw);
    case 'money': {
      const n = Number(raw);
      return Number.isFinite(n) ? formatSiteMoney(n, 'BDT', lang) : raw;
    }
  }
}
