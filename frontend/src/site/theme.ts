/**
 * Site theme system: normalisers, font catalogue, CSS-variable mapping and a
 * WCAG contrast helper. Pure logic only (no React), so it is unit-testable
 * and importable from the editor, the renderer and the templates.
 *
 * All variables are applied to `.site-root` (see SiteRoot.tsx), never to
 * `:root`, so a site theme can't leak into the dashboard.
 */
import type {
  NavItem, SiteFontKey, SiteFooterStyle, SiteHeaderStyle, SiteLang, SiteLayoutMode, SiteNavigation, SiteRadius,
  SiteSettings, SiteTheme, SiteTopBarLink, SiteTopBarSettings,
} from './types';

export const DEFAULT_THEME: SiteTheme = {
  primary: '#1d4ed8',
  accent: '#f59e0b',
  font: 'inter',
  radius: 'md',
  mode: 'light',
  headerStyle: 'modern',
  footerStyle: 'modern',
  layout: 'full',
  pageBackground: 'none',
};

export const HEADER_STYLES: Array<[SiteHeaderStyle, string]> = [
  ['modern', 'Modern (sticky, blurred)'],
  ['portal', 'Classic portal (top bar + banner)'],
  ['corporate', 'Corporate (navy bars + dropdowns)'],
  ['banner', 'Banner (wide image header)'],
  ['centered', 'Centred (logo + nav stacked)'],
  ['minimal', 'Minimal (logo + text nav)'],
];

export const FOOTER_STYLES: Array<[SiteFooterStyle, string]> = [
  ['modern', 'Modern (three columns)'],
  ['portal', 'Classic portal (skyline divider)'],
  ['corporate', 'Corporate (four columns, dark)'],
  ['columns', 'Columns (four columns, light)'],
  ['minimal', 'Minimal (one line)'],
];

export const LAYOUT_MODES: Array<[SiteLayoutMode, string]> = [
  ['full', 'Full width'],
  ['boxed', 'Boxed (~1000px, patterned background)'],
];

export const PAGE_BACKGROUNDS: Array<[string, string]> = [
  ['none', 'None'],
  ['dots', 'Dot grid'],
  ['grid', 'Grid lines'],
  ['diagonal', 'Diagonal stripes'],
  ['waves', 'Soft waves'],
];

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: '',
  social: {},
  defaultLanguage: 'en',
  languages: ['en', 'bn'],
  liteMode: false,
  publicResults: false,
  showToppers: false,
};

export interface SiteFont {
  key: SiteFontKey;
  label: string;
  /** CSS font-family stack. Bangla glyphs always fall back to Hind Siliguri. */
  stack: string;
  /** Google Fonts `family=` query value; null = no download. */
  google: string | null;
}

