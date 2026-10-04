/**
 * Landing-page ("design") blocks: FeatureGrid, PricingTable, Steps, Team,
 * BentoGrid, Countdown, Newsletter, Tabs, Marquee, ComparisonTable,
 * SplitHero, GradientBanner, TestimonialWall, AnnouncementBar.
 *
 * Same conventions as `content.tsx` / `text.tsx`: Bangla twins on every text
 * prop, entrance animation via `.site-anim` (off in lite mode / reduced
 * motion / the editor — see site.css), WCAG AA, works at 360px.
 */
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Minus, X } from 'lucide-react';
import { useIsEditing, useSiteApi, useSiteRuntime, useSiteText } from '../runtime';
import { BlockIcon } from './icons';
import {
  BlockSection, EditorHint, i18nField, i18nFields, ICON_OPTIONS, introFields, NotConnected, optimiseImage,
  radioField, RichHtml, sectionDefaults, sectionFields, SectionIntro, selectField, SiteImage, SiteLink, textField,
  urlField, useRichPick, type SectionProps, type SiteBlock,
} from './shared';

const introDefaults = { eyebrow: '', eyebrowBn: '', heading: '', headingBn: '', intro: '', introBn: '', align: 'left' };
const COLS: Record<string, string> = { '2': 'sm:grid-cols-2', '3': 'sm:grid-cols-2 lg:grid-cols-3', '4': 'sm:grid-cols-2 lg:grid-cols-4' };

/* ── Feature grid ───────────────────────────────────────────────────────── */

interface FeatureItem { icon?: string; title?: string; titleBn?: string; text?: string; textBn?: string }

export const FeatureGrid: SiteBlock = {
  label: 'Feature grid',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Features', max: 8,
      arrayFields: { icon: selectField('Icon', ICON_OPTIONS), ...i18nFields(['title', 'Title'], ['text', 'Text', 'textarea']) },
      defaultItemProps: { icon: 'star', title: 'Feature', titleBn: '', text: 'Sample text describing this feature.', textBn: 'এই বৈশিষ্ট্যের নমুনা লেখা।' },
      getItemSummary: (i: FeatureItem) => i.title || 'Feature',
    },
    columns: selectField('Columns', [['2', '2'], ['3', '3'], ['4', '4']]),
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Everything you need', headingBn: 'যা যা প্রয়োজন সবকিছু', align: 'center',
    items: [
      { icon: 'star', title: 'Feature one', titleBn: 'বৈশিষ্ট্য এক', text: 'Sample text describing this feature.', textBn: 'এই বৈশিষ্ট্যের নমুনা লেখা।' },
      { icon: 'lightbulb', title: 'Feature two', titleBn: 'বৈশিষ্ট্য দুই', text: 'Sample text describing this feature.', textBn: 'এই বৈশিষ্ট্যের নমুনা লেখা।' },
      { icon: 'shield', title: 'Feature three', titleBn: 'বৈশিষ্ট্য তিন', text: 'Sample text describing this feature.', textBn: 'এই বৈশিষ্ট্যের নমুনা লেখা।' },
    ],
    columns: '3', ...sectionDefaults,
  },
  render: (p) => <FeatureGridView {...p} />,
};

