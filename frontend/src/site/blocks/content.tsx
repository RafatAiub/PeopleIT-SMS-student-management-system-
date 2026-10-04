/** Content blocks: Cards, StatsCounter, Testimonials, FAQ, ContactInfo, Timeline, PrincipalMessage. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Facebook, Instagram, Linkedin, Mail, MapPin, MessageCircle, Phone, Quote, Youtube } from 'lucide-react';
import { useIsEditing, useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteNumber } from '../strings';
import { BlockIcon } from './icons';
import {
  BlockSection, EditorHint, EmptyBlock, i18nField, i18nFields, ICON_OPTIONS, introFields, optimiseImage, radioField, RichHtml,
  sectionDefaults, sectionFields, SectionIntro, selectField, SiteImage, SiteLink, textField, urlField, useRichPick,
  type SectionProps, type SiteBlock,
} from './shared';

const introDefaults = { eyebrow: '', eyebrowBn: '', heading: '', headingBn: '', intro: '', introBn: '', align: 'left' };
const COLS: Record<string, string> = { '2': 'sm:grid-cols-2', '3': 'sm:grid-cols-2 lg:grid-cols-3', '4': 'sm:grid-cols-2 lg:grid-cols-4' };

/* ── Cards ──────────────────────────────────────────────────────────────── */

interface CardItem { icon?: string; image?: string; title?: string; titleBn?: string; text?: string; textBn?: string; href?: string; linkLabel?: string; linkLabelBn?: string }

export const Cards: SiteBlock = {
  label: 'Cards',
  fields: {
    ...introFields,
    cards: {
      type: 'array', label: 'Cards',
      arrayFields: {
        icon: selectField('Icon', ICON_OPTIONS),
        image: textField('Image URL (optional)'),
        ...i18nFields(['title', 'Title'], ['text', 'Text', 'textarea'], ['linkLabel', 'Link label']),
        href: urlField('Link (optional)'),
      },
      defaultItemProps: { icon: 'star', image: '', title: 'Card title', titleBn: '', text: 'Sample text.', textBn: '', href: '', linkLabel: '', linkLabelBn: '' },
      getItemSummary: (c: CardItem) => c.title || 'Card',
    },
    columns: selectField('Columns', [['2', '2'], ['3', '3'], ['4', '4']]),
    style: selectField('Card style', [['card', 'Bordered card'], ['plain', 'Plain'], ['centered', 'Centred icon']]),
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Why choose us', headingBn: 'কেন আমাদের বেছে নেবেন',
    cards: [
      { icon: 'book', image: '', title: 'Strong academics', titleBn: 'শক্তিশালী শিক্ষাদান', text: 'Sample text describing this strength.', textBn: 'এই বৈশিষ্ট্যের নমুনা বর্ণনা।', href: '', linkLabel: '', linkLabelBn: '' },
      { icon: 'users', image: '', title: 'Caring teachers', titleBn: 'যত্নশীল শিক্ষক', text: 'Sample text describing this strength.', textBn: 'এই বৈশিষ্ট্যের নমুনা বর্ণনা।', href: '', linkLabel: '', linkLabelBn: '' },
      { icon: 'shield', image: '', title: 'Safe campus', titleBn: 'নিরাপদ ক্যাম্পাস', text: 'Sample text describing this strength.', textBn: 'এই বৈশিষ্ট্যের নমুনা বর্ণনা।', href: '', linkLabel: '', linkLabelBn: '' },
    ],
    columns: '3', style: 'card', ...sectionDefaults,
  },
  render: (p) => <CardsView {...p} />,
};

