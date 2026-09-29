/**
 * Building blocks shared by every site block: editor field helpers (with
 * Bangla twins), the section shell, intros, links, images, rich text and the
 * empty / error / loading states. Only Puck *types* are imported, so the
 * public renderer never pulls the editor runtime.
 */
import { isValidElement, type CSSProperties, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { ComponentConfig, Field } from '@puckeditor/core';
import { useIsEditing, useSiteHref, useSiteRuntime, useSiteText } from '../runtime';
import { isExternalHref, safeHref } from '../embed';
import { sanitizeRichText } from '../sanitize';
import { fillTokens } from '../tokens';

/** Every site block is a plain Puck component config. */
export type SiteBlock = ComponentConfig;

/** What a `slot` field becomes at render time (editor and public renderer alike). */
export type SlotRender = (props?: { className?: string; style?: CSSProperties; minEmptyHeight?: number }) => ReactNode;

/* ── Field helpers ──────────────────────────────────────────────────────── */

export type FieldMap = Record<string, Field>;

const BN_SUFFIX = ' (বাংলা)';

/** A text prop and its optional Bangla twin: `{ key, keyBn }`. */
export function i18nField(key: string, label: string, type: 'text' | 'textarea' | 'richtext' = 'text'): FieldMap {
  return {
    [key]: { type, label } as Field,
    [`${key}Bn`]: { type, label: `${label}${BN_SUFFIX}` } as Field,
  };
}

export function i18nFields(...defs: Array<[key: string, label: string, type?: 'text' | 'textarea' | 'richtext']>): FieldMap {
  return Object.assign({}, ...defs.map(([k, l, t]) => i18nField(k, l, t)));
}

export const textField = (label: string, placeholder?: string): Field => ({ type: 'text', label, placeholder });
export const urlField = (label: string): Field => ({ type: 'text', label, placeholder: 'https://… or /page' });
export const numberField = (label: string, min?: number, max?: number): Field => ({ type: 'number', label, min, max });
export const selectField = (label: string, options: Array<[value: string, label: string]>): Field => ({
  type: 'select',
  label,
  options: options.map(([value, l]) => ({ value, label: l })),
});
export const radioField = (label: string, options: Array<[value: string | boolean, label: string]>): Field => ({
  type: 'radio',
  label,
  options: options.map(([value, l]) => ({ value, label: l })),
});
export const yesNo = (label: string): Field => radioField(label, [[true, 'Yes'], [false, 'No']]);

export const ICON_OPTIONS: Array<[string, string]> = [
  ['', 'None'], ['book', 'Book'], ['graduation', 'Graduation cap'], ['users', 'People'], ['trophy', 'Trophy'],
  ['flask', 'Science'], ['computer', 'Computer'], ['palette', 'Arts'], ['ball', 'Sports'], ['bus', 'Transport'],
  ['shield', 'Safety'], ['heart', 'Care'], ['globe', 'Global'], ['mosque', 'Mosque'], ['calendar', 'Calendar'],
  ['star', 'Star'], ['wrench', 'Technical'], ['lightbulb', 'Ideas'], ['phone', 'Phone'], ['map', 'Location'],
];

/* ── Section shell ──────────────────────────────────────────────────────── */

export type Tone = 'default' | 'surface' | 'soft' | 'primary' | 'accent' | 'dark';
export type Pad = 'none' | 'sm' | 'md' | 'lg';
export type Width = 'narrow' | 'default' | 'wide' | 'full';

export interface SectionProps {
  tone?: Tone;
  pad?: Pad;
  width?: Width;
  anchor?: string;
}

export const sectionFields: FieldMap = {
  tone: selectField('Background', [['default', 'Page'], ['surface', 'Light surface'], ['soft', 'Brand tint'], ['primary', 'Brand colour'], ['accent', 'Accent colour'], ['dark', 'Dark']]),
  pad: selectField('Vertical spacing', [['none', 'None'], ['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]),
  width: selectField('Content width', [['narrow', 'Narrow'], ['default', 'Standard'], ['wide', 'Wide'], ['full', 'Full width']]),
  anchor: textField('Anchor ID (for #links)', 'e.g. admissions'),
};

export const sectionDefaults: Required<SectionProps> = { tone: 'default', pad: 'md', width: 'default', anchor: '' };

const ANCHOR_RE = /[^a-z0-9_-]/gi;

export function BlockSection({ tone = 'default', pad = 'md', width = 'default', anchor, className = '', children, label }: SectionProps & { className?: string; children: ReactNode; label?: string }) {
  const id = anchor ? anchor.replace(ANCHOR_RE, '-').toLowerCase() : undefined;
  return (
    <section id={id} aria-label={label || undefined} className={`site-tone-${tone} site-pad-${pad} ${className}`}>
      <div className={`site-container site-w-${width}`}>{children}</div>
    </section>
  );
}

/* ── Intro (eyebrow / heading / text) ───────────────────────────────────── */

export interface IntroProps {
  eyebrow?: string; eyebrowBn?: string;
  heading?: string; headingBn?: string;
  intro?: string; introBn?: string;
  align?: 'left' | 'center';
}

export const introFields: FieldMap = {
  ...i18nFields(['eyebrow', 'Small label above heading'], ['heading', 'Heading'], ['intro', 'Intro text', 'textarea']),
  align: radioField('Heading alignment', [['left', 'Left'], ['center', 'Centre']]),
};

export function SectionIntro(p: IntroProps & { level?: 1 | 2; className?: string }) {
  const { tx } = useSiteText();
  const eyebrow = tx(p.eyebrow, p.eyebrowBn);
  const heading = tx(p.heading, p.headingBn);
  const intro = tx(p.intro, p.introBn);
  if (!eyebrow && !heading && !intro) return null;
  const center = p.align === 'center';
  const H = p.level === 1 ? 'h1' : 'h2';
  return (
    <div className={`mb-8 flex flex-col gap-3 ${center ? 'items-center text-center mx-auto max-w-3xl' : 'max-w-3xl'} ${p.className ?? ''}`}>
      {eyebrow && <span className="site-eyebrow">{eyebrow}</span>}
      {heading && <H className={p.level === 1 ? 'site-h1' : 'site-h2'}>{heading}</H>}
      {intro && <p className="site-lead site-muted whitespace-pre-line">{intro}</p>}
    </div>
  );
}

/* ── Links ──────────────────────────────────────────────────────────────── */

export function SiteLink({ href, className, style, children, ariaLabel }: { href?: string; className?: string; style?: CSSProperties; children: ReactNode; ariaLabel?: string }) {
  const editing = useIsEditing();
  const toHref = useSiteHref();
  const inRouter = useInRouterContext();
  const safe = safeHref(href);
  if (!safe) return <span className={className} style={style}>{children}</span>;
  if (editing) {
    return (
      <a href={safe} className={className} style={style} aria-label={ariaLabel} onClick={(e) => e.preventDefault()}>
        {children}
      </a>
    );
  }
  if (isExternalHref(safe)) {
    const web = /^https?:/i.test(safe);
    return (
      <a href={safe} className={className} style={style} aria-label={ariaLabel} {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    );
  }
  const resolved = toHref(safe) ?? safe;
  if (safe.startsWith('#') || !inRouter) return <a href={resolved} className={className} style={style} aria-label={ariaLabel}>{children}</a>;
  return <Link to={resolved} className={className} style={style} aria-label={ariaLabel}>{children}</Link>;
}

/* ── Images ─────────────────────────────────────────────────────────────── */

/** Cloudinary URLs get automatic format/quality and a width cap. */
export function optimiseImage(url: string | undefined, width = 1600): string | undefined {
  if (!url) return undefined;
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/.exec(url);
  if (!m) return url;
  if (/^(f_|q_|w_|c_)/.test(m[2])) return url;
  return `${m[1]}f_auto,q_auto,c_limit,w_${width}/${m[2]}`;
}

export function SiteImage({ src, alt, className, width = 1600, eager = false, style }: { src?: string; alt?: string; className?: string; width?: number; eager?: boolean; style?: CSSProperties }) {
  const { tx } = useSiteText();
  if (!src) return null;
  return (
    <img
      src={optimiseImage(src, width)}
      alt={alt ? tx(alt) : ''}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
      style={style}
    />
  );
}

/* ── Rich text ──────────────────────────────────────────────────────────── */

/** Puck gives richtext props as ReactNode in the editor and as HTML strings when stored. */
export function isRichEmpty(v: unknown): boolean {
  if (v == null || v === false) return true;
  if (typeof v === 'string') return v.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';
  if (isValidElement(v)) {
    // Puck wraps the HTML string: <Suspense><RichTextRender content="…"/></Suspense>
    const inner = (v.props as { children?: unknown })?.children;
    const content = isValidElement(inner) ? (inner.props as { content?: unknown })?.content : undefined;
    if (typeof content === 'string') return isRichEmpty(content);
  }
  return false;
}

export function useRichPick() {
  const { lang } = useSiteText();
  return (en: unknown, bn: unknown): unknown => (lang === 'bn' && !isRichEmpty(bn) ? bn : en);
}

export function RichHtml({ value, className = '' }: { value: unknown; className?: string }) {
  const { tokens } = useSiteRuntime();
  if (isRichEmpty(value)) return null;
  if (typeof value === 'string') {
    const html = sanitizeRichText(fillTokens(value, tokens, { escape: true }));
    return <div className={`site-prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <div className={`site-prose ${className}`}>{value as ReactNode}</div>;
}

/* ── States ─────────────────────────────────────────────────────────────── */

export function EmptyBlock({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="site-empty" role="status">
      {icon && <span aria-hidden className="opacity-70">{icon}</span>}
      <p className="site-empty-title">{title}</p>
      {hint && <p className="text-sm">{hint}</p>}
    </div>
  );
}

/** Authoring hint ("add content…"): shown in the editor only, nothing on the public site. */
export function EditorHint(props: { title: string; hint?: string; icon?: ReactNode }) {
  return useIsEditing() ? <EmptyBlock {...props} /> : null;
}

export function ErrorBlock({ onRetry }: { onRetry?: () => void }) {
  const { s } = useSiteText();
  return (
    <div className="site-empty" role="alert">
      <p className="site-empty-title">{s('Couldn’t load this section.')}</p>
      {onRetry && (
        <button type="button" className="site-btn site-btn-outline site-btn-sm mt-2" onClick={onRetry}>
          {s('Try again')}
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 3, className = 'h-16' }: { rows?: number; className?: string }) {
  const { s } = useSiteText();
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={s('Loading…')}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className={`site-skeleton ${className}`} />)}
    </div>
  );
}

/** Shown by live blocks when there's no site to fetch from (e.g. a design preview). */
export function NotConnected() {
  const { s } = useSiteText();
  return <EmptyBlock title={s('Live data appears once the site is connected.')} />;
}

export function pickNonEmpty<T>(items: T[] | undefined, isEmpty: (t: T) => boolean): T[] {
  return (items ?? []).filter((i) => !isEmpty(i));
}
