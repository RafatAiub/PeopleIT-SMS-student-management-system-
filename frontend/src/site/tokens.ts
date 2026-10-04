/**
 * Template tokens: `{{institution.name}}`, `{{site.tagline}}`, `{{year}}`…
 * Templates ship sample copy containing tokens; the renderer fills them from
 * the institution's real data at render time, so a template never states a
 * fact about a school that the school didn't provide.
 */
import { applyFmt } from './format';
import type { PublicInstitution, PublicProfile, SiteLang, SiteSettings } from './types';

/**
 * `{{key}}` or `{{key|fmt}}` (fmt: date:long | upper | bn-digits | money).
 * Besides the site tokens below, the renderer adds data-scope tokens:
 * `{{item.x}}`, `{{parent.x}}`, `{{page.x}}` and `{{url.q}}` (see binding.ts).
 */
export const TOKEN_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)(?:\s*\|\s*([a-z][a-z:-]*))?\s*\}\}/g;

/** Tokens the editor can offer in a "insert token" helper. */
export const SITE_TOKENS: Array<{ token: string; label: string }> = [
  { token: '{{institution.name}}', label: 'Institution name' },
  { token: '{{institution.phone}}', label: 'Phone' },
  { token: '{{institution.email}}', label: 'Email' },
  { token: '{{institution.address}}', label: 'Address' },
  { token: '{{institution.established}}', label: 'Year established' },
  { token: '{{institution.nameBn}}', label: 'Institution name (Bangla, always)' },
  { token: '{{institution.eiin}}', label: 'EIIN' },
  { token: '{{institution.mpo}}', label: 'MPO / nationalisation info' },
  { token: '{{institution.recognition}}', label: 'Recognition / teaching permission' },
  { token: '{{head.name}}', label: 'Head of institution — name' },
  { token: '{{head.designation}}', label: 'Head of institution — designation' },
  { token: '{{site.name}}', label: 'Site name' },
  { token: '{{site.tagline}}', label: 'Tagline' },
  { token: '{{year}}', label: 'Current year' },
];

export type TokenMap = Record<string, string | undefined>;

/** Profile facts (`GET /data/profile`, Track B §7.3) — optional; blank tokens when not yet fetched. */
export type TokenProfileInput = Partial<Pick<PublicProfile, 'nameBn' | 'eiin' | 'mpoInfo' | 'recognitionInfo'>> & {
  headOfInstitution?: { name?: string; designation?: string } | null;
} | null;

export function buildSiteTokens(input: {
  institution?: Partial<PublicInstitution> | null;
  settings?: Partial<SiteSettings> | null;
  lang?: SiteLang;
  now?: Date;
  profile?: TokenProfileInput;
}): TokenMap {
  const { institution: inst, settings: s, lang = 'en', profile } = input;
  const bn = lang === 'bn';
  const instName = (bn && (profile?.nameBn || inst?.nameBn)) || inst?.name || undefined;
  const siteName = (bn && s?.siteNameBn) || s?.siteName || instName;
  return {
    'institution.name': instName,
    'institution.nameBn': profile?.nameBn || inst?.nameBn,
    'institution.phone': inst?.contact?.phone,
    'institution.email': inst?.contact?.email,
    'institution.address': inst?.contact?.address,
    'institution.website': inst?.contact?.website,
    'institution.established':
      inst?.establishedYear != null && inst.establishedYear !== '' ? String(inst.establishedYear) : s?.establishedYear ? String(s.establishedYear) : undefined,
    'institution.eiin': profile?.eiin,
    'institution.mpo': profile?.mpoInfo,
    'institution.recognition': profile?.recognitionInfo,
    'head.name': profile?.headOfInstitution?.name,
    'head.designation': profile?.headOfInstitution?.designation,
    'site.name': siteName,
    'site.tagline': (bn && s?.taglineBn) || s?.tagline || undefined,
    year: String((input.now ?? new Date()).getFullYear()),
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface FillOptions {
  /** HTML-escape substituted values (use for rich text / HTML strings). */
  escape?: boolean;
  /** Leave unknown/empty tokens in place (editor) instead of removing them (public). */
  keepMissing?: boolean;
  /** Language for `|date:long` style formats (default en). */
  lang?: SiteLang;
  /** Keep `{{item.x}}` / `{{parent.x}}` / `{{page.x}}` / `{{url.x}}` untouched (they fill at render time, per item). */
  keepScopeTokens?: boolean;
}

export const SCOPE_TOKEN_RE = /^(item|parent|page|url)\./;

export function hasTokens(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  const found = TOKEN_RE.test(text);
  TOKEN_RE.lastIndex = 0;
  return found;
}

/** Replace every `{{token}}` in `text`. Missing values become '' unless `keepMissing`. */
export function fillTokens(text: string, tokens: TokenMap, opts: FillOptions = {}): string {
  if (!text || text.indexOf('{{') === -1) return text;
  return text.replace(TOKEN_RE, (match, key: string, fmt?: string) => {
    if (opts.keepScopeTokens && SCOPE_TOKEN_RE.test(key)) return match;
    const raw = tokens[key];
    if (raw == null || raw === '') return opts.keepMissing ? match : '';
    const v = fmt ? applyFmt(raw, fmt, opts.lang) : raw;
    return opts.escape ? escapeHtml(v) : v;
  });
}

/**
 * Deep-fill every string in a JSON value (Puck data, template pages). Keys
 * listed in `skipKeys` (ids, types, URLs by default) are left untouched.
 */
export function fillTokensDeep<T>(value: T, tokens: TokenMap, opts: FillOptions & { skipKeys?: string[] } = {}): T {
  const skip = new Set(opts.skipKeys ?? ['id', 'type']);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return fillTokens(v, tokens, opts);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = skip.has(k) ? val : walk(val);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

/** Collapse whitespace left behind when a token filled to '' ("Call  today"). */
export function tidyFilled(text: string): string {
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?।])/g, '$1').trim();
}