function FeatureGridView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const items = (p.items as FeatureItem[]) ?? [];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!items.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className={`grid grid-cols-1 gap-6 ${COLS[p.columns] ?? COLS['3']}`}>
          {items.map((it, i) => (
            <div key={i} className="site-anim site-card site-card-pad flex flex-col gap-3 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              {it.icon && (
                <span className="inline-flex h-12 w-12 items-center justify-center" style={{ background: 'var(--site-primary-soft)', color: 'var(--site-primary-text)', borderRadius: 'var(--site-radius)' }}>
                  <BlockIcon name={it.icon} />
                </span>
              )}
              <h3 className="site-h4">{tx(it.title, it.titleBn)}</h3>
              {tx(it.text, it.textBn) && <p className="site-muted whitespace-pre-line">{tx(it.text, it.textBn)}</p>}
            </div>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Pricing table ──────────────────────────────────────────────────────── */

interface PlanItem { name?: string; nameBn?: string; price?: string; period?: string; periodBn?: string; features?: string; featuresBn?: string; highlighted?: boolean; badge?: string; badgeBn?: string; buttonLabel?: string; buttonLabelBn?: string; href?: string }

export const PricingTable: SiteBlock = {
  label: 'Pricing table',
  fields: {
    ...introFields,
    plans: {
      type: 'array', label: 'Plans', max: 4,
      arrayFields: {
        ...i18nFields(['name', 'Plan name'], ['period', 'Billing period (e.g. /month)']),
        price: textField('Price (e.g. ৳2,000 or Free)'),
        ...i18nField('features', 'Features (one per line)', 'textarea'),
        ...i18nField('badge', 'Badge (e.g. Most popular)'),
        highlighted: radioField('Highlight this plan', [[true, 'Yes'], [false, 'No']]),
        ...i18nField('buttonLabel', 'Button label'),
        href: urlField('Button link'),
      },
      defaultItemProps: { name: 'Plan', nameBn: '', price: '৳0', period: '', periodBn: '', features: 'Feature one\nFeature two', featuresBn: '', highlighted: false, badge: '', badgeBn: '', buttonLabel: 'Choose plan', buttonLabelBn: 'বেছে নিন', href: '/admissions' },
      getItemSummary: (pl: PlanItem) => pl.name || 'Plan',
    },
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Simple pricing', headingBn: 'সহজ মূল্য তালিকা', align: 'center',
    plans: [
      { name: 'Basic', nameBn: 'বেসিক', price: '৳2,000', period: '/month', periodBn: '/মাস', features: 'Sample feature\nSample feature\nSample feature', featuresBn: 'নমুনা বৈশিষ্ট্য\nনমুনা বৈশিষ্ট্য\nনমুনা বৈশিষ্ট্য', highlighted: false, badge: '', badgeBn: '', buttonLabel: 'Choose plan', buttonLabelBn: 'বেছে নিন', href: '/admissions' },
      { name: 'Standard', nameBn: 'স্ট্যান্ডার্ড', price: '৳3,500', period: '/month', periodBn: '/মাস', features: 'Sample feature\nSample feature\nSample feature\nSample feature', featuresBn: 'নমুনা বৈশিষ্ট্য\nনমুনা বৈশিষ্ট্য\nনমুনা বৈশিষ্ট্য\nনমুনা বৈশিষ্ট্য', highlighted: true, badge: 'Most popular', badgeBn: 'সবচেয়ে জনপ্রিয়', buttonLabel: 'Choose plan', buttonLabelBn: 'বেছে নিন', href: '/admissions' },
    ],
    ...sectionDefaults,
  },
  render: (p) => <PricingTableView {...p} />,
};

function PricingTableView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const plans = (p.plans as PlanItem[]) ?? [];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!plans.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className={`mx-auto grid max-w-5xl grid-cols-1 gap-6 ${plans.length > 1 ? 'md:grid-cols-2' : ''} ${plans.length > 2 ? 'lg:grid-cols-3' : ''} ${plans.length > 3 ? 'xl:grid-cols-4' : ''}`}>
          {plans.map((pl, i) => {
            const features = tx(pl.features, pl.featuresBn).split('\n').map((f: string) => f.trim()).filter(Boolean);
            const highlighted = Boolean(pl.highlighted);
            return (
              <div key={i} className={`site-anim relative flex flex-col gap-5 ${highlighted ? 'site-tone-primary' : 'site-card'} site-card-pad`} style={{ borderRadius: 'var(--site-radius-lg)', ...(highlighted ? { transform: 'scale(1.03)', boxShadow: '0 20px 45px -20px rgb(0 0 0 / .35)' } : {}) }}>
                {tx(pl.badge, pl.badgeBn) && (
                  <span className="site-badge site-badge-accent absolute -top-3 left-1/2 -translate-x-1/2">{tx(pl.badge, pl.badgeBn)}</span>
                )}
                <div>
                  <p className="text-lg font-bold">{tx(pl.name, pl.nameBn)}</p>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold" style={{ fontFamily: 'var(--site-heading-font)' }}>{pl.price}</span>
                    {tx(pl.period, pl.periodBn) && <span className="text-sm opacity-80">{tx(pl.period, pl.periodBn)}</span>}
                  </p>
                </div>
                {features.length > 0 && (
                  <ul className="m-0 flex flex-1 list-none flex-col gap-2 p-0 text-sm">
                    {features.map((f: string, j: number) => (
                      <li key={j} className="flex items-start gap-2"><Check size={16} className="mt-0.5 flex-none" aria-hidden />{f}</li>
                    ))}
                  </ul>
                )}
                <SiteLink href={pl.href} className={`site-btn ${highlighted ? 'site-btn-primary' : 'site-btn-outline'} w-full`}>{tx(pl.buttonLabel, pl.buttonLabelBn) || s('Read more')}</SiteLink>
              </div>
            );
          })}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Steps ──────────────────────────────────────────────────────────────── */

interface StepItem { title?: string; titleBn?: string; text?: string; textBn?: string; icon?: string }

export const Steps: SiteBlock = {
  label: 'Steps',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Steps', max: 6,
      arrayFields: { icon: selectField('Icon', ICON_OPTIONS), ...i18nFields(['title', 'Title'], ['text', 'Text', 'textarea']) },
      defaultItemProps: { icon: '', title: 'Step', titleBn: '', text: 'Sample text.', textBn: 'নমুনা লেখা।' },
      getItemSummary: (i: StepItem) => i.title || 'Step',
    },
    layout: radioField('Layout', [['row', 'Side by side'], ['column', 'Stacked']]),
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'How it works', headingBn: 'যেভাবে কাজ করে', align: 'center',
    items: [
      { icon: '', title: 'Step one', titleBn: 'ধাপ এক', text: 'Sample text — describe the first step.', textBn: 'নমুনা লেখা — প্রথম ধাপ লিখুন।' },
      { icon: '', title: 'Step two', titleBn: 'ধাপ দুই', text: 'Sample text — describe the second step.', textBn: 'নমুনা লেখা — দ্বিতীয় ধাপ লিখুন।' },
      { icon: '', title: 'Step three', titleBn: 'ধাপ তিন', text: 'Sample text — describe the third step.', textBn: 'নমুনা লেখা — তৃতীয় ধাপ লিখুন।' },
    ],
    layout: 'row', ...sectionDefaults,
  },
  render: (p) => <StepsView {...p} />,
};

