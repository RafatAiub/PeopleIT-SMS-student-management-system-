/**
 * Renders user-written `{ html, css, js }` inside a sandboxed iframe (`srcdoc`).
 * Security rule (see docs/redesign/WEBSITE_V2_BRIEF.md §1): the iframe has an
 * opaque origin and **never** gets `allow-same-origin`, so it can't read the
 * app's `localStorage` tokens, cookies or the parent DOM. Custom JS talks to
 * the platform only through the `postMessage` bridge below.
 *
 * Works two ways:
 *  - Inside `<SiteRuntimeProvider>` (the public site, the Code block): reads
 *    theme/site/lang/basePath from context when the matching prop is omitted.
 *  - Outside it (Engineer C's code editor live preview): pass `theme` (and
 *    optionally `siteId`/`lang`/`basePath`/`institutionName`) explicitly.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { API_ROOT } from '../api';
import { addProductBySlug } from '../cart';
import { fetchSiteData, isSiteDataSource, SITE_DATA_SOURCES } from '../dataSources';
import { RESERVED_SLUGS } from '../routes';
import { useSiteApi, useSiteRuntime } from '../runtime';
import { DEFAULT_THEME, themeFontUrl, themeToCssVars } from '../theme';
import type { SiteLang, SiteTheme } from '../types';

/**
 * `allow-scripts` lets the user's JS run; `allow-same-origin` is deliberately
 * never included — without it the iframe's origin is opaque ("null"), so
 * script inside it cannot access the parent's storage, cookies or DOM even
 * though scripts execute.
 */
export const SANDBOX_ATTR =
  'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-top-navigation-by-user-activation';

const BRIDGE_SOURCE = 'peoplenit-site-sandbox';

export interface SandboxFrameProps {
  html: string;
  css?: string;
  js?: string;
  /** `'auto'` (default): the frame reports its content height and the iframe grows to fit. A number fixes the height in px. */
  height?: 'auto' | number;
  /** Minimum height in px while auto-height is still settling (avoids a flash of a 0-height frame). */
  minHeight?: number;
  title?: string;
  className?: string;
  theme?: SiteTheme;
  siteId?: string | null;
  lang?: SiteLang;
  basePath?: string;
  institutionName?: string;
  /** Overrides for the bridge's `SITE.navigate` / `addToCart` / `openCart` (defaults use the site runtime). */
  onNavigate?: (path: string) => void;
  onAddToCart?: (slug: string, qty: number) => void;
  onOpenCart?: () => void;
}

export interface BuildSrcDocInput {
  html: string;
  css?: string;
  js?: string;
  theme: SiteTheme;
  liteMode?: boolean;
  siteId?: string | null;
  apiBase?: string;
  lang?: SiteLang;
  basePath?: string;
  institutionName?: string;
}

/** Escapes a closing `</script>`/`</style>` so user content can't break out of its tag early. */
function escapeClosingTag(src: string, tag: 'script' | 'style'): string {
  const re = new RegExp(`</${tag}`, 'gi');
  return src.replace(re, `<\\/${tag}`);
}

/**
 * Pure builder for the iframe `srcdoc` (exported for tests). Includes:
 *  - a base stylesheet with the site's theme CSS variables (same names as
 *    `.site-root`) and its font;
 *  - the user's `css`/`html`/`js`, sandwiched safely;
 *  - the bridge script (`window.SITE`, height reporting).
 */
