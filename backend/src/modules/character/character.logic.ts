// =============================================================================
// Character (আখলাক) scoring & badges (T2) — pure logic. No DB, no Express.
// Unit-tested in tests/character-logic.test.ts.
// =============================================================================

export const DEFAULT_TRAITS: ReadonlyArray<{ name: string; nameBn: string; description: string }> = [
  { name: 'Punctuality', nameBn: 'সময়ানুবর্তিতা', description: 'Arrives on time for classes, salah and activities.' },
  { name: 'Manners (Adab)', nameBn: 'আদব', description: 'Polite speech and conduct with teachers, elders and classmates.' },
  { name: 'Salah', nameBn: 'সালাত', description: 'Regular and attentive in prayer.' },
  { name: 'Cleanliness', nameBn: 'পরিচ্ছন্নতা', description: 'Personal hygiene, tidy uniform and clean surroundings.' },
  { name: 'Respect', nameBn: 'শ্রদ্ধাবোধ', description: 'Respects teachers, parents, elders and others.' },
  { name: 'Responsibility', nameBn: 'দায়িত্বশীলতা', description: 'Completes duties and homework; takes care of belongings.' },
  { name: 'Honesty', nameBn: 'সততা', description: 'Truthful in words and actions.' },
];

/** The fixed badge icon set (names map to lucide icons on the frontend). */
export const BADGE_ICONS = [
  'star',
  'award',
  'medal',
  'trophy',
  'crown',
  'heart',
  'sparkles',
  'sun',
  'moon',
  'book',
  'clock',
  'shield',
  'thumbs-up',
  'smile',
  'leaf',
  'flame',
] as const;
export type BadgeIcon = (typeof BADGE_ICONS)[number];

export function isBadgeIcon(v: string): v is BadgeIcon {
  return (BADGE_ICONS as readonly string[]).includes(v);
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_BADGES: ReadonlyArray<{
  name: string;
  nameBn: string;
  description: string;
  icon: BadgeIcon;
  color: string;
  points: number;
  rule: 'NONE' | 'OVERALL_AVERAGE' | 'ATTENDANCE_STREAK';
  ruleThreshold?: number;
  ruleStreakDays?: number;
}> = [
  { name: 'Star of Akhlaq', nameBn: 'আখলাকের তারকা', description: 'Overall character score of 90% or more in a period.', icon: 'star', color: '#c2550a', points: 20, rule: 'OVERALL_AVERAGE', ruleThreshold: 90 },
  { name: 'Always on time', nameBn: 'সবসময় সময়মতো', description: '20 school days in a row present and on time.', icon: 'clock', color: '#0f766e', points: 15, rule: 'ATTENDANCE_STREAK', ruleStreakDays: 20 },
  { name: 'Helping hand', nameBn: 'সাহায্যের হাত', description: 'Awarded by a teacher for helping others.', icon: 'heart', color: '#be123c', points: 10, rule: 'NONE' },
];

export interface TraitLike {
  id: string;
  scaleMin: number;
  scaleMax: number;
  weight: number;
}

/** Is `score` a whole number inside the trait's scale? */
export function isValidScore(score: unknown, trait: Pick<TraitLike, 'scaleMin' | 'scaleMax'>): score is number {
  return typeof score === 'number' && Number.isInteger(score) && score >= trait.scaleMin && score <= trait.scaleMax;
}

/** A score as 0–100 % of its trait's scale (min → 0 %, max → 100 %). */
export function scorePercent(score: number, trait: Pick<TraitLike, 'scaleMin' | 'scaleMax'>): number {
  const span = trait.scaleMax - trait.scaleMin;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, ((score - trait.scaleMin) / span) * 100));
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Weighted overall percentage of one student's scores in a period. Traits with
 * weight 0 or no score are left out. Null when nothing is scored.
 */
export function overallPercent(scores: Array<{ traitId: string; score: number }>, traits: TraitLike[]): number | null {
  const byId = new Map(traits.map((t) => [t.id, t]));
  let sum = 0;
  let weights = 0;
  for (const s of scores) {
    const t = byId.get(s.traitId);
    if (!t || t.weight <= 0) continue;
    sum += scorePercent(s.score, t) * t.weight;
    weights += t.weight;
  }
  return weights > 0 ? round1(sum / weights) : null;
}

/** Average raw score per trait across many rows (e.g. a class, or a student over periods). */
export function averageByTrait(rows: Array<{ traitId: string; score: number }>): Record<string, number> {
  const acc: Record<string, { s: number; n: number }> = {};
  for (const r of rows) {
    const a = (acc[r.traitId] ??= { s: 0, n: 0 });
    a.s += r.score;
    a.n += 1;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(acc)) out[k] = round1(v.s / v.n);
  return out;
}

/** Letter-like band for report cards (EN + BN). */
export function characterBand(percent: number | null): { en: string; bn: string } | null {
  if (percent == null) return null;
  if (percent >= 90) return { en: 'Excellent', bn: 'চমৎকার' };
  if (percent >= 75) return { en: 'Very good', bn: 'খুব ভালো' };
  if (percent >= 60) return { en: 'Good', bn: 'ভালো' };
  if (percent >= 40) return { en: 'Satisfactory', bn: 'সন্তোষজনক' };
  return { en: 'Needs improvement', bn: 'উন্নতি প্রয়োজন' };
}