const BANGLA = "'Hind Siliguri'";
const SANS_FALLBACK = `${BANGLA}, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
const SERIF_FALLBACK = `${BANGLA}, Georgia, 'Times New Roman', serif`;

export const SITE_FONTS: SiteFont[] = [
  { key: 'inter', label: 'Inter', stack: `Inter, ${SANS_FALLBACK}`, google: null /* already loaded by the app */ },
  { key: 'poppins', label: 'Poppins', stack: `Poppins, ${SANS_FALLBACK}`, google: 'Poppins:wght@400;500;600;700' },
  { key: 'nunito', label: 'Nunito (rounded)', stack: `Nunito, ${SANS_FALLBACK}`, google: 'Nunito:wght@400;600;700;800' },
  { key: 'merriweather', label: 'Merriweather (serif)', stack: `Merriweather, ${SERIF_FALLBACK}`, google: 'Merriweather:wght@400;700' },
  { key: 'playfair', label: 'Playfair Display (serif)', stack: `'Playfair Display', ${SERIF_FALLBACK}`, google: 'Playfair+Display:wght@500;600;700' },
  { key: 'lora', label: 'Lora (serif)', stack: `Lora, ${SERIF_FALLBACK}`, google: 'Lora:wght@400;600;700' },
  { key: 'noto-naskh', label: 'Noto Naskh Arabic accent', stack: `Inter, 'Noto Naskh Arabic', ${SANS_FALLBACK}`, google: 'Noto+Naskh+Arabic:wght@400;600;700' },
  { key: 'system', label: 'System (fastest)', stack: `system-ui, -apple-system, 'Segoe UI', Roboto, ${BANGLA}, sans-serif`, google: null },
];

export const SITE_RADII: Record<SiteRadius, string> = { none: '0px', sm: '4px', md: '10px', lg: '16px', xl: '24px' };

export function fontByKey(key: string | undefined): SiteFont {
  return SITE_FONTS.find((f) => f.key === key) ?? SITE_FONTS[0];
}

/* ── Colour + contrast (WCAG 2.x) ───────────────────────────────────────── */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v.trim());
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA: 4.5 for body text, 3 for large text (≥ 24px, or ≥ 18.66px bold). */
export function meetsAA(fg: string, bg: string, large = false): boolean {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

/** White or near-black, whichever reads better on `bg`. */
export function readableTextOn(bg: string): '#ffffff' | '#0f172a' {
  return contrastRatio('#ffffff', bg) >= contrastRatio('#0f172a', bg) ? '#ffffff' : '#0f172a';
}

/** Mix `hex` toward black (amount > 0) or white (amount < 0). */
export function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = amount > 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  return toHex(rgb.map((c) => c + (target - c) * t) as [number, number, number]);
}

/**
 * Darken (or lighten on dark backgrounds) `fg` until it reaches AA against
 * `bg`. Used for links/headings in the brand colour so a light brand colour
 * never produces unreadable text. Returns the original when it already passes.
 */
export function ensureContrast(fg: string, bg: string, ratio = 4.5): string {
  if (!isHexColor(fg) || !isHexColor(bg)) return fg;
  if (contrastRatio(fg, bg) >= ratio) return fg;
  const darken = relativeLuminance(bg) > 0.4;
  for (let i = 1; i <= 20; i++) {
    const c = shade(fg, (darken ? 1 : -1) * i * 0.05);
    if (contrastRatio(c, bg) >= ratio) return c;
  }
  return darken ? '#000000' : '#ffffff';
}

export interface ThemeContrastReport {
  /** Text on a primary-coloured button. */
  onPrimary: number;
  /** Primary used as text/link colour on the page background. */
  primaryOnBg: number;
  onAccent: number;
  passes: boolean;
  warnings: string[];
}

/** For the theme editor's AA warning (Engineer C). */
export function checkThemeContrast(theme: SiteTheme): ThemeContrastReport {
  const bg = theme.mode === 'dark' ? DARK_BG : LIGHT_BG;
  const onPrimary = contrastRatio(readableTextOn(theme.primary), theme.primary);
  const primaryOnBg = contrastRatio(theme.primary, bg);
  const onAccent = contrastRatio(readableTextOn(theme.accent), theme.accent);
  const warnings: string[] = [];
  if (onPrimary < 4.5) warnings.push('Button text on the primary colour is below AA (4.5:1).');
  if (primaryOnBg < 4.5) warnings.push('The primary colour is too light for links on the page background; a darker shade will be used for text.');
  if (onAccent < 4.5) warnings.push('Text on the accent colour is below AA (4.5:1).');
  return { onPrimary, primaryOnBg, onAccent, passes: warnings.length === 0, warnings };
}

/* ── CSS variables ──────────────────────────────────────────────────────── */

const LIGHT_BG = '#ffffff';
const DARK_BG = '#0b1220';

export function themeToCssVars(theme: SiteTheme, opts: { liteMode?: boolean } = {}): Record<string, string> {
  const t = normaliseTheme(theme);
  const dark = t.mode === 'dark';
  const bg = dark ? DARK_BG : LIGHT_BG;
  const surface = dark ? '#111a2e' : '#f8fafc';
  const text = dark ? '#e2e8f0' : '#0f172a';
  const muted = dark ? '#a3b1c6' : '#475569';
  const body = opts.liteMode ? fontByKey('system') : fontByKey(t.font);
  const heading = opts.liteMode ? fontByKey('system') : fontByKey(t.headingFont ?? t.font);
  return {
    '--site-primary': t.primary,
    '--site-primary-strong': shade(t.primary, 0.18),
    '--site-primary-soft': dark ? shade(t.primary, 0.7) : shade(t.primary, -0.88),
    '--site-on-primary': readableTextOn(t.primary),
    '--site-primary-text': ensureContrast(t.primary, bg),
    '--site-accent': t.accent,
    '--site-accent-soft': dark ? shade(t.accent, 0.7) : shade(t.accent, -0.85),
    '--site-on-accent': readableTextOn(t.accent),
    '--site-accent-text': ensureContrast(t.accent, bg),
    '--site-bg': bg,
    '--site-surface': surface,
    '--site-surface-2': dark ? '#16213a' : '#eef2f7',
    '--site-text': text,
    '--site-muted': muted,
    '--site-border': dark ? '#24324d' : '#e2e8f0',
    '--site-radius': SITE_RADII[t.radius],
    '--site-radius-lg': t.radius === 'none' ? '0px' : `calc(${SITE_RADII[t.radius]} * 1.6)`,
    '--site-font': body.stack,
    '--site-heading-font': heading.stack,
  };
}

/** Google Fonts stylesheet URL for the theme, or null when nothing to fetch. */
export function themeFontUrl(theme: SiteTheme): string | null {
  const families = Array.from(new Set([fontByKey(theme.font), fontByKey(theme.headingFont ?? theme.font)]))
    .map((f) => f.google)
    .filter((g): g is string => Boolean(g));
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
}

/* ── Normalisers (tolerate partial / legacy JSON) ───────────────────────── */

const RADIUS_KEYS = Object.keys(SITE_RADII) as SiteRadius[];

export function normaliseTheme(v: unknown): SiteTheme {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  let radius: SiteRadius = DEFAULT_THEME.radius;
  if (typeof o.radius === 'string' && (RADIUS_KEYS as string[]).includes(o.radius)) radius = o.radius as SiteRadius;
  else if (typeof o.radius === 'number') radius = o.radius <= 0 ? 'none' : o.radius <= 5 ? 'sm' : o.radius <= 12 ? 'md' : o.radius <= 18 ? 'lg' : 'xl';
  const fontKeys = SITE_FONTS.map((f) => f.key) as string[];
  const headerStyles = HEADER_STYLES.map(([k]) => k) as string[];
  const footerStyles = FOOTER_STYLES.map(([k]) => k) as string[];
  const patternKeys = PAGE_BACKGROUNDS.map(([k]) => k) as string[];
  const pageBackground = typeof o.pageBackground === 'string' ? o.pageBackground.trim() : '';
  return {
    primary: isHexColor(o.primary) ? normaliseHex(o.primary) : DEFAULT_THEME.primary,
    accent: isHexColor(o.accent) ? normaliseHex(o.accent) : DEFAULT_THEME.accent,
    font: typeof o.font === 'string' && fontKeys.includes(o.font) ? (o.font as SiteFontKey) : DEFAULT_THEME.font,
    headingFont: typeof o.headingFont === 'string' && fontKeys.includes(o.headingFont) ? (o.headingFont as SiteFontKey) : undefined,
    radius,
    mode: o.mode === 'dark' ? 'dark' : 'light',
    headerStyle: typeof o.headerStyle === 'string' && headerStyles.includes(o.headerStyle) ? (o.headerStyle as SiteHeaderStyle) : 'modern',
    footerStyle: typeof o.footerStyle === 'string' && footerStyles.includes(o.footerStyle) ? (o.footerStyle as SiteFooterStyle) : 'modern',
    layout: o.layout === 'boxed' ? 'boxed' : 'full',
    pageBackground: patternKeys.includes(pageBackground) ? pageBackground : /^https:\/\//i.test(pageBackground) ? pageBackground : 'none',
  };
}

function normaliseTopBarLinks(v: unknown): SiteTopBarLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === 'object' && typeof (i as Record<string, unknown>).label === 'string' && typeof (i as Record<string, unknown>).href === 'string')
    .slice(0, 4)
    .map((i) => ({ label: i.label as string, labelBn: typeof i.labelBn === 'string' && i.labelBn ? (i.labelBn as string) : undefined, href: i.href as string }));
}

function normaliseTopBar(v: unknown): SiteTopBarSettings | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return {
    showDate: o.showDate === true,
    showContact: o.showContact !== false,
    showSocial: o.showSocial !== false,
    loginLinks: normaliseTopBarLinks(o.loginLinks),
  };
}

function normaliseHex(h: string): string {
  const s = h.trim();
  return s.startsWith('#') ? s.toLowerCase() : `#${s.toLowerCase()}`;
}