export function buildSrcDoc(input: BuildSrcDocInput): string {
  const theme = input.theme ?? DEFAULT_THEME;
  const vars = themeToCssVars(theme, { liteMode: input.liteMode });
  const varsCss = Object.entries(vars)
    .map(([k, v]) => `${k}:${String(v).replace(/[<>]/g, '')}`)
    .join(';');
  const fontUrl = themeFontUrl(theme);
  const site = {
    siteId: input.siteId ?? null,
    apiBase: input.apiBase ?? '',
    lang: input.lang ?? 'en',
    basePath: input.basePath ?? '',
    institution: { name: input.institutionName ?? '' },
  };
  const userCss = escapeClosingTag(input.css ?? '', 'style');
  const userJs = escapeClosingTag(input.js ?? '', 'script');
  const dataSources = JSON.stringify(SITE_DATA_SOURCES);

  return `<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${fontUrl ? `<link rel="stylesheet" href="${fontUrl}" />` : ''}
<style>
  :root{${varsCss}}
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:var(--site-font);color:var(--site-text);background:var(--site-bg);line-height:1.6;overflow-wrap:anywhere}
  img,video,iframe{max-width:100%}
  a{color:var(--site-primary-text,inherit)}
</style>
<style>${userCss}</style>
</head>
<body>
${input.html ?? ''}
<script>
(function () {
  var SITE_DATA = ${JSON.stringify(site)};
  function send(msg) {
    try { parent.postMessage(Object.assign({ source: '${BRIDGE_SOURCE}' }, msg), '*'); } catch (e) {}
  }
  var pendingData = {};
  var dataSeq = 0;
  window.SITE = Object.assign({}, SITE_DATA, {
    navigate: function (path) { send({ type: 'navigate', path: String(path == null ? '/' : path) }); },
    addToCart: function (slug, qty) { send({ type: 'addToCart', slug: String(slug == null ? '' : slug), qty: Number(qty) || 1 }); },
    openCart: function () { send({ type: 'openCart' }); },
    /**
     * Fetches a public data source (same allow-list as the visual DataList
     * block — see src/site/dataSources.ts) through the parent, which does the
     * actual request with siteId/preview token the sandbox never has direct
     * access to. Returns a Promise. Unknown sources reject.
     */
    dataSources: ${dataSources},
    data: function (source, params) {
      return new Promise(function (resolve, reject) {
        dataSeq += 1;
        var id = 'd' + Date.now() + '-' + dataSeq;
        pendingData[id] = { resolve: resolve, reject: reject };
        send({ type: 'data', id: id, source: String(source == null ? '' : source), params: params && typeof params === 'object' ? params : {} });
      });
    },
  });
  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || msg.source !== '${BRIDGE_SOURCE}' || msg.type !== 'data-result') return;
    var id = msg.id;
    var pending = pendingData[id];
    if (!pending) return;
    delete pendingData[id];
    if (msg.ok) pending.resolve(msg.data); else pending.reject(new Error(msg.error || 'Request failed'));
  });
  function postHeight() {
    try {
      var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
      send({ type: 'height', height: h });
    } catch (e) {}
  }
  if (typeof ResizeObserver !== 'undefined') {
    try { new ResizeObserver(postHeight).observe(document.documentElement); } catch (e) {}
  }
  window.addEventListener('load', postHeight);
  setTimeout(postHeight, 60);
  setTimeout(postHeight, 350);

  // Link mapping (mirrors the pure \`mapImportedHref\` in site/code/codePage.ts —
  // keep both in sync): a relative link written for a static export
  // ("about.html", "./about.html", "about/", "blog/index.html") is translated
  // to the site-relative path our router understands ("/about", "/blog-page")
  // so imported and hand-written pages can link to each other. External
  // links, mailto:/tel:/javascript: and hash-only anchors are left alone —
  // the browser (or the iframe's own in-page scrolling) handles those natively.
  var RESERVED_SLUGS_ = ${JSON.stringify([...RESERVED_SLUGS])};
  function mapHref(href) {
    var trimmed = href.trim();
    var hashIdx = trimmed.search(/[?#]/);
    var pathPart = hashIdx === -1 ? trimmed : trimmed.slice(0, hashIdx);
    var suffix = hashIdx === -1 ? '' : trimmed.slice(hashIdx);
    pathPart = pathPart.replace(/^\\.\\//, '');
    if (pathPart.charAt(0) === '/') pathPart = pathPart.slice(1);
    pathPart = pathPart.replace(/\\/$/, '');
    pathPart = pathPart.replace(/\\.html?$/i, '');
    if (pathPart === 'index' || pathPart === '') return '/' + suffix;
    var segs = pathPart.split('/').filter(function (s) { return s.length > 0; });
    if (segs.length && segs[segs.length - 1].toLowerCase() === 'index') segs.pop();
    if (!segs.length) return '/' + suffix;
    var slug = segs.join('-').toLowerCase();
    if (RESERVED_SLUGS_.indexOf(slug) !== -1) slug = slug + '-page';
    return '/' + slug + suffix;
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href') || '';
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    if (/^#/.test(href)) return; // in-page anchor: native scroll within the frame
    if (/^([a-z][a-z0-9+.-]*:)?\\/\\//i.test(href)) return; // external / protocol-relative
    var mapped = mapHref(href);
    if (mapped) {
      e.preventDefault();
      window.SITE.navigate(mapped);
    }
  }, true);
})();
</script>
<script>${userJs}</script>
</body>
</html>`;
}

