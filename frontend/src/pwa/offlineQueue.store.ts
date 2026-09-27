import { createStore, get, set, update } from 'idb-keyval';
import type { QueueEntry } from './offlineQueue.logic';

// =============================================================================
// IndexedDB persistence for the offline attendance queue (idb-keyval).
// A single array under one key: the queue is small (a handful of registers),
// and whole-array updates inside idb-keyval's `update` are atomic per store.
// A window event keeps every mounted hook/banner in sync (same tab); the
// `storage`-less design means other tabs pick changes up on their next read.
// =============================================================================

const store = typeof indexedDB !== 'undefined' ? createStore('peoplenit-offline', 'attendance-queue') : null;
const KEY = 'queue-v1';
export const QUEUE_CHANGED_EVENT = 'peoplenit:offline-queue-changed';

let memoryFallback: QueueEntry[] = []; // private mode / IndexedDB unavailable

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export async function readQueue(): Promise<QueueEntry[]> {
  if (!store) return memoryFallback;
  try {
    return (await get<QueueEntry[]>(KEY, store)) ?? [];
  } catch {
    return memoryFallback;
  }
}

export async function writeQueue(queue: QueueEntry[]): Promise<void> {
  memoryFallback = queue;
  if (store) {
    try {
      await set(KEY, queue, store);
    } catch {
      // keep the in-memory copy
    }
  }
  notify();
}

export async function updateQueue(fn: (queue: QueueEntry[]) => QueueEntry[]): Promise<QueueEntry[]> {
  let result: QueueEntry[] = [];
  if (store) {
    try {
      await update<QueueEntry[]>(
        KEY,
        (old) => {
          result = fn(old ?? []);
          return result;
        },
        store,
      );
      memoryFallback = result;
      notify();
      return result;
    } catch {
      // fall through to memory
    }
  }
  result = fn(memoryFallback);
  memoryFallback = result;
  notify();
  return result;
}
