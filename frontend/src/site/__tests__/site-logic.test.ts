/**
 * Pure-logic tests for the Sites renderer: token filling, iframe allow-list,
 * video URL parsing, host detection, contrast helper and page-data validation.
 *
 * The frontend has no test runner configured, so this file is self-running
 * and type-checked with the app (`npx tsc --noEmit -p .`). Run it with:
 *
 *   npx esbuild src/site/__tests__/site-logic.test.ts --bundle --platform=node \
 *     --loader:.css=empty --jsx=automatic --outfile=<tmp>/site-tests.cjs && node <tmp>/site-tests.cjs
 *
 * It exits non-zero on the first failure. (Vitest-compatible if a runner is
 * added later: wrap each `test()` body unchanged.)
 */
import { buildSiteTokens, fillTokens, fillTokensDeep, hasTokens, tidyFilled } from '../tokens';
import { isAllowedIframeSrc, osmEmbedUrl, safeHref, toVideoEmbed } from '../embed';
import { isAppHost, isSiteHost, resolveTarget } from '../host';
import { checkThemeContrast, contrastRatio, DEFAULT_THEME, ensureContrast, meetsAA, normaliseTheme, readableTextOn } from '../theme';
import { isValidPageData } from '../render';
import { SITE_TEMPLATES } from '../templates';
import { SITE_COMPONENTS, BLOCK_CATEGORIES } from '../config';
import { addLine, cartCount, cartSubtotal, cartTotals, hasCourseItem, hasPhysicalItem, removeLine, setLineQty, type CartLine } from '../cart';
import { buildSrcDoc, SANDBOX_ATTR } from '../code/SandboxFrame';
import { emptyCodePageData, isCodePage, readCodePageProps } from '../code/codePage';
import { isReservedSlug, parseSitePath } from '../routes';

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

/* ── Tokens ─────────────────────────────────────────────────────────────── */

const tokens = buildSiteTokens({
  institution: { name: 'Green Valley School', nameBn: 'গ্রিন ভ্যালি স্কুল', contact: { phone: '01700-000000', email: 'info@example.org' } },
  settings: { siteName: '', establishedYear: 1995 },
  now: new Date('2026-05-01T00:00:00Z'),
});

test('fills known tokens', () => {
  eq(fillTokens('Welcome to {{institution.name}}!', tokens), 'Welcome to Green Valley School!');
  eq(fillTokens('© {{ year }} {{site.name}}', tokens), '© 2026 Green Valley School');
  eq(fillTokens('Since {{institution.established}}', tokens), 'Since 1995');
});

test('missing tokens render empty (never literal braces)', () => {
  eq(fillTokens('Visit {{institution.address}}', tokens), 'Visit ');
  eq(fillTokens('{{unknown.token}}', tokens), '');
  eq(tidyFilled(fillTokens('Call {{institution.address}} today .', tokens)), 'Call today.');
});

test('keepMissing leaves unknown tokens', () => {
  eq(fillTokens('A {{institution.address}}', tokens, { keepMissing: true }), 'A {{institution.address}}');
});

test('escapes values in HTML mode', () => {
  const t = buildSiteTokens({ institution: { name: '<b>X</b> & "Y"', contact: {} } });
  eq(fillTokens('<p>{{institution.name}}</p>', t, { escape: true }), '<p>&lt;b&gt;X&lt;/b&gt; &amp; &quot;Y&quot;</p>');
});

test('Bangla picks the Bangla name', () => {
  const bn = buildSiteTokens({ institution: { name: 'A', nameBn: 'অ', contact: {} }, lang: 'bn' });
  eq(bn['institution.name'], 'অ');
});

test('fillTokensDeep skips ids/types and fills nested strings', () => {
  const data = { type: 'Hero', props: { id: '{{x}}', title: '{{institution.name}}', items: [{ t: '{{year}}' }] } };
  eq(fillTokensDeep(data, tokens), { type: 'Hero', props: { id: '{{x}}', title: 'Green Valley School', items: [{ t: '2026' }] } });
});

test('hasTokens', () => {
  ok(hasTokens('a {{b.c}}'));
  ok(!hasTokens('plain'));
  ok(hasTokens('x {{ y }}'), 'second call must not be affected by regex state');
});

/* ── Embed allow-list ───────────────────────────────────────────────────── */

