/**
 * Pure logic for the ZIP / HTML website import (Track D — see
 * docs/redesign/WEBSITE_V3_PLAN.md §1 "AI website ZIP import" and §3 Track D,
 * and WEBSITE_V2_BRIEF.md §1 for the sandbox rules the imported pages must
 * respect). Everything here is framework- and DOM-free (no `DOMParser`, no
 * browser-only API) so it runs identically in the browser (Vite) and under
 * plain Node for `__tests__/zip-import.test.ts` (see that file's header for
 * the self-running test pattern).
 *
 * `ImportWizard.tsx` is the only caller that talks to the browser: it reads
 * the uploaded `File`, unzips it with `fflate` (also isomorphic), calls into
 * this module for every decision, uploads assets, then calls the page hooks.
 */

// ── Limits (WEBSITE_V3_PLAN.md §3 Track D) ─────────────────────────────────

export const MAX_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_FILES = 500;
/** A single page's Puck data (root.props.code + wrapper) may reach 1 MB. */
export const MAX_PAGE_BYTES = 1024 * 1024;

export interface LimitCheck {
  ok: boolean;
  reason?: string;
}

export function checkZipLimits(fileCount: number, totalBytes: number): LimitCheck {
  if (totalBytes > MAX_ZIP_BYTES) return { ok: false, reason: `The ZIP is larger than 50 MB (${(totalBytes / (1024 * 1024)).toFixed(1)} MB).` };
  if (fileCount > MAX_ZIP_FILES) return { ok: false, reason: `The ZIP has more than 500 files (${fileCount}).` };
  return { ok: true };
}

// ── Zip entry cleanup: junk, path traversal, top-level folder, dist/build ──

export type ZipFiles = Record<string, Uint8Array>;

const IGNORED_DIR_PARTS = new Set(['__MACOSX', 'node_modules', '.git']);
const IGNORED_FILE_NAMES = new Set(['.DS_Store']);

/** A directory marker or a file living inside a directory we never import. */
export function isIgnoredZipPath(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  if (!p || p.endsWith('/')) return true;
  const parts = p.split('/');
  const base = parts[parts.length - 1];
  if (IGNORED_FILE_NAMES.has(base)) return true;
  return parts.some((part) => IGNORED_DIR_PARTS.has(part));
}

/** Path traversal / absolute-path rejection: `..` segments that would escape the ZIP root, or an absolute/drive path. */
export function isUnsafeZipPath(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(p)) return true; // drive letter, e.g. C:\
  if (p.startsWith('/')) return true; // absolute path
  let depth = 0;
  for (const part of p.split('/')) {
    if (part === '..') {
      depth -= 1;
      if (depth < 0) return true;
    } else if (part !== '.' && part !== '') {
      depth += 1;
    }
  }
  return false;
}

/** Resolves `.`/`..` segments in a forward-slash path (assumed already checked for traversal, or being deliberately clamped at the root). */
export function normalizeZipPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

export interface CleanZipResult {
  /** Final path → bytes, junk removed, traversal-free, root folder stripped, `dist`/`build` preferred when it holds `index.html`. */
  files: ZipFiles;
  /** Unsafe paths that were dropped instead of imported. */
  rejectedPaths: string[];
  /** The single wrapping folder that was stripped, if any (e.g. `my-site-export`). */
  strippedPrefix: string;
  /** `dist` or `build` when that folder's contents were preferred over sibling files (e.g. source alongside a build). */
  preferredDist: 'dist' | 'build' | null;
}