function normaliseNavItems(v: unknown, depth = 0): NavItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((i) => i && typeof i === 'object' && typeof (i as NavItem).label === 'string')
    .map((i) => {
      const item = i as NavItem;
      return {
        label: item.label,
        labelBn: typeof item.labelBn === 'string' && item.labelBn ? item.labelBn : undefined,
        href: typeof item.href === 'string' ? item.href : '#',
        children: depth < 1 ? normaliseNavItems(item.children, depth + 1) : undefined,
      };
    });
}

export function normaliseNavigation(v: unknown): SiteNavigation {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { header: normaliseNavItems(o.header), footer: normaliseNavItems(o.footer) };
}

function normaliseShop(v: unknown): SiteSettings['shop'] {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, any>;
  return {
    enabled: o.enabled === true,
    currency: 'BDT',
    shippingFee: Number.isFinite(Number(o.shippingFee)) ? Number(o.shippingFee) : 0,
    freeShippingOver: o.freeShippingOver == null ? null : Number(o.freeShippingOver) || null,
    codEnabled: o.codEnabled !== false,
    notifyEmails: Array.isArray(o.notifyEmails) ? o.notifyEmails.filter((e: unknown) => typeof e === 'string') : [],
    termsUrl: typeof o.termsUrl === 'string' && o.termsUrl ? o.termsUrl : undefined,
  };
}

