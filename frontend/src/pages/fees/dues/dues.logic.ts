// =============================================================================
// P4 dues UI — pure helpers (no React, no I/O). Tested in
// __tests__/dues-logic.test.ts.
// =============================================================================

export type CellStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'NO_INVOICE' | 'WAIVED';

/**
 * Cell look. Brand orange (#f57722) is never used behind white text; dark
 * text sits on the light tints. Each status also has its own symbol, so the
 * grid never relies on colour alone.
 */
export const CELL_STYLE: Record<CellStatus, { cls: string; symbol: string; label: string }> = {
  PAID: { cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100', symbol: '✓', label: 'Paid' },
  PARTIAL: { cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100', symbol: '◐', label: 'Partly paid' },
  UNPAID: { cls: 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100', symbol: '✕', label: 'Unpaid' },
  NO_INVOICE: { cls: 'bg-slate-50 text-slate-400 dark:bg-white/5 dark:text-slate-500', symbol: '·', label: 'No invoice' },
  WAIVED: { cls: 'bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-100', symbol: '–', label: 'Waived / cancelled' },
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Inclusive YYYY-MM list. Capped at 36. */
export function monthRange(from: string, to: string): string[] {
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) return [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const out: string[] = [];
  while ((y < ty || (y === ty && m <= tm)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Calendar year → from/to months. */
export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01`, to: `${year}-12` };
}

/** "Current" YYYY-MM in a time zone. */
export function currentMonth(timeZone = 'Asia/Dhaka', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}

const EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BN = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];

export function shortMonth(key: string, lang: 'en' | 'bn' = 'en'): string {
  if (!MONTH_RE.test(key)) return key;
  return (lang === 'bn' ? BN : EN)[Number(key.slice(5, 7)) - 1];
}

/** Placeholders a reminder template may use. */
export const PLACEHOLDERS = ['{student}', '{months}', '{amount}', '{school}', '{guardian}', '{month_names}', '{class}'] as const;

/** Unknown {tokens} in a template (typos the school should fix before sending). */
export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(PLACEHOLDERS);
  const found = template.match(/\{\w+\}/g) ?? [];
  return [...new Set(found.filter((p) => !known.has(p)))];
}

/** Rough preview of a template with sample values (the server renders the real one). */
export function sampleRender(template: string, school: string): string {
  const sample: Record<string, string> = {
    '{student}': 'Ayesha Karim', '{months}': '2', '{amount}': '1,600', '{school}': school || 'School',
    '{guardian}': 'Abdul Karim', '{month_names}': 'Feb 2026, Mar 2026', '{class}': 'Class 5 A',
  };
  return template.replace(/\{\w+\}/g, (p) => sample[p] ?? p);
}

/** Collection rate as text ("35%" / "—"). */
export function rateText(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${rate}%`;
}

/** Download a Blob as a file in the browser. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File name from a Content-Disposition header. */
export function fileNameFrom(disposition: string | undefined, fallback: string): string {
  const m = /filename="?([^";]+)"?/i.exec(disposition ?? '');
  return m ? m[1] : fallback;
}

export type ReportKey = 'cash-book' | 'monthly-summary' | 'outstanding' | 'concessions' | 'student-statement' | 'late-fines' | 'refunds';

/** Which filters each report uses. `dates` = from/to days; `months` = from/to months. */
export const REPORT_DEFS: Array<{ key: ReportKey; title: string; description: string; range: 'dates' | 'months' | 'none'; filters: Array<'class' | 'collector' | 'method' | 'student'> }> = [
  { key: 'cash-book', title: 'Daily collection (cash book)', description: 'Every payment by date, with totals per day, method and collector.', range: 'dates', filters: ['class', 'collector', 'method'] },
  { key: 'monthly-summary', title: 'Monthly collection summary', description: 'Billed vs collected per month, by class and by fee category.', range: 'months', filters: ['class'] },
  { key: 'outstanding', title: 'Outstanding dues by class', description: 'Dues per class and section, due now and not yet due.', range: 'none', filters: ['class'] },
  { key: 'concessions', title: 'Concessions and waivers', description: 'Discounts given on invoices and cancelled (waived) invoices.', range: 'dates', filters: ['class'] },
  { key: 'student-statement', title: 'Student fee statement', description: 'One student’s invoices and payments for the year — printable.', range: 'months', filters: ['student'] },
  { key: 'late-fines', title: 'Late fines', description: 'Late fines charged, waived and collected.', range: 'dates', filters: ['class'] },
  { key: 'refunds', title: 'Reversed and refunded payments', description: 'Payments reversed or refunded, with reasons.', range: 'dates', filters: [] },
];

/** Default range for a report: this month (dates) or this year (months). */
export function defaultRange(range: 'dates' | 'months' | 'none', today: string): { from: string; to: string } {
  if (range === 'dates') return { from: `${today.slice(0, 8)}01`, to: today };
  if (range === 'months') return { from: `${today.slice(0, 4)}-01`, to: `${today.slice(0, 4)}-12` };
  return { from: '', to: '' };
}
