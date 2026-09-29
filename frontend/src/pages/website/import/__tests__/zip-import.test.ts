/**
 * Pure-logic tests for the ZIP / HTML website import (Track D). Same
 * self-running pattern as `frontend/src/site/__tests__/site-logic.test.ts`
 * (no test runner is configured for the frontend) — run with:
 *
 *   npx esbuild src/pages/website/import/__tests__/zip-import.test.ts --bundle --platform=node \
 *     --loader:.css=empty --jsx=automatic --outfile=<tmp>/zip-import-tests.cjs && node <tmp>/zip-import-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import { strToU8, unzipSync, zipSync } from 'fflate';
import {
  applyAssetUrls,
  checkExecutables,
  checkPageSizeCap,
  checkServerApp,
  checkSourceProject,
  checkZipLimits,
  cleanZipEntries,
  codePageByteSize,
  extractHtmlPage,
  isIgnoredZipPath,
  isUnsafeZipPath,
  normalizeZipPath,
  resolveAssetPath,
  rewriteCssUrls,
  rewriteHtmlAssetRefs,
  rewriteJsAssetStrings,
  slugForPath,
  type ZipFiles,
} from '../logic';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`✗ ${name}\n    ${(e as Error).message}`);
  }
}

function eq<T>(actual: T, expected: T, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}

function ok(cond: unknown, msg = 'expected truthy') {
  if (!cond) throw new Error(msg);
}

/* ── Path normalisation ─────────────────────────────────────────────────── */

test('normalizeZipPath resolves . and ..', () => {
  eq(normalizeZipPath('a/./b'), 'a/b');
  eq(normalizeZipPath('a/b/../c'), 'a/c');
  eq(normalizeZipPath('./a/b'), 'a/b');
  eq(normalizeZipPath('a//b'), 'a/b');
  eq(normalizeZipPath('a\\b'), 'a/b', 'backslashes become forward slashes');
});

test('isIgnoredZipPath skips junk and directory markers', () => {
  ok(isIgnoredZipPath('__MACOSX/about.html'));
  ok(isIgnoredZipPath('site/.git/config'));
  ok(isIgnoredZipPath('site/node_modules/x/index.js'));
  ok(isIgnoredZipPath('site/.DS_Store'));
  ok(isIgnoredZipPath('folder/'), 'directory marker');
  ok(!isIgnoredZipPath('site/index.html'));
});

/* ── Path traversal rejection ───────────────────────────────────────────── */

test('isUnsafeZipPath rejects traversal and absolute paths', () => {
  ok(isUnsafeZipPath('../../etc/passwd'));
  ok(isUnsafeZipPath('a/../../b'), 'escapes root even though nested');
  ok(isUnsafeZipPath('/etc/passwd'));
  ok(isUnsafeZipPath('C:\\Windows\\system.ini'));
  ok(!isUnsafeZipPath('a/../b'), 'stays inside root');
  ok(!isUnsafeZipPath('about/index.html'));
});

test('cleanZipEntries drops unsafe paths and reports them', () => {
  const raw: ZipFiles = {
    'index.html': strToU8('<html></html>'),
    '../evil.html': strToU8('evil'),
    '/etc/passwd': strToU8('evil'),
    '__MACOSX/._index.html': strToU8('junk'),
  };
  const { files, rejectedPaths } = cleanZipEntries(raw);
  ok('index.html' in files);
  eq(Object.keys(files).length, 1);
  eq(rejectedPaths.sort(), ['../evil.html', '/etc/passwd'].sort());
});

test('cleanZipEntries strips a single wrapping folder', () => {
  const raw: ZipFiles = {
    'my-export/index.html': strToU8('<html></html>'),
    'my-export/about.html': strToU8('<html></html>'),
    'my-export/img/logo.png': strToU8('PNG'),
  };
  const { files, strippedPrefix } = cleanZipEntries(raw);
  eq(strippedPrefix, 'my-export');
  ok('index.html' in files);
  ok('about.html' in files);
  ok('img/logo.png' in files);
});

test('cleanZipEntries does not strip when there are multiple top-level entries', () => {
  const raw: ZipFiles = { 'index.html': strToU8('a'), 'about.html': strToU8('b') };
  const { files, strippedPrefix } = cleanZipEntries(raw);
  eq(strippedPrefix, '');
  eq(Object.keys(files).sort(), ['about.html', 'index.html']);
});

/* ── dist/build preference ──────────────────────────────────────────────── */

