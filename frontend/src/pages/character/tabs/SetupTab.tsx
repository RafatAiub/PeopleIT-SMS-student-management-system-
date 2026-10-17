import React from 'react';
import toast from 'react-hot-toast';
import { Edit3, Lock, Plus, Sparkles, Trash2, Unlock } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Checkbox, ErrorState, Input, Modal, Select, SkeletonText, Textarea } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate, formatNumber, useLocale, useT } from '@/i18n';
import {
  apiErrorMessage, BADGE_ICONS, PERIOD_KIND_LABEL, RULE_LABEL, useBadges, useCharacterSettings, useDeleteBadge, useDeletePeriod, useDeleteTrait,
  usePeriods, useSaveBadge, useSavePeriod, useSaveSettings, useSaveTrait, useSeedBadges, useSeedTraits, useTraits,
  type Badge as BadgeDef, type BadgeIcon, type BadgeRule, type Period, type PeriodKind, type Trait,
} from '../character.api';
import { quickPeriod } from '../character.logic';
import { BadgeIconTile, useBi } from '../shared';

// =============================================================================
// T2 setup (ADMIN / MANAGEMENT): traits, assessment periods, badges, settings.
// =============================================================================

const onErr = (t: (k: string) => string, fallback: string) => (err: unknown) => toast.error(apiErrorMessage(err, t(fallback)));
const confirmDelete = (m: string) => window.confirm(m);

/* ── Traits ──────────────────────────────────────────────────────────────── */

const TraitModal: React.FC<{ trait: Trait | 'new' | null; onClose: () => void }> = ({ trait, onClose }) => {
  const t = useT();
  const save = useSaveTrait();
  const editing = trait && trait !== 'new' ? trait : null;
  const blank = { name: '', nameBn: '', description: '', scaleMin: '1', scaleMax: '5', weight: '1', active: true };
  const [f, setF] = React.useState(blank);
  React.useEffect(() => {
    if (!trait) return;
    setF(editing ? { name: editing.name, nameBn: editing.nameBn ?? '', description: editing.description ?? '', scaleMin: String(editing.scaleMin), scaleMax: String(editing.scaleMax), weight: String(editing.weight), active: editing.active } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trait]);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: editing?.id, body: { name: f.name, nameBn: f.nameBn || null, description: f.description || null, scaleMin: Number(f.scaleMin), scaleMax: Number(f.scaleMax), weight: Number(f.weight), active: f.active } },
      { onSuccess: () => { toast.success(t('Trait saved')); onClose(); }, onError: onErr(t, 'Could not save the trait') },
    );
  };
  return (
    <Modal isOpen={Boolean(trait)} onClose={onClose} title={editing ? t('Edit trait') : t('New trait')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="trait-form" isLoading={save.isPending}>{t('Save')}</Button></div>}>
      <form id="trait-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label={t('Name')} required maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} />
        <Input label={t('Name (Bangla)')} lang="bn" maxLength={80} value={f.nameBn} onChange={(e) => set({ nameBn: e.target.value })} />
        <Textarea label={t('Description')} rows={2} maxLength={500} value={f.description} onChange={(e) => set({ description: e.target.value })} containerClassName="sm:col-span-2" />
        <Select label={t('Scale')} value={`${f.scaleMin}-${f.scaleMax}`} onChange={(e) => { const [a, b] = e.target.value.split('-'); set({ scaleMin: a, scaleMax: b }); }}
          options={[{ value: '1-5', label: '1 – 5' }, { value: '1-10', label: '1 – 10' }, { value: '0-5', label: '0 – 5' }, { value: '1-3', label: '1 – 3' }]} />
        <Input label={t('Weight')} type="number" min="0" max="100" step="0.5" value={f.weight} onChange={(e) => set({ weight: e.target.value })} helperText={t('0 leaves the trait out of the overall %.')} />
        <Checkbox label={t('Active')} description={t('Inactive traits are hidden from new score sheets.')} checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
      </form>
    </Modal>
  );
};

