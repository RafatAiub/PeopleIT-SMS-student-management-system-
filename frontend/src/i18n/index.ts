import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { bn } from './bn';

/**
 * Lightweight i18n. Keys are the English source strings (gettext style), so
 * an untranslated key simply renders in English — no screen ever shows a raw
 * key. `t('Hello {name}', { name })` interpolates.
 *
 * Preferences are per browser (`locale-storage`). The institution record has
 * no timezone / date-format / numeral columns yet; making these
 * institution-wide needs a schema change (pending approval).
 */

export type Lang = 'en' | 'bn';
export type Numerals = 'latn' | 'beng';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'D MMM YYYY';

interface LocaleState {
  lang: Lang;
  numerals: Numerals;
  timeZone: string;
  dateFormat: DateFormat;
  setLang: (lang: Lang) => void;
  setNumerals: (n: Numerals) => void;
  setTimeZone: (tz: string) => void;
  setDateFormat: (f: DateFormat) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      lang: 'en',
      numerals: 'latn',
      timeZone: 'Asia/Dhaka',
      dateFormat: 'D MMM YYYY',
      setLang: (lang) => {
        document.documentElement.lang = lang;
        // Bangla UI reads most naturally with Bangla digits; users can still
        // switch numerals back independently.
        set(lang === 'bn' ? { lang, numerals: 'beng' } : { lang, numerals: 'latn' });
      },
      setNumerals: (numerals) => set({ numerals }),
      setTimeZone: (timeZone) => set({ timeZone }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
    }),
    { name: 'locale-storage' }
  )
);

const DICTS: Record<Lang, Record<string, string>> = { en: {}, bn };

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Non-hook translate, for code outside components (reads current state). */
export function translate(key: string, vars?: Record<string, string | number>): string {
  const { lang } = useLocaleStore.getState();
  return interpolate(DICTS[lang][key] ?? key, vars);
}

export function useT() {
  const lang = useLocaleStore((s) => s.lang);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => interpolate(DICTS[lang][key] ?? key, vars),
    [lang]
  );
}

// ── Formatters ────────────────────────────────────────────────────────────

function numberLocale(lang: Lang, numerals: Numerals) {
  // South Asian digit grouping (1,23,456) for both languages.
  const base = lang === 'bn' ? 'bn-BD' : 'en-IN';
  return `${base}-u-nu-${numerals}`;
}

export function formatNumber(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const { lang, numerals } = useLocaleStore.getState();
  return new Intl.NumberFormat(numberLocale(lang, numerals), opts).format(value);
}

/** BDT with the ৳ symbol and lakh grouping, e.g. ৳1,23,456 or ৳১,২৩,৪৫৬ */
export function formatCurrency(value: number | string | null | undefined, opts?: { decimals?: number }): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const decimals = opts?.decimals ?? (Number.isInteger(n) ? 0 : 2);
  const { lang, numerals } = useLocaleStore.getState();
  return new Intl.NumberFormat(numberLocale(lang, numerals), {
    style: 'currency',
    currency: 'BDT',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatDate(value: string | number | Date | null | undefined, withTime = false): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const { lang, numerals, timeZone, dateFormat } = useLocaleStore.getState();
  const locale = `${lang === 'bn' ? 'bn-BD' : 'en-GB'}-u-nu-${numerals}`;
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: dateFormat === 'D MMM YYYY' ? 'numeric' : '2-digit',
    month: dateFormat === 'D MMM YYYY' ? 'short' : '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const [dd, mm, yyyy] = [get('day'), get('month'), get('year')];
  let out: string;
  switch (dateFormat) {
    case 'MM/DD/YYYY': out = `${mm}/${dd}/${yyyy}`; break;
    case 'YYYY-MM-DD': out = `${yyyy}-${mm}-${dd}`; break;
    case 'D MMM YYYY': out = `${dd} ${mm} ${yyyy}`; break;
    default: out = `${dd}/${mm}/${yyyy}`;
  }
  if (!withTime) return out;
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(d);
  return `${out}, ${time}`;
}

/** Re-render subscribers when any locale preference changes. */
export function useLocale() {
  return useLocaleStore();
}
