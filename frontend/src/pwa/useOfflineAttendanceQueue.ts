import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import {
  classifyReplay,
  conflictMessage,
  enqueue,
  markAttempt,
  markConflict,
  removeEntry,
  replayable,
  requeue,
  type BulkAttendancePayload,
  type QueueEntry,
} from './offlineQueue.logic';
import { QUEUE_CHANGED_EVENT, readQueue, updateQueue } from './offlineQueue.store';
import { useOnlineStatus } from './useOnlineStatus';

// =============================================================================
// useOfflineAttendanceQueue — wraps POST /attendance/bulk so a teacher can
// keep marking attendance with no connection.
//
//   submit(payload, { scopeKey, label })
//     online  → POSTs immediately; a network failure (no response) queues it
//     offline → queues it in IndexedDB
//     Resolves { queued: false } when saved on the server, { queued: true }
//     when stored for later. Server rejections (4xx/5xx with a response)
//     are re-thrown unchanged so the page's existing error handling runs.
//
//   Replays automatically when the browser comes back online (and on mount),
//   oldest first. A 4xx on replay becomes a "conflict" with the server's
//   message; the user can retry it or discard it. 401 waits for sign-in.
// =============================================================================

export interface SubmitResult {
  queued: boolean;
}

export interface ReplaySummary {
  synced: number;
  conflicts: string[];
  stoppedEarly: boolean;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `q_${Date.now()}_${Math.random().toString(36).slice(2)}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const statusOf = (e: any): number | null => (e?.response ? (e.response.status as number) : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messageOf = (e: any): string | undefined => e?.response?.data?.message;

let replaying = false; // one replay pass at a time across all hook instances

export function useOfflineAttendanceQueue(options: { onReplayed?: (summary: ReplaySummary) => void } = {}) {
  const isOnline = useOnlineStatus();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;
  const institutionId = user?.institutionId || null;
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const onReplayedRef = useRef(options.onReplayed);
  onReplayedRef.current = options.onReplayed;

  const refresh = useCallback(async () => setEntries(await readQueue()), []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, onChange);
  }, [refresh]);

  const mine = entries.filter((e) => e.meta.userId === userId && (e.meta.institutionId ?? null) === institutionId);
  const pending = mine.filter((e) => e.status === 'pending');
  const conflicts = mine.filter((e) => e.status === 'conflict');

  const queue = useCallback(
    async (payload: BulkAttendancePayload, scope: { scopeKey: string; label: string }) => {
      if (!userId) throw new Error('Sign in to save attendance');
      await updateQueue((q) => enqueue(q, payload, { userId, institutionId, ...scope }, new Date(), newId));
    },
    [userId, institutionId],
  );

  const submit = useCallback(
    async (payload: BulkAttendancePayload, scope: { scopeKey: string; label: string }): Promise<SubmitResult> => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queue(payload, scope);
        return { queued: true };
      }
      try {
        await apiClient.post('/attendance/bulk', payload);
        return { queued: false };
      } catch (error) {
        if (statusOf(error) === null) {
          await queue(payload, scope);
          return { queued: true };
        }
        throw error;
      }
    },
    [queue],
  );

  const replay = useCallback(async (): Promise<ReplaySummary> => {
    const summary: ReplaySummary = { synced: 0, conflicts: [], stoppedEarly: false };
    if (replaying || !userId) return summary;
    replaying = true;
    setIsReplaying(true);
    try {
      const todo = replayable(await readQueue(), userId, institutionId);
      for (const entry of todo) {
        let status: number | null = null;
        let message: string | undefined;
        try {
          const res = await apiClient.post('/attendance/bulk', entry.payload);
          status = res.status;
        } catch (error) {
          status = statusOf(error);
          message = messageOf(error);
        }
        const outcome = classifyReplay(status);
        if (outcome === 'done') {
          await updateQueue((q) => removeEntry(q, entry.id));
          summary.synced++;
        } else if (outcome === 'conflict') {
          const text = conflictMessage(entry, message, status ?? undefined);
          await updateQueue((q) => markConflict(q, entry.id, text));
          summary.conflicts.push(text);
        } else {
          await updateQueue((q) => markAttempt(q, entry.id));
          summary.stoppedEarly = true;
          break; // offline again / server down / signed out — try the rest later
        }
      }
    } finally {
      replaying = false;
      setIsReplaying(false);
    }
    if (summary.synced || summary.conflicts.length) onReplayedRef.current?.(summary);
    return summary;
  }, [userId, institutionId]);

  // Auto-replay on reconnect and once on mount.
  useEffect(() => {
    if (isOnline && userId) void replay();
  }, [isOnline, userId, replay]);

  const discard = useCallback(async (id: string) => {
    await updateQueue((q) => removeEntry(q, id));
  }, []);

  const retry = useCallback(
    async (id: string) => {
      await updateQueue((q) => requeue(q, id));
      return replay();
    },
    [replay],
  );

  return { isOnline, pending, conflicts, isReplaying, submit, replay, discard, retry };
}
