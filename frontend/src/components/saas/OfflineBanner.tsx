import React from 'react';
import { CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import { formatNumber, useT } from '@/i18n';
import { useOfflineAttendanceQueue } from '@/pwa/useOfflineAttendanceQueue';

// =============================================================================
// OfflineBanner — connection + offline-attendance-queue status strip.
//   offline                → "You are offline" (+ queued count)
//   online, items queued   → "N registers waiting to sync" + Sync now
//   rejected replays       → conflict list with Retry / Discard
// Renders nothing when online with an empty queue. Safe to mount once in the
// app layout and/or on the attendance page (replays are de-duplicated).
// =============================================================================

export const OfflineBanner: React.FC<{ className?: string }> = ({ className }) => {
  const t = useT();
  const { isOnline, pending, conflicts, isReplaying, replay, retry, discard } = useOfflineAttendanceQueue({
    onReplayed: (s) => {
      if (s.synced) toast.success(t('{n} offline attendance register(s) synced', { n: s.synced }));
      if (s.conflicts.length) toast.error(t('{n} register(s) could not be synced — see details', { n: s.conflicts.length }));
    },
  });

  if (isOnline && !pending.length && !conflicts.length) return null;

  return (
    <div className={className} role="status" aria-live="polite">
      {(!isOnline || pending.length > 0) && (
        <div
          className={
            isOnline
              ? 'flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-100'
              : 'flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100'
          }
        >
          {isOnline ? <RefreshCw className={`w-4 h-4 shrink-0 ${isReplaying ? 'animate-spin' : ''}`} /> : <CloudOff className="w-4 h-4 shrink-0" />}
          <span className="flex-1 min-w-0">
            {!isOnline && <strong className="font-semibold">{t('You are offline.')} </strong>}
            {pending.length > 0
              ? t('{n} attendance register(s) saved on this device, waiting to sync.', { n: formatNumber(pending.length) })
              : t('Attendance you save now is kept on this device and sent when you are back online.')}
          </span>
          {isOnline && pending.length > 0 && (
            <Button size="xs" variant="outline" isLoading={isReplaying} onClick={() => void replay()}>
              {t('Sync now')}
            </Button>
          )}
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t('Some offline attendance was not accepted by the server')}
          </p>
          <ul className="mt-2 space-y-2">
            {conflicts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-0 break-words">{c.error}</span>
                <Button size="xs" variant="outline" disabled={!isOnline || isReplaying} onClick={() => void retry(c.id)}>
                  {t('Retry')}
                </Button>
                <Button size="xs" variant="danger-soft" onClick={() => void discard(c.id)}>
                  {t('Discard')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default OfflineBanner;
