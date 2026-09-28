// =============================================================================
// Sites — pure logic (no database, no network). Unit-tested in
// tests/sites-logic.test.ts.
//
//   - sanitiser for Puck page data / HTML strings and plain-text form values
//   - Puck data shape validation
//   - form definition + submission validation
//   - version pruning
//   - slug helpers, default site JSON, public name masking
//   - sitemap.xml / robots.txt builders
// =============================================================================

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_VERSIONS_PER_PAGE = 30;
/** Serialized Puck data larger than this is rejected (inline data: images belong on Cloudinary). */
export const MAX_PAGE_DATA_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 40;

/** iframe hosts an Embed/HTML block may load. Everything else is stripped. */
export const IFRAME_HOST_ALLOWLIST = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'www.google.com',
  'maps.google.com',
  'www.openstreetmap.org',
  'openstreetmap.org',
  'docs.google.com',
  'calendar.google.com',
  'www.facebook.com',
  'drive.google.com',
];

// ── Sanitiser ────────────────────────────────────────────────────────────────

const DANGEROUS_BLOCK_TAGS = ['script', 'style', 'object', 'embed', 'applet', 'noscript', 'template', 'xml'];
const DANGEROUS_VOID_TAGS = ['base', 'meta', 'link', 'frame', 'frameset'];
const FORM_TAGS = ['form', 'input', 'button', 'select', 'textarea', 'option'];

