/** Text-first blocks: Hero, Heading, RichText, ButtonGroup, CallToAction. */
import { toVideoEmbed } from '../embed';
import { useSiteRuntime, useSiteText } from '../runtime';
import {
  BlockSection, i18nField, i18nFields, optimiseImage, radioField, RichHtml, sectionDefaults, sectionFields,
  selectField, SiteLink, textField, urlField, useRichPick, type SectionProps, type SiteBlock,
} from './shared';

/* ── Buttons (shared by Hero, CTA, ButtonGroup) ─────────────────────────── */

export interface ButtonItem { label?: string; labelBn?: string; href?: string; variant?: string }

export const buttonsField = {
  type: 'array' as const,
  label: 'Buttons',
  max: 4,
  arrayFields: {
    ...i18nField('label', 'Label'),
    href: urlField('Link'),
    variant: selectField('Style', [['primary', 'Primary'], ['accent', 'Accent'], ['outline', 'Outline'], ['ghost', 'Plain']]),
  },
  defaultItemProps: { label: 'Button', labelBn: '', href: '/', variant: 'primary' },
  getItemSummary: (i: ButtonItem) => i.label || 'Button',
};

export function Buttons({ items, size = 'md', center = false, onImage = false }: { items?: ButtonItem[]; size?: 'md' | 'lg'; center?: boolean; onImage?: boolean }) {
  const { tx } = useSiteText();
  const list = (items ?? []).filter((b) => tx(b.label, b.labelBn));
  if (!list.length) return null;
  return (
    <div className={`flex flex-wrap gap-3 ${center ? 'justify-center' : ''}`}>
      {list.map((b, i) => {
        let v = b.variant || 'primary';
        if (onImage && v === 'outline') v = 'light-outline';
        if (onImage && v === 'ghost') v = 'light-outline';
        return (
          <SiteLink key={i} href={b.href} className={`site-btn site-btn-${v} ${size === 'lg' ? 'site-btn-lg' : ''}`}>
            {tx(b.label, b.labelBn)}
          </SiteLink>
        );
      })}
    </div>
  );
}

/**
 * The AI site generator emits a single CTA as flat props (`ctaLabel`/`ctaHref`
 * on Hero, `buttonLabel`/`buttonHref` on CallToAction). Use them when present.
 */
function legacyButtons(p: Record<string, any>, prefix: 'cta' | 'button'): ButtonItem[] | null {
  const label = p[`${prefix}Label`];
  if (typeof label !== 'string' || !label.trim()) return null;
  return [{ label, labelBn: p[`${prefix}LabelBn`] ?? '', href: p[`${prefix}Href`] || '/', variant: 'primary' }];
}

/* ── Hero ───────────────────────────────────────────────────────────────── */

const HERO_HEIGHT: Record<string, string> = { auto: '', md: 'min-h-[420px] md:min-h-[520px]', lg: 'min-h-[520px] md:min-h-[680px]', screen: 'min-h-[80vh]' };
const OVERLAY: Record<string, string> = {
  none: 'transparent',
  light: 'rgb(15 23 42 / .35)',
  dark: 'rgb(15 23 42 / .65)',
  brand: 'linear-gradient(120deg, color-mix(in srgb, var(--site-primary) 88%, transparent), color-mix(in srgb, var(--site-primary) 45%, transparent))',
  gradient: 'linear-gradient(180deg, rgb(15 23 42 / .15), rgb(15 23 42 / .75))',
};

export const Hero: SiteBlock = {
  label: 'Hero',
  fields: {
    ...i18nFields(['eyebrow', 'Small label'], ['title', 'Title'], ['subtitle', 'Subtitle', 'textarea']),
    buttons: buttonsField,
    layout: selectField('Layout', [['center', 'Centred'], ['left', 'Left aligned'], ['split', 'Text + image side by side']]),
    backgroundImage: textField('Background / side image URL'),
    imageAlt: textField('Image description (alt text)'),
    backgroundVideo: textField('Background video (MP4 URL; hidden in lite mode)'),
    overlay: selectField('Overlay on image', [['none', 'None'], ['light', 'Light shade'], ['dark', 'Dark shade'], ['brand', 'Brand colour'], ['gradient', 'Bottom gradient']]),
    height: selectField('Height', [['auto', 'Fit content'], ['md', 'Medium'], ['lg', 'Large'], ['screen', 'Most of the screen']]),
    tone: sectionFields.tone,
  },
  defaultProps: {
    eyebrow: 'Welcome', eyebrowBn: 'স্বাগতম',
    title: '{{institution.name}}', titleBn: '',
    subtitle: 'A short sentence about your school’s mission. Replace this sample text.', subtitleBn: 'আপনার প্রতিষ্ঠানের লক্ষ্য নিয়ে একটি ছোট বাক্য লিখুন। এটি নমুনা লেখা।',
    buttons: [
      { label: 'Admissions', labelBn: 'ভর্তি', href: '/admissions', variant: 'primary' },
      { label: 'Contact us', labelBn: 'যোগাযোগ', href: '/contact', variant: 'outline' },
    ],
    layout: 'center', backgroundImage: '', imageAlt: '', backgroundVideo: '', overlay: 'dark', height: 'md', tone: 'soft',
  },
  render: (p) => <HeroView {...p} />,
};