/** Cleans raw `fflate.unzipSync` output: drops junk/unsafe entries, strips one wrapping folder, and prefers `dist/`/`build/` when present. */
export function cleanZipEntries(raw: ZipFiles): CleanZipResult {
  const rejectedPaths: string[] = [];
  let kept: ZipFiles = {};

  for (const [rawPath, data] of Object.entries(raw)) {
    const path = rawPath.replace(/\\/g, '/');
    if (isIgnoredZipPath(path)) continue;
    if (isUnsafeZipPath(path)) {
      rejectedPaths.push(rawPath);
      continue;
    }
    kept[normalizeZipPath(path)] = data;
  }

  // Strip a single common top-level folder.
  let strippedPrefix = '';
  const topSegments = new Set(Object.keys(kept).map((p) => p.split('/')[0]));
  if (topSegments.size === 1) {
    const [only] = topSegments;
    if (only && Object.keys(kept).every((p) => p.startsWith(`${only}/`))) {
      strippedPrefix = only;
      const next: ZipFiles = {};
      for (const [p, data] of Object.entries(kept)) next[p.slice(only.length + 1)] = data;
      kept = next;
    }
  }

  // Prefer dist/ or build/ when it holds an index.html (e.g. source committed alongside its build).
  let preferredDist: 'dist' | 'build' | null = null;
  for (const folder of ['dist', 'build'] as const) {
    if (kept[`${folder}/index.html`]) {
      preferredDist = folder;
      break;
    }
  }
  if (preferredDist) {
    const prefix = `${preferredDist}/`;
    const next: ZipFiles = {};
    for (const [p, data] of Object.entries(kept)) {
      if (p.startsWith(prefix)) next[p.slice(prefix.length)] = data;
    }
    kept = next;
  }

  return { files: kept, rejectedPaths, strippedPrefix, preferredDist };
}

// ── Source project / server app / executable rejection ────────────────────

export interface RejectionCheck {
  rejected: boolean;
  reason?: string;
}

const SOURCE_FILE_RE = /(^|\/)src\/.*\.(jsx|tsx|vue|svelte)$/i;
const NEXT_CONFIG_RE = /(^|\/)next\.config\.(js|ts|mjs|cjs)$/i;

/** Claude gives a single HTML file; Bolt/Lovable/v0 give source (WEBSITE_V3_PLAN.md §1). Reject source with no built output. */
export function checkSourceProject(paths: string[]): RejectionCheck {
  const hasPackageJson = paths.includes('package.json');
  const hasBuiltHtml = paths.some((p) => /\.html?$/i.test(p));
  const looksLikeSource = hasPackageJson && (paths.some((p) => SOURCE_FILE_RE.test(p)) || paths.some((p) => NEXT_CONFIG_RE.test(p)));
  if (looksLikeSource && !hasBuiltHtml) {
    return { rejected: true, reason: 'This is source code. Run `npm run build` and upload the dist folder.' };
  }
  return { rejected: false };
}

const NEXT_APP_ROUTER_RE = /(^|\/)app\/.*\/(page|layout)\.(t|j)sx?$/i;
const NEXT_PAGES_API_RE = /(^|\/)pages\/api\/.+\.(t|j)sx?$/i;

/** Next.js `app/` router pages or `pages/api/*` need a server runtime and can't be hosted as static files. */
export function checkServerApp(paths: string[]): RejectionCheck {
  if (paths.some((p) => NEXT_APP_ROUTER_RE.test(p)) || paths.some((p) => NEXT_PAGES_API_RE.test(p))) {
    return { rejected: true, reason: 'This is a server application (Next.js app router or API routes) and can’t be hosted as static files. Export a static build and upload that instead.' };
  }
  return { rejected: false };
}

const EXECUTABLE_RE = /\.(exe|msi|dll|so|dylib|bat|cmd|com|jar|apk|ps1|sh)$/i;

export function checkExecutables(paths: string[]): RejectionCheck {
  if (paths.some((p) => EXECUTABLE_RE.test(p))) {
    return { rejected: true, reason: 'Executable files are not allowed in a website import.' };
  }
  return { rejected: false };
}

// ── Slugs (index.html → home; reserved → -page; dedupe) ────────────────────

/** Mirrors `frontend/src/site/routes.ts`'s `RESERVED_SLUGS` (kept independent: this module must stay DOM/router-free so it runs in Node tests). */
export const RESERVED_IMPORT_SLUGS = ['blog', 'shop', 'cart', 'checkout', 'order', 'courses', 'learn', 'account'] as const;