function iframeSrcAllowed(src: string): boolean {
  try {
    const url = new URL(src.startsWith('//') ? `https:${src}` : src);
    if (url.protocol !== 'https:') return false;
    return IFRAME_HOST_ALLOWLIST.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n');
}

/** True for a URL that must never be rendered as a link or resource. */
export function isDangerousUrl(value: string): boolean {
  // Browsers decode character references in attribute values and ignore
  // whitespace/control characters inside the scheme.
  // eslint-disable-next-line no-control-regex
  const compact = decodeEntities(value).replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
  if (/^(javascript|vbscript|livescript|mocha):/.test(compact)) return true;
  // data: is only acceptable for raster images.
  if (compact.startsWith('data:') && !/^data:image\/(png|jpe?g|gif|webp|avif);/.test(compact)) return true;
  return false;
}

/**
 * Conservative HTML scrubber for strings stored in page data. It is not a full
 * HTML parser; it removes everything that can execute or exfiltrate:
 * script-like elements, event-handler attributes, javascript:/vbscript: URLs,
 * form controls, and iframes whose src is not on the allow-list. Plain text
 * (including a literal "<" in "Grade < 5") passes through unchanged.
 */
export function sanitizeHtml(input: string): string {
  let out = input;
  // Remove NUL bytes, which some parsers treat as terminators.
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\u0000/g, '');
  // HTML comments can hide conditional-comment payloads.
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of DANGEROUS_BLOCK_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }
  for (const tag of [...DANGEROUS_VOID_TAGS, ...FORM_TAGS]) {
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }
  // iframes: keep only allow-listed https sources.
  out = out.replace(/<iframe\b([^>]*)>([\s\S]*?<\/iframe\s*>)?/gi, (match, attrs: string) => {
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const value = src ? (src[1] ?? src[2] ?? src[3] ?? '') : '';
    return value && iframeSrcAllowed(value) ? match : '';
  });
  // Event handlers: onclick=, onerror=, … (quoted or not). Repeated until
  // stable, because a tag can carry several handlers.
  let prev: string;
  do {
    prev = out;
    out = out.replace(/(<[^>]*?)[\s/]+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '$1');
  } while (out !== prev);
  // Dangerous URLs inside href/src/action/formaction/xlink:href/style url().
  out = out.replace(
    /([\s/](?:href|src|action|formaction|xlink:href|poster|srcset|background)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, prefix: string, d?: string, s?: string, u?: string) => {
      const value = d ?? s ?? u ?? '';
      return isDangerousUrl(value) ? `${prefix}"#"` : match;
    },
  );
  out = out.replace(/([\s/]style\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (match, prefix: string, d?: string, s?: string) => {
    const value = d ?? s ?? '';
    return /expression\s*\(|javascript:|url\s*\(\s*['"]?\s*(javascript|vbscript|data:(?!image\/))/i.test(value)
      ? `${prefix}""`
      : match;
  });
  return out;
}

const URL_KEY = /(^|_)(href|url|src|link|image|logo|favicon|poster|cover|video)$|Url$|Href$|Src$|Image$/i;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class PageDataError extends Error {}

/**
 * Deep-sanitises arbitrary JSON (Puck data, navigation, settings): every string
 * goes through sanitizeHtml, URL-like keys with a dangerous scheme become '',
 * prototype-pollution keys are dropped, and nesting is capped.
 */
export function sanitizeJson(value: unknown, depth = 0, key = ''): unknown {
  if (depth > MAX_DEPTH) throw new PageDataError('Page data is nested too deeply');
  if (typeof value === 'string') {
    if (URL_KEY.test(key) && isDangerousUrl(value.trim())) return '';
    return sanitizeHtml(value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'number' && !Number.isFinite(value) ? null : value;
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeJson(v, depth + 1, key));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      if (v === undefined) continue;
      out[k] = sanitizeJson(v, depth + 1, k);
    }
    return out;
  }
  return null;
}

/** Plain-text value from a public form: tags stripped, control chars removed, trimmed, capped. */
export function sanitizeText(input: string, maxLength = 5000): string {
  return (
    input
      .replace(/<[^>]*>/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .trim()
      .slice(0, maxLength)
  );
}

// ── Puck data ────────────────────────────────────────────────────────────────

export interface PuckData {
  root: { props?: Record<string, unknown>; [k: string]: unknown };
  content: { type: string; props: Record<string, unknown>; [k: string]: unknown }[];
  zones?: Record<string, { type: string; props: Record<string, unknown> }[]>;
}

export function emptyPuckData(): PuckData {
  return { root: { props: {} }, content: [] };
}

function assertComponentList(list: unknown, where: string) {
  if (!Array.isArray(list)) throw new PageDataError(`${where} must be an array`);
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new PageDataError(`${where}[${i}] must be an object`);
    const c = item as Record<string, unknown>;
    if (typeof c.type !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(c.type)) {
      throw new PageDataError(`${where}[${i}].type must be a block name`);
    }
    if (c.props !== undefined && (typeof c.props !== 'object' || c.props === null || Array.isArray(c.props))) {
      throw new PageDataError(`${where}[${i}].props must be an object`);
    }
  });
}

/**
 * Validates the Puck Data envelope, sanitises it, and enforces the size cap.
 * Unknown block types are allowed (the block library is owned by the
 * frontend); only the shape is checked here.
 */
export function normalizePuckData(input: unknown): PuckData {
  if (input === undefined || input === null) return emptyPuckData();
  if (typeof input !== 'object' || Array.isArray(input)) throw new PageDataError('Page data must be an object');
  const raw = input as Record<string, unknown>;
  const root = raw.root ?? { props: {} };
  if (typeof root !== 'object' || root === null || Array.isArray(root)) throw new PageDataError('root must be an object');
  assertComponentList(raw.content ?? [], 'content');
  if (raw.zones !== undefined) {
    if (typeof raw.zones !== 'object' || raw.zones === null || Array.isArray(raw.zones)) {
      throw new PageDataError('zones must be an object');
    }
    for (const [zone, list] of Object.entries(raw.zones as Record<string, unknown>)) {
      assertComponentList(list, `zones.${zone}`);
    }
  }
  const clean = sanitizeJson({ ...raw, root, content: raw.content ?? [] }) as PuckData;
  const bytes = Buffer.byteLength(JSON.stringify(clean), 'utf8');
  if (bytes > MAX_PAGE_DATA_BYTES) {
    throw new PageDataError(
      `Page data is too large (${Math.round(bytes / 1024)} KB, limit ${MAX_PAGE_DATA_BYTES / 1024} KB). Upload images to the media library instead of pasting them.`,
    );
  }
  return clean;
}

// ── Slugs ────────────────────────────────────────────────────────────────────

/** Single path segment, lowercase. '' is reserved for the home page. */
export const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_PAGE_SLUGS = new Set(['_home', 'api', 'preview', 'sitemap.xml', 'robots.txt', 'admin', 'login']);
export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'smtp', 'ftp', 'cpanel', 'webmail', 'ns1', 'ns2', 'static', 'cdn', 'assets',
  'dashboard', 'status', 'help', 'support', 'docs', 'blog', 'dev', 'staging', 'test',
]);

/** '_home' (the URL token for the home page) ↔ '' (stored slug). */
export function slugFromParam(param: string): string {
  return param === '_home' ? '' : param.toLowerCase();
}

export function slugify(input: string, maxLength = 80): string {
  const s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return s;
}

/** Picks `base`, `base-2`, `base-3`, … not present in `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = base || 'post';
  if (!set.has(root)) return root;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${root}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** Subdomain default derived from an institution slug (safe for DNS). */
export function subdomainFromSlug(slug: string): string {
  let s = slugify(slug, 63);
  if (!s) s = 'school';
  if (RESERVED_SUBDOMAINS.has(s)) s = `${s}-school`;
  return s;
}