const TraitsCard: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const q = useTraits();
  const seed = useSeedTraits();
  const del = useDeleteTrait();
  const [editing, setEditing] = React.useState<Trait | 'new' | null>(null);
  return (
    <Card>
      <CardHeader title={t('Traits')} description={t('What teachers score each period.')} actions={<Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>{t('Add')}</Button>} />
      <div className="mt-3">
        {q.isLoading ? <SkeletonText lines={4} /> : q.isError ? <ErrorState title={t('Could not load traits')} onRetry={() => q.refetch()} /> : (q.data ?? []).length === 0 ? (
          <EmptyState title={t('No traits yet')} description={t('Start with the recommended seven: punctuality, adab, salah, cleanliness, respect, responsibility and honesty.')}
            action={<Button leftIcon={<Sparkles className="w-4 h-4" />} isLoading={seed.isPending} onClick={() => seed.mutate(undefined, { onSuccess: () => toast.success(t('Default traits added')), onError: onErr(t, 'Could not add traits') })}>{t('Add recommended traits')}</Button>} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/6">
            {q.data!.map((tr) => (
              <li key={tr.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{bi(tr.name, tr.nameBn)} {!tr.active && <Badge variant="neutral">{t('Inactive')}</Badge>}</p>
                  <p className="text-xs text-slate-500">{tr.scaleMin}–{tr.scaleMax} · {t('Weight')} {formatNumber(tr.weight)}</p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={t('Edit')} onClick={() => setEditing(tr)}><Edit3 className="w-4 h-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={t('Delete')} onClick={() => confirmDelete(t('Delete this trait?')) && del.mutate(tr.id, { onSuccess: () => toast.success(t('Trait deleted')), onError: onErr(t, 'Could not delete') })}><Trash2 className="w-4 h-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TraitModal trait={editing} onClose={() => setEditing(null)} />
    </Card>
  );
};

/* ── Periods ─────────────────────────────────────────────────────────────── */

const PeriodModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const t = useT();
  const { lang } = useLocale();
  const save = useSavePeriod();
  const [f, setF] = React.useState({ kind: 'MONTHLY' as PeriodKind, ...quickPeriod('MONTHLY', new Date()) });
  React.useEffect(() => { if (open) setF({ kind: 'MONTHLY', ...quickPeriod('MONTHLY', new Date()) }); }, [open]);
  const setKind = (kind: PeriodKind) => setF((x) => (kind === 'TERM' ? { ...x, kind } : { kind, ...quickPeriod(kind, new Date()) }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({ body: f }, { onSuccess: () => { toast.success(t('Period created')); onClose(); }, onError: onErr(t, 'Could not save the period') });
  };
  return (
    <Modal isOpen={open} onClose={onClose} title={t('New assessment period')} size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="period-form" isLoading={save.isPending}>{t('Save')}</Button></div>}>
      <form id="period-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label={t('Type')} value={f.kind} onChange={(e) => setKind(e.target.value as PeriodKind)}
          options={(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => ({ value: k, label: lang === 'bn' ? PERIOD_KIND_LABEL[k].bn : PERIOD_KIND_LABEL[k].en }))} />
        <Input label={t('Name')} required maxLength={80} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
        <Input label={t('Start date')} type="date" required value={f.startDate} onChange={(e) => setF((x) => ({ ...x, startDate: e.target.value }))} />
        <Input label={t('End date')} type="date" required value={f.endDate} onChange={(e) => setF((x) => ({ ...x, endDate: e.target.value }))} />
      </form>
    </Modal>
  );
};

const PeriodsCard: React.FC = () => {
  const t = useT();
  const { lang } = useLocale();
  const q = usePeriods();
  const save = useSavePeriod();
  const del = useDeletePeriod();
  const [open, setOpen] = React.useState(false);
  const toggleLock = (p: Period) => save.mutate({ id: p.id, body: { locked: !p.locked } }, { onError: onErr(t, 'Could not save the period') });
  return (
    <Card>
      <CardHeader title={t('Assessment periods')} description={t('Weekly, monthly or term. Lock a period once report cards are final.')} actions={<Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>{t('Add')}</Button>} />
      <div className="mt-3">
        {q.isLoading ? <SkeletonText lines={4} /> : (q.data ?? []).length === 0 ? <p className="text-sm text-slate-500">{t('No periods yet.')}</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-white/6">
            {q.data!.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{p.name} <Badge variant="neutral">{lang === 'bn' ? PERIOD_KIND_LABEL[p.kind].bn : PERIOD_KIND_LABEL[p.kind].en}</Badge> {p.locked && <Badge variant="warning">{t('Locked')}</Badge>}</p>
                  <p className="text-xs text-slate-500">{formatDate(p.startDate)} – {formatDate(p.endDate)} · {t('{n} scores', { n: formatNumber(p._count?.scores ?? 0) })}</p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={p.locked ? t('Unlock') : t('Lock')} onClick={() => toggleLock(p)}>{p.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}</Button>
                <Button size="icon-sm" variant="ghost" aria-label={t('Delete')} onClick={() => confirmDelete(t('Delete this period?')) && del.mutate(p.id, { onSuccess: () => toast.success(t('Period deleted')), onError: onErr(t, 'Could not delete') })}><Trash2 className="w-4 h-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PeriodModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
};

/* ── Badges ──────────────────────────────────────────────────────────────── */

const BadgeModal: React.FC<{ badge: BadgeDef | 'new' | null; onClose: () => void }> = ({ badge, onClose }) => {
  const t = useT();
  const { lang } = useLocale();
  const bi = useBi();
  const traits = useTraits(Boolean(badge));
  const save = useSaveBadge();
  const editing = badge && badge !== 'new' ? badge : null;
  const blank = { name: '', nameBn: '', description: '', icon: 'star' as BadgeIcon, color: '#c2550a', points: '10', rule: 'NONE' as BadgeRule, ruleTraitId: '', ruleThreshold: '', ruleStreakDays: '', active: true };
  const [f, setF] = React.useState(blank);
  React.useEffect(() => {
    if (!badge) return;
    setF(editing ? {
      name: editing.name, nameBn: editing.nameBn ?? '', description: editing.description ?? '', icon: editing.icon, color: editing.color, points: String(editing.points),
      rule: editing.rule, ruleTraitId: editing.ruleTraitId ?? '', ruleThreshold: editing.ruleThreshold != null ? String(editing.ruleThreshold) : '', ruleStreakDays: editing.ruleStreakDays != null ? String(editing.ruleStreakDays) : '', active: editing.active,
    } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badge]);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      id: editing?.id,
      body: {
        name: f.name, nameBn: f.nameBn || null, description: f.description || null, icon: f.icon, color: f.color, points: Number(f.points), rule: f.rule, active: f.active,
        ruleTraitId: f.rule === 'TRAIT_AVERAGE' ? f.ruleTraitId || null : null,
        ruleThreshold: f.rule === 'TRAIT_AVERAGE' || f.rule === 'OVERALL_AVERAGE' ? (f.ruleThreshold ? Number(f.ruleThreshold) : null) : null,
        ruleStreakDays: f.rule === 'ATTENDANCE_STREAK' ? (f.ruleStreakDays ? Number(f.ruleStreakDays) : null) : null,
      },
    }, { onSuccess: () => { toast.success(t('Badge saved')); onClose(); }, onError: onErr(t, 'Could not save the badge') });
  };
  return (
    <Modal isOpen={Boolean(badge)} onClose={onClose} title={editing ? t('Edit badge') : t('New badge')} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="badge-form" isLoading={save.isPending}>{t('Save')}</Button></div>}>
      <form id="badge-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label={t('Name')} required maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} />
        <Input label={t('Name (Bangla)')} lang="bn" maxLength={80} value={f.nameBn} onChange={(e) => set({ nameBn: e.target.value })} />
        <Textarea label={t('Description')} rows={2} maxLength={500} value={f.description} onChange={(e) => set({ description: e.target.value })} containerClassName="sm:col-span-2" />
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium mb-2">{t('Icon')}</legend>
          <div className="flex flex-wrap gap-2">
            {BADGE_ICONS.map((ic) => (
              <button key={ic} type="button" onClick={() => set({ icon: ic })} aria-label={ic} aria-pressed={f.icon === ic}
                className={`rounded-full p-0.5 ${f.icon === ic ? 'ring-2 ring-primary-600' : ''}`}>
                <BadgeIconTile icon={ic} color={f.color} size="sm" />
              </button>
            ))}
          </div>
        </fieldset>
        <Input label={t('Colour')} type="color" value={f.color} onChange={(e) => set({ color: e.target.value })} />
        <Input label={t('Points')} type="number" min="0" max="1000" required value={f.points} onChange={(e) => set({ points: e.target.value })} />
        <Select label={t('Awarded')} value={f.rule} onChange={(e) => set({ rule: e.target.value as BadgeRule })} containerClassName="sm:col-span-2"
          options={(Object.keys(RULE_LABEL) as BadgeRule[]).map((r) => ({ value: r, label: lang === 'bn' ? RULE_LABEL[r].bn : RULE_LABEL[r].en }))} />
        {f.rule === 'TRAIT_AVERAGE' && (
          <>
            <Select label={t('Trait')} required value={f.ruleTraitId} onChange={(e) => set({ ruleTraitId: e.target.value })} placeholder={t('Choose a trait')}
              options={(traits.data ?? []).map((tr) => ({ value: tr.id, label: `${bi(tr.name, tr.nameBn)} (${tr.scaleMin}–${tr.scaleMax})` }))} />
            <Input label={t('Minimum score')} type="number" step="0.5" required value={f.ruleThreshold} onChange={(e) => set({ ruleThreshold: e.target.value })} />
          </>
        )}
        {f.rule === 'OVERALL_AVERAGE' && <Input label={t('Minimum overall %')} type="number" min="1" max="100" required value={f.ruleThreshold} onChange={(e) => set({ ruleThreshold: e.target.value })} />}
        {f.rule === 'ATTENDANCE_STREAK' && <Input label={t('Days in a row (present, not late)')} type="number" min="2" max="365" required value={f.ruleStreakDays} onChange={(e) => set({ ruleStreakDays: e.target.value })} />}
        <Checkbox label={t('Active')} checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
      </form>
    </Modal>
  );
};

const BadgesCard: React.FC = () => {
  const t = useT();
  const bi = useBi();
  const { lang } = useLocale();
  const q = useBadges();
  const seed = useSeedBadges();
  const del = useDeleteBadge();
  const [editing, setEditing] = React.useState<BadgeDef | 'new' | null>(null);
  return (
    <Card>
      <CardHeader title={t('Badges')} description={t('Manual badges are given by teachers; automatic ones are checked per period.')} actions={<Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>{t('Add')}</Button>} />
      <div className="mt-3">
        {q.isLoading ? <SkeletonText lines={4} /> : (q.data ?? []).length === 0 ? (
          <EmptyState title={t('No badges yet')} action={<Button leftIcon={<Sparkles className="w-4 h-4" />} isLoading={seed.isPending} onClick={() => seed.mutate(undefined, { onSuccess: () => toast.success(t('Default badges added')), onError: onErr(t, 'Could not add badges') })}>{t('Add starter badges')}</Button>} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/6">
            {q.data!.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <BadgeIconTile icon={b.icon} color={b.color} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{bi(b.name, b.nameBn)} <span className="text-xs text-slate-500">+{formatNumber(b.points)}</span> {!b.active && <Badge variant="neutral">{t('Inactive')}</Badge>}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {lang === 'bn' ? RULE_LABEL[b.rule].bn : RULE_LABEL[b.rule].en}
                    {b.rule === 'TRAIT_AVERAGE' && b.ruleTrait ? ` · ${bi(b.ruleTrait.name, b.ruleTrait.nameBn)} ≥ ${b.ruleThreshold}` : ''}
                    {b.rule === 'OVERALL_AVERAGE' ? ` · ≥ ${b.ruleThreshold}%` : ''}
                    {b.rule === 'ATTENDANCE_STREAK' ? ` · ${b.ruleStreakDays}` : ''}
                    {' · '}{t('{n} awarded', { n: formatNumber(b._count?.awards ?? 0) })}
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={t('Edit')} onClick={() => setEditing(b)}><Edit3 className="w-4 h-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={t('Delete')} onClick={() => confirmDelete(t('Delete this badge?')) && del.mutate(b.id, { onSuccess: () => toast.success(t('Badge deleted')), onError: onErr(t, 'Could not delete') })}><Trash2 className="w-4 h-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <BadgeModal badge={editing} onClose={() => setEditing(null)} />
    </Card>
  );
};

/* ── Settings ────────────────────────────────────────────────────────────── */

const SettingsCard: React.FC = () => {
  const t = useT();
  const q = useCharacterSettings();
  const save = useSaveSettings();
  if (!q.data) return <Card><SkeletonText lines={3} /></Card>;
  const toggle = (k: 'leaderboardEnabled' | 'leaderboardPublic' | 'notifyGuardians', v: boolean) =>
    save.mutate({ [k]: v }, { onSuccess: () => toast.success(t('Settings saved')), onError: onErr(t, 'Could not save settings') });
  return (
    <Card>
      <CardHeader title={t('Settings')} />
      <div className="mt-3 space-y-3">
        <Checkbox label={t('Notify guardians when a badge is awarded')} checked={q.data.notifyGuardians} onChange={(e) => toggle('notifyGuardians', e.target.checked)} />
        <Checkbox label={t('Class leaderboards')} description={t('Ranks students by points, showing only first name and class.')} checked={q.data.leaderboardEnabled} onChange={(e) => toggle('leaderboardEnabled', e.target.checked)} />
        <Checkbox label={t('Show leaderboards to students and guardians')} description={t('Off: staff only.')} disabled={!q.data.leaderboardEnabled} checked={q.data.leaderboardPublic} onChange={(e) => toggle('leaderboardPublic', e.target.checked)} />
      </div>
    </Card>
  );
};

const SetupTab: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <TraitsCard />
    <BadgesCard />
    <PeriodsCard />
    <SettingsCard />
  </div>
);

export default SetupTab;
