// =============================================================================
// T4 Admissions CRM — pure helpers (no I/O). Unit-tested in
// tests/crm-logic.test.ts; the DB side lives in crm.*.service.ts.
// =============================================================================

import { digitsOf } from '../../utils/phone';

export type EnquiryStatus = 'NEW' | 'CONTACTED' | 'VISITED' | 'APPLIED' | 'ENROLLED' | 'LOST';
export const ENQUIRY_STATUSES: EnquiryStatus[] = ['NEW', 'CONTACTED', 'VISITED', 'APPLIED', 'ENROLLED', 'LOST'];

export interface StageSeed {
  status: EnquiryStatus;
  name: string;
  nameBn: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

/** Same values as the seed in migration 20261017090000_t4_crm (tested). */
export const DEFAULT_STAGES: StageSeed[] = [
  { status: 'NEW', name: 'New', nameBn: 'নতুন', color: '#3b82f6', order: 1, isWon: false, isLost: false },
  { status: 'CONTACTED', name: 'Contacted', nameBn: 'যোগাযোগ হয়েছে', color: '#8b5cf6', order: 2, isWon: false, isLost: false },
  { status: 'VISITED', name: 'Visit scheduled', nameBn: 'পরিদর্শন নির্ধারিত', color: '#f59e0b', order: 3, isWon: false, isLost: false },
  { status: 'APPLIED', name: 'Applied', nameBn: 'আবেদন করেছে', color: '#0ea5e9', order: 4, isWon: false, isLost: false },
  { status: 'ENROLLED', name: 'Admitted', nameBn: 'ভর্তি হয়েছে', color: '#16a34a', order: 5, isWon: true, isLost: false },
  { status: 'LOST', name: 'Lost', nameBn: 'হারানো', color: '#dc2626', order: 6, isWon: false, isLost: true },
];

export interface StageLike {
  id: string;
  order: number;
  status: EnquiryStatus | string;
  isWon: boolean;
  isLost: boolean;
  name?: string;
}

/** A won stage always counts as ENROLLED and a lost stage as LOST. */
export function statusForStage(stage: { isWon: boolean; isLost: boolean; status?: string | null }, fallback: EnquiryStatus = 'CONTACTED'): EnquiryStatus {
  if (stage.isWon) return 'ENROLLED';
  if (stage.isLost) return 'LOST';
  const s = stage.status as EnquiryStatus | undefined;
  // An open stage may not claim a closed status.
  if (s && ENQUIRY_STATUSES.includes(s) && s !== 'ENROLLED' && s !== 'LOST') return s;
  return fallback;
}

/** The stage a legacy status maps to: keep the current stage when it already counts as that status, else the first (by order). */
export function stageForStatus<T extends StageLike>(stages: T[], status: string, currentStageId?: string | null): T | undefined {
  const current = currentStageId ? stages.find((s) => s.id === currentStageId) : undefined;
  if (current && current.status === status) return current;
  return [...stages].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).find((s) => s.status === status);
}

