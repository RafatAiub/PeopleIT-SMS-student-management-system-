/**
 * HTML sanitisers for rich text and the Embed/HTML block (DOMPurify).
 * Two private DOMPurify instances so hooks never leak into other code.
 */
import DOMPurify from 'dompurify';
import { isAllowedIframeSrc } from './embed';

type Purifier = ReturnType<typeof DOMPurify>;

let richPurifier: Purifier | null = null;
let embedPurifier: Purifier | null = null;

function canPurify(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function addLinkHook(p: Purifier) {
  p.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
    }
  });
}

function getRich(): Purifier {
  if (!richPurifier) {
    richPurifier = DOMPurify(window);
    addLinkHook(richPurifier);
  }
  return richPurifier;
}

function getEmbed(): Purifier {
  if (!embedPurifier) {
    embedPurifier = DOMPurify(window);
    addLinkHook(embedPurifier);
    embedPurifier.addHook('uponSanitizeElement', (node, data) => {
      if (data.tagName === 'iframe') {
        const el = node as Element;
        if (!isAllowedIframeSrc(el.getAttribute('src'))) el.parentNode?.removeChild(el);
      }
    });
    embedPurifier.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'IFRAME') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation allow-forms');
        if (!node.getAttribute('title')) node.setAttribute('title', 'Embedded content');
      }
    });
  }
  return embedPurifier;
}

const RICH_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'object', 'embed'],
  FORBID_ATTR: ['style', 'onerror', 'onload'],
};

/** Rich text from the editor (Puck richtext → HTML string). */
export function sanitizeRichText(html: string): string {
  if (!html) return '';
  if (!canPurify()) return '';
  return getRich().sanitize(html, RICH_CONFIG) as string;
}

const EMBED_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'width', 'height', 'title'],
  FORBID_TAGS: ['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base'],
  FORBID_ATTR: ['srcdoc', 'onerror', 'onload'],
};

/** Embed/HTML block: basic HTML plus iframes from the allow-list only. */
export function sanitizeEmbedHtml(html: string): string {
  if (!html) return '';
  if (!canPurify()) return '';
  return getEmbed().sanitize(html, EMBED_CONFIG) as string;
}

/* ── Custom modules (Liquid output, W14) ─────────────────────────────────── */

let modulePurifier: Purifier | null = null;
/** Set only for the duration of one synchronous `sanitize` call. */
let moduleHrefMapper: ((href: string) => string) | null = null;

function getModule(): Purifier {
  if (!modulePurifier) {
    modulePurifier = DOMPurify(window);
    addLinkHook(modulePurifier);
    modulePurifier.addHook('uponSanitizeElement', (node, data) => {
      if (data.tagName === 'iframe') {
        const el = node as Element;
        if (!isAllowedIframeSrc(el.getAttribute('src'))) el.parentNode?.removeChild(el);
      }
    });
    modulePurifier.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && moduleHrefMapper) {
        const href = node.getAttribute('href') ?? '';
        if (href.startsWith('/') && !href.startsWith('//')) node.setAttribute('href', moduleHrefMapper(href));
      }
      if (node.tagName === 'IFRAME') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation');
        if (!node.getAttribute('title')) node.setAttribute('title', 'Embedded content');
      }
    });
  }
  return modulePurifier;
}

const MODULE_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'loading', 'target', 'title'],
  FORBID_TAGS: ['script', 'style', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'link', 'meta', 'base', 'frame', 'frameset', 'noscript'],
  FORBID_ATTR: ['srcdoc', 'formaction', 'onerror', 'onload'],
  ALLOW_DATA_ATTR: true,
};

/**
 * Rendered custom-module HTML: rich HTML + SVG + inline styles and data-*
 * attributes, allow-listed iframes; never scripts, forms or <style> (module
 * CSS is scoped and injected separately). `mapHref` rewrites site-relative
 * links (`/teachers/x`) to the site's base path.
 */
export function sanitizeModuleHtml(html: string, mapHref?: (href: string) => string): string {
  if (!html) return '';
  if (!canPurify()) return '';
  moduleHrefMapper = mapHref ?? null;
  try {
    return getModule().sanitize(html, MODULE_CONFIG) as string;
  } finally {
    moduleHrefMapper = null;
  }
}
