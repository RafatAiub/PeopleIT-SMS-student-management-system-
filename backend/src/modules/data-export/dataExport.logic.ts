// =============================================================================
// Tenant data export — pure helpers (no prisma / fs). Unit-tested.
// =============================================================================

export const EXPORT_RETENTION_DAYS = 7;
export const EXPORT_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/** A job still being built — a second request while one is active is refused. */
export const ACTIVE_EXPORT_STATUSES: ExportStatus[] = ['PENDING', 'RUNNING'];

/** Jobs stuck PENDING/RUNNING longer than this were interrupted (restart) — marked FAILED. */
export const STALE_EXPORT_MS = 60 * 60 * 1000;

/**
 * Formats one CSV cell (RFC 4180):
 *   - null/undefined → empty; Date → ISO string; objects → JSON
 *   - quotes the value when it contains a comma, quote, CR or LF; doubles quotes
 *   - spreadsheet formula-injection guard: a text value starting with
 *     = + - @ TAB or CR is prefixed with a single quote so Excel/Sheets
 *     never evaluate it. Plain numbers (including negatives) are left alone.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  else if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  else if (typeof value === 'boolean') return value ? 'true' : 'false';
  else if (typeof value === 'object') {
    // Prisma Decimal is numeric (has toFixed) → its string form; other objects → JSON.
    if (typeof (value as { toFixed?: unknown }).toFixed === 'function') return String(value);
    text = JSON.stringify(value);
  } else text = String(value);

  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(values: readonly unknown[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}

/** UTF-8 BOM so Excel opens Bangla text correctly. */
export const CSV_BOM = '﻿';

export function expiryFrom(completedAt: Date, days = EXPORT_RETENTION_DAYS): Date {
  return new Date(completedAt.getTime() + days * 86_400_000);
}

export function isExpired(expiresAt: Date | null, now: Date): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}

/** File name stored in DataExportJob.fileUrl as `local:<name>` — never a user-controlled path. */
export function exportFileName(jobId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(jobId)) throw new Error('Invalid export job id');
  return `export-${jobId}.zip`;
}

export function fileNameFromUrl(fileUrl: string | null): string | null {
  if (!fileUrl || !fileUrl.startsWith('local:')) return null;
  const name = fileUrl.slice('local:'.length);
  return /^export-[A-Za-z0-9_-]{1,64}\.zip$/.test(name) ? name : null;
}
