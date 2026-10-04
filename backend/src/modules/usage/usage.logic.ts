// =============================================================================
// Usage metering — pure helpers (no prisma / env access). Unit-tested.
// =============================================================================

export type MeteredMetric = 'SMS' | 'EMAIL' | 'AI_CALL' | 'STORAGE_MB';
export const METERED_METRICS: MeteredMetric[] = ['SMS', 'EMAIL', 'AI_CALL', 'STORAGE_MB'];

export const UNIT_PRICE_ENV: Record<MeteredMetric, string> = {
  SMS: 'COST_PER_SMS_BDT',
  EMAIL: 'COST_PER_EMAIL_BDT',
  AI_CALL: 'COST_PER_AI_CALL_BDT',
  STORAGE_MB: 'COST_PER_STORAGE_MB_BDT',
};

export type UnitPrices = Record<MeteredMetric, number | null>;

/** Parses a non-negative price; empty/invalid → null ("not configured"). */
export function parsePrice(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function unitPricesFrom(env: Record<string, string | undefined>): UnitPrices {
  return {
    SMS: parsePrice(env[UNIT_PRICE_ENV.SMS]),
    EMAIL: parsePrice(env[UNIT_PRICE_ENV.EMAIL]),
    AI_CALL: parsePrice(env[UNIT_PRICE_ENV.AI_CALL]),
    STORAGE_MB: parsePrice(env[UNIT_PRICE_ENV.STORAGE_MB]),
  };
}

/** Money rounded to 2 dp, or null when the unit price is not configured. */
export function estimateCost(billableUnits: number, unitPrice: number | null): number | null {
  if (unitPrice === null) return null;
  return Math.round(billableUnits * unitPrice * 100) / 100;
}

/** Sum of the configured line costs; null when no line has a price. */
export function totalCost(costs: Array<number | null>): number | null {
  const known = costs.filter((c): c is number => c !== null);
  if (!known.length) return null;
  return Math.round(known.reduce((a, b) => a + b, 0) * 100) / 100;
}

/**
 * "YYYY-MM" → [start, end) in UTC. Undefined → the current month.
 * Throws on a malformed month.
 */
export function monthRange(month: string | undefined, now = new Date()): { month: string; start: Date; end: Date } {
  let year: number;
  let mon: number; // 0-based
  if (month) {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
    if (!m) throw new Error('month must be YYYY-MM');
    year = Number(m[1]);
    mon = Number(m[2]) - 1;
  } else {
    year = now.getUTCFullYear();
    mon = now.getUTCMonth();
  }
  const start = new Date(Date.UTC(year, mon, 1));
  const end = new Date(Date.UTC(year, mon + 1, 1));
  return { month: `${year}-${String(mon + 1).padStart(2, '0')}`, start, end };
}

export interface MetricCounts {
  /** Messages/calls actually sent through a real provider (billable). */
  billable: number;
  /** Demo / skipped sends — logged, not sent, not billed. */
  demo: number;
}

/**
 * Billable SMS/email units for a month. Campaign sends already write a
 * UsageRecord (SMS quantity = segments), so NotificationDelivery rows with a
 * `CAMPAIGN:` templateKey are excluded here to avoid double counting.
 */
export function messagingUnits(params: { usageRecordUnits: number; transactionalSent: number }): number {
  return params.usageRecordUnits + params.transactionalSent;
}