/** Validates a full stage set: names unique, at least one open, one won and one lost stage. Returns an error message or null. */
export function validateStageSet(stages: Array<{ name: string; isWon: boolean; isLost: boolean }>): string | null {
  if (stages.length === 0) return 'At least one stage is required';
  const names = stages.map((s) => s.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Stage names must be unique';
  if (stages.some((s) => s.isWon && s.isLost)) return 'A stage cannot be both won and lost';
  if (!stages.some((s) => s.isWon)) return 'Keep at least one "won" (admitted) stage';
  if (!stages.some((s) => s.isLost)) return 'Keep at least one "lost" stage';
  if (!stages.some((s) => !s.isWon && !s.isLost)) return 'Keep at least one open stage';
  return null;
}

// ── Dates (Asia/Dhaka, fixed UTC+6, no DST) ─────────────────────────────────

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** [start, end) of the Dhaka calendar day containing `now`, as UTC instants. */
export function dhakaDayBounds(now = new Date()): { start: Date; end: Date } {
  const local = now.getTime() + DHAKA_OFFSET_MS;
  const startLocal = Math.floor(local / DAY_MS) * DAY_MS;
  return { start: new Date(startLocal - DHAKA_OFFSET_MS), end: new Date(startLocal - DHAKA_OFFSET_MS + DAY_MS) };
}

/** YYYY-MM-DD of the Dhaka day containing `now`. */
export function dhakaDateKey(now = new Date()): string {
  return new Date(now.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hour (0–23) in Dhaka. */
export function dhakaHour(now = new Date()): number {
  return new Date(now.getTime() + DHAKA_OFFSET_MS).getUTCHours();
}

/** YYYY-MM in Dhaka (report "month" bucket). */
export function dhakaMonthKey(d: Date): string {
  return new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 7);
}

export type DueState = 'overdue' | 'today' | 'upcoming' | 'none';

export function dueState(dueAt: Date | string | null | undefined, now = new Date()): DueState {
  if (!dueAt) return 'none';
  const t = new Date(dueAt).getTime();
  const { start, end } = dhakaDayBounds(now);
  if (t < start.getTime()) return 'overdue';
  if (t < end.getTime()) return 'today';
  return 'upcoming';
}

// ── Daily digest ────────────────────────────────────────────────────────────

export interface DigestTask {
  id: string;
  title: string;
  dueAt: Date | null;
  done: boolean;
  assigneeUserId: string | null;
  enquiryName?: string | null;
}

export interface DigestFollowUp {
  id: string;
  studentName: string;
  nextStep: string | null;
  followUpAt: Date | null;
  assignedToUserId: string | null;
  closed: boolean;
}

export interface DigestEntry {
  userId: string;
  overdue: number;
  dueToday: number;
  followUps: number;
  lines: string[];
}

/**
 * Who gets a digest today, and what it says: open tasks (and open enquiries'
 * next steps) that are overdue or due today, grouped by assignee. Done tasks,
 * closed enquiries, unassigned items and items due after today are skipped.
 */
export function selectDigest(tasks: DigestTask[], followUps: DigestFollowUp[], now = new Date(), maxLines = 10): DigestEntry[] {
  const { end } = dhakaDayBounds(now);
  const byUser = new Map<string, DigestEntry & { sortable: Array<{ t: number; line: string }> }>();
  const entry = (userId: string) => {
    let e = byUser.get(userId);
    if (!e) {
      e = { userId, overdue: 0, dueToday: 0, followUps: 0, lines: [], sortable: [] };
      byUser.set(userId, e);
    }
    return e;
  };
  for (const t of tasks) {
    if (t.done || !t.assigneeUserId || !t.dueAt || t.dueAt.getTime() >= end.getTime()) continue;
    const e = entry(t.assigneeUserId);
    const state = dueState(t.dueAt, now);
    if (state === 'overdue') e.overdue++;
    else e.dueToday++;
    e.sortable.push({ t: t.dueAt.getTime(), line: `${state === 'overdue' ? '[Overdue] ' : ''}${t.title}${t.enquiryName ? ` — ${t.enquiryName}` : ''}` });
  }
  for (const f of followUps) {
    if (f.closed || !f.assignedToUserId || !f.followUpAt || f.followUpAt.getTime() >= end.getTime()) continue;
    const e = entry(f.assignedToUserId);
    e.followUps++;
    const state = dueState(f.followUpAt, now);
    e.sortable.push({ t: f.followUpAt.getTime(), line: `${state === 'overdue' ? '[Overdue] ' : ''}Follow up: ${f.studentName}${f.nextStep ? ` — ${f.nextStep}` : ''}` });
  }
  return [...byUser.values()]
    .map(({ sortable, ...e }) => {
      const sorted = sortable.sort((a, b) => a.t - b.t).map((s) => s.line);
      const lines = sorted.slice(0, maxLines);
      if (sorted.length > maxLines) lines.push(`…and ${sorted.length - maxLines} more`);
      return { ...e, lines };
    })
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

// ── Duplicates ──────────────────────────────────────────────────────────────

/** Lower-case, strip punctuation and honorifics, collapse spaces. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[.,'’"`()\-_/]/g, ' ')
    .replace(/\b(md|mohammad|muhammad|mohammed|mst|mrs|mr|miss|ms)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Last 10 digits of a phone ('' when fewer than 6 digits). */
export function phoneKey(phone: string | null | undefined): string {
  const d = digitsOf(phone ?? '');
  return d.length < 6 ? '' : d.slice(-10);
}

export function emailKey(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity of two names (token-order independent). */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeName(a).split(' ').filter(Boolean).sort().join(' ');
  const nb = normalizeName(b).split(' ').filter(Boolean).sort().join(' ');
  if (!na || !nb) return 0;
  const max = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / max;
}

export interface DupCandidate {
  id: string;
  studentName: string;
  guardianName?: string | null;
  phone?: string | null;
  email?: string | null;
}

export type DupReason = 'PHONE' | 'EMAIL' | 'NAME';
export const NAME_SIMILARITY_THRESHOLD = 0.8;

/** Why `b` looks like a duplicate of `a` (empty = not a duplicate). */
export function duplicateReasons(a: DupCandidate, b: DupCandidate): DupReason[] {
  if (a.id === b.id) return [];
  const reasons: DupReason[] = [];
  const pa = phoneKey(a.phone);
  if (pa && pa === phoneKey(b.phone)) reasons.push('PHONE');
  const ea = emailKey(a.email);
  if (ea && ea === emailKey(b.email)) reasons.push('EMAIL');
  if (nameSimilarity(a.studentName, b.studentName) >= NAME_SIMILARITY_THRESHOLD) {
    // A name match alone is weak (common names); require the guardian to look alike too when both are known.
    const ga = normalizeName(a.guardianName);
    const gb = normalizeName(b.guardianName);
    if (reasons.length > 0 || !ga || !gb || nameSimilarity(ga, gb) >= NAME_SIMILARITY_THRESHOLD) reasons.push('NAME');
  }
  return reasons;
}

/** Groups enquiries into duplicate clusters (union-find over pairwise matches, bucketed to stay sub-quadratic). */
export function findDuplicateGroups<T extends DupCandidate>(rows: T[]): Array<{ items: T[]; reasons: DupReason[] }> {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reasonsByRoot = new Map<number, Set<DupReason>>();
  const pairs: Array<[number, number, DupReason[]]> = [];

  const buckets = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const keys = new Set<string>();
    const p = phoneKey(r.phone);
    if (p) keys.add(`p:${p}`);
    const e = emailKey(r.email);
    if (e) keys.add(`e:${e}`);
    const n = normalizeName(r.studentName).replace(/\s/g, '');
    if (n.length >= 3) keys.add(`n:${n.slice(0, 3)}`);
    for (const k of keys) {
      const list = buckets.get(k) ?? [];
      list.push(i);
      buckets.set(k, list);
    }
  });
  const seen = new Set<string>();
  for (const idxs of buckets.values()) {
    if (idxs.length < 2 || idxs.length > 400) continue; // a giant bucket is noise (e.g. a shared office phone)
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x];
        const j = idxs[y];
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const reasons = duplicateReasons(rows[i], rows[j]);
        if (reasons.length) pairs.push([i, j, reasons]);
      }
    }
  }
  for (const [i, j] of pairs) parent[find(i)] = find(j);
  for (const [i, , reasons] of pairs) {
    const root = find(i);
    const set = reasonsByRoot.get(root) ?? new Set<DupReason>();
    reasons.forEach((r) => set.add(r));
    reasonsByRoot.set(root, set);
  }
  const groups = new Map<number, T[]>();
  rows.forEach((r, i) => {
    const root = find(i);
    if (!reasonsByRoot.has(root)) return;
    const list = groups.get(root) ?? [];
    list.push(r);
    groups.set(root, list);
  });
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([root, items]) => ({ items, reasons: [...(reasonsByRoot.get(root) ?? [])] }));
}

