// =============================================================================
// Pure inventory logic (no I/O) — unit tested in
// backend/tests/inventory-library-transport-logic.test.ts.
//
// Stock movement semantics (StockMovement.quantity):
//   IN     — positive number of units received.
//   OUT    — positive number of units issued / consumed.
//   ADJUST — SIGNED delta (e.g. -3 for three damaged units, +2 found in a
//            stock-take). A stock-take can also be entered as a counted
//            quantity; the service converts it to the signed delta.
// The running StockItem.quantity must never go below zero.
// =============================================================================

export type StockMovementKind = 'IN' | 'OUT' | 'ADJUST';

export interface StockChangeInput {
  type: StockMovementKind;
  /** IN/OUT: positive units. ADJUST: signed delta. Ignored when countedQuantity is set. */
  quantity?: number;
  /** ADJUST only: the physically counted quantity (stock-take). */
  countedQuantity?: number;
}

export type StockChangeResult =
  | { ok: true; delta: number; newQuantity: number; movementQuantity: number }
  | { ok: false; error: string };

/**
 * Works out the quantity change for one movement against the current stock.
 * Never returns a negative newQuantity — an OUT larger than stock, or an
 * ADJUST that would drop below zero, is rejected.
 */
export function computeStockChange(current: number, input: StockChangeInput): StockChangeResult {
  if (!Number.isInteger(current) || current < 0) return { ok: false, error: 'Current stock is invalid' };

  if (input.type === 'ADJUST' && input.countedQuantity !== undefined && input.countedQuantity !== null) {
    const counted = input.countedQuantity;
    if (!Number.isInteger(counted) || counted < 0) return { ok: false, error: 'Counted quantity must be a whole number of 0 or more' };
    const delta = counted - current;
    if (delta === 0) return { ok: false, error: 'Counted quantity equals the current stock — nothing to adjust' };
    return { ok: true, delta, newQuantity: counted, movementQuantity: delta };
  }

  const qty = input.quantity;
  if (qty === undefined || qty === null || !Number.isInteger(qty)) return { ok: false, error: 'Quantity must be a whole number' };

  switch (input.type) {
    case 'IN':
      if (qty <= 0) return { ok: false, error: 'Quantity received must be at least 1' };
      return { ok: true, delta: qty, newQuantity: current + qty, movementQuantity: qty };
    case 'OUT':
      if (qty <= 0) return { ok: false, error: 'Quantity issued must be at least 1' };
      if (qty > current) return { ok: false, error: `Insufficient stock — only ${current} available` };
      return { ok: true, delta: -qty, newQuantity: current - qty, movementQuantity: qty };
    case 'ADJUST':
      if (qty === 0) return { ok: false, error: 'Adjustment cannot be zero' };
      if (current + qty < 0) return { ok: false, error: `Adjustment would make stock negative — only ${current} available` };
      return { ok: true, delta: qty, newQuantity: current + qty, movementQuantity: qty };
    default:
      return { ok: false, error: 'Unknown movement type' };
  }
}

/** Signed effect of a stored movement on stock (for history / rebuilds). */
export function movementDelta(type: StockMovementKind, quantity: number): number {
  if (type === 'OUT') return -Math.abs(quantity);
  if (type === 'IN') return Math.abs(quantity);
  return quantity;
}

export function isLowStock(item: { quantity: number; reorderLevel: number }): boolean {
  return item.quantity <= item.reorderLevel;
}

/**
 * Weighted-average unit cost from IN movements that carry a unitCost.
 * Returns null when no costed IN movement exists (valuation unknown).
 */
export function weightedAverageCost(movements: { type: StockMovementKind; quantity: number; unitCost: number | null }[]): number | null {
  let units = 0;
  let paisa = 0;
  for (const m of movements) {
    if (m.type !== 'IN' || m.unitCost === null || m.unitCost === undefined || m.quantity <= 0) continue;
    units += m.quantity;
    paisa += Math.round(m.unitCost * 100) * m.quantity;
  }
  if (units === 0) return null;
  return Math.round(paisa / units) / 100;
}

export interface StockValuationRow {
  stockItemId: string;
  name: string;
  unit: string;
  quantity: number;
  averageUnitCost: number | null;
  value: number | null;
}

export function stockValuation(
  items: { id: string; name: string; unit: string; quantity: number }[],
  movementsByItem: Map<string, { type: StockMovementKind; quantity: number; unitCost: number | null }[]>,
): { rows: StockValuationRow[]; totalValue: number; unvaluedItems: number } {
  let totalPaisa = 0;
  let unvaluedItems = 0;
  const rows = items.map((it) => {
    const avg = weightedAverageCost(movementsByItem.get(it.id) ?? []);
    const value = avg === null ? null : Math.round(avg * 100 * it.quantity) / 100;
    if (value === null) {
      if (it.quantity > 0) unvaluedItems++;
    } else {
      totalPaisa += Math.round(value * 100);
    }
    return { stockItemId: it.id, name: it.name, unit: it.unit, quantity: it.quantity, averageUnitCost: avg, value };
  });
  return { rows, totalValue: totalPaisa / 100, unvaluedItems };
}

export interface PurchaseLineInput {
  name: string;
  stockItemId?: string | null;
  quantity: number;
  unitCost: number;
}

/** Sum of quantity × unitCost across lines, in paisa to avoid float drift. */
export function purchaseTotal(lines: PurchaseLineInput[]): number {
  const paisa = lines.reduce((sum, l) => sum + Math.round(l.unitCost * 100) * l.quantity, 0);
  return paisa / 100;
}

/** Asset codes are compared case-insensitively and stored trimmed + upper-cased. */
export function normalizeAssetCode(code: string): string {
  return code.trim().replace(/\s+/g, '-').toUpperCase();
}

/** "YYYY-MM" bucket in Bangladesh time (UTC+6, no DST). */
export function monthKey(date: Date, utcOffsetMinutes = 360): string {
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Every "YYYY-MM" from `from` to `to` inclusive, so empty months still chart as 0. */
export function monthRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  const start = monthKey(from);
  const end = monthKey(to);
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  for (let guard = 0; guard < 240 && (y < ey || (y === ey && m <= em)); guard++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function maintenanceCostByMonth(
  records: { date: Date; cost: number | null; status: string }[],
  from: Date,
  to: Date,
): { period: string; cost: number; count: number }[] {
  const buckets = new Map<string, { paisa: number; count: number }>(monthRange(from, to).map((k) => [k, { paisa: 0, count: 0 }]));
  for (const r of records) {
    if (r.status === 'CANCELLED') continue;
    const b = buckets.get(monthKey(r.date));
    if (!b) continue;
    b.paisa += Math.round((r.cost ?? 0) * 100);
    b.count++;
  }
  return [...buckets.entries()].map(([period, b]) => ({ period, cost: b.paisa / 100, count: b.count }));
}

/** RFC 4180 CSV cell escaping; also neutralises spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}
