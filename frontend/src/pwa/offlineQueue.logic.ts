// =============================================================================
// Offline attendance queue — pure logic (no IndexedDB, no network, no React).
// Checked by offlineQueue.check.ts.
//
// A queued entry holds one POST /attendance/bulk payload. Entries are keyed
// by (user, institution, date, scope) so re-saving the same register while
// still offline MERGES into the pending entry — the latest mark for each
// student wins — instead of stacking duplicates that would replay in order.
// =============================================================================

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY';

export interface AttendanceRecordPayload {
  studentId: string;
  status: AttendanceStatus;
  notes?: string | null;
}

/** Exactly the body POST /attendance/bulk accepts. */
export interface BulkAttendancePayload {
  date: string; // ISO string
  records: AttendanceRecordPayload[];
}

export interface QueueMeta {
  userId: string;
  institutionId: string | null;
  /** Stable identifier of the register, e.g. the section id. */
  scopeKey: string;
  /** Human label shown in the UI, e.g. "Class 6 - A". */
  label: string;
}

export type QueueEntryStatus = 'pending' | 'conflict';

export interface QueueEntry {
  id: string;
  key: string;
  meta: QueueMeta;
  payload: BulkAttendancePayload;
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  status: QueueEntryStatus;
  /** Server message when a replay was rejected (status 'conflict'). */
  error?: string;
}

export function dayOf(isoDate: string): string {
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? isoDate.slice(0, 10) : d.toISOString().slice(0, 10);
}

export function entryKey(meta: QueueMeta, payload: BulkAttendancePayload): string {
  return [meta.userId, meta.institutionId ?? '-', dayOf(payload.date), meta.scopeKey].join('|');
}

/** Merge record lists: later list wins per studentId; order = first appearance. */
export function mergeRecords(older: AttendanceRecordPayload[], newer: AttendanceRecordPayload[]): AttendanceRecordPayload[] {
  const map = new Map<string, AttendanceRecordPayload>();
  for (const r of older) map.set(r.studentId, r);
  for (const r of newer) map.set(r.studentId, r);
  return Array.from(map.values());
}

/**
 * Adds a payload to the queue. A pending entry with the same key absorbs it
 * (records merged, newer wins). A conflicted entry with the same key is
 * replaced by a fresh pending one carrying the merged records — the user has
 * re-saved, which is an explicit decision to try again.
 */
export function enqueue(
  queue: readonly QueueEntry[],
  payload: BulkAttendancePayload,
  meta: QueueMeta,
  now: Date,
  newId: () => string,
): QueueEntry[] {
  const key = entryKey(meta, payload);
  const idx = queue.findIndex((e) => e.key === key);
  const stamp = now.toISOString();
  if (idx === -1) {
    return [...queue, { id: newId(), key, meta, payload: { date: payload.date, records: [...payload.records] }, queuedAt: stamp, updatedAt: stamp, attempts: 0, status: 'pending' }];
  }
  const existing = queue[idx];
  const merged: QueueEntry = {
    ...existing,
    meta,
    payload: { date: payload.date, records: mergeRecords(existing.payload.records, payload.records) },
    updatedAt: stamp,
    status: 'pending',
    error: undefined,
  };
  const next = [...queue];
  next[idx] = merged;
  return next;
}

/** Entries the given user may replay now (their own, still pending), oldest first. */
export function replayable(queue: readonly QueueEntry[], userId: string | null | undefined, institutionId: string | null | undefined): QueueEntry[] {
  if (!userId) return [];
  return queue
    .filter((e) => e.status === 'pending' && e.meta.userId === userId && (e.meta.institutionId ?? null) === (institutionId ?? null))
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export type ReplayOutcome = 'done' | 'retry' | 'conflict' | 'auth';

/**
 * Classifies the result of replaying one entry.
 *   2xx                 → done (remove)
 *   no response / 5xx / 408 / 429 → retry later (keep pending; stop this pass)
 *   401                 → auth (keep pending; user must sign in again)
 *   other 4xx           → conflict (server rejected it — e.g. a student left
 *                         the section, the teacher lost access to the section,
 *                         validation failed). Needs the user's decision.
 */
export function classifyReplay(statusCode: number | null | undefined): ReplayOutcome {
  if (statusCode === null || statusCode === undefined || statusCode === 0) return 'retry';
  if (statusCode >= 200 && statusCode < 300) return 'done';
  if (statusCode === 401) return 'auth';
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500) return 'retry';
  return 'conflict';
}

export function markConflict(queue: readonly QueueEntry[], id: string, message: string): QueueEntry[] {
  return queue.map((e) => (e.id === id ? { ...e, status: 'conflict' as const, error: message, attempts: e.attempts + 1 } : e));
}

export function markAttempt(queue: readonly QueueEntry[], id: string): QueueEntry[] {
  return queue.map((e) => (e.id === id ? { ...e, attempts: e.attempts + 1 } : e));
}

export function removeEntry(queue: readonly QueueEntry[], id: string): QueueEntry[] {
  return queue.filter((e) => e.id !== id);
}

export function requeue(queue: readonly QueueEntry[], id: string): QueueEntry[] {
  return queue.map((e) => (e.id === id ? { ...e, status: 'pending' as const, error: undefined } : e));
}

/** Human-readable conflict text for a rejected replay. */
export function conflictMessage(entry: QueueEntry, serverMessage: string | undefined, statusCode: number | undefined): string {
  const base = serverMessage?.trim() || (statusCode === 403 ? 'You no longer have access to this register.' : 'The server rejected this register.');
  return `${entry.meta.label} · ${dayOf(entry.payload.date)}: ${base}`;
}
