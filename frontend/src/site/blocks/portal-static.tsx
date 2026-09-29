/**
 * Static portal blocks (C2): admin-typed content that isn't fetched from a
 * data source, plus a couple that read the new whitelisted settings
 * (`settings.hotlines` / `importantLinks` / `eServices` — §7.6) when the
 * school has filled them in centrally, falling back to the block's own
 * editable list otherwise.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Facebook, Music, Phone } from 'lucide-react';
import { isAllowedIframeSrc, toVideoEmbed } from '../embed';
import { useIsEditing, useSiteData, useSiteRuntime, useSiteText } from '../runtime';
import { BlockIcon } from './icons';
import {
  BlockSection, EditorHint, i18nField, i18nFields, ICON_OPTIONS, introFields, numberField, radioField, RichHtml, sectionDefaults,
  sectionFields, SectionIntro, selectField, SiteImage, SiteLink, textField, urlField, useRichPick, type SectionProps, type SiteBlock,
  type SlotRender,
} from './shared';

const introDefaults = { eyebrow: '', eyebrowBn: '', heading: '', headingBn: '', intro: '', introBn: '', align: 'left' };

/* ── Info box grid (Style A: heading, big icon, bulleted link list) ─────── */

interface InfoBoxLink { label?: string; labelBn?: string; href?: string }
interface InfoBox { icon?: string; heading?: string; headingBn?: string; links?: InfoBoxLink[] }

export const InfoBoxGrid: SiteBlock = {
  label: 'Info box grid (তথ্য বক্স)',
  fields: {
    ...introFields,
    boxes: {
      type: 'array', label: 'Boxes', max: 8,
      arrayFields: {
        icon: selectField('Icon', ICON_OPTIONS),
        ...i18nFields(['heading', 'Heading']),
        links: {
          type: 'array', label: 'Links', max: 8,
          arrayFields: { ...i18nFields(['label', 'Label']), href: urlField('Link') },
          defaultItemProps: { label: 'Link', labelBn: '', href: '/' },
          getItemSummary: (l: InfoBoxLink) => l.label || 'Link',
        },
      },
      defaultItemProps: { icon: 'book', heading: 'Box heading', headingBn: '', links: [] },
      getItemSummary: (b: InfoBox) => b.heading || 'Box',
    },
    columns: selectField('Columns', [['2', '2'], ['3', '3']]),
    ...sectionFields,
  },
  defaultProps: {
    ...introDefaults,
    boxes: [
      { icon: 'book', heading: 'প্রতিষ্ঠান সংক্রান্ত তথ্য', headingBn: '', links: [] },
      { icon: 'graduation', heading: 'পাঠদান সংক্রান্ত তথ্য', headingBn: '', links: [] },
      { icon: 'wrench', heading: 'বাজেট ও প্রকল্প', headingBn: '', links: [] },
      { icon: 'star', heading: 'কো-কারিকুলার প্রোগ্রাম', headingBn: '', links: [] },
      { icon: 'trophy', heading: 'পরীক্ষা সংক্রান্ত', headingBn: '', links: [] },
      { icon: 'users', heading: 'ভর্তি সংক্রান্ত তথ্য', headingBn: '', links: [] },
    ],
    columns: '3', ...sectionDefaults,
  },
  render: (p) => <InfoBoxGridView {...p} />,
};