function StepsView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const items = (p.items as StepItem[]) ?? [];
  const row = p.layout !== 'column';
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!items.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <ol className={`m-0 grid list-none gap-8 p-0 ${row ? `grid-cols-1 md:grid-cols-${Math.min(items.length, 4)}` : 'grid-cols-1 max-w-2xl mx-auto'}`}>
          {items.map((it, i) => (
            <li key={i} className="site-anim relative flex flex-col gap-3" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-lg font-extrabold" style={{ background: 'var(--site-primary)', color: 'var(--site-on-primary)' }}>
                  {it.icon ? <BlockIcon name={it.icon} /> : i + 1}
                </span>
                {row && i < items.length - 1 && <span aria-hidden className="hidden h-0.5 flex-1 md:block" style={{ background: 'var(--site-border)' }} />}
              </div>
              <h3 className="site-h4">{tx(it.title, it.titleBn)}</h3>
              {tx(it.text, it.textBn) && <p className="site-muted whitespace-pre-line">{tx(it.text, it.textBn)}</p>}
            </li>
          ))}
        </ol>
      )}
    </BlockSection>
  );
}

/* ── Team ───────────────────────────────────────────────────────────────── */

interface TeamMember { photo?: string; name?: string; nameBn?: string; role?: string; roleBn?: string; bio?: string; bioBn?: string }

export const Team: SiteBlock = {
  label: 'Team',
  fields: {
    ...introFields,
    members: {
      type: 'array', label: 'Team members', max: 12,
      arrayFields: { photo: textField('Photo URL'), ...i18nFields(['name', 'Name'], ['role', 'Role'], ['bio', 'Short bio', 'textarea']) },
      defaultItemProps: { photo: '', name: 'Name', nameBn: '', role: 'Role', roleBn: '', bio: '', bioBn: '' },
      getItemSummary: (m: TeamMember) => m.name || 'Member',
    },
    columns: selectField('Columns', [['2', '2'], ['3', '3'], ['4', '4']]),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Meet the team', headingBn: 'দলের সাথে পরিচিত হোন', align: 'center', members: [], columns: '4', ...sectionDefaults },
  render: (p) => <TeamView {...p} />,
};

function TeamView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const members = (p.members as TeamMember[]) ?? [];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!members.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className={`grid grid-cols-2 gap-5 ${COLS[p.columns] ?? COLS['4']}`}>
          {members.map((m, i) => (
            <div key={i} className="site-anim flex flex-col items-center gap-2 text-center" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              {m.photo ? (
                <SiteImage src={m.photo} alt={tx(m.name, m.nameBn)} width={400} className="aspect-square w-full max-w-[180px] rounded-full object-cover" />
              ) : (
                <div aria-hidden className="flex aspect-square w-full max-w-[180px] items-center justify-center rounded-full text-2xl font-bold" style={{ background: 'var(--site-primary-soft)' }}>
                  {(m.name || '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
                </div>
              )}
              <p className="font-semibold">{tx(m.name, m.nameBn)}</p>
              {tx(m.role, m.roleBn) && <p className="text-sm" style={{ color: 'var(--site-primary-text)' }}>{tx(m.role, m.roleBn)}</p>}
              {tx(m.bio, m.bioBn) && <p className="site-muted text-sm">{tx(m.bio, m.bioBn)}</p>}
            </div>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Bento grid ─────────────────────────────────────────────────────────── */

interface BentoItem { size?: string; icon?: string; image?: string; title?: string; titleBn?: string; text?: string; textBn?: string; href?: string }

const BENTO_SPAN: Record<string, string> = { sm: 'lg:col-span-1 lg:row-span-1', wide: 'lg:col-span-2 lg:row-span-1', tall: 'lg:col-span-1 lg:row-span-2', big: 'lg:col-span-2 lg:row-span-2' };

export const BentoGrid: SiteBlock = {
  label: 'Bento grid',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Tiles', max: 8,
      arrayFields: {
        size: selectField('Tile size', [['sm', 'Small'], ['wide', 'Wide'], ['tall', 'Tall'], ['big', 'Big']]),
        icon: selectField('Icon', ICON_OPTIONS),
        image: textField('Background image URL (optional)'),
        ...i18nFields(['title', 'Title'], ['text', 'Text', 'textarea']),
        href: urlField('Link (optional)'),
      },
      defaultItemProps: { size: 'sm', icon: 'star', image: '', title: 'Tile', titleBn: '', text: 'Sample text.', textBn: 'নমুনা লেখা।', href: '' },
      getItemSummary: (i: BentoItem) => i.title || 'Tile',
    },
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Highlights', headingBn: 'বিশেষত্ব',
    items: [
      { size: 'wide', icon: 'star', image: '', title: 'Big highlight', titleBn: 'বড় বিশেষত্ব', text: 'Sample text — the headline feature.', textBn: 'নমুনা লেখা — প্রধান বৈশিষ্ট্য।', href: '' },
      { size: 'sm', icon: 'book', image: '', title: 'Detail', titleBn: 'বিস্তারিত', text: 'Sample text.', textBn: 'নমুনা লেখা।', href: '' },
      { size: 'sm', icon: 'users', image: '', title: 'Detail', titleBn: 'বিস্তারিত', text: 'Sample text.', textBn: 'নমুনা লেখা।', href: '' },
    ],
    ...sectionDefaults,
  },
  render: (p) => <BentoGridView {...p} />,
};

function BentoGridView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const items = (p.items as BentoItem[]) ?? [];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!items.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className="grid grid-cols-1 gap-4 lg:auto-rows-[180px] lg:grid-cols-4">
          {items.map((it, i) => {
            const img = optimiseImage(it.image, 900);
            const onImg = Boolean(img);
            return (
              <SiteLink key={i} href={it.href} className={`site-anim group relative flex flex-col justify-end overflow-hidden p-6 no-underline ${BENTO_SPAN[it.size ?? 'sm']}`} style={{ animationDelay: `${Math.min(i, 8) * 50}ms`, borderRadius: 'var(--site-radius-lg)', background: onImg ? '#0f172a' : 'var(--site-surface)', minHeight: 180, color: onImg ? '#fff' : 'var(--site-text)' }}>
                {img && <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105" />}
                {onImg && <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />}
                <span className="relative flex flex-col gap-1">
                  {it.icon && !onImg && <span className="mb-2 inline-flex h-10 w-10 items-center justify-center" style={{ background: 'var(--site-primary-soft)', color: 'var(--site-primary-text)', borderRadius: 'var(--site-radius)' }}><BlockIcon name={it.icon} /></span>}
                  <span className="text-lg font-bold">{tx(it.title, it.titleBn)}</span>
                  {tx(it.text, it.textBn) && <span className={`text-sm ${onImg ? 'opacity-90' : 'site-muted'}`}>{tx(it.text, it.textBn)}</span>}
                </span>
              </SiteLink>
            );
          })}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Countdown ──────────────────────────────────────────────────────────── */

function useCountdown(target: string, liteMode: boolean) {
  const targetMs = useMemo(() => Date.parse(target || ''), [target]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(targetMs)) return undefined;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, liteMode ? 60_000 : 1000);
    return () => window.clearInterval(id);
  }, [targetMs, liteMode]);
  const diff = Number.isFinite(targetMs) ? Math.max(0, targetMs - now) : 0;
  return {
    valid: Number.isFinite(targetMs),
    expired: Number.isFinite(targetMs) && targetMs - now <= 0,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  };
}

export const Countdown: SiteBlock = {
  label: 'Countdown',
  fields: {
    ...introFields,
    targetDate: textField('Target date & time (e.g. 2026-12-01T09:00)'),
    ...i18nField('expiredText', 'Text shown after it ends'),
    buttons: { type: 'array', label: 'Button', max: 1, arrayFields: { ...i18nField('label', 'Label'), href: urlField('Link') }, defaultItemProps: { label: 'Register now', labelBn: 'নিবন্ধন করুন', href: '/admissions' }, getItemSummary: (i: { label?: string }) => i.label || 'Button' },
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Admission fair starts in', headingBn: 'ভর্তি মেলা শুরু হতে বাকি', align: 'center',
    targetDate: '', expiredText: 'The event has started.', expiredTextBn: 'অনুষ্ঠান শুরু হয়ে গেছে।',
    buttons: [{ label: 'Register now', labelBn: 'নিবন্ধন করুন', href: '/admissions' }],
    ...sectionDefaults, tone: 'dark',
  },
  render: (p) => <CountdownView {...p} />,
};

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-3" style={{ background: 'rgb(255 255 255 / .08)' }}>
      <span className="text-3xl font-extrabold tabular-nums md:text-4xl">{String(Math.max(0, value)).padStart(2, '0')}</span>
      <span className="text-xs uppercase tracking-wide opacity-80">{label}</span>
    </div>
  );
}