function HeroView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const img = optimiseImage(p.backgroundImage, 1920);
  const split = p.layout === 'split';
  const onImage = Boolean(img || p.backgroundVideo) && !split;
  const video = !split && p.backgroundVideo ? toVideoEmbed(p.backgroundVideo) : null;
  const center = p.layout === 'center';
  const eyebrow = tx(p.eyebrow, p.eyebrowBn);
  const title = tx(p.title, p.titleBn);
  const subtitle = tx(p.subtitle, p.subtitleBn);

  const text = (
    <div className={`site-anim flex flex-col gap-5 ${center ? 'items-center text-center mx-auto max-w-3xl' : 'max-w-2xl'}`}>
      {eyebrow && <span className="site-eyebrow" style={onImage ? { color: '#fff' } : undefined}>{eyebrow}</span>}
      {title && <h1 className="site-h1" style={onImage ? { color: '#fff' } : undefined}>{title}</h1>}
      {subtitle && <p className="site-lead whitespace-pre-line" style={{ opacity: onImage ? 0.95 : undefined }}>{subtitle}</p>}
      <Buttons items={legacyButtons(p, 'cta') ?? p.buttons} size="lg" center={center} onImage={onImage} />
    </div>
  );

  if (split) {
    return (
      <BlockSection tone={p.tone} pad="lg">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
          {text}
          {img ? (
            <img src={img} alt={p.imageAlt || ''} className="site-anim aspect-[4/3] w-full object-cover" style={{ borderRadius: 'var(--site-radius-lg)' }} fetchPriority="high" />
          ) : (
            <HeroArt />
          )}
        </div>
      </BlockSection>
    );
  }

  return (
    <section className={`site-hero ${onImage ? '' : `site-tone-${p.tone ?? 'soft'}`} flex items-center ${HERO_HEIGHT[p.height] ?? ''}`} style={onImage ? { color: '#fff', background: '#0f172a' } : undefined}>
      {img && <img src={img} alt={p.imageAlt || ''} className="site-hero-media" fetchPriority="high" />}
      {video?.kind === 'file' && <HeroVideo src={video.src} />}
      {onImage && <div className="site-hero-overlay" style={{ background: OVERLAY[p.overlay] ?? OVERLAY.dark }} />}
      <div className="site-container site-pad-lg w-full">{text}</div>
    </section>
  );
}

function HeroVideo({ src }: { src: string }) {
  const { liteMode } = useSiteRuntime();
  if (liteMode) return null;
  return <video className="site-hero-media hidden sm:block" src={src} autoPlay muted loop playsInline preload="none" aria-hidden />;
}

/** Decorative placeholder art (no stock photos): brand-coloured shapes. */
function HeroArt() {
  return (
    <svg viewBox="0 0 400 300" className="site-anim w-full" role="presentation" aria-hidden>
      <rect x="0" y="0" width="400" height="300" rx="24" fill="var(--site-primary-soft)" />
      <circle cx="300" cy="90" r="60" fill="var(--site-accent)" opacity=".85" />
      <rect x="60" y="150" width="180" height="110" rx="14" fill="var(--site-primary)" />
      <path d="M60 150 L150 95 L240 150 Z" fill="var(--site-primary-strong)" />
      <rect x="130" y="200" width="40" height="60" rx="6" fill="var(--site-primary-soft)" />
      <rect x="80" y="175" width="30" height="24" rx="4" fill="var(--site-primary-soft)" />
      <rect x="190" y="175" width="30" height="24" rx="4" fill="var(--site-primary-soft)" />
    </svg>
  );
}

/* ── Heading ────────────────────────────────────────────────────────────── */

export const Heading: SiteBlock = {
  label: 'Heading',
  fields: {
    ...i18nFields(['eyebrow', 'Small label'], ['text', 'Heading'], ['sub', 'Sub-heading', 'textarea']),
    level: selectField('Level', [['h1', 'H1 (page title)'], ['h2', 'H2'], ['h3', 'H3']]),
    align: radioField('Alignment', [['left', 'Left'], ['center', 'Centre']]),
    ...sectionFields,
  },
  defaultProps: { eyebrow: '', eyebrowBn: '', text: 'Section heading', textBn: 'অংশের শিরোনাম', sub: '', subBn: '', level: 'h2', align: 'left', ...sectionDefaults, pad: 'sm' },
  render: (p) => <HeadingView {...p} />,
};

