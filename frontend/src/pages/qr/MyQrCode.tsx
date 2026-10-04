import React from 'react';
import { QrCode } from 'lucide-react';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useMyQrToken } from './qr.queries';

/** Own check-in QR — staff roles and STUDENT (GET /qr/my-token). */
export default function MyQrCode() {
  const t = useT();
  const { user } = useAuthStore();
  const { data, isLoading, isError, refetch } = useMyQrToken();

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <PageHeader title={t('My Check-in QR')} description={t('Show this code at the school’s check-in kiosk.')} />
      <div className="glass-card rounded-2xl p-6 text-center">
        {isLoading ? (
          <Skeleton className="w-60 h-60 mx-auto rounded-xl" />
        ) : isError ? (
          <ErrorState message={t('Could not load your QR code.')} onRetry={() => refetch()} />
        ) : data?.qrDataUrl ? (
          <>
            <img src={data.qrDataUrl} alt={t('My check-in QR code')} className="w-60 h-60 mx-auto" />
            <p className="mt-3 font-semibold text-slate-900 dark:text-white">
              {user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : ''}
            </p>
            <p className="text-xs text-slate-500">{data.type === 'STUDENT' ? t('Student check-in') : t('Staff check-in / check-out')}</p>
          </>
        ) : (
          <div className="text-slate-500 text-sm">
            <QrCode className="w-10 h-10 mx-auto mb-2 opacity-50" />
            {t('QR image unavailable')}
          </div>
        )}
      </div>
    </div>
  );
}
