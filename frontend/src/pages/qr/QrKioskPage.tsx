import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ScanLine, CheckCircle2, Clock, AlertTriangle, Settings2, LogOut, LogIn } from 'lucide-react';
import { Alert, Button, ErrorState, Input, PageHeader, Skeleton, Avatar } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT, formatDate } from '@/i18n';
import { cn } from '@/lib/cn';
import { useCheckIns, useQrScan, type ScanResult } from './qr.queries';
import { isCameraScanSupported, useQrCamera } from './useQrCamera';

const CUTOFF_STORAGE_KEY = 'qr-kiosk-cutoff';
const DEFAULT_CUTOFF = '09:00';

function readCutoff(): string {
  try {
    const v = localStorage.getItem(CUTOFF_STORAGE_KEY);
    return v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : DEFAULT_CUTOFF;
  } catch {
    return DEFAULT_CUTOFF;
  }
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function resultTone(r: ScanResult): 'success' | 'warning' | 'info' {
  if (r.duplicate) return 'info';
  if (r.status === 'LATE') return 'warning';
  return 'success';
}

/** Kiosk for SUPER_ADMIN / ADMIN / TEACHER (matches POST /qr/scan). */
export default function QrKioskPage() {
  const t = useT();
  const [code, setCode] = useState('');
  const [cutoff, setCutoff] = useState(readCutoff);
  const [showSettings, setShowSettings] = useState(false);
  const [last, setLast] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scan = useQrScan();
  const checkIns = useCheckIns(todayIso());

  const submitCode = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || scan.isPending) return;
      setScanError(null);
      scan.mutate(
        { code: trimmed, cutoffTime: cutoff, deviceInfo: navigator.userAgent.slice(0, 200) },
        {
          onSuccess: (r) => setLast(r),
          onError: (e: any) => {
            setLast(null);
            setScanError(e?.response?.data?.message || t('Scan failed. Try again.'));
          },
        },
      );
      setCode('');
    },
    [scan, cutoff, t],
  );

  const camera = useQrCamera(submitCode);
  const cameraSupported = isCameraScanSupported();

  // Keep focus in the code box so USB/Bluetooth QR scanners (keyboard
  // wedge) work without touching the screen.
  useEffect(() => {
    inputRef.current?.focus();
  }, [last, scanError]);

  const saveCutoff = (v: string) => {
    setCutoff(v);
    try {
      localStorage.setItem(CUTOFF_STORAGE_KEY, v);
    } catch {
      /* private mode — keep for this session only */
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title={t('QR Check-in Kiosk')}
        description={t('Scan student or staff QR codes (or ID-card QR) to mark today’s attendance.')}
        actions={
          <Button variant="outline" leftIcon={<Settings2 className="w-4 h-4" />} onClick={() => setShowSettings((v) => !v)}>
            {t('Late after {time}', { time: cutoff })}
          </Button>
        }
      />

      {showSettings && (
        <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <Input
            type="time"
            label={t('Late cutoff (this device)')}
            value={cutoff}
            onChange={(e) => e.target.value && saveCutoff(e.target.value)}
            helperText={t('Scans after this local time are marked Late. Default 09:00.')}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-4 space-y-4">
          <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
            <video ref={camera.videoRef} className={cn('w-full h-full object-cover', !camera.active && 'hidden')} muted playsInline />
            {!camera.active && (
              <div className="text-center text-slate-300 p-6">
                <ScanLine className="w-10 h-10 mx-auto mb-2 opacity-70" />
                <p className="text-sm">
                  {cameraSupported ? t('Start the camera, or use a handheld scanner / type the code below.') : t('Camera scanning isn’t supported in this browser — use a handheld scanner or type the code below.')}
                </p>
              </div>
            )}
            {camera.active && <div className="absolute inset-8 border-2 border-white/70 rounded-xl pointer-events-none" aria-hidden />}
          </div>
          {cameraSupported && (
            <Button
              fullWidth
              variant={camera.active ? 'secondary' : 'primary'}
              leftIcon={camera.active ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              onClick={() => (camera.active ? camera.stop() : camera.start())}
            >
              {camera.active ? t('Stop camera') : t('Start camera')}
            </Button>
          )}
          {camera.error && <Alert tone="warning">{t(camera.error)}</Alert>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitCode(code);
            }}
            className="flex gap-2 items-end"
          >
            <Input
              ref={inputRef}
              label={t('Code')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="PQ1.S.…"
              autoComplete="off"
              containerClassName="flex-1"
            />
            <Button type="submit" isLoading={scan.isPending} disabled={!code.trim()}>
              {t('Check in')}
            </Button>
          </form>
        </div>

        <div className="space-y-4">
          {scanError && (
            <Alert tone="danger" title={t('Not checked in')}>
              {scanError}
            </Alert>
          )}
          {last ? (
            <div
              className={cn(
                'glass-card rounded-2xl p-5 border-2',
                resultTone(last) === 'success' && 'border-emerald-300 dark:border-emerald-500/40',
                resultTone(last) === 'warning' && 'border-amber-300 dark:border-amber-500/40',
                resultTone(last) === 'info' && 'border-blue-300 dark:border-blue-500/40',
              )}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-4">
                <Avatar name={last.person.name} src={last.person.avatarUrl ?? undefined} size="lg" />
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-slate-900 dark:text-white truncate">{last.person.name}</p>
                  <p className="text-sm text-slate-500 truncate">
                    {last.person.type === 'STUDENT' ? t('Student') : t('Staff')}
                    {last.person.subtitle ? ` · ${last.person.subtitle}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
                {last.duplicate ? (
                  <>
                    <Clock className="w-5 h-5 text-blue-600" />
                    <span className="text-blue-700 dark:text-blue-400">{t('Already scanned in the last 5 minutes — ignored.')}</span>
                  </>
                ) : last.action === 'CHECKED_OUT' ? (
                  <>
                    <LogOut className="w-5 h-5 text-blue-600" />
                    <span>{t('Checked out at {time}', { time: last.time })}</span>
                  </>
                ) : last.action === 'ALREADY_MARKED' ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>{t('Already marked {status} today — scan logged.', { status: last.status ?? '' })}</span>
                  </>
                ) : last.status === 'LATE' ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span className="text-amber-700 dark:text-amber-400">{t('Late — checked in at {time}', { time: last.time })}</span>
                  </>
                ) : (
                  <>
                    {last.action === 'CHECKED_IN' ? <LogIn className="w-5 h-5 text-emerald-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                    <span className="text-emerald-700 dark:text-emerald-400">{t('Present — checked in at {time}', { time: last.time })}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            !scanError && (
              <div className="glass-card rounded-2xl">
                <EmptyState compact icon={<ScanLine />} title={t('Waiting for a scan')} />
              </div>
            )
          )}

          <div className="glass-card rounded-2xl p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
              {t('Today’s check-ins')} {checkIns.data ? <span className="text-slate-500 font-normal">({checkIns.data.meta.total})</span> : null}
            </h3>
            {checkIns.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
            ) : checkIns.isError ? (
              <ErrorState compact message={t('Could not load check-ins.')} onRetry={() => checkIns.refetch()} />
            ) : (checkIns.data?.items.length ?? 0) === 0 ? (
              <EmptyState compact title={t('No check-ins yet today')} />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5 max-h-80 overflow-y-auto">
                {checkIns.data!.items.map((c) => (
                  <li key={c.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-xs text-slate-500 truncate">{c.subtitle}{c.method === 'ID_CARD' ? ` · ${t('ID card')}` : ''}</p>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{formatDate(c.scannedAt, true)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