function HeadingView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const Tag = (['h1', 'h2', 'h3'].includes(p.level) ? p.level : 'h2') as 'h1' | 'h2' | 'h3';
  const cls = { h1: 'site-h1', h2: 'site-h2', h3: 'site-h3' }[Tag];
  const center = p.align === 'center';
  const eyebrow = tx(p.eyebrow, p.eyebrowBn);
  const sub = tx(p.sub, p.subBn);
  return (
    <BlockSection {...(p as SectionProps)}>
      <div className={`flex flex-col gap-3 ${center ? 'items-center text-center mx-auto max-w-3xl' : 'max-w-3xl'}`}>
        {eyebrow && <span className="site-eyebrow">{eyebrow}</span>}
        <Tag className={cls}>{tx(p.text, p.textBn)}</Tag>
        {sub && <p className="site-lead site-muted whitespace-pre-line">{sub}</p>}
      </div>
    </BlockSection>
  );
}

/* ── Rich text ──────────────────────────────────────────────────────────── */

export const RichText: SiteBlock = {
  label: 'Rich text',
  fields: { ...i18nField('body', 'Text', 'richtext'), align: radioField('Alignment', [['left', 'Left'], ['center', 'Centre']]), ...sectionFields },
  defaultProps: {
    body: '<p>Write about your school here. This is sample text — replace it with your own words.</p>',
    bodyBn: '<p>এখানে আপনার প্রতিষ্ঠান সম্পর্কে লিখুন। এটি নমুনা লেখা — নিজের কথা দিয়ে বদলে দিন।</p>',
    align: 'left', ...sectionDefaults, width: 'narrow', pad: 'sm',
  },
  render: (p) => <RichTextView {...p} />,
};

function RichTextView(p: Record<string, any>) {
  const pick = useRichPick();
  const { tx } = useSiteText();
  const center = p.align === 'center' ? 'site-prose-center' : '';
  // Plain-text `text`/`textBn` (AI generator output) is rendered as paragraphs.
  if (p.body === undefined && typeof p.text === 'string') {
    const paras = tx(p.text, p.textBn).split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
    return (
      <BlockSection {...(p as SectionProps)}>
        <div className={`site-prose ${center}`}>{paras.map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</div>
      </BlockSection>
    );
  }
  return (
    <BlockSection {...(p as SectionProps)}>
      <RichHtml value={pick(p.body, p.bodyBn)} className={center} />
    </BlockSection>
  );
}

/* ── Button group ───────────────────────────────────────────────────────── */

export const ButtonGroup: SiteBlock = {
  label: 'Button group',
  fields: { buttons: buttonsField, align: radioField('Alignment', [['left', 'Left'], ['center', 'Centre']]), size: radioField('Size', [['md', 'Normal'], ['lg', 'Large']]), ...sectionFields },
  defaultProps: { buttons: [{ label: 'Learn more', labelBn: 'আরও জানুন', href: '/about', variant: 'primary' }], align: 'left', size: 'md', ...sectionDefaults, pad: 'sm' },
  render: (p) => (
    <BlockSection {...(p as SectionProps)}>
      <Buttons items={p.buttons} size={p.size} center={p.align === 'center'} />
    </BlockSection>
  ),
};

/* ── Call to action ─────────────────────────────────────────────────────── */

export const CallToAction: SiteBlock = {
  label: 'Call to action',
  fields: {
    ...i18nFields(['title', 'Title'], ['text', 'Text', 'textarea']),
    buttons: buttonsField,
    style: selectField('Style', [['band', 'Full-width band'], ['card', 'Rounded card']]),
    tone: sectionFields.tone,
  },
  defaultProps: {
    title: 'Admissions are open', titleBn: 'ভর্তি চলছে',
    text: 'Sample text: tell families how to apply and whom to contact.', textBn: 'নমুনা লেখা: কীভাবে আবেদন করবেন ও কার সাথে যোগাযোগ করবেন তা লিখুন।',
    buttons: [{ label: 'Apply now', labelBn: 'এখনই আবেদন করুন', href: '/admissions', variant: 'primary' }],
    style: 'band', tone: 'primary',
  },
  render: (p) => <CtaView {...p} />,
};

function CtaView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const inner = (
    <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 className="site-h2">{tx(p.title, p.titleBn)}</h2>
        {tx(p.text, p.textBn) && <p className="site-lead site-muted whitespace-pre-line">{tx(p.text, p.textBn)}</p>}
      </div>
      <Buttons items={legacyButtons(p, 'button') ?? p.buttons} size="lg" />
    </div>
  );
  if (p.style === 'card') {
    return (
      <BlockSection tone="default" pad="md">
        <div className={`site-tone-${p.tone ?? 'primary'} site-card-pad md:p-12`} style={{ borderRadius: 'var(--site-radius-lg)' }}>{inner}</div>
      </BlockSection>
    );
  }
  return <BlockSection tone={p.tone ?? 'primary'} pad="md">{inner}</BlockSection>;
}