// ── Versions ─────────────────────────────────────────────────────────────────

/**
 * Given versions (any order), returns the ids beyond the newest `keep`.
 * Ties on createdAt are broken by id so the result is deterministic.
 */
export function versionsToPrune(
  versions: { id: string; createdAt: Date }[],
  keep = MAX_VERSIONS_PER_PAGE,
): string[] {
  if (versions.length <= keep) return [];
  const sorted = [...versions].sort((a, b) => {
    const d = b.createdAt.getTime() - a.createdAt.getTime();
    return d !== 0 ? d : b.id.localeCompare(a.id);
  });
  return sorted.slice(keep).map((v) => v.id);
}

// ── Forms ────────────────────────────────────────────────────────────────────

export const FORM_FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox'] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
}

/** Keys an ENQUIRY form must carry (mapped onto AdmissionEnquiry). */
export const ENQUIRY_REQUIRED_KEYS = ['studentName', 'phone'] as const;
/** Honeypot input name — bots fill it, people never see it. */
export const HONEYPOT_FIELD = 'website';

/** Structural problems in a form definition (empty = valid). */
export function validateFormDefinition(fields: FormField[], target: 'ENQUIRY' | 'INBOX'): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.key)) errors.push(`Duplicate field key "${f.key}"`);
    seen.add(f.key);
    if (f.key === HONEYPOT_FIELD) errors.push(`"${HONEYPOT_FIELD}" is reserved`);
    if ((f.type === 'select' || f.type === 'radio') && (!f.options || f.options.length === 0)) {
      errors.push(`Field "${f.key}" needs at least one option`);
    }
  }
  if (target === 'ENQUIRY') {
    for (const key of ENQUIRY_REQUIRED_KEYS) {
      const field = fields.find((f) => f.key === key);
      if (!field) errors.push(`An admission-enquiry form needs a "${key}" field`);
      else if (!field.required) errors.push(`Field "${key}" must be required on an admission-enquiry form`);
    }
  }
  return errors;
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{5,19}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_LEN: Record<FormFieldType, number> = {
  text: 300,
  textarea: 5000,
  email: 200,
  phone: 25,
  number: 30,
  date: 10,
  select: 200,
  radio: 200,
  checkbox: 10,
};

export interface FormValidationResult {
  ok: boolean;
  /** Clean values for known fields only; unknown keys are dropped. */
  values: Record<string, string | boolean>;
  errors: { field: string; message: string }[];
}

/** Validates a public submission against the form's fields. Never trusts client keys. */
export function validateSubmission(fields: FormField[], input: Record<string, unknown>): FormValidationResult {
  const values: Record<string, string | boolean> = {};
  const errors: { field: string; message: string }[] = [];

  for (const f of fields) {
    const raw = input[f.key];
    if (f.type === 'checkbox') {
      const checked = raw === true || raw === 'true' || raw === 'on' || raw === '1';
      if (f.required && !checked) errors.push({ field: f.key, message: `${f.label} is required` });
      values[f.key] = checked;
      continue;
    }
    const str = raw === undefined || raw === null ? '' : typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
    const value = sanitizeText(str, MAX_LEN[f.type]);
    if (!value) {
      if (f.required) errors.push({ field: f.key, message: `${f.label} is required` });
      continue;
    }
    switch (f.type) {
      case 'email':
        if (!EMAIL_RE.test(value)) errors.push({ field: f.key, message: `${f.label} must be a valid email` });
        break;
      case 'phone':
        if (!PHONE_RE.test(value)) errors.push({ field: f.key, message: `${f.label} must be a valid phone number` });
        break;
      case 'number':
        if (!Number.isFinite(Number(value))) errors.push({ field: f.key, message: `${f.label} must be a number` });
        break;
      case 'date':
        if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
          errors.push({ field: f.key, message: `${f.label} must be a date (YYYY-MM-DD)` });
        }
        break;
      case 'select':
      case 'radio':
        if (!(f.options ?? []).includes(value)) errors.push({ field: f.key, message: `${f.label} has an invalid choice` });
        break;
      default:
        break;
    }
    values[f.key] = value;
  }
  return { ok: errors.length === 0, values, errors };
}