test('cleanZipEntries prefers dist/ when it holds index.html, dropping sibling source', () => {
  const raw: ZipFiles = {
    'package.json': strToU8('{}'),
    'src/main.tsx': strToU8('export default 1'),
    'dist/index.html': strToU8('<html><body>hi</body></html>'),
    'dist/assets/index-abc123.js': strToU8('console.log(1)'),
    'dist/assets/index-abc123.css': strToU8('body{color:red}'),
  };
  const { files, preferredDist } = cleanZipEntries(raw);
  eq(preferredDist, 'dist');
  eq(Object.keys(files).sort(), ['assets/index-abc123.css', 'assets/index-abc123.js', 'index.html']);
});

test('cleanZipEntries prefers dist over build when both exist', () => {
  const raw: ZipFiles = {
    'dist/index.html': strToU8('d'),
    'build/index.html': strToU8('b'),
  };
  eq(cleanZipEntries(raw).preferredDist, 'dist');
});

test('cleanZipEntries leaves files alone when no dist/build index.html exists', () => {
  const raw: ZipFiles = { 'index.html': strToU8('a'), 'assets/style.css': strToU8('b') };
  const { files, preferredDist } = cleanZipEntries(raw);
  eq(preferredDist, null);
  eq(Object.keys(files).sort(), ['assets/style.css', 'index.html']);
});

test('a real ZIP (fflate zipSync) round-trips through cleanZipEntries', () => {
  const zipped = zipSync({
    'export/dist/index.html': strToU8('<html><body>Vite app</body></html>'),
    'export/dist/assets/index-9f8a.js': strToU8('console.log("hi")'),
    'export/package.json': strToU8('{"name":"x"}'),
    'export/src/App.tsx': strToU8('export default function App(){return null}'),
  });
  const raw = unzipSync(zipped) as ZipFiles;
  const { files, strippedPrefix, preferredDist } = cleanZipEntries(raw);
  eq(strippedPrefix, 'export');
  eq(preferredDist, 'dist');
  eq(Object.keys(files).sort(), ['assets/index-9f8a.js', 'index.html']);
});

/* ── Source project / server app / executable detection ─────────────────── */

test('checkSourceProject rejects a Vite/React source export with no built html', () => {
  const paths = ['package.json', 'vite.config.ts', 'src/main.tsx', 'src/App.tsx'];
  const r = checkSourceProject(paths);
  ok(r.rejected);
  eq(r.reason, 'This is source code. Run `npm run build` and upload the dist folder.');
});

test('checkSourceProject accepts source alongside a built dist (handled by dist preference upstream)', () => {
  const paths = ['package.json', 'src/main.tsx', 'dist/index.html'];
  ok(!checkSourceProject(paths).rejected);
});

test('checkSourceProject does not reject a plain built export', () => {
  ok(!checkSourceProject(['index.html', 'about.html', 'img/logo.png']).rejected);
});

test('checkSourceProject catches a Next.js source export (next.config.js, no html)', () => {
  ok(checkSourceProject(['package.json', 'next.config.js', 'app/page.tsx']).rejected);
});

test('checkServerApp rejects a Next.js app router export', () => {
  const r = checkServerApp(['app/layout.tsx', 'app/page.tsx', 'app/about/page.tsx']);
  ok(r.rejected);
});

test('checkServerApp rejects pages/api routes', () => {
  ok(checkServerApp(['pages/index.tsx', 'pages/api/hello.ts']).rejected);
});

test('checkServerApp accepts a plain built export', () => {
  ok(!checkServerApp(['index.html', 'about.html']).rejected);
});

test('checkExecutables flags known executable extensions', () => {
  ok(checkExecutables(['index.html', 'setup.exe']).rejected);
  ok(checkExecutables(['install.sh']).rejected);
  ok(!checkExecutables(['index.html', 'about.html']).rejected);
});

/* ── Slug mapping ────────────────────────────────────────────────────────── */

test('slugForPath: index.html → home', () => {
  eq(slugForPath('index.html', new Set()), 'home');
});

test('slugForPath: about.html / about/index.html → about', () => {
  eq(slugForPath('about.html', new Set()), 'about');
  eq(slugForPath('about/index.html', new Set()), 'about');
});

test('slugForPath: nested paths joined with -', () => {
  eq(slugForPath('academics/admission/index.html', new Set()), 'academics-admission');
  eq(slugForPath('news/2024/results.html', new Set()), 'news-2024-results');
});

