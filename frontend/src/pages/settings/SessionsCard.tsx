import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, LogOut, MonitorSmartphone, Smartphone, Tablet, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import { Badge, Button, Card, CardHeader, ErrorState, SkeletonText, Alert } from '@/components/ui';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState } from '@/components/common/EmptyState';
import { useAuthStore } from '@/store/authStore';
import { formatDate, useT } from '@/i18n';
import { apiErrorMessage } from '@/components/saas/saas.api';

// =============================================================================
// Settings → Security → Signed-in devices. Backend: /auth/sessions,
// /auth/sessions/:id, /auth/sessions/revoke-others, /auth/logout-all.
// =============================================================================

interface SessionRow {
  id: string;
  device: { browser: string; os: string; deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'; label: string };
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface SessionsResponse {
  sessions: SessionRow[];
  currentSessionKnown: boolean;
  metadataAvailable: boolean;
}

const SESSIONS_KEY = ['auth', 'sessions'] as const;

const DeviceIcon: React.FC<{ type: SessionRow['device']['deviceType'] }> = ({ type }) => {
  const cls = 'w-5 h-5';
  if (type === 'mobile') return <Smartphone className={cls} />;
  if (type === 'tablet') return <Tablet className={cls} />;
  if (type === 'desktop') return <Laptop className={cls} />;
  return <HelpCircle className={cls} />;
};

type Pending = null | { kind: 'one'; session: SessionRow } | { kind: 'others' } | { kind: 'all' };

export const SessionsCard: React.FC = () => {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { refreshToken, clearAuth, supportSession } = useAuthStore();
  const [pending, setPending] = useState<Pending>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async (): Promise<SessionsResponse> => {
      const { data: body } = await apiClient.get('/auth/sessions');
      return body.data;
    },
    enabled: !supportSession,
  });

  const signOutHere = () => {
    clearAuth();
    navigate('/login');
  };

  const action = useMutation({
    mutationFn: async (p: Exclude<Pending, null>) => {
      if (p.kind === 'one') {
        const { data: body } = await apiClient.delete(`/auth/sessions/${p.session.id}`);
        return { kind: p.kind, wasCurrent: Boolean(body.data?.wasCurrent) || p.session.isCurrent, count: 1 };
      }
      if (p.kind === 'others') {
        const { data: body } = await apiClient.post('/auth/sessions/revoke-others', refreshToken ? { refreshToken } : {});
        return { kind: p.kind, wasCurrent: false, count: Number(body.data?.revoked ?? 0) };
      }
      await apiClient.post('/auth/logout-all');
      return { kind: p.kind, wasCurrent: true, count: 0 };
    },
    onSuccess: (r) => {
      setPending(null);
      if (r.wasCurrent) {
        toast.success(t('Signed out.'));
        signOutHere();
        return;
      }
      toast.success(
        r.kind === 'others' ? t('Signed out of {n} other device(s).', { n: r.count }) : t('Device signed out.')
      );
      qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, t('Could not sign that device out. Please try again.')));
    },
  });

  if (supportSession) return null;

  const sessions = data?.sessions ?? [];
  const others = sessions.filter((s) => !s.isCurrent).length;

  const confirmCopy: Record<Exclude<Pending, null>['kind'], { title: string; message: string; label: string }> = {
    one: {
      title: t('Sign out this device?'),
      message:
        pending?.kind === 'one' && pending.session.isCurrent
          ? t('This is the device you are using now — you will be signed out here.')
          : t('That device will need to sign in again. It may keep working for a few minutes, until its current access token expires.'),
      label: t('Sign out'),
    },
    others: {
      title: t('Sign out all other devices?'),
      message: t('Every device except this one will need to sign in again.'),
      label: t('Sign out others'),
    },
    all: {
      title: t('Sign out everywhere?'),
      message: t('All devices, including this one, will be signed out.'),
      label: t('Sign out everywhere'),
    },
  };

  return (
    <Card>
      <CardHeader
        icon={<MonitorSmartphone className="w-5 h-5" />}
        title={t('Signed-in devices')}
        description={t('Devices that can currently access your account. Sign out any you don’t recognise.')}
      />

      {isLoading ? (
        <SkeletonText lines={4} />
      ) : isError ? (
        <ErrorState compact title={t('Could not load your devices')} onRetry={() => refetch()} />
      ) : sessions.length === 0 ? (
        <EmptyState compact title={t('No active sessions')} description={t('Sign in again to see this device here.')} />
      ) : (
        <>
          {!data?.metadataAvailable && (
            <Alert tone="info" className="mb-3">
              {t('Device names appear after the latest database update is applied.')}
            </Alert>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-white/6">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-white/6 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                  <DeviceIcon type={s.device.deviceType} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{t(s.device.label)}</span>
                    {s.isCurrent && <Badge variant="success" dot>{t('This device')}</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {t('Last active {when}', { when: formatDate(s.lastUsedAt, true) })}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={s.isCurrent ? 'ghost' : 'outline'}
                  onClick={() => setPending({ kind: 'one', session: s })}
                  disabled={action.isPending}
                  aria-label={t('Sign out {device}', { device: t(s.device.label) })}
                >
                  {t('Sign out')}
                </Button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<LogOut className="w-4 h-4" />}
              onClick={() => setPending({ kind: 'others' })}
              disabled={action.isPending || others === 0}
            >
              {t('Sign out all other devices')}
            </Button>
            <Button variant="danger-soft" size="sm" onClick={() => setPending({ kind: 'all' })} disabled={action.isPending}>
              {t('Sign out everywhere')}
            </Button>
          </div>
          {!data?.currentSessionKnown && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {t('“This device” is marked after your next sign-in or token refresh.')}
            </p>
          )}
        </>
      )}

      {pending && (
        <ConfirmModal
          isOpen
          title={confirmCopy[pending.kind].title}
          message={confirmCopy[pending.kind].message}
          confirmLabel={confirmCopy[pending.kind].label}
          variant={pending.kind === 'others' ? 'warning' : 'danger'}
          isLoading={action.isPending}
          onConfirm={() => action.mutate(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </Card>
  );
};

export default SessionsCard;