test('iframe allow-list accepts known https embeds', () => {
  ok(isAllowedIframeSrc('https://www.youtube.com/embed/dQw4w9WgXcQ'));
  ok(isAllowedIframeSrc('https://www.youtube-nocookie.com/embed/abc123def'));
  ok(isAllowedIframeSrc('https://player.vimeo.com/video/123456'));
  ok(isAllowedIframeSrc('https://www.google.com/maps/embed?pb=xyz'));
  ok(isAllowedIframeSrc('https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4'));
  ok(isAllowedIframeSrc('https://docs.google.com/forms/d/e/abc/viewform?embedded=true'));
});

test('iframe allow-list rejects everything else', () => {
  ok(!isAllowedIframeSrc('http://www.youtube.com/embed/x'), 'http');
  ok(!isAllowedIframeSrc('https://evil.example.com/embed/x'), 'unknown host');
  ok(!isAllowedIframeSrc('https://www.youtube.com.evil.com/embed/x'), 'suffix trick');
  ok(!isAllowedIframeSrc('https://www.google.com/search?q=x'), 'wrong path on allowed host');
  ok(!isAllowedIframeSrc('javascript:alert(1)'), 'javascript:');
  ok(!isAllowedIframeSrc('data:text/html,<script>1</script>'), 'data:');
  ok(!isAllowedIframeSrc('https://user:pw@www.youtube.com/embed/x'), 'credentials');
  ok(!isAllowedIframeSrc(''), 'empty');
  ok(!isAllowedIframeSrc(null), 'null');
});