/** Maps an ENQUIRY form's clean values onto the enquiry fields. */
export function mapEnquiryValues(values: Record<string, string | boolean>) {
  const s = (k: string) => (typeof values[k] === 'string' && values[k] ? (values[k] as string) : undefined);
  const known = new Set(['studentName', 'guardianName', 'phone', 'email', 'classInterested', 'message']);
  const extras = Object.entries(values)
    .filter(([k, v]) => !known.has(k) && v !== '' && v !== false)
    .map(([k, v]) => `${k}: ${v === true ? 'yes' : v}`);
  const noteParts = [s('message') ? `Website message: ${s('message')}` : null, ...extras].filter(Boolean);
  return {
    studentName: s('studentName') ?? '',
    guardianName: s('guardianName') ?? null,
    phone: s('phone') ?? '',
    email: s('email') ?? null,
    classInterested: s('classInterested') ?? null,
    notes: noteParts.length ? noteParts.join('\n') : null,
  };
}

// ── Public-safe helpers ──────────────────────────────────────────────────────

/** "Rahim Uddin" → "Rahim U." — used for the toppers list. */
export function maskName(firstName: string, lastName: string): string {
  const first = (firstName || '').trim().split(/\s+/)[0] ?? '';
  const initial = (lastName || '').trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

export interface SiteSettings {
  siteName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  social: Record<string, string>;
  analyticsId: string | null;
  defaultLanguage: 'en' | 'bn';
  languages: ('en' | 'bn')[];
  liteMode: boolean;
  publicResults: boolean;
  showToppers: boolean;
  establishedYear: number | null;
  [k: string]: unknown;
}

export function defaultTheme() {
  return { primary: '#1d4ed8', accent: '#f59e0b', font: 'Inter', radius: 'md', mode: 'light' };
}

export function defaultNavigation() {
  return { header: [{ label: 'Home', labelBn: 'হোম', href: '/' }], footer: [] as unknown[] };
}

export function defaultSettings(institution: { name: string; logoUrl?: string | null; defaultLanguage?: string | null }): SiteSettings {
  const lang = institution.defaultLanguage === 'bn' ? 'bn' : 'en';
  return {
    siteName: institution.name,
    logoUrl: institution.logoUrl ?? null,
    faviconUrl: null,
    social: {},
    analyticsId: null,
    defaultLanguage: lang,
    languages: ['en', 'bn'],
    liteMode: false,
    publicResults: false,
    showToppers: false,
    establishedYear: null,
  };
}

/** Reads the boolean gates from a stored settings blob (defaults: off). */
export function readGates(settings: unknown): { publicResults: boolean; showToppers: boolean; establishedYear: number | null } {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const year = Number(s.establishedYear);
  return {
    publicResults: s.publicResults === true,
    showToppers: s.showToppers === true,
    establishedYear: Number.isInteger(year) && year > 1000 && year <= new Date().getFullYear() ? year : null,
  };
}

/** Settings keys exposed on the public resolve endpoint. */
const PUBLIC_SETTING_KEYS = [
  'siteName', 'siteNameBn', 'tagline', 'taglineBn', 'logoUrl', 'faviconUrl', 'social', 'analyticsId', 'defaultLanguage',
  'languages', 'liteMode', 'publicResults', 'showToppers', 'establishedYear', 'footerText', 'footerTextBn',
  'defaultEnquiryFormId',
];

export function publicSettings(settings: unknown): Record<string, unknown> {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_SETTING_KEYS) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

// ── Sitemap / robots ─────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export interface SitemapEntry {
  path: string;
  lastmod?: Date | null;
}

export function buildSitemap(baseUrl: string, entries: SitemapEntry[]): string {
  const base = baseUrl.replace(/\/+$/, '');
  const urls = entries
    .map((e) => {
      const loc = `${base}${e.path.startsWith('/') ? e.path : `/${e.path}`}`;
      const lastmod = e.lastmod ? `<lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : '';
      return `  <url><loc>${xmlEscape(loc)}</loc>${lastmod}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobots(baseUrl: string | null, published: boolean): string {
  if (!published) return 'User-agent: *\nDisallow: /\n';
  const lines = ['User-agent: *', 'Allow: /'];
  if (baseUrl) lines.push(`Sitemap: ${baseUrl.replace(/\/+$/, '')}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

// ── Dates ────────────────────────────────────────────────────────────────────

/**
 * Does a stored date of birth match "YYYY-MM-DD"? DOBs may have been saved as
 * midnight UTC or as local midnight in Bangladesh (UTC+6, i.e. 18:00 UTC the
 * previous day), so both readings are accepted.
 */
export function dobMatches(dob: Date, isoDate: string, tzOffsetHours = 6): boolean {
  const utc = dob.toISOString().slice(0, 10);
  const local = new Date(dob.getTime() + tzOffsetHours * 3600_000).toISOString().slice(0, 10);
  return utc === isoDate || local === isoDate;
}
