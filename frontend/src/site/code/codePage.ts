/**
 * "Code mode" pages: `data.root.props = { mode: 'code', code: { html, css, js }, chrome }`
 * and `content` stays `[]` (see WEBSITE_V2_BRIEF.md §2). No schema change —
 * this lives entirely inside the existing Puck `Data` JSON.
 */
import type { SitePageData } from '../types';

export interface CodePageCode {
  html: string;
  css: string;
  js: string;
}

export interface CodePageProps {
  mode: 'code';
  code: CodePageCode;
  /** `'full'`: site header + footer around the code page; `'none'`: the sandbox fills the browser window. */
  chrome: 'full' | 'none';
}

/** True when `data.root.props.mode === 'code'` (a code-mode page rather than a visual/Puck-blocks page). */
export function isCodePage(data: unknown): data is { root: { props: CodePageProps }; content: [] } {
  if (!data || typeof data !== 'object') return false;
  const root = (data as { root?: unknown }).root;
  if (!root || typeof root !== 'object') return false;
  const props = (root as { props?: unknown }).props;
  return Boolean(props) && typeof props === 'object' && (props as { mode?: unknown }).mode === 'code';
}

/** Reads the code page's props with safe fallbacks (never throws on partial/legacy data). */
export function readCodePageProps(data: SitePageData | { root?: { props?: Record<string, unknown> } }): CodePageProps {
  const props = (data.root?.props ?? {}) as Record<string, unknown>;
  const code = (props.code && typeof props.code === 'object' ? (props.code as Record<string, unknown>) : {}) as Record<string, unknown>;
  return {
    mode: 'code',
    code: {
      html: typeof code.html === 'string' ? code.html : '',
      css: typeof code.css === 'string' ? code.css : '',
      js: typeof code.js === 'string' ? code.js : '',
    },
    chrome: props.chrome === 'none' ? 'none' : 'full',
  };
}

/** A nice-looking starter landing page for "Blank landing page" (Engineer C's "New page" flow). */
export function emptyCodePageData(title = 'New page'): SitePageData {
  const escapedTitle = title.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
  const html = `<section class="hero">
  <div class="wrap">
    <p class="eyebrow">Welcome</p>
    <h1>${escapedTitle}</h1>
    <p class="lead">This is a blank landing page. Edit the HTML, CSS and JS tabs to build anything — it renders in a safe sandbox, so you have full control.</p>
    <div class="cta">
      <a class="btn btn-primary" href="#features">Explore</a>
      <a class="btn btn-outline" href="/contact">Contact us</a>
    </div>
  </div>
</section>

<section id="features" class="features">
  <div class="wrap grid">
    <div class="card">
      <h3>Fast</h3>
      <p>Loads instantly and works on every device, from a small phone to a large desktop screen.</p>
    </div>
    <div class="card">
      <h3>Flexible</h3>
      <p>Write plain HTML, CSS and JavaScript — no restrictions, full creative control.</p>
    </div>
    <div class="card">
      <h3>On-brand</h3>
      <p>The theme's colours and fonts are already available as CSS variables below.</p>
    </div>
  </div>
</section>`;

  const css = `.wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
.hero { padding: 96px 0 72px; text-align: center; background: linear-gradient(180deg, var(--site-primary-soft), transparent); }
.eyebrow { text-transform: uppercase; letter-spacing: .08em; font-weight: 700; font-size: .85rem; color: var(--site-primary-text); margin: 0 0 12px; }
.hero h1 { font-family: var(--site-heading-font); font-size: clamp(2rem, 1.3rem + 3vw, 3.4rem); font-weight: 800; margin: 0 0 16px; }
.lead { font-size: 1.15rem; color: var(--site-muted); max-width: 640px; margin: 0 auto 28px; }
.cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 12px 26px; border-radius: var(--site-radius, 10px); font-weight: 700; text-decoration: none; border: 2px solid transparent; }
.btn-primary { background: var(--site-primary); color: var(--site-on-primary, #fff); }
.btn-outline { border-color: var(--site-primary); color: var(--site-primary-text); }
.features { padding: 64px 0; }
.grid { display: grid; gap: 24px; grid-template-columns: 1fr; }
@media (min-width: 720px) { .grid { grid-template-columns: repeat(3, 1fr); } }
.card { border: 1px solid var(--site-border); border-radius: var(--site-radius, 10px); padding: 28px; }
.card h3 { margin: 0 0 8px; font-family: var(--site-heading-font); }
.card p { margin: 0; color: var(--site-muted); }`;

  const js = `// Runs inside a sandboxed iframe — no access to the parent page or its storage.
// window.SITE.navigate(path), window.SITE.addToCart(slug, qty) and window.SITE.openCart()
// talk to the platform through postMessage.
console.log('Page ready:', window.SITE);`;

  return {
    root: { props: { title, mode: 'code', chrome: 'full', code: { html, css, js } } },
    content: [],
    zones: {},
  };
}