function InfoBoxGridView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const boxes = (p.boxes as InfoBox[]) ?? [];
  const cols = p.columns === '2' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!boxes.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className={`grid grid-cols-1 gap-5 ${cols}`}>
          {boxes.map((b, i) => (
            <div key={i} className="site-info-box site-card site-card-pad">
              <span className="site-info-box-icon" aria-hidden><BlockIcon name={b.icon} size={26} /></span>
              <div className="min-w-0 flex-1">
                <h3 className="site-h4 mb-2">{tx(b.heading, b.headingBn)}</h3>
                {b.links?.length ? (
                  <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-sm">
                    {b.links.filter((l) => tx(l.label, l.labelBn)).map((l, j) => <li key={j}><SiteLink href={l.href}>{tx(l.label, l.labelBn)}</SiteLink></li>)}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Sidebar layout (main ~70% + sidebar ~30%) ───────────────────────────── */

export const SidebarLayout: SiteBlock = {
  label: 'Sidebar layout (main + sidebar)',
  fields: {
    sidebarSide: radioField('Sidebar side', [['right', 'Right'], ['left', 'Left']]),
    gap: selectField('Gap', [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]),
    main: { type: 'slot', label: 'Main column' },
    sidebar: { type: 'slot', label: 'Sidebar column' },
    ...sectionFields,
  },
  defaultProps: { sidebarSide: 'right', gap: 'md', main: [], sidebar: [], ...sectionDefaults, width: 'wide' },
  render: (p) => {
    const Main = p.main as SlotRender;
    const Sidebar = p.sidebar as SlotRender;
    const gap = { sm: 'gap-6', md: 'gap-8 lg:gap-10', lg: 'gap-10 lg:gap-14' }[p.gap as string] ?? 'gap-8 lg:gap-10';
    const order = p.sidebarSide === 'left' ? 'lg:grid-cols-[3fr_7fr]' : 'lg:grid-cols-[7fr_3fr]';
    return (
      <BlockSection {...(p as SectionProps)}>
        <div className={`grid grid-cols-1 items-start ${gap} ${order}`}>
          {p.sidebarSide === 'left' && <Sidebar className="flex min-w-0 flex-col gap-6" minEmptyHeight={80} />}
          <Main className="flex min-w-0 flex-col gap-8" minEmptyHeight={160} />
          {p.sidebarSide !== 'left' && <Sidebar className="flex min-w-0 flex-col gap-6" minEmptyHeight={80} />}
        </div>
      </BlockSection>
    );
  },
};

/* ── Sidebar card (purple title bar + body) ──────────────────────────────── */

export const SidebarCard: SiteBlock = {
  label: 'Sidebar card (title bar)',
  fields: { ...i18nField('title', 'Title bar'), content: { type: 'slot', label: 'Content' } },
  defaultProps: { title: 'Card title', titleBn: '', content: [] },
  render: (p) => {
    const Content = p.content as SlotRender;
    return (
      <div>
        <div className="site-sidebar-title">{p.title}</div>
        <div className="site-sidebar-card site-card-pad">
          <Content className="flex flex-col gap-3" minEmptyHeight={40} />
        </div>
      </div>
    );
  },
};

/* ── Head / founder message (reads profile.headOfInstitution, falls back to typed text) ── */

export const HeadMessage: SiteBlock = {
  label: 'Head’s message (প্রধানের বাণী)',
  fields: {
    ...i18nField('heading', 'Heading'),
    ...i18nField('message', 'Message (used when no profile head is set)', 'richtext'),
    fallbackName: textField('Name (fallback)'),
    fallbackDesignation: textField('Designation (fallback)'),
    fallbackPhoto: textField('Photo URL (fallback)'),
    detailsHref: urlField('“বিস্তারিত” link (optional)'),
    ...sectionFields,
  },
  defaultProps: {
    heading: 'Head’s message', headingBn: 'প্রধান শিক্ষকের বাণী', message: '<p>Sample text — the head’s welcome message goes here.</p>', messageBn: '<p>নমুনা লেখা — প্রধান শিক্ষকের শুভেচ্ছা বার্তা এখানে লিখুন।</p>',
    fallbackName: '', fallbackDesignation: '', fallbackPhoto: '', detailsHref: '', ...sectionDefaults, tone: 'surface',
  },
  render: (p) => <HeadMessageView {...p} />,
};

function HeadMessageView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const pick = useRichPick();
  const q = useSiteData(['profile'], (id, api) => api.profile(id), { staleTime: 10 * 60_000 });
  const head = q.data?.headOfInstitution;
  const name = head?.name || p.fallbackName;
  const designation = head?.designation || p.fallbackDesignation;
  const photo = head?.photoUrl || p.fallbackPhoto;
  return (
    <BlockSection {...(p as SectionProps)}>
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-center gap-2 text-center">
          {photo ? (
            <SiteImage src={photo} alt={name} width={440} className="aspect-square w-full max-w-[220px] rounded-full object-cover" />
          ) : (
            <div aria-hidden className="flex aspect-square w-full max-w-[220px] items-center justify-center rounded-full" style={{ background: 'var(--site-primary-soft)' }}>
              <BlockIcon name="graduation" size={48} />
            </div>
          )}
          {name && <p className="font-bold">{name}</p>}
          {designation && <p className="site-muted -mt-1 text-sm">{designation}</p>}
          {p.detailsHref && <SiteLink href={p.detailsHref} className="site-btn site-btn-outline site-btn-sm mt-1">{s('Read more')}</SiteLink>}
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="site-h2">{tx(p.heading, p.headingBn)}</h2>
          <RichHtml value={pick(p.message, p.messageBn)} />
        </div>
      </div>
    </BlockSection>
  );
}

/* ── Hotline list (BD preset, editable; prefers settings.hotlines) ───────── */

interface HotlineItem { number?: string; label?: string; labelBn?: string }

const BD_HOTLINES: HotlineItem[] = [
  { number: '333', label: 'Government information', labelBn: 'সরকারি তথ্য সেবা' },
  { number: '999', label: 'Emergency (police/fire/ambulance)', labelBn: 'জাতীয় জরুরি সেবা' },
  { number: '109', label: 'Violence against women & children', labelBn: 'নারী ও শিশু নির্যাতন' },
  { number: '106', label: 'Anti-corruption', labelBn: 'দুর্নীতি প্রতিরোধ' },
  { number: '1090', label: 'Bangladesh Meteorological', labelBn: 'আবহাওয়া অধিদপ্তর' },
  { number: '1098', label: 'Child helpline', labelBn: 'শিশু সহায়তা' },
];

export const HotlineList: SiteBlock = {
  label: 'Hotline numbers (হটলাইন নম্বর)',
  fields: {
    ...introFields,
    items: {
      type: 'array', label: 'Numbers (used only when the site has no central hotlines set)', max: 12,
      arrayFields: { number: textField('Number'), ...i18nField('label', 'Label') },
      defaultItemProps: { number: '', label: '', labelBn: '' },
      getItemSummary: (i: HotlineItem) => i.number || 'Number',
    },
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Emergency hotlines', headingBn: 'জরুরি হটলাইন', items: BD_HOTLINES, ...sectionDefaults, tone: 'dark' },
  render: (p) => <HotlineListView {...p} />,
};

function HotlineListView(p: Record<string, any>) {
  const { settings } = useSiteRuntime();
  const { tx, s } = useSiteText();
  const items = (settings.hotlines?.length ? settings.hotlines : (p.items as HotlineItem[])) ?? [];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!items.length ? <EditorHint icon={<Phone size={24} />} title={s('Add content in the editor')} /> : (
        <div className="site-hotline-grid">
          {items.filter((i) => i.number).map((i, idx) => (
            <a key={idx} href={`tel:${String(i.number).replace(/[^\d+]/g, '')}`} className="site-hotline-chip no-underline" style={{ color: 'inherit' }}>
              <span className="text-xl font-extrabold">{i.number}</span>
              {tx(i.label, i.labelBn) && <span className="text-center text-xs opacity-90">{tx(i.label, i.labelBn)}</span>}
            </a>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Facebook page plugin (allow-listed iframe) ──────────────────────────── */

export const FacebookPage: SiteBlock = {
  label: 'Facebook page',
  fields: {
    ...i18nField('heading', 'Heading'),
    pageUrl: textField('Facebook page URL', 'https://www.facebook.com/yourschool'),
    height: numberField('Height (px)', 130, 1200),
    showTimeline: radioField('Show posts (timeline)', [[true, 'Yes'], [false, 'No, just the page header']]),
    ...sectionFields,
  },
  defaultProps: { heading: 'Follow us on Facebook', headingBn: 'ফেসবুকে আমাদের অনুসরণ করুন', pageUrl: '', height: 500, showTimeline: true, ...sectionDefaults },
  render: (p) => <FacebookPageView {...p} />,
};

function FacebookPageView(p: Record<string, any>) {
  const { s } = useSiteText();
  const url = String(p.pageUrl ?? '').trim();
  let src: string | null = null;
  if (/^https:\/\/(www\.)?facebook\.com\//i.test(url)) {
    const height = Math.max(130, Math.min(1200, Number(p.height) || 500));
    const qs = new URLSearchParams({ href: url, tabs: p.showTimeline !== false ? 'timeline' : '', width: '360', height: String(height), small_header: 'false', adapt_container_width: 'true', hide_cover: 'false', show_facepile: 'true' });
    const candidate = `https://www.facebook.com/plugins/page.php?${qs.toString()}`;
    src = isAllowedIframeSrc(candidate) ? candidate : null;
  }
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!src ? (
        <EditorHint icon={<Facebook size={24} />} title={s('Add content in the editor')} />
      ) : (
        <div className="overflow-hidden" style={{ borderRadius: 'var(--site-radius)' }}>
          <iframe src={src} title="Facebook" width="100%" height={Math.max(130, Math.min(1200, Number(p.height) || 500))} style={{ border: 0, overflow: 'hidden' }} scrolling="no" loading="lazy" allow="encapsulated-media" />
        </div>
      )}
    </BlockSection>
  );
}

/* ── Video gallery (click-to-play grid) ──────────────────────────────────── */

interface VideoItem { url?: string; title?: string; titleBn?: string; poster?: string }

export const VideoGallery: SiteBlock = {
  label: 'Video gallery',
  fields: {
    ...introFields,
    videos: {
      type: 'array', label: 'Videos', max: 12,
      arrayFields: { url: textField('YouTube/Vimeo/MP4 link'), poster: textField('Poster image URL (optional)'), ...i18nField('title', 'Title') },
      defaultItemProps: { url: '', poster: '', title: 'Video', titleBn: '' },
      getItemSummary: (v: VideoItem) => v.title || 'Video',
    },
    columns: selectField('Columns', [['2', '2'], ['3', '3']]),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Video gallery', headingBn: 'ভিডিও গ্যালারি', videos: [], columns: '3', ...sectionDefaults },
  render: (p) => <VideoGalleryView {...p} />,
};

function VideoGalleryView(p: Record<string, any>) {
  // Reuses the block-local video-embed pattern from blocks/media.tsx's `Video` (own state per tile).
  const { tx, s } = useSiteText();
  const videos = ((p.videos as VideoItem[]) ?? []).filter((v) => v.url);
  const cols = p.columns === '2' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!videos.length ? <EditorHint title={s('Add a video link in the editor')} /> : (
        <div className={`grid grid-cols-1 gap-5 ${cols}`}>
          {videos.map((v, i) => <VideoTile key={i} video={v} label={tx(v.title, v.titleBn)} />)}
        </div>
      )}
    </BlockSection>
  );
}

function VideoTile({ video, label }: { video: VideoItem; label: string }) {
  const [play, setPlay] = useState(false);
  const editing = useIsEditing();
  const embed = useMemo(() => toVideoEmbed(video.url), [video.url]);
  if (!embed) return null;
  if (embed.kind === 'file') {
    return <video src={embed.src} poster={video.poster || undefined} controls preload="none" className="aspect-video w-full bg-black" style={{ borderRadius: 'var(--site-radius-lg)' }} title={label} />;
  }
  if (play && !editing) {
    return <iframe src={`${embed.src}?autoplay=1`} title={label || 'Video'} className="aspect-video w-full border-0" style={{ borderRadius: 'var(--site-radius-lg)' }} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />;
  }
  const thumb = video.poster || (embed.kind === 'youtube' ? `https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg` : undefined);
  return (
    <button type="button" onClick={() => setPlay(true)} aria-label={`▶ ${label}`} className="relative flex aspect-video w-full flex-col justify-end overflow-hidden border-0 p-0 text-left" style={{ borderRadius: 'var(--site-radius-lg)', background: '#0f172a' }}>
      {thumb && <img src={thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
      <span className="relative m-auto text-white"><svg width="52" height="52" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="12" r="11" opacity=".35" /><path d="M10 8l6 4-6 4V8z" /></svg></span>
      {label && <span className="relative bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-medium text-white">{label}</span>}
    </button>
  );
}

/* ── Audio player (national anthem etc.) ─────────────────────────────────── */

export const AudioPlayer: SiteBlock = {
  label: 'Audio player',
  fields: { ...i18nField('title', 'Title'), url: textField('Audio file URL (mp3)'), ...sectionFields },
  defaultProps: { title: 'National anthem', titleBn: 'জাতীয় সংগীত', url: '', ...sectionDefaults, width: 'narrow' },
  render: (p) => <AudioPlayerView {...p} />,
};

function AudioPlayerView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const title = tx(p.title, p.titleBn);
  return (
    <BlockSection {...(p as SectionProps)}>
      {!p.url ? <EditorHint icon={<Music size={24} />} title={s('Add content in the editor')} /> : (
        <div className="site-card site-card-pad flex flex-col gap-3">
          {title && <p className="flex items-center gap-2 font-semibold"><Music size={18} aria-hidden />{title}</p>}
          <audio controls preload="none" className="w-full" src={p.url}>
            <track kind="captions" />
          </audio>
        </div>
      )}
    </BlockSection>
  );
}

/* ── Image slider (reduced-motion aware) ─────────────────────────────────── */

interface SlideItem { image?: string; caption?: string; captionBn?: string; href?: string }

export const ImageSlider: SiteBlock = {
  label: 'Image slider',
  fields: {
    slides: {
      type: 'array', label: 'Slides', max: 10,
      arrayFields: { image: textField('Image URL'), ...i18nField('caption', 'Caption'), href: urlField('Link (optional)') },
      defaultItemProps: { image: '', caption: '', captionBn: '', href: '' },
      getItemSummary: (s: SlideItem) => s.caption || 'Slide',
    },
    autoplay: radioField('Auto-advance', [[true, 'Yes'], [false, 'No']]),
    height: selectField('Height', [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]),
    ...sectionFields,
  },
  defaultProps: { slides: [], autoplay: true, height: 'md', ...sectionDefaults, pad: 'none', width: 'full' },
  render: (p) => <ImageSliderView {...p} />,
};

const SLIDER_H: Record<string, string> = { sm: 'h-56', md: 'h-72 sm:h-96', lg: 'h-96 sm:h-[520px]' };

function ImageSliderView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const { liteMode } = useSiteRuntime();
  const editing = useIsEditing();
  const slides = ((p.slides as SlideItem[]) ?? []).filter((sl) => sl.image);
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
    if (!mq) return undefined;
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  const canAutoplay = p.autoplay !== false && !liteMode && !reduced && !editing && slides.length > 1;
  useEffect(() => {
    if (!canAutoplay) return undefined;
    const t = window.setInterval(() => setI((n) => (n + 1) % slides.length), 5000);
    return () => window.clearInterval(t);
  }, [canAutoplay, slides.length]);
  if (!slides.length) return <BlockSection {...(p as SectionProps)}><EditorHint title={s('Add content in the editor')} /></BlockSection>;
  const cur = slides[i % slides.length];
  return (
    <BlockSection {...(p as SectionProps)}>
      <div className={`relative overflow-hidden ${SLIDER_H[p.height] ?? SLIDER_H.md}`} style={{ borderRadius: p.pad === 'none' ? 0 : 'var(--site-radius-lg)' }}>
        {slides.map((sl, idx) => (
          <div key={idx} aria-hidden={idx !== (i % slides.length)} className="absolute inset-0 transition-opacity duration-700" style={{ opacity: idx === (i % slides.length) ? 1 : 0 }}>
            <SiteImage src={sl.image} alt={tx(sl.caption, sl.captionBn)} width={1600} eager={idx === 0} className="h-full w-full object-cover" />
          </div>
        ))}
        {tx(cur.caption, cur.captionBn) && (
          <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-lg font-semibold text-white sm:p-6">
            {cur.href ? <SiteLink href={cur.href} className="text-white no-underline">{tx(cur.caption, cur.captionBn)}</SiteLink> : tx(cur.caption, cur.captionBn)}
          </p>
        )}
        {slides.length > 1 && (
          <>
            <button type="button" aria-label={s('Previous')} onClick={() => setI((n) => (n - 1 + slides.length) % slides.length)} className="site-btn site-btn-ghost site-btn-sm absolute left-2 top-1/2 -translate-y-1/2 !bg-black/35 !text-white"><ChevronLeft size={20} /></button>
            <button type="button" aria-label={s('Next')} onClick={() => setI((n) => (n + 1) % slides.length)} className="site-btn site-btn-ghost site-btn-sm absolute right-2 top-1/2 -translate-y-1/2 !bg-black/35 !text-white"><ChevronRight size={20} /></button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {slides.map((_, idx) => <span key={idx} aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: idx === (i % slides.length) ? '#fff' : 'rgba(255,255,255,.5)' }} />)}
            </div>
          </>
        )}
      </div>
    </BlockSection>
  );
}

/* ── Important links / e-services (from settings when present) ──────────── */

interface PlainLink { label?: string; labelBn?: string; href?: string; icon?: string }

function LinkListBase({ p, settingsKey, defaultHeading, defaultHeadingBn }: { p: Record<string, any>; settingsKey: 'importantLinks' | 'eServices'; defaultHeading: string; defaultHeadingBn: string }) {
  const { settings } = useSiteRuntime();
  const { tx, s } = useSiteText();
  const fromSettings = settings[settingsKey];
  const items: PlainLink[] = (fromSettings?.length ? fromSettings : (p.links as PlainLink[])) ?? [];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} heading={p.heading || defaultHeading} headingBn={p.headingBn || defaultHeadingBn} />
      {!items.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {items.filter((l) => tx(l.label, l.labelBn)).map((l, i) => (
            <li key={i}>
              <SiteLink href={l.href} className="site-card flex items-center gap-2 !no-underline p-3">
                {l.icon ? <BlockIcon name={l.icon} size={18} /> : <ExternalLink size={16} aria-hidden />}
                <span className="font-medium">{tx(l.label, l.labelBn)}</span>
              </SiteLink>
            </li>
          ))}
        </ul>
      )}
    </BlockSection>
  );
}

const linkListFields = {
  ...introFields,
  links: {
    type: 'array' as const, label: 'Links (used only when the site has none set centrally)', max: 20,
    arrayFields: { ...i18nFields(['label', 'Label']), href: urlField('Link') },
    defaultItemProps: { label: 'Link', labelBn: '', href: '/' },
    getItemSummary: (l: PlainLink) => l.label || 'Link',
  },
  ...sectionFields,
};

export const ImportantLinks: SiteBlock = {
  label: 'Important links (গুরুত্বপূর্ণ লিংক)',
  fields: linkListFields,
  defaultProps: { ...introDefaults, heading: 'Important links', headingBn: 'গুরুত্বপূর্ণ লিংক', links: [], ...sectionDefaults },
  render: (p) => <LinkListBase p={p} settingsKey="importantLinks" defaultHeading="Important links" defaultHeadingBn="গুরুত্বপূর্ণ লিংক" />,
};

export const EServices: SiteBlock = {
  label: 'E-services (ই-সেবা)',
  fields: linkListFields,
  defaultProps: { ...introDefaults, heading: 'E-services', headingBn: 'ই-সেবা', links: [], ...sectionDefaults },
  render: (p) => <LinkListBase p={p} settingsKey="eServices" defaultHeading="E-services" defaultHeadingBn="ই-সেবা" />,
};

/* ── Data table (editable; up to 6 columns) ──────────────────────────────── */

interface TableRow { c1?: string; c2?: string; c3?: string; c4?: string; c5?: string; c6?: string }

export const DataTable: SiteBlock = {
  label: 'Table (editable)',
  fields: {
    ...introFields,
    headers: { type: 'array', label: 'Column headings', max: 6, arrayFields: { label: textField('Heading') }, defaultItemProps: { label: 'Column' }, getItemSummary: (c: { label?: string }) => c.label || 'Column' },
    rows: {
      type: 'array', label: 'Rows', max: 50,
      arrayFields: { c1: textField('Cell 1'), c2: textField('Cell 2'), c3: textField('Cell 3'), c4: textField('Cell 4'), c5: textField('Cell 5'), c6: textField('Cell 6') },
      defaultItemProps: { c1: '', c2: '', c3: '', c4: '', c5: '', c6: '' },
      getItemSummary: (r: TableRow) => r.c1 || 'Row',
    },
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, headers: [{ label: 'Column 1' }, { label: 'Column 2' }], rows: [], ...sectionDefaults },
  render: (p) => <DataTableView {...p} />,
};

function DataTableView(p: Record<string, any>) {
  const { s } = useSiteText();
  const headers = ((p.headers as Array<{ label?: string }>) ?? []).map((h) => h.label ?? '');
  const rows = (p.rows as TableRow[]) ?? [];
  const keys: Array<keyof TableRow> = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!rows.length ? <EditorHint title={s('Add content in the editor')} /> : (
        <div className="site-table-wrap">
          <table className="site-table site-table-striped">
            {headers.length > 0 && <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>}
            <tbody>{rows.map((r, i) => <tr key={i}>{keys.slice(0, Math.max(headers.length, 1)).map((k) => <td key={k}>{r[k] ?? ''}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </BlockSection>
  );
}
