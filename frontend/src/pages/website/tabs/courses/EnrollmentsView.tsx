import React from 'react';
import { GraduationCap, Plus, UserMinus } from 'lucide-react';
import { Button, Badge, Modal, Input, Skeleton, ErrorState } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT, formatDate } from '@/i18n';
import { useEnrollments, useGrantEnrollment, useRevokeEnrollment, apiError } from '../../sites.queries';
import type { SiteEnrollment } from '../../sites.types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GrantAccessModal: React.FC<{ courseId: string; isOpen: boolean; onClose: () => void }> = ({ courseId, isOpen, onClose }) => {
  const t = useT();
  const grant = useGrantEnrollment();
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => { if (isOpen) { setEmail(''); setName(''); setError(undefined); } }, [isOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError(t('Enter a valid email address.')); return; }
    grant.mutate({ courseId, email: email.trim().toLowerCase(), name: name.trim() || undefined }, { onSuccess: onClose });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={grant.isPending ? () => {} : onClose}
      title={t('Grant access')}
      description={t('Gives this person the course immediately. If they don’t have an account yet, one is created — they set a password by registering with the same email.')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={grant.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="site-grant-access" isLoading={grant.isPending}>{t('Grant access')}</Button>
        </>
      }
    >
      <form id="site-grant-access" className="space-y-4" onSubmit={submit} noValidate>
        <Input id="grant-email" type="email" label={t('Email')} required value={email} error={error} onChange={(e) => setEmail(e.target.value)} />
        <Input id="grant-name" label={t('Name')} value={name} onChange={(e) => setName(e.target.value)} helperText={t('Optional — used only if this creates a new account.')} />
      </form>
    </Modal>
  );
};

export const EnrollmentsView: React.FC<{ courseId: string }> = ({ courseId }) => {
  const t = useT();
  const [page, setPage] = React.useState(1);
  const q = useEnrollments(courseId, page);
  const revoke = useRevokeEnrollment();
  const [grantOpen, setGrantOpen] = React.useState(false);
  const [toRevoke, setToRevoke] = React.useState<SiteEnrollment | null>(null);

  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-400">{t('{n} enrolled', { n: total })}</p>
        <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setGrantOpen(true)}>{t('Grant access')}</Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : q.isError ? (
        <ErrorState compact message={apiError(q.error, t('Could not load enrollments.'))} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState compact icon={<GraduationCap />} title={t('No one enrolled yet')} description={t('Grant access to give someone the course without a purchase.')} action={<Button size="sm" onClick={() => setGrantOpen(true)}>{t('Grant access')}</Button>} />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/6 rounded-lg border border-slate-200 dark:border-white/10">
          {items.map((en) => (
            <li key={en.id} className="px-3 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">{en.customer.name || en.customer.email}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {en.customer.email}
                  {typeof en.progress === 'number' ? ` · ${t('{n}% complete', { n: en.progress })}` : ''}
                  {en.createdAt ? ` · ${t('Enrolled {when}', { when: formatDate(en.createdAt) })}` : ''}
                </p>
              </div>
              <Badge variant={en.status === 'ACTIVE' ? 'success' : 'neutral'} dot>{en.status === 'ACTIVE' ? t('Active') : t('Revoked')}</Badge>
              {en.status === 'ACTIVE' && (
                <Button size="icon-sm" variant="ghost" className="text-red-600 dark:text-red-400" aria-label={t('Revoke access')} title={t('Revoke access')} onClick={() => setToRevoke(en)}>
                  <UserMinus className="w-4 h-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('Previous')}</Button>
          <span className="text-slate-500">{t('Page {page} of {total}', { page, total: totalPages })}</span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('Next')}</Button>
        </div>
      )}

      <GrantAccessModal courseId={courseId} isOpen={grantOpen} onClose={() => setGrantOpen(false)} />
      <ConfirmModal
        isOpen={!!toRevoke}
        title={t('Revoke access?')}
        message={t('{name} immediately loses access to this course and its lessons.', { name: toRevoke?.customer.name || toRevoke?.customer.email || '' })}
        confirmLabel={t('Revoke access')}
        isLoading={revoke.isPending}
        onCancel={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revoke.mutate({ id: toRevoke.id, courseId }, { onSuccess: () => setToRevoke(null) })}
      />
    </div>
  );
};
