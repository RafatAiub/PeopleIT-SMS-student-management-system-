// Pure-logic checks for the offline attendance queue (no IndexedDB, no DOM).
// The frontend has no test runner; this file is type-checked by `tsc` and can
// be executed stand-alone:
//   npx ts-node --transpile-only -O '{"module":"commonjs"}' frontend/src/pwa/offlineQueue.check.ts
// It is never imported by the app.

import {
  classifyReplay,
  conflictMessage,
  enqueue,
  entryKey,
  markConflict,
  mergeRecords,
  removeEntry,
  replayable,
  requeue,
  type QueueEntry,
  type QueueMeta,
} from './offlineQueue.logic';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`offlineQueue check failed: ${name}`);
  passed++;
}

let n = 0;
const id = () => `id${++n}`;
const meta: QueueMeta = { userId: 'u1', institutionId: 'i1', scopeKey: 'sec-a', label: 'Class 6 - A' };
const t0 = new Date('2026-09-28T08:00:00Z');
const t1 = new Date('2026-09-28T08:05:00Z');
const date = '2026-09-28T00:00:00.000Z';

// 1. First save creates a pending entry.
let q: QueueEntry[] = enqueue([], { date, records: [{ studentId: 's1', status: 'PRESENT' }, { studentId: 's2', status: 'ABSENT' }] }, meta, t0, id);
check('creates entry', q.length === 1 && q[0].status === 'pending' && q[0].payload.records.length === 2);

// 2. Re-saving the same register merges; newer mark wins, new students appended.
q = enqueue(q, { date, records: [{ studentId: 's2', status: 'LATE', notes: 'bus' }, { studentId: 's3', status: 'PRESENT' }] }, meta, t1, id);
check('merges same key', q.length === 1);
check('newer wins', q[0].payload.records.find((r) => r.studentId === 's2')?.status === 'LATE');
check('keeps untouched', q[0].payload.records.find((r) => r.studentId === 's1')?.status === 'PRESENT');
check('appends new', q[0].payload.records.length === 3);
check('keeps original queuedAt', q[0].queuedAt === t0.toISOString() && q[0].updatedAt === t1.toISOString());

// 3. Different day or section → separate entries.
q = enqueue(q, { date: '2026-09-29T00:00:00.000Z', records: [{ studentId: 's1', status: 'ABSENT' }] }, meta, t1, id);
q = enqueue(q, { date, records: [{ studentId: 's9', status: 'PRESENT' }] }, { ...meta, scopeKey: 'sec-b', label: 'Class 6 - B' }, t1, id);
check('separate keys', q.length === 3);
check('key includes day', entryKey(meta, { date: '2026-09-28T18:00:00.000Z', records: [] }) === 'u1|i1|2026-09-28|sec-a');

// 4. Only the owner's pending entries replay, oldest first.
q = enqueue(q, { date, records: [{ studentId: 'x', status: 'PRESENT' }] }, { ...meta, userId: 'u2' }, t0, id);
check('replay filters user', replayable(q, 'u1', 'i1').length === 3);
check('replay nothing when signed out', replayable(q, null, 'i1').length === 0);
check('replay filters institution', replayable(q, 'u1', 'other').length === 0);

// 5. Conflicts leave the replay set; re-saving revives as pending with merged records.
const first = q[0].id;
q = markConflict(q, first, 'Class 6 - A · 2026-09-28: Student not in section');
check('conflict excluded', replayable(q, 'u1', 'i1').every((e) => e.id !== first));
q = enqueue(q, { date, records: [{ studentId: 's1', status: 'ABSENT' }] }, meta, t1, id);
const revived = q.find((e) => e.id === first)!;
check('resave revives', revived.status === 'pending' && revived.error === undefined);
check('resave merges into conflict', revived.payload.records.find((r) => r.studentId === 's1')?.status === 'ABSENT' && revived.payload.records.length === 3);
q = markConflict(q, first, 'x');
q = requeue(q, first);
check('requeue', q.find((e) => e.id === first)?.status === 'pending');
q = removeEntry(q, first);
check('remove', !q.some((e) => e.id === first));

// 6. Replay classification.
check('2xx done', classifyReplay(201) === 'done');
check('offline retry', classifyReplay(null) === 'retry' && classifyReplay(0) === 'retry');
check('5xx retry', classifyReplay(503) === 'retry' && classifyReplay(429) === 'retry' && classifyReplay(408) === 'retry');
check('401 auth', classifyReplay(401) === 'auth');
check('4xx conflict', classifyReplay(403) === 'conflict' && classifyReplay(422) === 'conflict' && classifyReplay(409) === 'conflict');

// 7. Messages & record merge helper.
const e0 = enqueue([], { date, records: [] }, meta, t0, id)[0];
check('conflict message uses server text', conflictMessage(e0, 'Not your section', 403) === 'Class 6 - A · 2026-09-28: Not your section');
check('conflict message 403 fallback', conflictMessage(e0, undefined, 403).includes('no longer have access'));
check('mergeRecords order', mergeRecords([{ studentId: 'a', status: 'PRESENT' }], [{ studentId: 'b', status: 'ABSENT' }, { studentId: 'a', status: 'LATE' }]).map((r) => `${r.studentId}${r.status}`).join() === 'aLATE,bABSENT');

console.log(`offlineQueue checks passed: ${passed}`);