// ── Merge ───────────────────────────────────────────────────────────────────

export const MERGE_FILL_FIELDS = ['guardianName', 'email', 'classInterested', 'source', 'assignedToUserId', 'followUpAt', 'nextStep', 'lostReason'] as const;

/** Fields of `keep` that are empty and can be filled from `drop`. */
export function mergeFill<T extends Record<string, unknown>>(keep: T, drop: T): Partial<T> {
  const patch: Partial<T> = {};
  for (const f of MERGE_FILL_FIELDS) {
    const k = keep[f];
    const d = drop[f];
    if ((k === null || k === undefined || k === '') && d !== null && d !== undefined && d !== '') {
      (patch as Record<string, unknown>)[f] = d;
    }
  }
  return patch;
}

// ── Conversion report ───────────────────────────────────────────────────────

export interface ReportRow {
  id: string;
  createdAt: Date;
  wonAt: Date | null;
  source: string | null;
  classInterested: string | null;
  ownerId: string | null;
  stageId: string | null;
  /** Orders of stages this enquiry has been in (from the activity log), besides the current one. */
  visitedStageIds?: string[];
}

export type ReportGroupBy = 'source' | 'class' | 'owner' | 'month';

export interface ConversionGroup {
  key: string;
  total: number;
  won: number;
  lost: number;
  open: number;
  /** Percent, one decimal. */
  conversionRate: number;
  /** Average days from enquiry to admission for won rows (null when none). */
  avgDaysToAdmit: number | null;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY_MS;
}