function CountdownView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const { liteMode } = useSiteRuntime();
  const cd = useCountdown(String(p.targetDate ?? ''), liteMode);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!cd.valid ? (
        <EditorHint title={s('Add content in the editor')} hint="Set a target date in the block settings." />
      ) : cd.expired ? (
        <p className="site-lead text-center">{tx(p.expiredText, p.expiredTextBn)}</p>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-wrap justify-center gap-3">
            <CountdownUnit value={cd.days} label={s('Days')} />
            <CountdownUnit value={cd.hours} label={s('Hours')} />
            <CountdownUnit value={cd.minutes} label={s('Minutes')} />
            <CountdownUnit value={cd.seconds} label={s('Seconds')} />
          </div>
          {(p.buttons as Array<{ label?: string; labelBn?: string; href?: string }>)?.[0] && tx(p.buttons[0].label, p.buttons[0].labelBn) && (
            <SiteLink href={p.buttons[0].href} className="site-btn site-btn-primary site-btn-lg">{tx(p.buttons[0].label, p.buttons[0].labelBn)}</SiteLink>
          )}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Newsletter (posts to a SiteForm or the default enquiry form) ───────── */

export const Newsletter: SiteBlock = {
  label: 'Newsletter signup',
  fields: { ...introFields, formId: textField('Form ID (from Website › Forms; empty = default enquiry form)'), ...i18nField('placeholder', 'Email placeholder'), ...i18nField('buttonLabel', 'Button label'), ...i18nField('successMessage', 'Thank-you message'), ...sectionFields },
  defaultProps: {
    ...introDefaults, heading: 'Stay updated', headingBn: 'সংবাদ পেতে যুক্ত থাকুন', intro: 'Get notices and news by email.', introBn: 'ইমেইলে নোটিশ ও খবর পান।', align: 'center',
    formId: '', placeholder: 'you@example.com', placeholderBn: 'you@example.com', buttonLabel: 'Subscribe', buttonLabelBn: 'যুক্ত হোন',
    successMessage: 'Thanks — you’re on the list!', successMessageBn: 'ধন্যবাদ — আপনি তালিকাভুক্ত হয়েছেন!',
    ...sectionDefaults, tone: 'soft', width: 'narrow',
  },
  render: (p) => <NewsletterView {...p} />,
};

function NewsletterView(p: Record<string, any>) {
  const { s, tx } = useSiteText();
  const { siteId, settings } = useSiteRuntime();
  const api = useSiteApi();
  const editing = useIsEditing();
  const uid = useId();
  const formId = String(p.formId ?? '').trim() || settings.defaultEnquiryFormId || '';
  const [email, setEmail] = useState('');
  const [honey, setHoney] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteId || editing || !formId) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(s('Enter a valid email')); return; }
    setError(null);
    setState('sending');
    try {
      await api.submitForm(siteId, formId, { email: email.trim() }, honey);
      setState('done');
      setEmail('');
    } catch {
      setState('error');
    }
  };

  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!siteId ? <NotConnected /> : !formId ? (
        editing ? <div className="mx-auto flex max-w-md items-start gap-2 site-alert site-alert-warning"><AlertTriangle size={18} className="mt-0.5 flex-none" aria-hidden /><p>{s('Choose a form for this block (Website › Forms).')}</p></div> : null
      ) : state === 'done' ? (
        <p className="site-alert site-alert-success mx-auto max-w-md text-center" role="status">{tx(p.successMessage, p.successMessageBn)}</p>
      ) : (
        <form onSubmit={submit} noValidate className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={uid}>{s('Email')}</label>
          <input id={uid} type="email" required className="site-input" placeholder={tx(p.placeholder, p.placeholderBn)} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
            <label htmlFor={`${uid}-hp`}>Website</label>
            <input id={`${uid}-hp`} tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} />
          </div>
          <button type="submit" className="site-btn site-btn-primary flex-none" disabled={state === 'sending' || editing}>{state === 'sending' ? s('Sending…') : tx(p.buttonLabel, p.buttonLabelBn)}</button>
          {error && <p className="site-error sm:col-span-2" role="alert">{error}</p>}
          {state === 'error' && <p className="site-error" role="alert">{s('Couldn’t send. Please check the form and try again.')}</p>}
        </form>
      )}
    </BlockSection>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

