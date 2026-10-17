import React from 'react';
import { Link } from 'react-router-dom';
import {
  Award as AwardIcon, BookOpen, Clock, Crown, Flame, Heart, Leaf, Medal, Moon, Shield, Smile, Sparkles, Star, Sun, ThumbsUp, Trophy,
} from 'lucide-react';
import { Avatar, Badge as UiBadge, Card, CardHeader, SkeletonText } from '@/components/ui';
import { ModuleGate } from '@/components/common/ModuleGate';
import { formatDate, formatNumber, useLocale, useT } from '@/i18n';
import { MODULE_KEY, useMyCharacter, type Award, type BadgeIcon, type StudentSummary } from './character.api';

// =============================================================================
// T2 character — shared bits: badge icon/chip and the per-student summary card
// (student profile tab, guardian + student dashboards, "My character" page).
// =============================================================================

const ICONS: Record<BadgeIcon, React.ComponentType<{ className?: string }>> = {
  star: Star,
  award: AwardIcon,
  medal: Medal,
  trophy: Trophy,
  crown: Crown,
  heart: Heart,
  sparkles: Sparkles,
  sun: Sun,
  moon: Moon,
  book: BookOpen,
  clock: Clock,
  shield: Shield,
  'thumbs-up': ThumbsUp,
  smile: Smile,
  leaf: Leaf,
  flame: Flame,
};

/** Bangla twin when the dashboard is in Bangla and one exists. */
export function useBi() {
  const { lang } = useLocale();
  return React.useCallback((en: string | null | undefined, bn?: string | null) => (lang === 'bn' && bn ? bn : en ?? ''), [lang]);
}

/** Round icon tile in the badge colour (icon drawn in the colour on a tint — never white text on brand). */
export const BadgeIconTile: React.FC<{ icon: BadgeIcon; color: string; size?: 'sm' | 'md' }> = ({ icon, color, size = 'md' }) => {
  const Icon = ICONS[icon] ?? Star;
  const box = size === 'sm' ? 'w-7 h-7' : 'w-10 h-10';
  return (
    <span className={`${box} inline-flex items-center justify-center rounded-full shrink-0`} style={{ backgroundColor: `${color}1f`, color }} aria-hidden>
      <Icon className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />
    </span>
  );
};

export const BadgeChip: React.FC<{ award: Pick<Award, 'badge' | 'awardedAt' | 'reason' | 'points'> }> = ({ award }) => {
  const bi = useBi();
  return (
    <li className="flex items-center gap-2 min-w-0" title={award.reason ?? undefined}>
      <BadgeIconTile icon={award.badge.icon} color={award.badge.color} size="sm" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{bi(award.badge.name, award.badge.nameBn)}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">+{formatNumber(award.points)} · {formatDate(award.awardedAt)}</span>
      </span>
    </li>
  );
};

export const BandBadge: React.FC<{ band: { en: string; bn: string } | null; overall: number | null }> = ({ band, overall }) => {
  const { lang } = useLocale();
  if (overall == null || !band) return null;
  const variant = overall >= 75 ? 'success' : overall >= 40 ? 'info' : 'warning';
  return <UiBadge variant={variant}>{formatNumber(overall)}% · {lang === 'bn' ? band.bn : band.en}</UiBadge>;
};

/** The body of a student's character summary (no card chrome). */
export const SummaryBody: React.FC<{ s: StudentSummary; compact?: boolean }> = ({ s, compact }) => {
  const t = useT();
  const bi = useBi();
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">{t('Points')}</dt>
          <dd className="text-xl font-bold text-primary-700 dark:text-primary-400 tabular-nums">{formatNumber(s.points)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">{s.latest ? s.latest.period.name : t('Latest assessment')}</dt>
          <dd className="mt-1">{s.latest ? <BandBadge band={s.latest.band} overall={s.latest.overall} /> : <span className="text-sm text-slate-500">{t('Not assessed yet')}</span>}</dd>
        </div>
      </dl>
      {s.latest && !compact && (
        <ul className="space-y-2" aria-label={t('Traits')}>
          {s.latest.traits.map((tr) => {
            const pct = tr.scaleMax > tr.scaleMin ? ((tr.score - tr.scaleMin) / (tr.scaleMax - tr.scaleMin)) * 100 : 100;
            return (
              <li key={tr.id} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{bi(tr.name, tr.nameBn)}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">{formatNumber(tr.score)} / {formatNumber(tr.scaleMax)}</span>
                </div>
                <div className="h-1.5 mt-1 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden" role="progressbar" aria-valuemin={tr.scaleMin} aria-valuemax={tr.scaleMax} aria-valuenow={tr.score} aria-label={bi(tr.name, tr.nameBn)}>
                  <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {s.latest?.comment && !compact && (
        <blockquote className="text-sm italic text-slate-600 dark:text-slate-300 border-l-2 border-primary-300 pl-3">{s.latest.comment}</blockquote>
      )}
      {s.badges.length > 0 ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label={t('Badges')}>
          {s.badges.slice(0, compact ? 4 : 50).map((a) => <BadgeChip key={a.id} award={a} />)}
        </ul>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('No badges yet — keep going!')}</p>
      )}
    </div>
  );
};

/** Guardian + student dashboard card: one block per child. Hidden while the module is off. */
const DashboardCardInner: React.FC = () => {
  const t = useT();
  const q = useMyCharacter();
  if (q.isLoading) return <Card><SkeletonText lines={3} /></Card>;
  const children = q.data?.children ?? [];
  if (children.length === 0) return null;
  return (
    <Card>
      <CardHeader
        icon={<Star className="w-5 h-5" />}
        title={t('Character & badges')}
        actions={<Link to="/character/mine" className="text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline">{t('View all')}</Link>}
      />
      <div className="mt-3 divide-y divide-slate-100 dark:divide-white/6">
        {children.map((s) => (
          <div key={s.student.id} className="py-3 first:pt-0 last:pb-0 space-y-3">
            {children.length > 1 && (
              <div className="flex items-center gap-2">
                <Avatar size="sm" name={`${s.student.firstName} ${s.student.lastName}`} src={s.student.avatarUrl} />
                <span className="font-semibold text-sm">{s.student.firstName} {s.student.lastName}</span>
              </div>
            )}
            <SummaryBody s={s} compact />
          </div>
        ))}
      </div>
    </Card>
  );
};

export const CharacterDashboardCard: React.FC = () => (
  <ModuleGate module={MODULE_KEY}>
    <DashboardCardInner />
  </ModuleGate>
);