export function groupKey(row: ReportRow, by: ReportGroupBy): string {
  switch (by) {
    case 'source':
      return (row.source || 'UNKNOWN').toUpperCase();
    case 'class':
      return row.classInterested?.trim() || '—';
    case 'owner':
      return row.ownerId ?? '';
    case 'month':
      return dhakaMonthKey(row.createdAt);
  }
}

export function computeConversion(rows: ReportRow[], stages: StageLike[], by: ReportGroupBy): ConversionGroup[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const groups = new Map<string, { total: number; won: number; lost: number; days: number[] }>();
  for (const r of rows) {
    const key = groupKey(r, by);
    const g = groups.get(key) ?? { total: 0, won: 0, lost: 0, days: [] };
    g.total++;
    const st = r.stageId ? stageById.get(r.stageId) : undefined;
    if (st?.isWon) {
      g.won++;
      if (r.wonAt) g.days.push(Math.max(0, daysBetween(r.createdAt, r.wonAt)));
    } else if (st?.isLost) g.lost++;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      total: g.total,
      won: g.won,
      lost: g.lost,
      open: g.total - g.won - g.lost,
      conversionRate: pct(g.won, g.total),
      avgDaysToAdmit: g.days.length ? round1(g.days.reduce((s, d) => s + d, 0) / g.days.length) : null,
    }))
    .sort((a, b) => (by === 'month' ? a.key.localeCompare(b.key) : b.total - a.total || a.key.localeCompare(b.key)));
}

export interface FunnelStep {
  stageId: string;
  name: string;
  /** Enquiries currently in this stage. */
  current: number;
  /** Enquiries that reached this stage or a later open/won one (lost rows count up to the furthest stage they reached). */
  reached: number;
  /** reached / total enquiries, percent. */
  rate: number;
}

/**
 * Funnel over the non-lost stages in order. An enquiry "reached" stage k when
 * its current stage — or any stage in its history — is at order ≥ k. Lost
 * enquiries with no history count only at the first stage.
 */
export function computeStageFunnel(rows: ReportRow[], stages: StageLike[]): { total: number; steps: FunnelStep[]; lost: number } {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const path = ordered.filter((s) => !s.isLost);
  const rank = new Map(path.map((s, i) => [s.id, i]));
  const lostIds = new Set(ordered.filter((s) => s.isLost).map((s) => s.id));
  const reachedCounts = new Array(path.length).fill(0);
  const currentCounts = new Map<string, number>();
  let lost = 0;
  for (const r of rows) {
    if (r.stageId) currentCounts.set(r.stageId, (currentCounts.get(r.stageId) ?? 0) + 1);
    if (r.stageId && lostIds.has(r.stageId)) lost++;
    let furthest = 0;
    for (const id of [r.stageId, ...(r.visitedStageIds ?? [])]) {
      const k = id ? rank.get(id) : undefined;
      if (k !== undefined && k > furthest) furthest = k;
    }
    for (let k = 0; k <= furthest && k < path.length; k++) reachedCounts[k]++;
  }
  return {
    total: rows.length,
    lost,
    steps: path.map((s, k) => ({
      stageId: s.id,
      name: s.name ?? '',
      current: currentCounts.get(s.id) ?? 0,
      reached: reachedCounts[k],
      rate: pct(reachedCounts[k], rows.length),
    })),
  };
}

export function overallConversion(rows: ReportRow[], stages: StageLike[]) {
  const [all] = computeConversion(
    rows.map((r) => ({ ...r, source: 'ALL' })),
    stages,
    'source',
  );
  return all ?? { key: 'ALL', total: 0, won: 0, lost: 0, open: 0, conversionRate: 0, avgDaysToAdmit: null };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