// ── Attendance streak ────────────────────────────────────────────────────────

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Longest run of consecutive *recorded* school days with status PRESENT
 * (LATE, ABSENT and HALF_DAY break the run). Days with no attendance row —
 * weekends, holidays — neither break nor extend a streak, so the streak
 * counts school days, not calendar days.
 */
export function longestOnTimeStreak(rows: Array<{ date: Date; status: string }>): number {
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  let best = 0;
  let run = 0;
  let lastKey = '';
  for (const r of sorted) {
    const k = dayKey(r.date);
    if (k === lastKey) continue; // one row per day
    lastKey = k;
    if (String(r.status).toUpperCase() === 'PRESENT') {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

// ── Auto badge rules ─────────────────────────────────────────────────────────

export type BadgeRule = 'NONE' | 'TRAIT_AVERAGE' | 'OVERALL_AVERAGE' | 'ATTENDANCE_STREAK';

export interface BadgeRuleDef {
  rule: BadgeRule;
  ruleTraitId: string | null;
  ruleThreshold: number | null;
  ruleStreakDays: number | null;
}

export interface StudentPeriodFacts {
  /** Raw score per traitId in the period. */
  traitScores: Record<string, number>;
  overallPercent: number | null;
  streak: number;
}

/** Does this student earn the badge for the period? NONE is manual-only → false. */
export function meetsBadgeRule(def: BadgeRuleDef, facts: StudentPeriodFacts): boolean {
  switch (def.rule) {
    case 'TRAIT_AVERAGE': {
      if (!def.ruleTraitId || def.ruleThreshold == null) return false;
      const s = facts.traitScores[def.ruleTraitId];
      return s != null && s >= def.ruleThreshold;
    }
    case 'OVERALL_AVERAGE':
      return def.ruleThreshold != null && facts.overallPercent != null && facts.overallPercent >= def.ruleThreshold;
    case 'ATTENDANCE_STREAK':
      return def.ruleStreakDays != null && def.ruleStreakDays > 0 && facts.streak >= def.ruleStreakDays;
    default:
      return false;
  }
}

/** Why a rule definition is invalid, or null when it is fine. */
export function badgeRuleProblem(
  def: BadgeRuleDef,
  trait?: { scaleMin: number; scaleMax: number } | null,
): string | null {
  switch (def.rule) {
    case 'NONE':
      return null;
    case 'TRAIT_AVERAGE':
      if (!def.ruleTraitId) return 'Choose the trait for this rule';
      if (!trait) return 'Trait not found';
      if (def.ruleThreshold == null) return 'Set the minimum score';
      if (def.ruleThreshold < trait.scaleMin || def.ruleThreshold > trait.scaleMax) {
        return `The minimum score must be between ${trait.scaleMin} and ${trait.scaleMax}`;
      }
      return null;
    case 'OVERALL_AVERAGE':
      if (def.ruleThreshold == null || def.ruleThreshold <= 0 || def.ruleThreshold > 100) return 'Set an overall percentage between 1 and 100';
      return null;
    case 'ATTENDANCE_STREAK':
      if (!def.ruleStreakDays || def.ruleStreakDays < 2 || def.ruleStreakDays > 365) return 'Set a streak between 2 and 365 days';
      return null;
    default:
      return 'Unknown rule';
  }
}

export const autoDedupeKey = (badgeId: string, studentId: string, periodId: string) => `auto:${badgeId}:${studentId}:${periodId}`;

// ── Periods ──────────────────────────────────────────────────────────────────

export type PeriodKind = 'WEEKLY' | 'MONTHLY' | 'TERM';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Suggested bounds and name for a new WEEKLY (Saturday–Friday, the Bangladesh
 * school week) or MONTHLY period containing `at` (UTC dates).
 */
export function suggestPeriod(kind: 'WEEKLY' | 'MONTHLY', at: Date): { name: string; startDate: Date; endDate: Date } {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  if (kind === 'MONTHLY') {
    return {
      name: `${MONTHS_EN[m]} ${y}`,
      startDate: new Date(Date.UTC(y, m, 1)),
      endDate: new Date(Date.UTC(y, m + 1, 0)),
    };
  }
  const day = at.getUTCDay(); // 0 Sun … 6 Sat
  const back = (day + 1) % 7; // days since Saturday
  const start = new Date(Date.UTC(y, m, at.getUTCDate() - back));
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { name: `Week of ${dayKey(start)}`, startDate: start, endDate: end };
}

export function periodRangeProblem(start: Date, end: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Invalid dates';
  if (end < start) return 'The end date must be on or after the start date';
  if (end.getTime() - start.getTime() > 400 * 86_400_000) return 'A period can be at most about a year long';
  return null;
}

// ── Leaderboards (privacy-friendly) ──────────────────────────────────────────

/** First name + class only — never surname, roll or ID. */
export function leaderboardName(firstName: string | null | undefined): string {
  const f = String(firstName ?? '').trim().split(/\s+/)[0];
  return f || '—';
}

/** Dense ranking: equal points share a rank (1, 2, 2, 3). */
export function rankRows<T extends { points: number }>(rows: T[]): Array<T & { rank: number }> {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  let rank = 0;
  let last: number | null = null;
  return sorted.map((r) => {
    if (r.points !== last) {
      rank += 1;
      last = r.points;
    }
    return { ...r, rank };
  });
}

/** Parses a bulk grid cell: '' → null (clear), digits → number, anything else → NaN. */
export function parseScoreCell(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  return /^\d{1,2}$/.test(s) ? Number(s) : Number.NaN;
}
