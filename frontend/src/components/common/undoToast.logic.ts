// T5: pure helper for the Undo toast (kept free of React/axios so it can be unit-tested).

/** Finds the trash entry id in an axios response, its `data`, or the API envelope's `data`. */
export function trashEntryIdOf(res: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): string | null => {
    if (!v || typeof v !== 'object' || depth > 4 || seen.has(v)) return null;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (typeof o.trashEntryId === 'string') return o.trashEntryId;
    for (const k of ['trash', 'data']) {
      const found = walk(o[k], depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(res, 0);
}
