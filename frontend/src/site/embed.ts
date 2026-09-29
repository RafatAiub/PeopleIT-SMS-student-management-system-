/**
 * Pure URL helpers for embeds: the iframe allow-list, video URL parsing and
 * the OpenStreetMap embed URL. No DOM, so these are unit-tested directly.
 */

export interface IframeRule {
  host: string;
  /** Allowed path prefixes; omitted = any path on that host. */
  paths?: string[];
}

/** Only https iframes from these hosts survive the Embed/HTML sanitiser. */
export const IFRAME_ALLOW_LIST: IframeRule[] = [
  { host: 'www.youtube.com', paths: ['/embed/'] },
  { host: 'youtube.com', paths: ['/embed/'] },
  { host: 'www.youtube-nocookie.com', paths: ['/embed/'] },
  { host: 'player.vimeo.com', paths: ['/video/'] },
  { host: 'www.google.com', paths: ['/maps/embed', '/maps/d/embed'] },
  { host: 'maps.google.com', paths: ['/maps'] },
  { host: 'www.openstreetmap.org', paths: ['/export/embed.html'] },
  { host: 'docs.google.com', paths: ['/forms/', '/presentation/', '/document/', '/spreadsheets/'] },
  { host: 'drive.google.com', paths: ['/file/'] },
  { host: 'calendar.google.com', paths: ['/calendar/embed'] },
  { host: 'www.facebook.com', paths: ['/plugins/'] },
  { host: 'open.spotify.com', paths: ['/embed/'] },
  { host: 'www.canva.com', paths: ['/design/'] },
];

export function isAllowedIframeSrc(src: string | null | undefined, rules: IframeRule[] = IFRAME_ALLOW_LIST): boolean {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  const rule = rules.find((r) => r.host === host);
  if (!rule) return false;
  if (!rule.paths) return true;
  return rule.paths.some((p) => url.pathname.startsWith(p));
}

export type VideoEmbed =
  | { kind: 'youtube'; id: string; src: string }
  | { kind: 'vimeo'; id: string; src: string }
  | { kind: 'file'; src: string }
  | null;

const YT_ID = /^[a-zA-Z0-9_-]{6,15}$/;

/** YouTube / Vimeo page URLs → privacy-friendly embed URLs; direct video files pass through. */
export function toVideoEmbed(input: string | null | undefined): VideoEmbed {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  let yt: string | null = null;
  if (host === 'youtu.be') yt = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') yt = url.searchParams.get('v');
    else {
      const m = /^\/(embed|shorts|live)\/([^/?#]+)/.exec(url.pathname);
      if (m) yt = m[2];
    }
  }
  if (yt && YT_ID.test(yt)) return { kind: 'youtube', id: yt, src: `https://www.youtube-nocookie.com/embed/${yt}` };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = /(\d{5,12})/.exec(url.pathname);
    if (m) return { kind: 'vimeo', id: m[1], src: `https://player.vimeo.com/video/${m[1]}` };
    return null;
  }
  if (url.protocol === 'https:' && /\.(mp4|webm|ogg|mov)$/i.test(url.pathname)) return { kind: 'file', src: url.toString() };
  return null;
}

/** OpenStreetMap iframe URL for a point with a zoom-ish bounding box. */
export function osmEmbedUrl(lat: number, lng: number, zoom = 15): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const z = Math.max(3, Math.min(19, Math.round(zoom)));
  const d = 360 / Math.pow(2, z) / 2;
  const bbox = [lng - d, lat - d / 2, lng + d, lat + d / 2].map((n) => n.toFixed(5)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Only allow safe link targets in blocks (no javascript:, data: etc.). */
export function safeHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  const h = href.trim();
  if (!h) return undefined;
  if (h.startsWith('/') || h.startsWith('#') || h.startsWith('?')) return h;
  try {
    const u = new URL(h);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? u.toString() : undefined;
  } catch {
    // Relative path without a leading slash (e.g. "about").
    return /^[a-z0-9][a-z0-9/_\-.]*$/i.test(h) ? `/${h}` : undefined;
  }
}

export function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}
