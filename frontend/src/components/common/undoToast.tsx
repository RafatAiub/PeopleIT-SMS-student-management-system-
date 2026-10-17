import React from 'react';
import toast from 'react-hot-toast';
import { Trash2, Undo2 } from 'lucide-react';
import apiClient from '@/api/client';
import { translate } from '@/i18n';
import { trashEntryIdOf } from './undoToast.logic';

// =============================================================================
// T5: "Moved to trash — Undo". Every delete of a trash-able record answers
// with { trash: { trashEntryId } }; the toast's Undo restores that entry.
// Anyone may undo their own delete; admins can restore anything later from
// Settings → Trash (30 days).
// =============================================================================

export { trashEntryIdOf };

export async function restoreFromTrash(trashEntryId: string): Promise<void> {
  await apiClient.post('/trash/restore', { ids: [trashEntryId] });
}

/**
 * Shows "<message> · Undo" for 8 seconds. `onRestored` should refresh the
 * caller's lists (e.g. invalidate its queries). Falls back to a plain success
 * toast when the response has no trash entry (older API).
 */
export function showUndoToast(message: string, res: unknown, onRestored?: () => void) {
  const id = trashEntryIdOf(res);
  if (!id) {
    toast.success(message);
    return;
  }
  toast(
    (tt) => (
      <span className="flex items-center gap-3 text-sm">
        <span>{message}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
          onClick={async () => {
            toast.dismiss(tt.id);
            try {
              await restoreFromTrash(id);
              toast.success(translate('Restored'));
              onRestored?.();
            } catch (error) {
              const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
              toast.error(msg || translate('Could not restore it. Try Settings → Trash.'));
            }
          }}
        >
          <Undo2 className="w-3.5 h-3.5" aria-hidden /> {translate('Undo')}
        </button>
      </span>
    ),
    { duration: 8000, icon: <Trash2 className="w-4 h-4 text-slate-600" aria-hidden /> },
  );
}