interface TabItem { label?: string; labelBn?: string; body?: string; bodyBn?: string }

export const Tabs: SiteBlock = {
  label: 'Tabs',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Tabs', max: 8,
      arrayFields: { ...i18nField('label', 'Tab label'), ...i18nField('body', 'Content', 'richtext') },
      defaultItemProps: { label: 'Tab', labelBn: '', body: '<p>Sample content.</p>', bodyBn: '<p>নমুনা কনটেন্ট।</p>' },
      getItemSummary: (i: TabItem) => i.label || 'Tab',
    },
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults,
    items: [
      { label: 'Overview', labelBn: 'সংক্ষিপ্ত বিবরণ', body: '<p>Sample content for this tab.</p>', bodyBn: '<p>এই ট্যাবের জন্য নমুনা কনটেন্ট।</p>' },
      { label: 'Details', labelBn: 'বিস্তারিত', body: '<p>Sample content for this tab.</p>', bodyBn: '<p>এই ট্যাবের জন্য নমুনা কনটেন্ট।</p>' },
    ],
    ...sectionDefaults, width: 'narrow',
  },
  render: (p) => <TabsView {...p} />,
};

function TabsView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const pick = useRichPick();
  const items = (p.items as TabItem[]) ?? [];
  const [active, setActive] = useState(0);
  const uid = useId();
  if (!items.length) return <BlockSection {...(p as SectionProps)}><SectionIntro {...p} /><EditorHint title={s('Add content in the editor')} /></BlockSection>;
  const cur = Math.min(active, items.length - 1);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      <div role="tablist" aria-label={tx(p.heading, p.headingBn) || 'Tabs'} className="mb-6 flex flex-wrap gap-2 border-b" style={{ borderColor: 'var(--site-border)' }}>
        {items.map((it, i) => (
          <button
            key={i} type="button" role="tab" id={`${uid}-tab-${i}`} aria-selected={cur === i} aria-controls={`${uid}-panel-${i}`}
            className="min-h-[44px] border-b-2 px-3 pb-2 font-semibold"
            style={{ borderColor: cur === i ? 'var(--site-primary)' : 'transparent', color: cur === i ? 'var(--site-primary-text)' : 'var(--site-muted)' }}
            onClick={() => setActive(i)}
          >
            {tx(it.label, it.labelBn)}
          </button>
        ))}
      </div>
      {items.map((it, i) => (
        <div key={i} id={`${uid}-panel-${i}`} role="tabpanel" aria-labelledby={`${uid}-tab-${i}`} hidden={cur !== i}>
          <RichHtml value={pick(it.body, it.bodyBn)} />
        </div>
      ))}
    </BlockSection>
  );
}