test('video URLs become embeds', () => {
  eq(toVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  eq(toVideoEmbed('https://youtu.be/dQw4w9WgXcQ?t=3')?.kind, 'youtube');
  eq(toVideoEmbed('https://youtube.com/shorts/dQw4w9WgXcQ')?.kind, 'youtube');
  eq(toVideoEmbed('https://vimeo.com/76979871')?.src, 'https://player.vimeo.com/video/76979871');
  eq(toVideoEmbed('https://cdn.example.org/a.mp4')?.kind, 'file');
  eq(toVideoEmbed('javascript:alert(1)'), null);
  eq(toVideoEmbed('not a url'), null);
});

test('safeHref blocks script URLs', () => {
  eq(safeHref('javascript:alert(1)'), undefined);
  eq(safeHref('/about'), '/about');
  eq(safeHref('about'), '/about');
  eq(safeHref('#x'), '#x');
  eq(safeHref('tel:+8801700000000'), 'tel:+8801700000000');
  eq(safeHref('https://example.org/a'), 'https://example.org/a');
});

test('OSM embed URL', () => {
  ok(osmEmbedUrl(23.81, 90.41, 15)?.startsWith('https://www.openstreetmap.org/export/embed.html?bbox='));
  eq(osmEmbedUrl(NaN, 90), null);
  eq(osmEmbedUrl(95, 90), null);
});

/* ── Host detection ─────────────────────────────────────────────────────── */

const env = { appHosts: 'app.peoplenit.com, *.internal.test', platformDomain: 'peoplenit.app' };

test('app hosts', () => {
  for (const h of ['localhost', '127.0.0.1', 'LOCALHOST:5173', 'abc-def.trycloudflare.com', 'peopleitsms.vercel.app', 'app.peoplenit.com', 'x.internal.test', '192.168.0.10', 'peoplenit.app', 'www.peoplenit.app', '']) {
    ok(isAppHost(h, env), `${h} should be an app host`);
  }
});

test('site hosts', () => {
  ok(isSiteHost('greenvalley.peoplenit.app', env));
  ok(isSiteHost('www.greenvalleyschool.edu.bd', env));
  ok(!isSiteHost('localhost', env));
  ok(isSiteHost('trycloudflare.com.evil.com', {}), 'a lookalike of an app host is not an app host');
});

test('resolveTarget', () => {
  eq(resolveTarget('greenvalley.peoplenit.app', env), { slug: 'greenvalley' });
  eq(resolveTarget('GreenValley.PeopleNIT.app.', env), { slug: 'greenvalley' });
  eq(resolveTarget('a.b.peoplenit.app', env), { host: 'a.b.peoplenit.app' });
  eq(resolveTarget('school.edu.bd', env), { host: 'school.edu.bd' });
  eq(resolveTarget('localhost', env), null);
  eq(resolveTarget('school.edu.bd', {}), { host: 'school.edu.bd' });
});

/* ── Contrast helper ────────────────────────────────────────────────────── */

test('contrast ratio matches WCAG reference values', () => {
  eq(Math.round(contrastRatio('#000000', '#ffffff') * 100) / 100, 21);
  eq(Math.round(contrastRatio('#ffffff', '#ffffff') * 100) / 100, 1);
  eq(Math.round(contrastRatio('#767676', '#ffffff') * 100) / 100, 4.54);
  ok(meetsAA('#767676', '#ffffff'));
  ok(!meetsAA('#aaaaaa', '#ffffff'));
  ok(meetsAA('#949494', '#ffffff', true), 'large text needs only 3:1');
});

test('readable text and ensureContrast', () => {
  eq(readableTextOn('#1d4ed8'), '#ffffff');
  eq(readableTextOn('#facc15'), '#0f172a');
  const fixed = ensureContrast('#facc15', '#ffffff');
  ok(contrastRatio(fixed, '#ffffff') >= 4.5, `ensureContrast gave ${fixed}`);
  eq(ensureContrast('#1d4ed8', '#ffffff'), '#1d4ed8');
});

test('theme contrast report + normalise', () => {
  ok(checkThemeContrast(normaliseTheme({ primary: '#1d4ed8', accent: '#0f172a' })).passes);
  ok(!checkThemeContrast(normaliseTheme({ primary: '#fde047', accent: '#fef08a' })).passes);
  eq(normaliseTheme({ primary: 'nope', radius: 14 }).radius, 'lg');
  eq(normaliseTheme({ primary: 'ABCDEF' }).primary, '#abcdef');
});

test('every template primary colour yields AA button text', () => {
  for (const t of SITE_TEMPLATES) {
    const r = checkThemeContrast(t.theme);
    ok(r.onPrimary >= 4.5, `${t.key} button text contrast ${r.onPrimary.toFixed(2)}`);
  }
});

/* ── Page data + templates ──────────────────────────────────────────────── */

test('isValidPageData', () => {
  ok(isValidPageData({ root: { props: {} }, content: [] }));
  ok(isValidPageData({ root: {}, content: [{ type: 'Heading', props: { id: 'h1', text: 'x' } }] }));
  ok(isValidPageData({ root: {}, content: [{ type: 'Columns', props: { id: 'c', col1: [{ type: 'Spacer', props: { id: 's' } }] } }] }));
  ok(!isValidPageData(null));
  ok(!isValidPageData({ content: 'x' }));
  ok(!isValidPageData({ root: {}, content: [{ type: 'NoSuchBlock', props: {} }] }));
  ok(!isValidPageData({ root: {}, content: [{ type: 'Columns', props: { id: 'c', col1: [{ type: 'Bad', props: {} }] } }] }));
});

test('fifteen templates, each with valid pages and the six standard slugs', () => {
  eq(SITE_TEMPLATES.length, 15);
  eq(new Set(SITE_TEMPLATES.map((t) => t.key)).size, 15);
  for (const t of SITE_TEMPLATES) {
    const slugs = t.pages.map((p) => p.slug);
    for (const s of ['', 'about', 'admissions', 'academics', 'notices', 'contact']) ok(slugs.includes(s), `${t.key} missing page "${s}"`);
    eq(new Set(slugs).size, slugs.length, `${t.key} duplicate slugs`);
    for (const s of slugs) ok(!isReservedSlug(s), `${t.key} uses reserved slug "${s}"`);
    for (const p of t.pages) {
      ok(isValidPageData(p.data), `${t.key}/${p.slug} invalid page data`);
      const ids = new Set<string>();
      const walk = (items: Array<{ type: string; props: Record<string, unknown> }>) => items.forEach((it) => {
        const id = String(it.props.id);
        ok(!ids.has(id), `${t.key}/${p.slug} duplicate id ${id}`);
        ids.add(id);
        for (const v of Object.values(it.props)) if (Array.isArray(v) && v[0]?.type) walk(v as typeof items);
      });
      walk(p.data.content as never);
    }
  }
});

test('AI generator block names exist in the config', () => {
  for (const k of ['Hero', 'Heading', 'RichText', 'StatsLive', 'Notices', 'CallToAction', 'TeacherDirectory', 'EnquiryForm', 'ClassRoutine', 'EventsCalendar', 'ContactInfo']) {
    ok(k in SITE_COMPONENTS, `missing ${k}`);
  }
});

test('every block is in exactly one category', () => {
  const all = BLOCK_CATEGORIES.flatMap((c) => c.components);
  eq(new Set(all).size, all.length);
  eq([...all].sort(), Object.keys(SITE_COMPONENTS).sort());
});

/* ── Cart maths (Website Builder v2) ────────────────────────────────────── */

const product = (over: Partial<CartLine> = {}): CartLine => ({ kind: 'PRODUCT', refId: 'p1', slug: 'uniform', name: 'Uniform', price: 500, qty: 1, productKind: 'PHYSICAL', ...over });
const digital = (over: Partial<CartLine> = {}): CartLine => ({ kind: 'PRODUCT', refId: 'p2', slug: 'ebook', name: 'E-book', price: 200, qty: 1, productKind: 'DIGITAL', ...over });
const course = (over: Partial<CartLine> = {}): CartLine => ({ kind: 'COURSE', refId: 'c1', slug: 'algebra', name: 'Algebra', price: 1000, qty: 1, ...over });

test('addLine merges the same product and clamps quantity', () => {
  let items = addLine([], product({ qty: 2 }));
  items = addLine(items, product({ qty: 3 }));
  eq(items.length, 1);
  eq(items[0].qty, 5);
  items = addLine(items, product({ qty: 999 }));
  ok(items[0].qty <= 99, 'qty is clamped to 99');
});

test('a course line is always qty 1 and never duplicates', () => {
  let items = addLine([], course({ qty: 5 }));
  eq(items[0].qty, 1);
  items = addLine(items, course({ qty: 3 }));
  eq(items.length, 1, 'enrolling twice does not duplicate the line');
  eq(items[0].qty, 1);
});

test('setLineQty removes the line at 0 and clamps otherwise', () => {
  let items = addLine([], product());
  items = setLineQty(items, 'p1', 3);
  eq(items[0].qty, 3);
  items = setLineQty(items, 'p1', 0);
  eq(items.length, 0);
});

test('removeLine drops only the matching line', () => {
  const items = addLine(addLine([], product()), course());
  eq(removeLine(items, 'p1').length, 1);
  eq(removeLine(items, 'p1')[0].kind, 'COURSE');
});

test('cartCount and cartSubtotal', () => {
  const items = [product({ qty: 2, price: 500 }), course({ price: 1000 })];
  eq(cartCount(items), 3);
  eq(cartSubtotal(items), 2000);
});

test('hasPhysicalItem / hasCourseItem', () => {
  ok(hasPhysicalItem([product()]));
  ok(!hasPhysicalItem([digital()]));
  ok(!hasPhysicalItem([course()]));
  ok(hasCourseItem([course()]));
  ok(!hasCourseItem([product()]));
});

test('cartTotals: shipping only with a physical item, free over the threshold', () => {
  const shop = { shippingFee: 60, freeShippingOver: 2000 };
  eq(cartTotals([digital()], shop).shipping, 0, 'digital-only order has no shipping');
  eq(cartTotals([course()], shop).shipping, 0, 'course-only order has no shipping');
  const withPhysical = cartTotals([product({ price: 500, qty: 1 })], shop);
  eq(withPhysical.shipping, 60);
  eq(withPhysical.total, 560);
  const overThreshold = cartTotals([product({ price: 2500, qty: 1 })], shop);
  eq(overThreshold.shipping, 0, 'free shipping over the threshold');
  eq(overThreshold.total, 2500);
});

/* ── Sandbox srcdoc builder (never allow-same-origin; bridge present) ──── */

test('SANDBOX_ATTR never includes allow-same-origin', () => {
  ok(SANDBOX_ATTR.includes('allow-scripts'));
  ok(!SANDBOX_ATTR.includes('allow-same-origin'));
});

test('buildSrcDoc includes the postMessage bridge and theme variables', () => {
  const doc = buildSrcDoc({ html: '<p>hi</p>', css: 'p{color:red}', js: 'console.log(1)', theme: DEFAULT_THEME, siteId: 'site1', apiBase: '/api/v1', lang: 'en', basePath: '/s/demo', institutionName: 'Demo School' });
  ok(doc.includes('window.SITE'), 'exposes window.SITE');
  ok(doc.includes('postMessage'), 'uses postMessage');
  ok(doc.includes('peoplenit-site-sandbox'), 'tags bridge messages');
  ok(doc.includes('--site-primary'), 'includes theme CSS variables');
  ok(doc.includes('"siteId":"site1"'));
  ok(doc.includes('Demo School'));
  ok(doc.includes('<p>hi</p>'));
  ok(doc.includes('p{color:red}'));
  ok(doc.includes('console.log(1)'));
});

test('buildSrcDoc escapes a closing </script> in user JS so it cannot break out early', () => {
  const evil = "console.log('safe')</script><script>window.__pwned = true;</script>";
  const doc = buildSrcDoc({ html: '', js: evil, theme: DEFAULT_THEME });
  ok(!doc.includes(evil), 'the raw closing tag sequence must not appear verbatim');
  ok(!doc.includes('</script><script>window.__pwned'), 'cannot prematurely close the script tag');
  ok(doc.includes('__pwned'), 'the (now inert) text is still present, just not exploitable');
});

test('buildSrcDoc escapes a closing </style> in user CSS the same way', () => {
  const evil = 'body{color:red}</style><script>alert(1)</script>';
  const doc = buildSrcDoc({ html: '', css: evil, theme: DEFAULT_THEME });
  ok(!doc.includes('</style><script>alert(1)'), 'cannot prematurely close the style tag');
});

/* ── Page code mode ──────────────────────────────────────────────────────── */

test('isCodePage recognises the code-mode root props', () => {
  ok(isCodePage({ root: { props: { mode: 'code', code: { html: '', css: '', js: '' }, chrome: 'full' } }, content: [] }));
  ok(!isCodePage({ root: { props: {} }, content: [] }));
  ok(!isCodePage({ root: { props: { mode: 'visual' } }, content: [] }));
  ok(!isCodePage(null));
  ok(!isCodePage({}));
});

test('readCodePageProps tolerates partial data', () => {
  const props = readCodePageProps({ root: { props: { mode: 'code' } } });
  eq(props.chrome, 'full');
  eq(props.code, { html: '', css: '', js: '' });
});

test('emptyCodePageData is a valid code page with real starter content', () => {
  const data = emptyCodePageData('My landing page');
  ok(isCodePage(data));
  eq(data.content.length, 0);
  const props = readCodePageProps(data);
  ok(props.code.html.includes('My landing page'));
  ok(props.code.html.length > 100 && props.code.css.length > 100, 'starter content is a real page, not a stub');
});

/* ── Public-site route parsing ──────────────────────────────────────────── */

test('parseSitePath: shop, cart, checkout, order, courses, learn, account', () => {
  eq(parseSitePath(''), { kind: 'page', slug: '' });
  eq(parseSitePath('about'), { kind: 'page', slug: 'about' });
  eq(parseSitePath('shop'), { kind: 'shop-list' });
  eq(parseSitePath('shop/uniform-set'), { kind: 'shop-product', slug: 'uniform-set' });
  eq(parseSitePath('cart'), { kind: 'cart' });
  eq(parseSitePath('checkout'), { kind: 'checkout' });
  eq(parseSitePath('order'), { kind: 'order-lookup' });
  eq(parseSitePath('order/SO-260929-7K3F'), { kind: 'order-status', orderNo: 'SO-260929-7K3F' });
  eq(parseSitePath('courses'), { kind: 'courses-list' });
  eq(parseSitePath('courses/algebra-101'), { kind: 'course-detail', slug: 'algebra-101' });
  eq(parseSitePath('learn'), { kind: 'learn-index' });
  eq(parseSitePath('learn/algebra-101'), { kind: 'learn-player', courseSlug: 'algebra-101', lessonId: undefined });
  eq(parseSitePath('learn/algebra-101/lesson-3'), { kind: 'learn-player', courseSlug: 'algebra-101', lessonId: 'lesson-3' });
  eq(parseSitePath('account'), { kind: 'account', sub: undefined });
  eq(parseSitePath('account/login'), { kind: 'account', sub: 'login' });
  eq(parseSitePath('account/register'), { kind: 'account', sub: 'register' });
  eq(parseSitePath('account/orders'), { kind: 'account', sub: 'orders' });
  eq(parseSitePath('/shop/'), { kind: 'shop-list' }, 'leading/trailing slashes are trimmed');
});

test('parseSitePath falls back to a plain page for deep or unknown sub-paths', () => {
  eq(parseSitePath('blog/my-post/comments'), { kind: 'page', slug: 'blog/my-post/comments' }, 'blog only supports /blog and /blog/:slug');
  eq(parseSitePath('shop/slug/extra'), { kind: 'page', slug: 'shop/slug/extra' });
});

test('isReservedSlug', () => {
  for (const s of ['blog', 'shop', 'cart', 'checkout', 'order', 'courses', 'learn', 'account']) ok(isReservedSlug(s));
  ok(!isReservedSlug('about'));
  ok(!isReservedSlug(''));
});

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
} else {
  console.log(`site-logic: ${passed} tests passed`);
}
