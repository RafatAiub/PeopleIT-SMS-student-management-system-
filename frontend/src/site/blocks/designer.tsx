/**
 * Designer blocks (W4): the small, unopinionated building blocks you compose
 * inside a CollectionList item or a template page — Text, Picture, Link/Button,
 * Badge, Stack (flex) and Grid. No section chrome (padding / container), so they
 * nest anywhere. Like every block they can bind any field to data (`_bind`) and
 * carry show-if rules (`_visible`) through `makeBindable`.
 */
import { ImageIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useSiteText } from '../runtime';
import {
  EditorHint, i18nFields, numberField, radioField, selectField, SiteImage, SiteLink, textField, urlField, yesNo,
  type SiteBlock, type SlotRender,
} from './shared';

const GAP_PX: Record<string, number> = { none: 0, xs: 4, sm: 8, md: 16, lg: 32, xl: 48 };
const gapField = (label = 'Gap') => selectField(label, [['none', 'None'], ['xs', 'Extra small'], ['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large'], ['xl', 'Extra large']]);
const alignField = (label: string) => selectField(label, [['start', 'Start'], ['center', 'Centre'], ['end', 'End'], ['stretch', 'Stretch']]);

/* ── Text ───────────────────────────────────────────────────────────────── */

const TEXT_SIZE: Record<string, string> = { xs: 'text-xs', sm: 'text-sm', md: 'text-base', lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl', '3xl': 'text-3xl md:text-4xl', '4xl': 'text-4xl md:text-5xl' };
const TEXT_WEIGHT: Record<string, string> = { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' };
const TEXT_ALIGN: Record<string, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };
const TEXT_COLOR: Record<string, string | undefined> = {
  default: undefined, muted: 'var(--site-muted)', primary: 'var(--site-primary-text)', accent: 'var(--site-accent)', inverse: '#ffffff',
};
const CLAMP: Record<string, string> = { '1': 'line-clamp-1', '2': 'line-clamp-2', '3': 'line-clamp-3', '4': 'line-clamp-4', '5': 'line-clamp-5', '6': 'line-clamp-6' };
const TEXT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'span', 'div'] as const;