function slugifySegment(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `htmlPath` is the page's zip-relative path (post `cleanZipEntries`), e.g. `about/index.html`. `used` accumulates slugs already given out (mutated). */
export function slugForPath(htmlPath: string, used: Set<string>): string {
  let p = htmlPath.replace(/\\/g, '/').replace(/^\/+/, '');
  p = p.replace(/\.html?$/i, '');
  let segments = p.split('/').filter(Boolean);
  if (segments.length && segments[segments.length - 1].toLowerCase() === 'index') segments = segments.slice(0, -1);

  let slug: string;
  if (segments.length === 0) {
    slug = 'home';
  } else {
    slug = segments.map(slugifySegment).filter(Boolean).join('-') || 'page';
  }
  if ((RESERVED_IMPORT_SLUGS as readonly string[]).includes(slug)) slug = `${slug}-page`;

  let final = slug;
  let n = 2;
  while (used.has(final)) {
    final = `${slug}-${n}`;
    n += 1;
  }
  used.add(final);
  return final;
}

// ── Local asset path resolution ────────────────────────────────────────────

const SKIP_HREF_RE = /^(data:|mailto:|tel:|javascript:|#)/i;
const EXTERNAL_RE = /^([a-z][a-z0-9+.-]*:)?\/\//i;

/** `null` for external/data/mailto/tel/javascript/hash-only refs; otherwise the resolved zip-relative path. */
export function resolveAssetPath(basePath: string, ref: string): string | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed || SKIP_HREF_RE.test(trimmed) || EXTERNAL_RE.test(trimmed)) return null;
  const clean = trimmed.split(/[?#]/)[0];
  if (!clean) return null;
  const joined = clean.startsWith('/') ? clean.slice(1) : (() => {
    const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : '';
    return baseDir ? `${baseDir}/${clean}` : clean;
  })();
  return normalizeZipPath(joined);
}

// ── CSS `url(...)` rewriting ────────────────────────────────────────────────

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

export interface CssRewriteResult {
  css: string;
  /** Resolved zip-relative paths of every local asset referenced. */
  refs: string[];
}

/**
 * Rewrites local `url(...)` references to an `asset:<resolvedPath>` sentinel
 * (resolved relative to `cssPath`, the CSS file's own zip-relative path).
 * External URLs and `data:` URIs are left untouched. The sentinel is replaced
 * with the real (Cloudinary or data:) URL once assets are uploaded — see
 * `applyAssetUrls`.
 */
export function rewriteCssUrls(css: string, cssPath: string): CssRewriteResult {
  const refs: string[] = [];
  const out = css.replace(CSS_URL_RE, (whole, quote: string, ref: string) => {
    const resolved = resolveAssetPath(cssPath, ref);
    if (!resolved) return whole;
    refs.push(resolved);
    return `url(${quote}asset:${resolved}${quote})`;
  });
  return { css: out, refs };
}

// ── HTML attribute asset rewriting (img/source/video/audio/track, inline style) ──

export interface HtmlAssetRewriteResult {
  html: string;
  refs: string[];
}

function rewriteSrcsetValue(value: string, basePath: string, refs: string[]): string {
  return value
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const spaceIdx = trimmed.search(/\s/);
      const urlPart = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const descriptor = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx);
      const resolved = resolveAssetPath(basePath, urlPart);
      if (!resolved) return part;
      refs.push(resolved);
      return `asset:${resolved}${descriptor}`;
    })
    .join(', ');
}