/* ── Marquee ────────────────────────────────────────────────────────────── */

interface MarqueeItem { text?: string; textBn?: string; image?: string }

export const Marquee: SiteBlock = {
  label: 'Marquee / scrolling strip',
  fields: {
    items: {
      type: 'array', label: 'Items', max: 20,
      arrayFields: { image: textField('Logo/image URL (optional)'), ...i18nField('text', 'Text') },
      defaultItemProps: { image: '', text: 'Sample item', textBn: 'নমুনা আইটেম' },
      getItemSummary: (i: MarqueeItem) => i.text || 'Item',
    },
    speed: selectField('Speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]),
    ...sectionFields,
  },
  defaultProps: { items: [], speed: 'normal', ...sectionDefaults, pad: 'sm' },
  render: (p) => <MarqueeView {...p} />,
};

const MARQUEE_DURATION: Record<string, string> = { slow: '50s', normal: '32s', fast: '18s' };

function MarqueeView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const { liteMode } = useSiteRuntime();
  const editing = useIsEditing();
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
    if (!mq) return undefined;
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  const items = (p.items as MarqueeItem[]) ?? [];
  if (!items.length) return <BlockSection {...(p as SectionProps)}><EditorHint title={s('Add content in the editor')} /></BlockSection>;
  const still = liteMode || editing || reducedMotion;
  const track = (key: string) => (
    <div key={key} aria-hidden={key === 'b'} className="flex flex-none items-center gap-10 pr-10" style={{ animation: still ? 'none' : `site-marquee ${MARQUEE_DURATION[p.speed] ?? MARQUEE_DURATION.normal} linear infinite` }}>
      {items.map((it, i) => (
        <span key={i} className="flex flex-none items-center gap-2 text-lg font-semibold opacity-80">
          {it.image && <img src={optimiseImage(it.image, 200)} alt="" loading="lazy" className="h-8 w-auto object-contain" />}
          {tx(it.text, it.textBn)}
        </span>
      ))}
    </div>
  );
  return (
    <BlockSection {...(p as SectionProps)}>
      <div className={`flex w-full ${still ? 'flex-wrap justify-center gap-6' : 'overflow-hidden'}`} style={{ maskImage: still ? undefined : 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)' }}>
        {still ? track('a') : <>{track('a')}{track('b')}</>}
      </div>
    </BlockSection>
  );
}

/* ── Comparison table ───────────────────────────────────────────────────── */

interface CompareRow { label?: string; col1?: string; col2?: string; col3?: string; col4?: string }

export const ComparisonTable: SiteBlock = {
  label: 'Comparison table',
  fields: {
    ...introFields,
    columns: { type: 'array', label: 'Column headings', max: 4, arrayFields: { label: textField('Heading') }, defaultItemProps: { label: 'Plan' }, getItemSummary: (c: { label?: string }) => c.label || 'Column' },
    rows: {
      type: 'array', label: 'Rows', max: 12,
      arrayFields: { label: textField('Feature'), col1: textField('Column 1 (yes / no / text)'), col2: textField('Column 2'), col3: textField('Column 3'), col4: textField('Column 4') },
      defaultItemProps: { label: 'Feature', col1: 'yes', col2: 'no', col3: '', col4: '' },
      getItemSummary: (r: CompareRow) => r.label || 'Row',
    },
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Compare', headingBn: 'তুলনা করুন',
    columns: [{ label: 'Basic' }, { label: 'Standard' }],
    rows: [
      { label: 'Sample feature', col1: 'yes', col2: 'yes', col3: '', col4: '' },
      { label: 'Sample feature', col1: 'no', col2: 'yes', col3: '', col4: '' },
    ],
    ...sectionDefaults,
  },
  render: (p) => <ComparisonTableView {...p} />,
};

function CompareCell({ value }: { value?: string }) {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'yes' || v === 'true') return <Check size={18} className="mx-auto" style={{ color: 'var(--site-primary-text)' }} aria-label="Yes" />;
  if (v === 'no' || v === 'false') return <Minus size={18} className="mx-auto opacity-40" aria-label="No" />;
  return <span>{value || '—'}</span>;
}

