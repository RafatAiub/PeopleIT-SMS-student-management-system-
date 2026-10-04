/** Media blocks: Image, Gallery, Video, LogoStrip, Map, Embed/HTML. */
import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, MapPin, PlayCircle, X } from 'lucide-react';
import { osmEmbedUrl, toVideoEmbed } from '../embed';
import { sanitizeEmbedHtml } from '../sanitize';
import { useIsEditing, useSiteRuntime, useSiteText } from '../runtime';
import {
  BlockSection, EditorHint, EmptyBlock, i18nField, i18nFields, introFields, numberField, optimiseImage, radioField, sectionDefaults,
  sectionFields, SectionIntro, selectField, SiteImage, SiteLink, textField, urlField, type SectionProps, type SiteBlock,
} from './shared';

const RATIO: Record<string, string> = { auto: '', '16/9': 'aspect-video', '4/3': 'aspect-[4/3]', '1/1': 'aspect-square', '3/4': 'aspect-[3/4]' };

/* ── Image ──────────────────────────────────────────────────────────────── */

export const ImageBlock: SiteBlock = {
  label: 'Image',
  fields: {
    src: textField('Image URL'),
    ...i18nFields(['alt', 'Description (alt text)'], ['caption', 'Caption']),
    href: urlField('Link (optional)'),
    ratio: selectField('Shape', [['auto', 'Original'], ['16/9', 'Wide 16:9'], ['4/3', '4:3'], ['1/1', 'Square'], ['3/4', 'Portrait']]),
    rounded: radioField('Rounded corners', [[true, 'Yes'], [false, 'No']]),
    ...sectionFields,
  },
  defaultProps: { src: '', alt: '', altBn: '', caption: '', captionBn: '', href: '', ratio: 'auto', rounded: true, ...sectionDefaults, pad: 'sm' },
  render: (p) => <ImageView {...p} />,
};

function ImageView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const caption = tx(p.caption, p.captionBn);
  const img = p.src ? (
    <SiteImage src={p.src} alt={tx(p.alt, p.altBn)} className={`w-full object-cover ${RATIO[p.ratio] ?? ''}`} style={p.rounded ? { borderRadius: 'var(--site-radius-lg)' } : undefined} />
  ) : (
    <EditorHint icon={<ImageIcon size={28} />} title={s('Add content in the editor')} />
  );
  return (
    <BlockSection {...(p as SectionProps)}>
      <figure className="m-0 flex flex-col gap-2">
        {p.href && p.src ? <SiteLink href={p.href}>{img}</SiteLink> : img}
        {caption && <figcaption className="site-muted text-center text-sm">{caption}</figcaption>}
      </figure>
    </BlockSection>
  );
}

/* ── Gallery ────────────────────────────────────────────────────────────── */

interface GalleryItem { src?: string; alt?: string; altBn?: string; caption?: string; captionBn?: string }

export const Gallery: SiteBlock = {
  label: 'Gallery',
  fields: {
    ...introFields,
    images: {
      type: 'array',
      label: 'Images',
      arrayFields: { src: textField('Image URL'), ...i18nFields(['alt', 'Description (alt text)'], ['caption', 'Caption']) },
      defaultItemProps: { src: '', alt: '', altBn: '', caption: '', captionBn: '' },
      getItemSummary: (i: GalleryItem, idx?: number) => i.caption || i.alt || `Image ${(idx ?? 0) + 1}`,
    },
    layout: radioField('Layout', [['grid', 'Grid'], ['carousel', 'Carousel']]),
    columns: selectField('Columns (grid)', [['2', '2'], ['3', '3'], ['4', '4']]),
    ...sectionFields,
  },
  defaultProps: { heading: 'Campus life', headingBn: 'ক্যাম্পাস জীবন', eyebrow: '', eyebrowBn: '', intro: '', introBn: '', align: 'left', images: [], layout: 'grid', columns: '3', ...sectionDefaults },
  render: (p) => <GalleryView {...p} />,
};

const GALLERY_COLS: Record<string, string> = { '2': 'grid-cols-2', '3': 'grid-cols-2 md:grid-cols-3', '4': 'grid-cols-2 md:grid-cols-4' };