function normaliseCourses(v: unknown): SiteSettings['courses'] {
  if (!v || typeof v !== 'object') return undefined;
  return { enabled: (v as Record<string, any>).enabled === true };
}

/** `settings.hotlines` (whitelisted — §7.6): school-wide emergency numbers, editable once and shown by the `HotlineList` block on every page. */
// The admin settings screen saves hotlines as `{ phone }` and links as
// `{ url }`; blocks read `number` / `href`. Accept both spellings here so
// whatever the school saved shows up on the public site.
const firstString = (o: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
  return undefined;
};
const isObj = (i: unknown): i is Record<string, unknown> => Boolean(i) && typeof i === 'object';

function normaliseHotlines(v: unknown): SiteSettings['hotlines'] {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter(isObj)
    .slice(0, 12)
    .map((i) => ({ number: firstString(i, 'number', 'phone') ?? '', label: typeof i.label === 'string' ? i.label : undefined, labelBn: typeof i.labelBn === 'string' ? i.labelBn : undefined }))
    .filter((i) => i.number);
  return out.length ? out : undefined;
}

/** `settings.importantLinks` (whitelisted — §7.6): shown by `ImportantLinks` when set. */
function normaliseLinkList(v: unknown): Array<{ label: string; labelBn?: string; href: string }> | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter(isObj)
    .slice(0, 20)
    .map((i) => ({ label: firstString(i, 'label') ?? '', labelBn: typeof i.labelBn === 'string' ? i.labelBn : undefined, href: firstString(i, 'href', 'url') ?? '' }))
    .filter((i) => i.label && i.href);
  return out.length ? out : undefined;
}

/** `settings.eServices` (whitelisted — §7.6): shown by `EServices` when set; same shape as `importantLinks` plus an optional icon key. */
function normaliseEServices(v: unknown): SiteSettings['eServices'] {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter(isObj)
    .slice(0, 20)
    .map((i) => ({
      label: firstString(i, 'label') ?? '',
      labelBn: typeof i.labelBn === 'string' ? i.labelBn : undefined,
      href: firstString(i, 'href', 'url') ?? '',
      icon: typeof i.icon === 'string' ? i.icon : undefined,
    }))
    .filter((i) => i.label && i.href);
  return out.length ? out : undefined;
}

export function normaliseSettings(v: unknown): SiteSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, any>;
  const langs = Array.isArray(o.languages) ? (o.languages.filter((l: unknown) => l === 'en' || l === 'bn') as SiteLang[]) : [];
  return {
    ...DEFAULT_SETTINGS,
    siteName: typeof o.siteName === 'string' ? o.siteName : '',
    siteNameBn: typeof o.siteNameBn === 'string' ? o.siteNameBn : undefined,
    tagline: typeof o.tagline === 'string' ? o.tagline : undefined,
    taglineBn: typeof o.taglineBn === 'string' ? o.taglineBn : undefined,
    logoUrl: typeof o.logoUrl === 'string' && o.logoUrl ? o.logoUrl : undefined,
    faviconUrl: typeof o.faviconUrl === 'string' && o.faviconUrl ? o.faviconUrl : undefined,
    social: o.social && typeof o.social === 'object' ? o.social : {},
    analyticsId: typeof o.analyticsId === 'string' && o.analyticsId ? o.analyticsId : undefined,
    defaultLanguage: o.defaultLanguage === 'bn' ? 'bn' : 'en',
    languages: langs.length ? langs : ['en', 'bn'],
    liteMode: o.liteMode === true,
    publicResults: o.publicResults === true,
    showToppers: o.showToppers === true,
    establishedYear: typeof o.establishedYear === 'number' ? o.establishedYear : Number(o.establishedYear) || undefined,
    defaultEnquiryFormId: typeof o.defaultEnquiryFormId === 'string' && o.defaultEnquiryFormId ? o.defaultEnquiryFormId : undefined,
    footerText: typeof o.footerText === 'string' && o.footerText ? o.footerText : undefined,
    footerTextBn: typeof o.footerTextBn === 'string' && o.footerTextBn ? o.footerTextBn : undefined,
    customCss: typeof o.customCss === 'string' && o.customCss ? o.customCss.slice(0, 100_000) : undefined,
    headHtml: typeof o.headHtml === 'string' && o.headHtml ? o.headHtml.slice(0, 50_000) : undefined,
    bodyEndHtml: typeof o.bodyEndHtml === 'string' && o.bodyEndHtml ? o.bodyEndHtml.slice(0, 50_000) : undefined,
    shop: normaliseShop(o.shop),
    courses: normaliseCourses(o.courses),
    topBar: normaliseTopBar(o.topBar),
    hotlines: normaliseHotlines(o.hotlines),
    importantLinks: normaliseLinkList(o.importantLinks),
    eServices: normaliseEServices(o.eServices),
  };
}