/** True when `data` is a message from our bridge (narrows `unknown` safely). */
function isBridgeMessage(data: unknown): data is { source: string; type: string; [k: string]: unknown } {
  return Boolean(data) && typeof data === 'object' && (data as { source?: unknown }).source === BRIDGE_SOURCE;
}

export function SandboxFrame(props: SandboxFrameProps) {
  const rt = useSiteRuntime();
  const api = useSiteApi();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const heightMode = props.height ?? 'auto';
  const [autoHeight, setAutoHeight] = useState(props.minHeight ?? 80);

  const theme = props.theme ?? rt.theme;
  const siteId = props.siteId !== undefined ? props.siteId : rt.siteId;
  const lang = props.lang ?? rt.lang;
  const basePath = props.basePath ?? rt.basePath;
  const institutionName = props.institutionName ?? rt.institution?.name ?? '';

  const srcDoc = useMemo(
    () =>
      buildSrcDoc({
        html: props.html,
        css: props.css,
        js: props.js,
        theme,
        liteMode: rt.liteMode,
        siteId,
        apiBase: API_ROOT,
        lang,
        basePath,
        institutionName,
      }),
    [props.html, props.css, props.js, theme, rt.liteMode, siteId, lang, basePath, institutionName],
  );

  useEffect(() => {
    function defaultNavigate(path: string) {
      const target = path.startsWith('/') ? `${basePath}${path}` : path;
      if (typeof window !== 'undefined') window.location.assign(target);
    }
    function defaultAddToCart(slug: string, qty: number) {
      if (!siteId || !slug) return;
      void addProductBySlug(siteId, api, slug, qty).catch(() => undefined);
    }
    function defaultOpenCart() {
      defaultNavigate('/cart');
    }
    /**
     * `SITE.data(source, params)`: the sandbox never fetches directly (it has
     * no siteId/preview token and must stay same-origin-free) — it asks the
     * parent, which validates `source` against the shared allow-list
     * (`dataSources.ts`) before making the same request a visual `DataList`
     * block would make, then posts the JSON result back.
     */
    async function handleDataRequest(id: string, source: unknown, params: unknown) {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const reply = (msg: Record<string, unknown>) => {
        try { win.postMessage({ source: BRIDGE_SOURCE, type: 'data-result', id, ...msg }, '*'); } catch { /* frame gone */ }
      };
      if (!isSiteDataSource(source)) { reply({ ok: false, error: `Unknown data source: ${String(source)}` }); return; }
      if (!siteId) { reply({ ok: false, error: 'Not connected' }); return; }
      try {
        const result = await fetchSiteData(siteId, api, source, params && typeof params === 'object' ? (params as Record<string, unknown>) : {});
        reply({ ok: true, data: result });
      } catch (e) {
        reply({ ok: false, error: e instanceof Error ? e.message : 'Request failed' });
      }
    }
    function handler(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!isBridgeMessage(e.data)) return;
      const data = e.data;
      if (data.type === 'height' && heightMode === 'auto') {
        const h = Number(data.height);
        if (Number.isFinite(h)) setAutoHeight(Math.max(props.minHeight ?? 0, h));
      } else if (data.type === 'navigate') {
        (props.onNavigate ?? defaultNavigate)(String(data.path ?? '/'));
      } else if (data.type === 'addToCart') {
        (props.onAddToCart ?? defaultAddToCart)(String(data.slug ?? ''), Number(data.qty) || 1);
      } else if (data.type === 'openCart') {
        (props.onOpenCart ?? defaultOpenCart)();
      } else if (data.type === 'data') {
        void handleDataRequest(String(data.id ?? ''), data.source, data.params);
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [heightMode, props.minHeight, props.onNavigate, props.onAddToCart, props.onOpenCart, siteId, basePath, api]);

  const style = heightMode === 'auto' ? { height: `${autoHeight}px`, minHeight: props.minHeight ?? 80 } : { height: typeof heightMode === 'number' ? `${heightMode}px` : undefined };

  return (
    <iframe
      ref={iframeRef}
      title={props.title ?? 'Custom content'}
      srcDoc={srcDoc}
      sandbox={SANDBOX_ATTR}
      className={props.className}
      style={{ width: '100%', border: 0, display: 'block', ...style }}
      loading="lazy"
    />
  );
}