test('slugForPath: reserved slugs get a -page suffix', () => {
  eq(slugForPath('shop.html', new Set()), 'shop-page');
  eq(slugForPath('blog/index.html', new Set()), 'blog-page');
  eq(slugForPath('account.html', new Set()), 'account-page');
});

test('slugForPath: dedupes against already-used slugs', () => {
  const used = new Set<string>();
  eq(slugForPath('about.html', used), 'about');
  eq(slugForPath('about/index.html', used), 'about-2');
  eq(slugForPath('ABOUT.HTML', used), 'about-3');
});

/* ── Local asset path resolution ─────────────────────────────────────────── */

test('resolveAssetPath resolves relative to the referencing file, ignores external/data/hash refs', () => {
  eq(resolveAssetPath('about/index.html', 'img/logo.png'), 'about/img/logo.png');
  eq(resolveAssetPath('about/index.html', '../img/logo.png'), 'img/logo.png');
  eq(resolveAssetPath('index.html', '/assets/logo.png'), 'assets/logo.png');
  eq(resolveAssetPath('index.html', 'logo.png?v=2'), 'logo.png');
  eq(resolveAssetPath('index.html', 'https://cdn.example.com/x.png'), null);
  eq(resolveAssetPath('index.html', '//cdn.example.com/x.png'), null);
  eq(resolveAssetPath('index.html', 'data:image/png;base64,AAAA'), null);
  eq(resolveAssetPath('index.html', 'mailto:a@b.com'), null);
  eq(resolveAssetPath('index.html', '#top'), null);
  eq(resolveAssetPath('index.html', ''), null);
});

/* ── CSS url() rewrite ───────────────────────────────────────────────────── */

test('rewriteCssUrls rewrites local refs to asset: sentinels, resolved relative to the CSS file', () => {
  const css = `.a{background:url(../img/x.png)} .b{background:url("fonts/f.woff2")} .c{background:url(https://cdn.example.com/y.png)}`;
  const { css: out, refs } = rewriteCssUrls(css, 'assets/style.css');
  ok(out.includes('url(asset:img/x.png)'), out);
  ok(out.includes('url("asset:assets/fonts/f.woff2")'), out);
  ok(out.includes('url(https://cdn.example.com/y.png)'), 'external url left alone');
  eq(refs.sort(), ['assets/fonts/f.woff2', 'img/x.png'].sort());
});

test('applyAssetUrls swaps sentinels for final URLs (or blank when missing)', () => {
  const map = new Map([['img/x.png', 'https://cdn/x.png']]);
  eq(applyAssetUrls('url(asset:img/x.png)', map), 'url(https://cdn/x.png)');
  eq(applyAssetUrls('url(asset:missing/y.png)', map), 'url()');
});

/* ── HTML attribute / JS best-effort asset rewriting ─────────────────────── */

test('rewriteHtmlAssetRefs rewrites img/source/video srcset/poster and inline style url()', () => {
  const html = `<img src="img/a.png" srcset="img/a.png 1x, img/a@2x.png 2x"><video poster="img/poster.jpg"><source src="vid/x.mp4"></video><div style="background:url(img/bg.png)"></div><img src="https://cdn.example.com/z.png">`;
  const { html: out, refs } = rewriteHtmlAssetRefs(html, 'index.html');
  ok(out.includes('src="asset:img/a.png"'));
  ok(out.includes('asset:img/a.png 1x'));
  ok(out.includes('asset:img/a@2x.png 2x'));
  ok(out.includes('poster="asset:img/poster.jpg"'));
  ok(out.includes('src="asset:vid/x.mp4"'));
  ok(out.includes('url(asset:img/bg.png)'));
  ok(out.includes('src="https://cdn.example.com/z.png"'), 'external image left alone');
  ok(refs.includes('img/a.png') && refs.includes('vid/x.mp4') && refs.includes('img/bg.png'));
});

test('rewriteJsAssetStrings is best-effort for quoted local asset paths', () => {
  const { js, refs } = rewriteJsAssetStrings(`var logo = "img/logo.png"; var ext = 'https://cdn.example.com/a.png'; var s = "hello";`, 'index.html');
  ok(js.includes('"asset:img/logo.png"'));
  ok(js.includes("'https://cdn.example.com/a.png'"), 'external left alone');
  ok(js.includes('"hello"'), 'non-asset strings untouched');
  eq(refs, ['img/logo.png']);
});

/* ── HTML page extraction ────────────────────────────────────────────────── */

