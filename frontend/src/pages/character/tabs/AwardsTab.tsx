import React from 'react';
import toast from 'react-hot-toast';
import { Plus, Trophy, Undo2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorState, Input, Modal, Select, SkeletonText } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate, formatNumber, useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import {
  apiErrorMessage, useAssessSections, useAwardBadge, useAwards, useBadges, useCharacterSettings, useGrid, useLeaderboard, usePeriods, useRevokeAward,
} from '../character.api';
import { BadgeIconTile, useBi } from '../shared';

// =============================================================================
// T2 awards: give a badge (with a reason) to one or more students of a section,
// see recent awards, revoke; plus the class leaderboard when switched on.
// =============================================================================

const AwardModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const t = useT();
  const bi = useBi();
  const badges = useBadges(open);
  const sections = useAssessSections(open);
  const periods = usePeriods(open);
  const award = useAwardBadge();
  const [badgeId, setBadgeId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
  const [periodId, setPeriodId] = React.useState('');
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [reason, setReason] = React.useState('');
  const grid = useGrid(periodId || periods.data?.[0]?.id || '', sectionId);

  React.useEffect(() => {
    if (open) {
      setPicked(new Set());
      setReason('');
    }
  }, [open]);

  const students = grid.data?.students ?? [];
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    award.mutate(
      { badgeId, studentIds: [...picked], periodId: periodId || null, reason },
      {
        onSuccess: (r) => { toast.success(t('{n} badges awarded', { n: formatNumber(r.awarded) })); onClose(); },
        onError: (err) => toast.error(apiErrorMessage(err, t('Could not award the badge'))),
      },
    );
  };
  const active = (badges.data ?? []).filter((b) => b.active);
  return (
    <Modal isOpen={open} onClose={onClose} title={t('Award a badge')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="award-form" isLoading={award.isPending} disabled={!badgeId || picked.size === 0 || !reason.trim()}>{t('Award')}</Button></div>}>
      <form id="award-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={t('Badge')} required value={badgeId} onChange={(e) => setBadgeId(e.target.value)} placeholder={t('Choose a badge')}
            options={active.map((b) => ({ value: b.id, label: `${bi(b.name, b.nameBn)} (+${b.points})` }))} />
          <Select label={t('Class / section')} required value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPicked(new Set()); }} placeholder={t('Choose a section')}
            options={(sections.data ?? []).map((s) => ({ value: s.id, label: `${s.className} — ${s.name}` }))} />
          <Select label={t('Assessment period (optional)')} value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder={t('None')}
            options={(periods.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <Input label={t('Reason')} required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} helperText={t('Guardians see this in the notification.')} />
        </div>
        {sectionId && (
          <fieldset>
            <legend className="text-sm font-semibold mb-2">{t('Students')} ({formatNumber(picked.size)})</legend>
            {grid.isLoading ? <SkeletonText lines={3} /> : (
              <div className="max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
                {students.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/4">
                    <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                    <span className="truncate">{s.firstName} {s.lastName}</span>
                    {s.rollNumber && <span className="text-xs text-slate-500">#{s.rollNumber}</span>}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}
      </form>
    </Modal>
  );
};

const Leaderboard: React.FC = () => {
  const t = useT();
  const settings = useCharacterSettings();
  const sections = useAssessSections();
  const [sectionId, setSectionId] = React.useState('');
  const enabled = Boolean(settings.data?.leaderboardEnabled);
  const q = useLeaderboard({ sectionId }, enabled && Boolean(sectionId));
  if (!enabled) return null;
  return (
    <Card>
      <CardHeader icon={<Trophy className="w-5 h-5" />} title={t('Class leaderboard')} description={t('First name and class only.')} />
      <div className="mt-3 space-y-3">
        <Select aria-label={t('Class / section')} value={sectionId} onChange={(e) => setSectionId(e.target.value)} placeholder={t('Choose a section')}
          options={(sections.data ?? []).map((s) => ({ value: s.id, label: `${s.className} — ${s.name}` }))} />
        {sectionId && (q.isLoading ? <SkeletonText lines={3} /> : (q.data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t('No points in this class yet.')}</p>
        ) : (
          <ol className="divide-y divide-slate-100 dark:divide-white/6 text-sm">
            {q.data!.rows.map((r) => (
              <li key={`${r.rank}-${r.name}-${r.points}`} className="flex justify-between gap-2 py-2">
                <span><span className="inline-block w-6 text-right tabular-nums text-slate-500 mr-2">{formatNumber(r.rank)}</span>{r.name} <span className="text-xs text-slate-500">{r.className}</span></span>
                <span className="tabular-nums font-semibold">{formatNumber(r.points)}</span>
              </li>
            ))}
          </ol>
        ))}
      </div>
    </Card>
  );
};

const AwardsTab: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const me = useAuthStore((s) => s.user);
  const isManager = me?.role === 'ADMIN' || me?.role === 'MANAGEMENT' || me?.role === 'SUPER_ADMIN';
  const [page, setPage] = React.useState(1);
  const q = useAwards({ page, pageSize: 20 });
  const revoke = useRevokeAward();
  const [open, setOpen] = React.useState(false);

  const doRevoke = (id: string) => {
    const reason = window.prompt(t('Why are you revoking this badge?'));
    if (!reason?.trim()) return;
    revoke.mutate({ id, reason: reason.trim() }, {
      onSuccess: () => toast.success(t('Badge revoked')),
      onError: (err) => toast.error(apiErrorMessage(err, t('Could not revoke'))),
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 space-y-4">
        <div className="flex justify-end"><Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>{t('Award a badge')}</Button></div>
        {q.isLoading ? <SkeletonText lines={6} /> : q.isError ? <ErrorState title={t('Could not load awards')} onRetry={() => q.refetch()} /> : (q.data?.items ?? []).length === 0 ? (
          <EmptyState title={t('No badges awarded yet')} description={t('Award a badge by hand, or score a period and check automatic badges.')} />
        ) : (
          <Card flush>
            <ul className="divide-y divide-slate-100 dark:divide-white/6">
              {q.data!.items.map((a) => (
                <li key={a.id} className={`flex items-center gap-3 px-4 py-3 ${a.revokedAt ? 'opacity-60' : ''}`}>
                  <BadgeIconTile icon={a.badge.icon} color={a.badge.color} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{a.student ? `${a.student.firstName} ${a.student.lastName}` : ''} · {bi(a.badge.name, a.badge.nameBn)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {[a.student?.class?.name, a.student?.section?.name].filter(Boolean).join(' ')} · {formatDate(a.awardedAt)} · {a.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.source === 'AUTO' && <Badge variant="info">{t('Auto')}</Badge>}
                    {a.revokedAt ? <Badge variant="neutral">{t('Revoked')}</Badge> : <span className="text-sm font-semibold tabular-nums">+{formatNumber(a.points)}</span>}
                    {!a.revokedAt && (isManager || a.awardedById === me?.id) && (
                      <Button size="icon-sm" variant="ghost" aria-label={t('Revoke')} onClick={() => doRevoke(a.id)}><Undo2 className="w-4 h-4" /></Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {q.data!.total > 20 && (
              <div className="flex justify-between items-center px-4 py-2 text-sm">
                <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>{t('Previous')}</Button>
                <span>{formatNumber(page)} / {formatNumber(Math.ceil(q.data!.total / 20))}</span>
                <Button size="sm" variant="secondary" disabled={page * 20 >= q.data!.total} onClick={() => setPage((p) => p + 1)}>{t('Next')}</Button>
              </div>
            )}
          </Card>
        )}
      </div>
      <div><Leaderboard /></div>
      <AwardModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
};

export default AwardsTab;