function CardsView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const cards = (p.cards as CardItem[]) ?? [];
  const centered = p.style === 'centered';
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!cards.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className={`grid grid-cols-1 gap-5 md:gap-6 ${COLS[p.columns] ?? COLS['3']}`}>
          {cards.map((c, i) => (
            <article key={i} className={`site-anim flex flex-col ${p.style === 'plain' ? '' : 'site-card'} ${centered ? 'items-center text-center' : ''}`}>
              {c.image && <SiteImage src={c.image} alt={tx(c.title, c.titleBn)} width={800} className="aspect-[16/10] w-full object-cover" />}
              <div className={`flex flex-1 flex-col gap-3 ${p.style === 'plain' ? '' : 'site-card-pad'} ${centered ? 'items-center' : ''}`}>
                {c.icon && !c.image && (
                  <span className="inline-flex h-12 w-12 items-center justify-center" style={{ background: 'var(--site-primary-soft)', color: 'var(--site-primary-text)', borderRadius: 'var(--site-radius)' }}>
                    <BlockIcon name={c.icon} />
                  </span>
                )}
                <h3 className="site-h3">{tx(c.title, c.titleBn)}</h3>
                {tx(c.text, c.textBn) && <p className="site-muted whitespace-pre-line">{tx(c.text, c.textBn)}</p>}
                {c.href && (
                  <SiteLink href={c.href} className="mt-auto font-semibold underline-offset-2 hover:underline">
                    {tx(c.linkLabel, c.linkLabelBn) || s('Read more')} →
                  </SiteLink>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Stats counter (numbers typed by the school) ────────────────────────── */

interface StatItem { value?: string; label?: string; labelBn?: string; suffix?: string }

export const StatsCounter: SiteBlock = {
  label: 'Stats counter',
  fields: {
    ...introFields,
    stats: {
      type: 'array', label: 'Figures', max: 6,
      arrayFields: { value: textField('Number (e.g. 1200)'), suffix: textField('Suffix (e.g. +, %)'), ...i18nField('label', 'Label') },
      defaultItemProps: { value: '', suffix: '+', label: 'Label', labelBn: '' },
      getItemSummary: (st: StatItem) => `${st.value || '—'} ${st.label || ''}`,
    },
    animate: radioField('Count up on scroll', [[true, 'Yes'], [false, 'No']]),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, stats: [], animate: true, ...sectionDefaults, tone: 'primary' },
  render: (p) => <StatsCounterView {...p} />,
};

function StatsCounterView(p: Record<string, any>) {
  const { s } = useSiteText();
  const stats = ((p.stats as StatItem[]) ?? []).filter((x) => x.value);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!stats.length ? <EditorHint title={s('Add content in the editor')} /> : <StatGrid items={stats.map((x) => ({ value: x.value!, suffix: x.suffix, label: x.label, labelBn: x.labelBn }))} animate={p.animate !== false} />}
    </BlockSection>
  );
}

export function StatGrid({ items, animate }: { items: Array<{ value: string | number; suffix?: string; label?: string; labelBn?: string }>; animate: boolean }) {
  const { tx } = useSiteText();
  return (
    <dl className={`m-0 grid grid-cols-2 gap-6 text-center ${items.length >= 4 ? 'md:grid-cols-4' : items.length === 3 ? 'md:grid-cols-3' : ''}`}>
      {items.map((st, i) => (
        <div key={i} className="flex flex-col-reverse gap-1">
          <dt className="site-muted text-sm font-medium md:text-base">{tx(st.label, st.labelBn)}</dt>
          <dd className="m-0 text-3xl font-extrabold md:text-5xl" style={{ fontFamily: 'var(--site-heading-font)' }}>
            <CountUp value={st.value} animate={animate} />{st.suffix}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CountUp({ value, animate }: { value: string | number; animate: boolean }) {
  const { lang, mode } = useSiteRuntime();
  const { liteMode } = useSiteRuntime();
  const target = typeof value === 'number' ? value : Number(String(value).replace(/[, ]/g, ''));
  const numeric = Number.isFinite(target);
  const canAnimate = animate && numeric && !liteMode && mode !== 'editor' && typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(canAnimate ? 0 : target);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!canAnimate) { setShown(target); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(target); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 1200);
        setShown(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [canAnimate, target]);
  return <span ref={ref}>{numeric ? formatSiteNumber(shown, lang) : String(value)}</span>;
}

/* ── Testimonials ───────────────────────────────────────────────────────── */

interface Testimonial { quote?: string; quoteBn?: string; name?: string; nameBn?: string; role?: string; roleBn?: string; photo?: string }

export const Testimonials: SiteBlock = {
  label: 'Testimonials',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Testimonials',
      arrayFields: { ...i18nFields(['quote', 'Quote', 'textarea'], ['name', 'Name'], ['role', 'Role (e.g. Guardian, Class 8)']), photo: textField('Photo URL (optional)') },
      defaultItemProps: { quote: '', quoteBn: '', name: '', nameBn: '', role: '', roleBn: '', photo: '' },
      getItemSummary: (t: Testimonial) => t.name || 'Testimonial',
    },
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'What families say', headingBn: 'অভিভাবকদের কথা', align: 'center', items: [], ...sectionDefaults, tone: 'surface' },
  render: (p) => <TestimonialsView {...p} />,
};

function TestimonialsView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const editing = useIsEditing();
  const items = ((p.items as Testimonial[]) ?? []).filter((t) => tx(t.quote, t.quoteBn));
  // Hide the whole section from visitors until real testimonials are added.
  if (!items.length && !editing) return null;
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!items.length ? <EditorHint icon={<Quote size={28} />} title={s('Add content in the editor')} /> : (
        <div className={`grid grid-cols-1 gap-5 ${items.length > 1 ? 'md:grid-cols-2' : ''} ${items.length > 2 ? 'lg:grid-cols-3' : ''}`}>
          {items.map((t, i) => (
            <figure key={i} className="site-card site-card-pad m-0 flex flex-col gap-4">
              <Quote size={28} aria-hidden style={{ color: 'var(--site-accent-text)' }} />
              <blockquote className="m-0 whitespace-pre-line text-lg">{tx(t.quote, t.quoteBn)}</blockquote>
              <figcaption className="mt-auto flex items-center gap-3">
                {t.photo && <img src={optimiseImage(t.photo, 120)} alt="" loading="lazy" className="h-11 w-11 rounded-full object-cover" />}
                <span className="flex flex-col">
                  <span className="font-semibold">{tx(t.name, t.nameBn)}</span>
                  {tx(t.role, t.roleBn) && <span className="site-muted text-sm">{tx(t.role, t.roleBn)}</span>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

interface FaqItem { q?: string; qBn?: string; a?: string; aBn?: string }

export const FAQ: SiteBlock = {
  label: 'FAQ accordion',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Questions',
      arrayFields: { ...i18nFields(['q', 'Question'], ['a', 'Answer', 'textarea']) },
      defaultItemProps: { q: 'Question', qBn: '', a: 'Answer', aBn: '' },
      getItemSummary: (f: FaqItem) => f.q || 'Question',
    },
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Frequently asked questions', headingBn: 'সচরাচর জিজ্ঞাসা',
    items: [
      { q: 'When does admission open?', qBn: 'ভর্তি কখন শুরু হয়?', a: 'Sample answer — replace with your admission dates.', aBn: 'নমুনা উত্তর — আপনার ভর্তির তারিখ দিয়ে বদলে দিন।' },
      { q: 'How can I contact the office?', qBn: 'অফিসে কীভাবে যোগাযোগ করব?', a: 'Call {{institution.phone}} or email {{institution.email}}.', aBn: '{{institution.phone}} নম্বরে কল করুন অথবা {{institution.email}} এ ইমেইল করুন।' },
    ],
    ...sectionDefaults, width: 'narrow',
  },
  render: (p) => <FaqView {...p} />,
};

function FaqView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const items = ((p.items as FaqItem[]) ?? []).filter((f) => tx(f.q, f.qBn));
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!items.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className="site-accordion">
          {items.map((f, i) => (
            <details key={i}>
              <summary>{tx(f.q, f.qBn)}</summary>
              <p className="site-muted whitespace-pre-line pb-4">{tx(f.a, f.aBn)}</p>
            </details>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Contact info ───────────────────────────────────────────────────────── */

export const ContactInfo: SiteBlock = {
  label: 'Contact info',
  fields: {
    ...introFields,
    ...i18nFields(['phone', 'Phone'], ['email', 'Email'], ['address', 'Address', 'textarea'], ['hours', 'Office hours', 'textarea']),
    showSocial: radioField('Show social links', [[true, 'Yes'], [false, 'No']]),
    layout: radioField('Layout', [['cards', 'Cards'], ['list', 'List']]),
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Get in touch', headingBn: 'যোগাযোগ করুন',
    phone: '{{institution.phone}}', phoneBn: '', email: '{{institution.email}}', emailBn: '', address: '{{institution.address}}', addressBn: '',
    hours: '', hoursBn: '', showSocial: true, layout: 'cards', ...sectionDefaults,
  },
  render: (p) => <ContactInfoView {...p} />,
};

const SOCIAL_ICONS: Record<string, typeof Facebook> = { facebook: Facebook, youtube: Youtube, instagram: Instagram, linkedin: Linkedin, whatsapp: MessageCircle };

export function SocialLinks({ className = '' }: { className?: string }) {
  const { settings } = useSiteRuntime();
  const entries = Object.entries(settings.social ?? {}).filter(([, v]) => typeof v === 'string' && v.trim());
  if (!entries.length) return null;
  return (
    <ul className={`m-0 flex list-none flex-wrap gap-2 p-0 ${className}`}>
      {entries.map(([k, v]) => {
        const Icon = SOCIAL_ICONS[k];
        const href = k === 'whatsapp' && /^\+?\d[\d\s-]+$/.test(v!) ? `https://wa.me/${v!.replace(/\D/g, '')}` : v!;
        return (
          <li key={k}>
            <SiteLink href={href} ariaLabel={k} className="site-btn site-btn-outline site-btn-sm !min-h-[40px] !px-3 capitalize">
              {Icon ? <Icon size={18} aria-hidden /> : k}
            </SiteLink>
          </li>
        );
      })}
    </ul>
  );
}

function ContactInfoView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const phone = tx(p.phone, p.phoneBn);
  const email = tx(p.email, p.emailBn);
  const address = tx(p.address, p.addressBn);
  const hours = tx(p.hours, p.hoursBn);
  const rows = [
    phone && { icon: <Phone size={20} />, label: s('Phone'), value: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` },
    email && { icon: <Mail size={20} />, label: s('Email'), value: email, href: `mailto:${email}` },
    address && { icon: <MapPin size={20} />, label: s('Address'), value: address },
    hours && { icon: <BlockIcon name="calendar" size={20} />, label: '', value: hours },
  ].filter(Boolean) as Array<{ icon: ReactNode; label: string; value: string; href?: string }>;
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!rows.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className={p.layout === 'list' ? 'flex flex-col gap-4' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'}>
          {rows.map((r, i) => (
            <div key={i} className={`flex items-start gap-3 ${p.layout === 'list' ? '' : 'site-card site-card-pad'}`}>
              <span className="mt-0.5 flex-none" style={{ color: 'var(--site-primary-text)' }} aria-hidden>{r.icon}</span>
              <div className="min-w-0">
                {r.label && <p className="site-muted text-sm">{r.label}</p>}
                {r.href ? <SiteLink href={r.href} className="break-words font-semibold">{r.value}</SiteLink> : <p className="whitespace-pre-line font-semibold">{r.value}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {p.showSocial !== false && <SocialLinks className="mt-6" />}
    </BlockSection>
  );
}

/* ── Timeline / history ─────────────────────────────────────────────────── */

interface TimelineItem { year?: string; title?: string; titleBn?: string; text?: string; textBn?: string }

export const Timeline: SiteBlock = {
  label: 'Timeline / History',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Milestones',
      arrayFields: { year: textField('Year / date'), ...i18nFields(['title', 'Title'], ['text', 'Text', 'textarea']) },
      defaultItemProps: { year: '', title: 'Milestone', titleBn: '', text: '', textBn: '' },
      getItemSummary: (t: TimelineItem) => `${t.year || ''} ${t.title || ''}`.trim() || 'Milestone',
    },
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults, heading: 'Our journey', headingBn: 'আমাদের পথচলা',
    items: [{ year: '{{institution.established}}', title: 'Founded', titleBn: 'প্রতিষ্ঠা', text: 'Sample text — describe how the school began.', textBn: 'নমুনা লেখা — প্রতিষ্ঠানের শুরুর গল্প লিখুন।' }],
    ...sectionDefaults, width: 'narrow',
  },
  render: (p) => <TimelineView {...p} />,
};

function TimelineView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const items = ((p.items as TimelineItem[]) ?? []).filter((t) => tx(t.title, t.titleBn) || t.year);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!items.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <ol className="m-0 list-none border-l-2 p-0 pl-6" style={{ borderColor: 'var(--site-border)' }}>
          {items.map((t, i) => (
            <li key={i} className="relative pb-8 last:pb-0">
              <span aria-hidden className="absolute -left-[33px] top-1 h-4 w-4 rounded-full" style={{ background: 'var(--site-primary)', boxShadow: '0 0 0 4px var(--site-bg)' }} />
              {tx(t.year) && <p className="site-eyebrow">{tx(t.year)}</p>}
              <h3 className="site-h4 mt-1">{tx(t.title, t.titleBn)}</h3>
              {tx(t.text, t.textBn) && <p className="site-muted mt-1 whitespace-pre-line">{tx(t.text, t.textBn)}</p>}
            </li>
          ))}
        </ol>
      )}
    </BlockSection>
  );
}

/* ── Principal's message ────────────────────────────────────────────────── */

export const PrincipalMessage: SiteBlock = {
  label: 'Principal’s message',
  fields: {
    ...i18nFields(['heading', 'Heading'], ['name', 'Name'], ['designation', 'Designation']),
    ...i18nField('message', 'Message', 'richtext'),
    photo: textField('Photo URL'),
    signature: textField('Signature image URL (optional)'),
    photoSide: radioField('Photo side', [['left', 'Left'], ['right', 'Right']]),
    ...sectionFields,
  },
  defaultProps: {
    heading: 'Message from the Principal', headingBn: 'অধ্যক্ষের বাণী',
    name: '', nameBn: '', designation: 'Principal', designationBn: 'অধ্যক্ষ',
    message: '<p>Sample text — the principal’s welcome message goes here.</p>', messageBn: '<p>নমুনা লেখা — অধ্যক্ষের শুভেচ্ছা বার্তা এখানে লিখুন।</p>',
    photo: '', signature: '', photoSide: 'left', ...sectionDefaults, tone: 'surface',
  },
  render: (p) => <PrincipalView {...p} />,
};

function PrincipalView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const pick = useRichPick();
  const right = p.photoSide === 'right';
  return (
    <BlockSection {...(p as SectionProps)}>
      <div className={`grid grid-cols-1 items-start gap-8 md:grid-cols-[280px_1fr] ${right ? 'md:grid-cols-[1fr_280px]' : ''}`}>
        <div className={`flex flex-col items-center gap-3 text-center ${right ? 'md:order-2' : ''}`}>
          {p.photo ? (
            <SiteImage src={p.photo} alt={tx(p.name, p.nameBn)} width={600} className="aspect-[4/5] w-full max-w-[280px] object-cover" style={{ borderRadius: 'var(--site-radius-lg)' }} />
          ) : (
            <div aria-hidden className="flex aspect-[4/5] w-full max-w-[280px] items-center justify-center" style={{ background: 'var(--site-primary-soft)', borderRadius: 'var(--site-radius-lg)' }}>
              <BlockIcon name="graduation" size={56} />
            </div>
          )}
          {tx(p.name, p.nameBn) && <p className="font-bold">{tx(p.name, p.nameBn)}</p>}
          {tx(p.designation, p.designationBn) && <p className="site-muted -mt-2 text-sm">{tx(p.designation, p.designationBn)}</p>}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="site-h2">{tx(p.heading, p.headingBn)}</h2>
          <RichHtml value={pick(p.message, p.messageBn)} />
          {p.signature && <img src={optimiseImage(p.signature, 400)} alt="" loading="lazy" className="h-14 w-auto self-start object-contain" />}
        </div>
      </div>
    </BlockSection>
  );
}