export const Text: SiteBlock = {
  label: 'Text (free)',
  fields: {
    ...i18nFields(['text', 'Text', 'textarea']),
    tag: selectField('HTML tag', [['p', 'Paragraph'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['span', 'Inline'], ['div', 'Plain block']]),
    size: selectField('Size', [['xs', 'XS'], ['sm', 'Small'], ['md', 'Normal'], ['lg', 'Large'], ['xl', 'XL'], ['2xl', '2XL'], ['3xl', '3XL'], ['4xl', '4XL']]),
    weight: selectField('Weight', [['normal', 'Normal'], ['medium', 'Medium'], ['semibold', 'Semibold'], ['bold', 'Bold']]),
    align: selectField('Align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]),
    color: selectField('Colour', [['default', 'Default'], ['muted', 'Muted'], ['primary', 'Brand'], ['accent', 'Accent'], ['inverse', 'White']]),
    upper: yesNo('UPPERCASE'),
    lines: numberField('Limit to N lines (0 = no limit)', 0, 6),
  },
  defaultProps: { text: 'Text', textBn: '', tag: 'p', size: 'md', weight: 'normal', align: 'left', color: 'default', upper: false, lines: 0 },
  render: (p) => <TextView {...p} />,
};

function TextView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const text = tx(p.text, p.textBn);
  if (!text) return null;
  const Tag = ((TEXT_TAGS as readonly string[]).includes(p.tag) ? p.tag : 'p') as 'p';
  const heading = /^h[1-4]$/.test(String(p.tag));
  const cls = [
    TEXT_SIZE[p.size] ?? TEXT_SIZE.md, TEXT_WEIGHT[heading && !p.weight ? 'bold' : p.weight] ?? '', TEXT_ALIGN[p.align] ?? '',
    p.upper ? 'uppercase tracking-wide' : '', CLAMP[String(p.lines)] ?? '', 'whitespace-pre-line',
  ].filter(Boolean).join(' ');
  const color = TEXT_COLOR[p.color as string];
  return <Tag className={cls} style={color ? { color } : undefined}>{text}</Tag>;
}

/* ── Picture ────────────────────────────────────────────────────────────── */

const PIC_RATIO: Record<string, string> = { auto: '', '16/9': 'aspect-video', '4/3': 'aspect-[4/3]', '1/1': 'aspect-square', '3/4': 'aspect-[3/4]', '21/9': 'aspect-[21/9]' };
const PIC_RADIUS: Record<string, string> = { none: '0', md: 'var(--site-radius)', lg: 'var(--site-radius-lg)', full: '9999px' };

export const Picture: SiteBlock = {
  label: 'Image (free)',
  fields: {
    src: textField('Image URL'),
    ...i18nFields(['alt', 'Description (alt text)']),
    href: urlField('Link (optional)'),
    ratio: selectField('Shape', [['auto', 'Original'], ['16/9', 'Wide 16:9'], ['21/9', 'Banner 21:9'], ['4/3', '4:3'], ['1/1', 'Square'], ['3/4', 'Portrait']]),
    fit: radioField('Fit', [['cover', 'Fill (crop)'], ['contain', 'Whole image']]),
    radius: selectField('Corners', [['none', 'Square'], ['md', 'Rounded'], ['lg', 'Very rounded'], ['full', 'Circle / pill']]),
    maxWidth: numberField('Max width in px (0 = full)', 0, 2000),
  },
  defaultProps: { src: '', alt: '', altBn: '', href: '', ratio: '4/3', fit: 'cover', radius: 'md', maxWidth: 0 },
  render: (p) => <PictureView {...p} />,
};

function PictureView(p: Record<string, any>) {
  const { tx, s } = useSiteText();
  if (!p.src) return <EditorHint icon={<ImageIcon size={24} />} title={s('Add content in the editor')} />;
  const max = Number(p.maxWidth) > 0 ? Number(p.maxWidth) : undefined;
  const img = (
    <SiteImage
      src={p.src}
      alt={tx(p.alt, p.altBn)}
      width={max ? Math.min(2 * max, 1600) : 1200}
      className={`block w-full ${p.ratio === 'auto' ? 'h-auto' : 'h-full'} ${p.fit === 'contain' ? 'object-contain' : 'object-cover'}`}
    />
  );
  const style: CSSProperties = { borderRadius: PIC_RADIUS[p.radius] ?? PIC_RADIUS.md, overflow: 'hidden', maxWidth: max };
  return (
    <div className={PIC_RATIO[p.ratio] ?? ''} style={style}>
      {p.href ? <SiteLink href={p.href} className="block h-full w-full">{img}</SiteLink> : img}
    </div>
  );
}

/* ── Link / Button ──────────────────────────────────────────────────────── */

const BTN_ALIGN: Record<string, string> = { start: 'justify-start', center: 'justify-center', end: 'justify-end' };

export const LinkButton: SiteBlock = {
  label: 'Link / Button',
  fields: {
    ...i18nFields(['label', 'Label']),
    href: urlField('Link'),
    variant: selectField('Style', [['primary', 'Primary'], ['accent', 'Accent'], ['outline', 'Outline'], ['ghost', 'Plain button'], ['link', 'Text link']]),
    size: selectField('Size', [['sm', 'Small'], ['md', 'Normal'], ['lg', 'Large']]),
    align: selectField('Position', [['start', 'Left'], ['center', 'Centre'], ['end', 'Right']]),
    fullWidth: yesNo('Full width'),
  },
  defaultProps: { label: 'Read more', labelBn: '', href: '', variant: 'primary', size: 'md', align: 'start', fullWidth: false },
  render: (p) => <LinkButtonView {...p} />,
};

function LinkButtonView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const label = tx(p.label, p.labelBn);
  if (!label) return null;
  const isLink = p.variant === 'link';
  const cls = isLink ? 'font-semibold underline-offset-2 hover:underline' : `site-btn site-btn-${p.variant || 'primary'} ${p.size === 'lg' ? 'site-btn-lg' : p.size === 'sm' ? 'site-btn-sm' : ''} ${p.fullWidth ? 'w-full' : ''}`;
  return (
    <div className={`flex ${BTN_ALIGN[p.align] ?? ''}`}>
      <SiteLink href={p.href} className={cls}>{label}</SiteLink>
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────────── */

const BADGE_TONE: Record<string, CSSProperties | undefined> = {
  neutral: undefined,
  accent: { background: 'var(--site-accent-soft)' },
  primary: { background: 'var(--site-primary)', color: 'var(--site-on-primary)', borderColor: 'transparent' },
  success: { background: '#dcfce7', color: '#166534', borderColor: 'transparent' },
  warning: { background: '#fef3c7', color: '#92400e', borderColor: 'transparent' },
  danger: { background: '#fee2e2', color: '#991b1b', borderColor: 'transparent' },
};

export const Badge: SiteBlock = {
  label: 'Badge / label',
  fields: {
    ...i18nFields(['text', 'Text']),
    tone: selectField('Colour', [['neutral', 'Neutral'], ['accent', 'Accent tint'], ['primary', 'Brand'], ['success', 'Green'], ['warning', 'Amber'], ['danger', 'Red']]),
    align: selectField('Position', [['start', 'Left'], ['center', 'Centre'], ['end', 'Right']]),
  },
  defaultProps: { text: 'New', textBn: '', tone: 'accent', align: 'start' },
  render: (p) => <BadgeView {...p} />,
};

function BadgeView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const text = tx(p.text, p.textBn);
  if (!text) return null;
  return (
    <div className={`flex ${BTN_ALIGN[p.align] ?? ''}`}>
      <span className="site-badge" style={BADGE_TONE[p.tone] ?? undefined}>{text}</span>
    </div>
  );
}

/* ── Stack (flex) ───────────────────────────────────────────────────────── */

const ITEMS: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' };
const SURFACE: Record<string, string> = { none: '', surface: 'site-tone-surface', soft: 'site-tone-soft', primary: 'site-tone-primary', dark: 'site-tone-dark', card: 'site-card' };

export const Stack: SiteBlock = {
  label: 'Stack (flex box)',
  fields: {
    direction: radioField('Direction', [['column', 'Vertical'], ['row', 'Horizontal']]),
    stackOnPhone: yesNo('Stack vertically on phones (horizontal only)'),
    gap: gapField(),
    align: alignField('Align items (cross axis)'),
    justify: selectField('Distribute (main axis)', [['start', 'Start'], ['center', 'Centre'], ['end', 'End'], ['between', 'Space between']]),
    wrap: yesNo('Wrap onto new lines'),
    padding: gapField('Inner padding'),
    surface: selectField('Background', [['none', 'None'], ['card', 'Card (border)'], ['surface', 'Light surface'], ['soft', 'Brand tint'], ['primary', 'Brand colour'], ['dark', 'Dark']]),
    radius: yesNo('Rounded corners'),
    content: { type: 'slot', label: 'Content' },
  },
  defaultProps: { direction: 'column', stackOnPhone: true, gap: 'md', align: 'stretch', justify: 'start', wrap: false, padding: 'none', surface: 'none', radius: false, content: [] },
  render: (p) => {
    const Content = p.content as SlotRender;
    const row = p.direction === 'row';
    const surface = SURFACE[p.surface as string] ?? '';
    return (
      <Content
        className={`flex min-w-0 ${row ? (p.stackOnPhone === false ? 'flex-row' : 'flex-col sm:flex-row') : 'flex-col'} ${p.wrap ? 'flex-wrap' : ''} ${surface}`}
        style={{
          gap: GAP_PX[p.gap as string] ?? 16, alignItems: ITEMS[p.align as string], justifyContent: JUSTIFY[p.justify as string],
          padding: GAP_PX[p.padding as string] ?? 0, ...(p.radius ? { borderRadius: 'var(--site-radius)' } : {}),
        }}
        minEmptyHeight={48}
      />
    );
  },
};

/* ── Grid ───────────────────────────────────────────────────────────────── */

const colsField = (label: string) => selectField(label, [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']]);

export const Grid: SiteBlock = {
  label: 'Grid',
  fields: {
    colsSm: colsField('Columns on phone'),
    colsMd: colsField('Columns on tablet'),
    colsLg: colsField('Columns on desktop'),
    gap: gapField(),
    align: alignField('Align items'),
    content: { type: 'slot', label: 'Cells' },
  },
  defaultProps: { colsSm: '1', colsMd: '2', colsLg: '3', gap: 'md', align: 'stretch', content: [] },
  render: (p) => {
    const Content = p.content as SlotRender;
    const n = (v: unknown, d: number) => Math.min(6, Math.max(1, Number(v) || d));
    return (
      <Content
        className="site-cols"
        style={{
          ['--c-sm' as string]: n(p.colsSm, 1), ['--c-md' as string]: n(p.colsMd, 2), ['--c-lg' as string]: n(p.colsLg, 3),
          ['--site-gap' as string]: `${GAP_PX[p.gap as string] ?? 16}px`, alignItems: ITEMS[p.align as string],
        }}
        minEmptyHeight={64}
      />
    );
  },
};