function GalleryView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const editing = useIsEditing();
  const images = ((p.images as GalleryItem[]) ?? []).filter((i) => i.src);
  const [open, setOpen] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: 'smooth' });
  // Visitors never see an empty gallery section — only editors get the placeholder.
  if (!images.length && !editing) return null;

  const tile = (img: GalleryItem, i: number) => (
    <button
      key={i}
      type="button"
      className="group relative block w-full overflow-hidden p-0 text-left"
      style={{ borderRadius: 'var(--site-radius)', border: 0, background: 'var(--site-surface-2)' }}
      onClick={() => !editing && setOpen(i)}
      aria-label={tx(img.alt, img.altBn) || tx(img.caption, img.captionBn) || `Image ${i + 1}`}
    >
      <img src={optimiseImage(img.src, 800)} alt={tx(img.alt, img.altBn)} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      {tx(img.caption, img.captionBn) && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-medium text-white">{tx(img.caption, img.captionBn)}</span>
      )}
    </button>
  );

  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!images.length ? (
        <EditorHint icon={<ImageIcon size={28} />} title={s('Add content in the editor')} />
      ) : p.layout === 'carousel' ? (
        <div className="relative">
          <div ref={scroller} className="site-scroller">{images.map(tile)}</div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="site-btn site-btn-outline site-btn-sm" onClick={() => scroll(-1)} aria-label={s('Previous')}><ChevronLeft size={18} /></button>
            <button type="button" className="site-btn site-btn-outline site-btn-sm" onClick={() => scroll(1)} aria-label={s('Next')}><ChevronRight size={18} /></button>
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 md:gap-4 ${GALLERY_COLS[p.columns] ?? GALLERY_COLS['3']}`}>{images.map(tile)}</div>
      )}
      {open !== null && images[open] && (
        <div role="dialog" aria-modal="true" aria-label={tx(images[open].alt, images[open].altBn) || 'Image'} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)} onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(null);
          if (e.key === 'ArrowRight') setOpen((open + 1) % images.length);
          if (e.key === 'ArrowLeft') setOpen((open - 1 + images.length) % images.length);
        }}>
          <button type="button" autoFocus className="site-btn site-btn-light site-btn-sm absolute right-4 top-4" onClick={() => setOpen(null)} aria-label={s('Close menu')}><X size={18} /></button>
          <img src={optimiseImage(images[open].src, 1800)} alt={tx(images[open].alt, images[open].altBn)} className="max-h-[85vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </BlockSection>
  );
}

/* ── Video ──────────────────────────────────────────────────────────────── */

export const Video: SiteBlock = {
  label: 'Video',
  fields: {
    ...introFields,
    url: textField('YouTube, Vimeo or MP4 link'),
    ...i18nField('title', 'Video title (for screen readers)'),
    poster: textField('Poster image URL (optional)'),
    ...sectionFields,
  },
  defaultProps: { eyebrow: '', eyebrowBn: '', heading: '', headingBn: '', intro: '', introBn: '', align: 'left', url: '', title: 'Video', titleBn: 'ভিডিও', poster: '', ...sectionDefaults, width: 'narrow' },
  render: (p) => <VideoView {...p} />,
};

function VideoView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const { liteMode } = useSiteRuntime();
  const editing = useIsEditing();
  const embed = useMemo(() => toVideoEmbed(p.url), [p.url]);
  // Click-to-load: the heavy player iframe only loads when asked (always in lite mode and the editor).
  const [play, setPlay] = useState(false);
  const title = tx(p.title, p.titleBn) || 'Video';
  let body;
  if (!embed) body = <EditorHint icon={<PlayCircle size={28} />} title={s('Add a video link in the editor')} />;
  else if (embed.kind === 'file') body = <video src={embed.src} poster={p.poster || undefined} controls preload="none" className="aspect-video w-full bg-black" style={{ borderRadius: 'var(--site-radius-lg)' }} title={title} />;
  else if (play && !editing) body = <iframe src={`${embed.src}?autoplay=1`} title={title} className="aspect-video w-full border-0" style={{ borderRadius: 'var(--site-radius-lg)' }} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />;
  else {
    const thumb = p.poster ? optimiseImage(p.poster, 1280) : embed.kind === 'youtube' && !liteMode ? `https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg` : undefined;
    body = (
      <button type="button" onClick={() => setPlay(true)} aria-label={`▶ ${title}`} className="relative flex aspect-video w-full items-center justify-center overflow-hidden border-0 p-0" style={{ borderRadius: 'var(--site-radius-lg)', background: '#0f172a' }}>
        {thumb && <img src={thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
        <PlayCircle size={72} className="relative text-white drop-shadow-lg" aria-hidden />
      </button>
    );
  }
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {body}
    </BlockSection>
  );
}

/* ── Logo strip ─────────────────────────────────────────────────────────── */

interface LogoItem { src?: string; name?: string; href?: string }

export const LogoStrip: SiteBlock = {
  label: 'Logo strip',
  fields: {
    ...introFields,
    logos: {
      type: 'array', label: 'Logos',
      arrayFields: { src: textField('Logo image URL'), name: textField('Name (alt text)'), href: urlField('Link (optional)') },
      defaultItemProps: { src: '', name: '', href: '' },
      getItemSummary: (i: LogoItem, idx?: number) => i.name || `Logo ${(idx ?? 0) + 1}`,
    },
    grayscale: radioField('Greyscale', [[true, 'Yes'], [false, 'No']]),
    ...sectionFields,
  },
  defaultProps: { eyebrow: '', eyebrowBn: '', heading: 'Affiliations & partners', headingBn: 'অধিভুক্তি ও অংশীদার', intro: '', introBn: '', align: 'center', logos: [], grayscale: true, ...sectionDefaults, pad: 'sm' },
  render: (p) => <LogoStripView {...p} />,
};

function LogoStripView(p: Record<string, any>) {
  const { s } = useSiteText();
  const logos = ((p.logos as LogoItem[]) ?? []).filter((l) => l.src);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!logos.length ? (
        <EditorHint title={s('Add content in the editor')} />
      ) : (
        <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-x-10 gap-y-6 p-0">
          {logos.map((l, i) => {
            const img = <img src={optimiseImage(l.src, 320)} alt={l.name || ''} loading="lazy" className={`h-10 w-auto max-w-[140px] object-contain md:h-12 ${p.grayscale ? 'opacity-75 grayscale transition hover:opacity-100 hover:grayscale-0' : ''}`} />;
            return <li key={i}>{l.href ? <SiteLink href={l.href}>{img}</SiteLink> : img}</li>;
          })}
        </ul>
      )}
    </BlockSection>
  );
}

/* ── Map (OpenStreetMap) ────────────────────────────────────────────────── */

export const MapBlock: SiteBlock = {
  label: 'Map',
  fields: {
    ...introFields,
    lat: numberField('Latitude', -90, 90),
    lng: numberField('Longitude', -180, 180),
    zoom: numberField('Zoom (3–19)', 3, 19),
    ...i18nField('address', 'Address shown under the map', 'textarea'),
    height: selectField('Height', [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]),
    ...sectionFields,
  },
  defaultProps: { eyebrow: '', eyebrowBn: '', heading: 'Find us', headingBn: 'আমাদের অবস্থান', intro: '', introBn: '', align: 'left', lat: undefined, lng: undefined, zoom: 16, address: '{{institution.address}}', addressBn: '', height: 'md', ...sectionDefaults },
  render: (p) => <MapView {...p} />,
};

const MAP_H: Record<string, string> = { sm: 'h-56', md: 'h-72 md:h-96', lg: 'h-96 md:h-[520px]' };

function MapView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  const editing = useIsEditing();
  const src = osmEmbedUrl(Number(p.lat), Number(p.lng), Number(p.zoom) || 16);
  const address = tx(p.address, p.addressBn);
  const link = src ? `https://www.openstreetmap.org/?mlat=${Number(p.lat)}&mlon=${Number(p.lng)}#map=${Number(p.zoom) || 16}/${Number(p.lat)}/${Number(p.lng)}` : undefined;
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {src ? (
        <iframe title={tx(p.heading, p.headingBn) || 'Map'} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className={`w-full border-0 ${MAP_H[p.height] ?? MAP_H.md}`} style={{ borderRadius: 'var(--site-radius-lg)', pointerEvents: editing ? 'none' : undefined }} />
      ) : (
        <EditorHint icon={<MapPin size={28} />} title={s('Map location not set')} />
      )}
      {(address || link) && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          {address && <p className="site-muted whitespace-pre-line">{address}</p>}
          {link && <SiteLink href={link} className="site-btn site-btn-outline site-btn-sm">OpenStreetMap ↗</SiteLink>}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Embed / HTML (sanitised, iframe allow-list) ────────────────────────── */

export const Embed: SiteBlock = {
  label: 'Embed / HTML',
  fields: {
    html: { type: 'textarea', label: 'HTML or embed code (scripts are removed; iframes only from YouTube, Vimeo, Google Maps/Forms/Docs, OpenStreetMap, Facebook, Canva)' },
    ...sectionFields,
  },
  defaultProps: { html: '', ...sectionDefaults, pad: 'sm' },
  render: (p) => <EmbedView {...p} />,
};

function EmbedView(p: Record<string, any>) {
  const { s } = useSiteText();
  const editing = useIsEditing();
  const raw = String(p.html ?? '');
  const clean = useMemo(() => sanitizeEmbedHtml(raw), [raw]);
  const blocked = /<iframe/i.test(raw) && !/<iframe/i.test(clean);
  return (
    <BlockSection {...(p as SectionProps)}>
      {!raw.trim() ? (
        <EditorHint title={s('Add content in the editor')} />
      ) : (
        <>
          {blocked && editing && <p className="site-alert site-alert-warning mb-3 text-sm">{s('This embed was blocked because it isn’t from an allowed site.')}</p>}
          <div className="site-prose max-w-none [&_iframe]:w-full [&_iframe]:border-0" dangerouslySetInnerHTML={{ __html: clean }} />
        </>
      )}
    </BlockSection>
  );
}