test('extractHtmlPage: Claude-style single HTML file with Tailwind CDN', () => {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>My Landing Page</title>
  <meta name="description" content="A page made by an AI tool.">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>.hero{color:red;background:url(img/hero.png)}</style>
</head>
<body class="bg-white" style="margin:0">
  <section class="hero"><h1>Welcome</h1><img src="img/hero.png" alt=""></section>
  <script>console.log('inline script'); var x = "img/other.png";</script>
</body>
</html>`;
  const files: Record<string, string> = {};
  const result = extractHtmlPage({ html, htmlPath: 'index.html', readText: (p) => files[p] });

  eq(result.title, 'My Landing Page');
  eq(result.description, 'A page made by an AI tool.');
  ok(!result.hasModuleScript);
  ok(result.html.includes('cdn.tailwindcss.com'), 'external CDN script kept as a tag');
  ok(result.html.includes('class="bg-white" style="margin:0"'), 'body class/style preserved via wrapper div');
  ok(result.html.includes('src="asset:img/hero.png"'));
  ok(result.css.includes('url(asset:img/hero.png)'));
  ok(result.js.includes("console.log('inline script')"));
  ok(result.js.includes('asset:img/other.png'), 'best-effort JS string rewrite');
  ok(result.assetRefs.includes('img/hero.png'));
  eq(result.warnings, []);
});

test('extractHtmlPage: Vite dist/ output with a module script keeps scripts as tags instead of concatenating', () => {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Vite App</title>
  <link rel="stylesheet" crossorigin href="/assets/index-9f8a.css">
  <script type="module" crossorigin src="/assets/index-9f8a.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
  const files: Record<string, string> = {
    'assets/index-9f8a.css': `body{margin:0;background:url(/assets/logo-abc.png)}`,
    'assets/index-9f8a.js': `import { h } from "./chunk.js";\nconsole.log("app");`,
  };
  const result = extractHtmlPage({ html, htmlPath: 'index.html', readText: (p) => files[p] });

  ok(result.hasModuleScript);
  eq(result.js, '', 'no concatenation when a module script is present');
  ok(result.html.includes('<script type="module">'), 'module script kept as an inline tag');
  ok(result.html.includes('import { h } from'), 'module script content is inlined, not left as a broken src=');
  ok(result.html.includes('<div id="root"></div>'));
  ok(result.css.includes('url(asset:assets/logo-abc.png)'), 'linked CSS inlined and its url() rewritten');
  eq(result.warnings, []);
});

test('extractHtmlPage warns about missing linked files instead of throwing', () => {
  const html = `<html><head><link rel="stylesheet" href="missing.css"><script src="missing.js"></script></head><body>hi</body></html>`;
  const result = extractHtmlPage({ html, htmlPath: 'index.html', readText: () => undefined });
  eq(result.css, '');
  eq(result.js, '');
  ok(result.warnings.some((w) => w.includes('missing.css')));
  ok(result.warnings.some((w) => w.includes('missing.js')));
});

test('extractHtmlPage falls back to the first <h1> when <title> is missing', () => {
  const result = extractHtmlPage({ html: '<html><body><h1>Fallback Heading</h1></body></html>', htmlPath: 'about.html', readText: () => undefined });
  eq(result.title, 'Fallback Heading');
});

/* ── 1 MB page cap ───────────────────────────────────────────────────────── */

test('checkPageSizeCap passes for a normal page and fails once it crosses 1 MB', () => {
  ok(checkPageSizeCap({ html: '<p>hi</p>', css: '', js: '' }).ok);
  const big = { html: 'x'.repeat(1024 * 1024 + 100), css: '', js: '' };
  const r = checkPageSizeCap(big);
  ok(!r.ok);
  ok(r.reason && r.reason.includes('1 MB'));
});

test('codePageByteSize grows with content', () => {
  const small = codePageByteSize({ html: 'a', css: '', js: '' });
  const big = codePageByteSize({ html: 'a'.repeat(1000), css: '', js: '' });
  ok(big > small);
});

/* ── ZIP-level limits ────────────────────────────────────────────────────── */

test('checkZipLimits enforces 50 MB / 500 files', () => {
  ok(checkZipLimits(10, 1024).ok);
  ok(!checkZipLimits(10, 51 * 1024 * 1024).ok);
  ok(!checkZipLimits(501, 1024).ok);
});

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
} else {
  console.log(`zip-import: ${passed} tests passed`);
}
