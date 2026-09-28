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
  window.SITE = Object.assign({}, SITE_DATA, {
    navigate: function (path) { send({ type: 'navigate', path: String(path == null ? '/' : path) }); },
    addToCart: function (slug, qty) { send({ type: 'addToCart', slug: String(slug == null ? '' : slug), qty: Number(qty) || 1 }); },
    openCart: function () { send({ type: 'openCart' }); },
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
