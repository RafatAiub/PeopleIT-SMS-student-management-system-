// =============================================================================
// T2 character — pure UI logic for the score grid (no React, no network).
// Tested by pages/character/__tests__/character-logic.test.ts (self-running).
// =============================================================================

export interface GridTrait {
  id: string;
  scaleMin: number;
  scaleMax: number;
  weight: number;
}

/** studentId → traitId → score */
export type ScoreMap = Record<string, Record<string, number | null>>;

export const cellKey = (studentId: string, traitId: string) => `${studentId}:${traitId}`;

/**
 * Parses what a teacher typed into a cell. '' → null (clear). A value outside
 * the scale is rejected ('invalid'), so a typo never silently saves.
 */
export function parseCell(raw: string, trait: Pick<GridTrait, 'scaleMin' | 'scaleMax'>): number | null | 'invalid' {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^\d{1,2}$/.test(s)) return 'invalid';
  const n = Number(s);
  return n >= trait.scaleMin && n <= trait.scaleMax ? n : 'invalid';
}

/** Weighted overall 0–100 % (same formula as the server). */
export function overallPercent(scores: Record<string, number | null> | undefined, traits: GridTrait[]): number | null {
  if (!scores) return null;
  let sum = 0;
  let w = 0;
  for (const t of traits) {
    const s = scores[t.id];
    if (s == null || t.weight <= 0) continue;
    const span = t.scaleMax - t.scaleMin;
    const pct = span <= 0 ? 100 : Math.max(0, Math.min(100, ((s - t.scaleMin) / span) * 100));
    sum += pct * t.weight;
    w += t.weight;
  }
  return w > 0 ? Math.round((sum / w) * 10) / 10 : null;
}

/** Keyboard navigation inside the grid: arrows, Enter = down, Tab handled by the browser. */
export function moveCell(
  pos: { row: number; col: number },
  key: string,
  rows: number,
  cols: number,
): { row: number; col: number } | null {
  switch (key) {
    case 'ArrowUp':
      return pos.row > 0 ? { row: pos.row - 1, col: pos.col } : null;
    case 'ArrowDown':
    case 'Enter':
      return pos.row < rows - 1 ? { row: pos.row + 1, col: pos.col } : null;
    case 'ArrowLeft':
      return pos.col > 0 ? { row: pos.row, col: pos.col - 1 } : null;
    case 'ArrowRight':
      return pos.col < cols - 1 ? { row: pos.row, col: pos.col + 1 } : null;
    default:
      return null;
  }
}

/**
 * Bulk fill ("all 4"): sets `value` for every student × trait (or one trait)
 * that the value fits; values outside a trait's scale are skipped.
 */
export function bulkFill(
  current: ScoreMap,
  studentIds: string[],
  traits: GridTrait[],
  value: number,
  opts: { traitId?: string; onlyEmpty?: boolean } = {},
): ScoreMap {
  const next: ScoreMap = {};
  for (const sid of studentIds) {
    next[sid] = { ...(current[sid] ?? {}) };
    for (const t of traits) {
      if (opts.traitId && t.id !== opts.traitId) continue;
      if (value < t.scaleMin || value > t.scaleMax) continue;
      if (opts.onlyEmpty && next[sid][t.id] != null) continue;
      next[sid][t.id] = value;
    }
  }
  return next;
}

/** Only the cells that differ from what was loaded, as the PUT /grid payload. */
export function diffScores(
  original: ScoreMap,
  edited: ScoreMap,
): Array<{ studentId: string; traitId: string; score: number | null }> {
  const out: Array<{ studentId: string; traitId: string; score: number | null }> = [];
  for (const [studentId, row] of Object.entries(edited)) {
    for (const [traitId, score] of Object.entries(row)) {
      const before = original[studentId]?.[traitId] ?? null;
      if ((score ?? null) !== before) out.push({ studentId, traitId, score: score ?? null });
    }
  }
  return out;
}

export function diffComments(
  original: Record<string, string | null>,
  edited: Record<string, string>,
): Array<{ studentId: string; comment: string | null }> {
  return Object.entries(edited)
    .filter(([sid, c]) => (c.trim() || null) !== ((original[sid] ?? '').trim() || null))
    .map(([studentId, c]) => ({ studentId, comment: c.trim() || null }));
}

/** Band label (EN/BN) for an overall percentage — mirrors the server. */
export function bandFor(percent: number | null): { en: string; bn: string } | null {
  if (percent == null) return null;
  if (percent >= 90) return { en: 'Excellent', bn: 'চমৎকার' };
  if (percent >= 75) return { en: 'Very good', bn: 'খুব ভালো' };
  if (percent >= 60) return { en: 'Good', bn: 'ভালো' };
  if (percent >= 40) return { en: 'Satisfactory', bn: 'সন্তোষজনক' };
  return { en: 'Needs improvement', bn: 'উন্নতি প্রয়োজন' };
}

/** yyyy-mm-dd bounds for a quick WEEKLY (Sat–Fri) or MONTHLY period. */
export function quickPeriod(kind: 'WEEKLY' | 'MONTHLY', at: Date): { name: string; startDate: string; endDate: string } {
  const y = at.getFullYear();
  const m = at.getMonth();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (kind === 'MONTHLY') {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return { name: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }), startDate: iso(start), endDate: iso(end) };
  }
  const back = (at.getDay() + 1) % 7;
  const start = new Date(y, m, at.getDate() - back);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { name: `Week of ${iso(start)}`, startDate: iso(start), endDate: iso(end) };
}