function ComparisonTableView(p: Record<string, any>) {
  const { s } = useSiteText();
  const columns = (p.columns as Array<{ label?: string }>) ?? [];
  const rows = (p.rows as CompareRow[]) ?? [];
  if (!columns.length || !rows.length) return <BlockSection {...(p as SectionProps)}><SectionIntro {...p} /><EditorHint title={s('Add content in the editor')} /></BlockSection>;
  const keys: Array<'col1' | 'col2' | 'col3' | 'col4'> = ['col1', 'col2', 'col3', 'col4'];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      <div className="site-table-wrap">
        <table className="site-table w-full">
          <thead><tr><th scope="col"></th>{columns.map((c, i) => <th key={i} scope="col" className="text-center">{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-semibold">{r.label}</td>
                {columns.map((_, j) => <td key={j} className="text-center"><CompareCell value={r[keys[j]]} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BlockSection>
  );
}

/* ── Split hero (landing pages: badges, gradient, image/video side) ────── */

export const SplitHero: SiteBlock = {
  label: 'Split hero',
  fields: {
    ...i18nFields(['eyebrow', 'Small label'], ['title', 'Title'], ['subtitle', 'Subtitle', 'textarea']),
    badges: { type: 'array', label: 'Badges', max: 4, arrayFields: { ...i18nField('label', 'Badge text') }, defaultItemProps: { label: 'Badge', labelBn: '' }, getItemSummary: (b: { label?: string }) => b.label || 'Badge' },
    buttons: { type: 'array', label: 'Buttons', max: 2, arrayFields: { ...i18nField('label', 'Label'), href: urlField('Link'), variant: selectField('Style', [['primary', 'Primary'], ['outline', 'Outline']]) }, defaultItemProps: { label: 'Get started', labelBn: 'শুরু করুন', href: '/admissions', variant: 'primary' }, getItemSummary: (b: { label?: string }) => b.label || 'Button' },
    image: textField('Image URL'),
    imageAlt: textField('Image description (alt text)'),
    side: radioField('Image side', [['right', 'Right'], ['left', 'Left']]),
    gradient: radioField('Brand gradient background', [[true, 'Yes'], [false, 'No']]),
  },
  defaultProps: {
    eyebrow: 'New', eyebrowBn: 'নতুন', title: 'A modern way to run your school online', titleBn: 'আপনার প্রতিষ্ঠান পরিচালনার আধুনিক উপায়',
    subtitle: 'Sample text: one or two sentences about the product or programme.', subtitleBn: 'নমুনা লেখা: পণ্য বা কার্যক্রম সম্পর্কে এক-দুই বাক্য।',
    badges: [{ label: 'Trusted', labelBn: 'বিশ্বস্ত' }, { label: 'Modern', labelBn: 'আধুনিক' }],
    buttons: [{ label: 'Get started', labelBn: 'শুরু করুন', href: '/admissions', variant: 'primary' }, { label: 'Learn more', labelBn: 'আরও জানুন', href: '/about', variant: 'outline' }],
    image: '', imageAlt: '', side: 'right', gradient: true,
  },
  render: (p) => <SplitHeroView {...p} />,
};

function SplitHeroView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const img = optimiseImage(p.image, 1400);
  const left = p.side === 'left';
  const badges = (p.badges as Array<{ label?: string; labelBn?: string }>) ?? [];
  const buttons = (p.buttons as Array<{ label?: string; labelBn?: string; href?: string; variant?: string }>) ?? [];
  return (
    <section className="relative overflow-hidden" style={p.gradient !== false ? { background: 'linear-gradient(135deg, var(--site-primary-soft), var(--site-accent-soft))' } : undefined}>
      <div className="site-container site-pad-lg">
        <div className={`grid grid-cols-1 items-center gap-10 md:grid-cols-2 ${left ? 'md:[&>*:first-child]:order-2' : ''}`}>
          <div className="site-anim flex flex-col gap-5">
            {tx(p.eyebrow, p.eyebrowBn) && <span className="site-eyebrow">{tx(p.eyebrow, p.eyebrowBn)}</span>}
            <h1 className="site-h1">{tx(p.title, p.titleBn)}</h1>
            {tx(p.subtitle, p.subtitleBn) && <p className="site-lead site-muted whitespace-pre-line">{tx(p.subtitle, p.subtitleBn)}</p>}
            {badges.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {badges.map((b, i) => tx(b.label, b.labelBn) && <li key={i} className="site-badge">{tx(b.label, b.labelBn)}</li>)}
              </ul>
            )}
            {buttons.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-3">
                {buttons.map((b, i) => tx(b.label, b.labelBn) && <SiteLink key={i} href={b.href} className={`site-btn site-btn-${b.variant ?? 'primary'} site-btn-lg`}>{tx(b.label, b.labelBn)}</SiteLink>)}
              </div>
            )}
          </div>
          {img ? (
            <img src={img} alt={p.imageAlt || ''} className="site-anim aspect-[4/3] w-full object-cover" style={{ borderRadius: 'var(--site-radius-lg)', boxShadow: '0 30px 60px -20px rgb(0 0 0 / .25)' }} fetchPriority="high" />
          ) : (
            <svg viewBox="0 0 400 300" className="site-anim w-full" role="presentation" aria-hidden>
              <rect x="0" y="0" width="400" height="300" rx="24" fill="var(--site-bg)" opacity=".6" />
              <rect x="40" y="40" width="320" height="220" rx="18" fill="var(--site-primary)" opacity=".18" />
              <circle cx="300" cy="90" r="46" fill="var(--site-accent)" opacity=".6" />
              <rect x="70" y="150" width="180" height="90" rx="12" fill="var(--site-primary)" opacity=".55" />
            </svg>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Gradient banner ────────────────────────────────────────────────────── */

export const GradientBanner: SiteBlock = {
  label: 'Gradient banner',
  fields: {
    ...i18nFields(['title', 'Title'], ['text', 'Text', 'textarea']),
    buttons: { type: 'array', label: 'Buttons', max: 2, arrayFields: { ...i18nField('label', 'Label'), href: urlField('Link') }, defaultItemProps: { label: 'Get started', labelBn: 'শুরু করুন', href: '/admissions' }, getItemSummary: (b: { label?: string }) => b.label || 'Button' },
  },
  defaultProps: {
    title: 'Ready when you are', titleBn: 'আপনি প্রস্তুত হলেই শুরু',
    text: 'Sample text — a short, energetic line inviting people to act.', textBn: 'নমুনা লেখা — কাজের জন্য উদ্দীপনামূলক একটি ছোট বাক্য।',
    buttons: [{ label: 'Get started', labelBn: 'শুরু করুন', href: '/admissions' }],
  },
  render: (p) => <GradientBannerView {...p} />,
};

function GradientBannerView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const buttons = (p.buttons as Array<{ label?: string; labelBn?: string; href?: string }>) ?? [];
  return (
    <section className="relative overflow-hidden site-pad-md" style={{ background: 'linear-gradient(120deg, var(--site-primary), var(--site-accent))', color: '#fff' }}>
      <div className="site-container flex flex-col items-center gap-4 text-center">
        <h2 className="site-h2">{tx(p.title, p.titleBn)}</h2>
        {tx(p.text, p.textBn) && <p className="site-lead max-w-2xl opacity-95">{tx(p.text, p.textBn)}</p>}
        {buttons.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {buttons.map((b, i) => tx(b.label, b.labelBn) && <SiteLink key={i} href={b.href} className="site-btn site-btn-light site-btn-lg">{tx(b.label, b.labelBn)}</SiteLink>)}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Testimonial wall (dense grid) ──────────────────────────────────────── */

interface WallItem { quote?: string; quoteBn?: string; name?: string; nameBn?: string; role?: string; roleBn?: string; photo?: string }

export const TestimonialWall: SiteBlock = {
  label: 'Testimonial wall',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Testimonials', max: 12,
      arrayFields: { ...i18nFields(['quote', 'Quote', 'textarea'], ['name', 'Name'], ['role', 'Role']), photo: textField('Photo URL (optional)') },
      defaultItemProps: { quote: 'Sample quote text.', quoteBn: 'নমুনা উক্তি।', name: 'Name', nameBn: '', role: '', roleBn: '', photo: '' },
      getItemSummary: (t: WallItem) => t.name || 'Testimonial',
    },
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Loved by our community', headingBn: 'আমাদের সম্প্রদায়ের ভালোবাসা', align: 'center', items: [], ...sectionDefaults, tone: 'surface' },
  render: (p) => <TestimonialWallView {...p} />,
};

function TestimonialWallView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const items = ((p.items as WallItem[]) ?? []).filter((t) => tx(t.quote, t.quoteBn));
  if (!items.length) return <BlockSection {...(p as SectionProps)}><SectionIntro {...p} /><EditorHint title={s('Add content in the editor')} /></BlockSection>;
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {items.map((t, i) => (
          <figure key={i} className="site-anim site-card site-card-pad m-0 mb-4 flex break-inside-avoid flex-col gap-3" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
            <blockquote className="m-0 whitespace-pre-line text-sm">{tx(t.quote, t.quoteBn)}</blockquote>
            <figcaption className="mt-auto flex items-center gap-2">
              {t.photo ? <img src={optimiseImage(t.photo, 100)} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" /> : (
                <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--site-primary-soft)' }}>{(t.name || '?').charAt(0)}</span>
              )}
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{tx(t.name, t.nameBn)}</span>
                {tx(t.role, t.roleBn) && <span className="site-muted text-xs">{tx(t.role, t.roleBn)}</span>}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </BlockSection>
  );
}

/* ── Announcement bar ───────────────────────────────────────────────────── */

export const AnnouncementBar: SiteBlock = {
  label: 'Announcement bar',
  fields: { ...i18nField('text', 'Message'), linkLabel: textField('Link label (optional)'), href: urlField('Link (optional)'), dismissible: radioField('Visitors can dismiss it', [[true, 'Yes'], [false, 'No']]), tone: selectField('Colour', [['primary', 'Brand colour'], ['accent', 'Accent colour'], ['dark', 'Dark']]) },
  defaultProps: { text: 'Admissions for the new session are now open.', textBn: 'নতুন শিক্ষাবর্ষের ভর্তি চলছে।', linkLabel: 'Apply now', href: '/admissions', dismissible: true, tone: 'primary' },
  render: (p) => <AnnouncementBarView {...p} />,
};

function AnnouncementBarView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const editing = useIsEditing();
  const text = tx(p.text, p.textBn);
  const storageKey = `site-announcement-dismissed:${text.slice(0, 60)}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!p.dismissible) return;
    try { setDismissed(sessionStorage.getItem(storageKey) === '1'); } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  if (!text || (dismissed && !editing)) return null;
  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(storageKey, '1'); } catch { /* private mode */ }
  };
  return (
    <div className={`site-tone-${p.tone ?? 'primary'} flex min-h-[44px] items-center justify-center gap-3 px-4 py-2 text-center text-sm font-semibold`}>
      <span>{text}{p.href && p.linkLabel && <> — <SiteLink href={p.href} className="underline underline-offset-2">{p.linkLabel}</SiteLink></>}</span>
      {p.dismissible !== false && (
        <button type="button" onClick={dismiss} aria-label={s('Close menu')} className="ml-1 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full opacity-80 hover:opacity-100">
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