/** Rewrites `img`/`source`/`video`/`audio`/`track` `src`/`srcset`/`poster`, and any inline `style="url(...)"`, to `asset:` sentinels. */
export function rewriteHtmlAssetRefs(html: string, basePath: string): HtmlAssetRewriteResult {
  const refs: string[] = [];

  let out = html.replace(/<(img|source|video|audio|track)\b([^>]*?)(\/?)>/gi, (whole, tag: string, attrStr: string, selfClose: string) => {
    let a = attrStr;
    a = a.replace(/(\bsrc\s*=\s*)(["'])([^"']*)\2/i, (_m: string, pre: string, q: string, v: string) => {
      const resolved = resolveAssetPath(basePath, v);
      if (!resolved) return `${pre}${q}${v}${q}`;
      refs.push(resolved);
      return `${pre}${q}asset:${resolved}${q}`;
    });
    a = a.replace(/(\bposter\s*=\s*)(["'])([^"']*)\2/i, (_m: string, pre: string, q: string, v: string) => {
      const resolved = resolveAssetPath(basePath, v);
      if (!resolved) return `${pre}${q}${v}${q}`;
      refs.push(resolved);
      return `${pre}${q}asset:${resolved}${q}`;
    });
    a = a.replace(/(\bsrcset\s*=\s*)(["'])([^"']*)\2/i, (_m: string, pre: string, q: string, v: string) => `${pre}${q}${rewriteSrcsetValue(v, basePath, refs)}${q}`);
    return `<${tag}${a}${selfClose}>`;
  });

  out = out.replace(/(\bstyle\s*=\s*)(["'])([^"']*)\2/gi, (_whole: string, pre: string, q: string, v: string) => {
    const { css: rewritten, refs: r } = rewriteCssUrls(v, basePath);
    refs.push(...r);
    return `${pre}${q}${rewritten}${q}`;
  });

  return { html: out, refs };
}

const ASSET_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|ogv|mp3|wav|ogg|pdf|woff2?|ttf|otf|eot)(\?[^"'`]*)?$/i;
const STR_LIT_RE = /(["'`])((?:(?!\1)[^\\\n])*)\1/g;

/** Best-effort: rewrites quoted JS string literals that look like a local asset path to an `asset:` sentinel. */
export function rewriteJsAssetStrings(js: string, basePath: string): { js: string; refs: string[] } {
  const refs: string[] = [];
  const out = js.replace(STR_LIT_RE, (whole: string, quote: string, inner: string) => {
    if (!inner || /^[a-z][a-z0-9+.-]*:/i.test(inner) || inner.startsWith('//')) return whole;
    if (!ASSET_EXT_RE.test(inner)) return whole;
    const resolved = resolveAssetPath(basePath, inner);
    if (!resolved) return whole;
    refs.push(resolved);
    return `${quote}asset:${resolved}${quote}`;
  });
  return { js: out, refs };
}

/** Replaces every `asset:<path>` sentinel with its uploaded URL (or `''` when that asset failed/was skipped). */
export function applyAssetUrls(text: string, urlMap: Map<string, string>): string {
  return text.replace(/asset:([^"'()\s]+)/g, (whole, p: string) => urlMap.get(p) ?? '');
}

// ── HTML page extraction ────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Escapes a closing `</script>`/`</style>` so inlined local script/style content can't break out of its tag early (mirrors `SandboxFrame.tsx`'s `escapeClosingTag`). */
function escapeClosingTag(src: string, tag: 'script' | 'style'): string {
  return src.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
}

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (m && m[1].trim()) return decodeEntities(m[1]).trim().replace(/\s+/g, ' ');
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) {
    const text = decodeEntities(h1[1].replace(/<[^>]+>/g, '')).trim().replace(/\s+/g, ' ');
    if (text) return text;
  }
  return '';
}

function extractDescription(html: string): string | undefined {
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html))) {
    const tag = m[0];
    if (!/\bname\s*=\s*["']description["']/i.test(tag)) continue;
    const cm = /content\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag);
    if (cm) {
      const val = decodeEntities(cm[2]).trim();
      return val || undefined;
    }
  }
  return undefined;
}

interface ParsedAttrs {
  [key: string]: string;
}

function parseAttrs(attrStr: string): ParsedAttrs {
  const attrs: ParsedAttrs = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr))) {
    const name = m[1].toLowerCase();
    const value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
    attrs[name] = decodeEntities(value ?? '');
  }
  return attrs;
}

export interface HtmlExtractResult {
  title: string;
  description?: string;
  /** Body inner HTML (wrapped in a `<div class=… style=…>` when the source `<body>` carried a class/style), with local asset refs rewritten to `asset:` sentinels and kept tags (external stylesheets, external/module scripts) appended in place. */
  html: string;
  /** Concatenated inline `<style>` + local linked CSS, `url(...)` rewritten to `asset:` sentinels. */
  css: string;
  /** Concatenated inline + local `<script>` content, in document order. Empty when `hasModuleScript` is true (see below). */
  js: string;
  /** True when any `<script type="module">` was found — module scripts (and every other script on the page, to preserve relative order) are then kept as `<script>` tags inside `html` instead of being concatenated into `js`, since concatenating ES module syntax into one classic script would break it. */
  hasModuleScript: boolean;
  /** Resolved zip-relative paths of every local asset referenced (images, fonts, video, PDFs, icons — for the upload step). */
  assetRefs: string[];
  warnings: string[];
}

export interface ExtractHtmlPageOptions {
  html: string;
  /** This page's own zip-relative path, e.g. `about/index.html` — the base for resolving local refs. */
  htmlPath: string;
  /** Returns a local file's text content, or `undefined` when it isn't present in the ZIP. */
  readText: (resolvedPath: string) => string | undefined;
}

/** Extracts a code-page `{ html, css, js }` (plus SEO/warnings) from one HTML file — see the module doc comment and WEBSITE_V3_PLAN.md §3 Track D point 4. */
export function extractHtmlPage(opts: ExtractHtmlPageOptions): HtmlExtractResult {
  const { html, htmlPath, readText } = opts;
  const warnings: string[] = [];
  const assetRefs: string[] = [];
  const title = extractTitle(html);
  const description = extractDescription(html);

  // Detect module scripts up front (a single pass over the *original* markup; stripping style/link below doesn't touch scripts).
  let hasModuleScript = false;
  const scriptScanRe = /<script\b([^>]*)(?:\/>|>([\s\S]*?)<\/script\s*>)/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptScanRe.exec(html))) {
    if ((parseAttrs(sm[1] || '').type || '').toLowerCase() === 'module') {
      hasModuleScript = true;
      break;
    }
  }

  const cssParts: string[] = [];
  const classicJsParts: string[] = [];
  const keptHeadTags: string[] = [];
  const keptScriptTags: string[] = [];

  let working = html;

  // <style>…</style>
  working = working.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_whole, _attrStr: string, body: string) => {
    const { css: rewritten, refs } = rewriteCssUrls(body, htmlPath);
    cssParts.push(rewritten);
    assetRefs.push(...refs);
    return '';
  });

  // <link …> (stylesheet, icon, or kept as-is if external and otherwise relevant)
  working = working.replace(/<link\b([^>]*?)\/?>/gi, (whole, attrStr: string) => {
    const attrs = parseAttrs(attrStr);
    const rel = (attrs.rel || '').toLowerCase();
    const relParts = rel.split(/\s+/).filter(Boolean);

    if (relParts.includes('stylesheet')) {
      const href = attrs.href || '';
      const resolved = resolveAssetPath(htmlPath, href);
      if (resolved === null) {
        keptHeadTags.push(whole); // external stylesheet (e.g. Google Fonts) — runs inside the sandbox
        return '';
      }
      const text = readText(resolved);
      if (text === undefined) {
        warnings.push(`Missing linked stylesheet: ${href}`);
        return '';
      }
      const { css: rewritten, refs } = rewriteCssUrls(text, resolved);
      cssParts.push(rewritten);
      assetRefs.push(...refs);
      return '';
    }

    if (relParts.some((r) => r.includes('icon'))) {
      const href = attrs.href || '';
      const resolved = resolveAssetPath(htmlPath, href);
      if (resolved) {
        assetRefs.push(resolved);
        keptHeadTags.push(whole.replace(href, `asset:${resolved}`));
      }
      return '';
    }

    if (relParts.includes('preconnect') || relParts.includes('dns-prefetch') || /^https?:\/\//i.test(attrs.href || '')) {
      keptHeadTags.push(whole); // e.g. Google Fonts preconnect
    }
    return '';
  });

  // <script …>…</script>
  working = working.replace(/<script\b([^>]*)(?:\/>|>([\s\S]*?)<\/script\s*>)/gi, (whole, attrStr: string, body: string | undefined) => {
    const attrs = parseAttrs(attrStr);
    const isModule = (attrs.type || '').toLowerCase() === 'module';
    const src = attrs.src;

    if (src) {
      const resolved = resolveAssetPath(htmlPath, src);
      if (resolved === null) {
        keptScriptTags.push(whole); // external script (CDN) — runs inside the sandbox
        return '';
      }
      const text = readText(resolved);
      if (text === undefined) {
        warnings.push(`Missing script file: ${src}`);
        return '';
      }
      if (hasModuleScript) {
        keptScriptTags.push(`<script${isModule ? ' type="module"' : ''}>${escapeClosingTag(text, 'script')}</script>`);
      } else {
        classicJsParts.push(text);
      }
      return '';
    }

    // Inline script.
    if (hasModuleScript) {
      keptScriptTags.push(whole);
    } else {
      classicJsParts.push(body || '');
    }
    return '';
  });

  const bodyMatch = /<body([^>]*)>([\s\S]*)<\/body>/i.exec(working);
  let bodyInner: string;
  let bodyAttrs: ParsedAttrs = {};
  if (bodyMatch) {
    bodyAttrs = parseAttrs(bodyMatch[1] || '');
    bodyInner = bodyMatch[2];
  } else {
    bodyInner = working.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<\/?html[^>]*>/gi, '');
  }

  const { html: rewrittenBody, refs: bodyRefs } = rewriteHtmlAssetRefs(bodyInner, htmlPath);
  assetRefs.push(...bodyRefs);

  let bodyHtml = rewrittenBody;
  const classAttr = bodyAttrs.class ? ` class="${escapeAttr(bodyAttrs.class)}"` : '';
  const styleAttr = bodyAttrs.style ? ` style="${escapeAttr(bodyAttrs.style)}"` : '';
  if (classAttr || styleAttr) bodyHtml = `<div${classAttr}${styleAttr}>${bodyHtml}</div>`;

  const composedHtml = [keptHeadTags.join('\n'), bodyHtml, keptScriptTags.join('\n')].filter(Boolean).join('\n');

  // Best-effort asset-path rewriting inside concatenated JS (only relevant when not in "kept as tags" mode; kept tags already had their own asset rewriting skipped deliberately — inline/external script content is left otherwise untouched).
  let js = '';
  if (!hasModuleScript) {
    const joined = classicJsParts.join('\n');
    const { js: rewrittenJs, refs } = rewriteJsAssetStrings(joined, htmlPath);
    js = rewrittenJs;
    assetRefs.push(...refs);
  }

  return {
    title,
    description,
    html: composedHtml,
    css: cssParts.join('\n'),
    js,
    hasModuleScript,
    assetRefs: Array.from(new Set(assetRefs)),
    warnings,
  };
}

// ── 1 MB page cap ────────────────────────────────────────────────────────────

export function codePageByteSize(code: { html: string; css: string; js: string }): number {
  const json = JSON.stringify({ root: { props: { mode: 'code', chrome: 'full', code } }, content: [] });
  return new TextEncoder().encode(json).length;
}

export function checkPageSizeCap(code: { html: string; css: string; js: string }): LimitCheck {
  const bytes = codePageByteSize(code);
  if (bytes > MAX_PAGE_BYTES) return { ok: false, reason: `This page is ${(bytes / 1024).toFixed(0)} KB, over the 1 MB limit. Remove some content or large inline assets.` };
  return { ok: true };
}
