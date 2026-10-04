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
import {
  checkThemeContrast, contrastRatio, DEFAULT_THEME, ensureContrast, FOOTER_STYLES, HEADER_STYLES, LAYOUT_MODES, meetsAA,
  normaliseSettings, normaliseTheme, readableTextOn,
} from '../theme';
import { isValidPageData } from '../render';
import { SITE_TEMPLATES } from '../templates';
import { SITE_COMPONENTS, BLOCK_CATEGORIES } from '../config';
import { addLine, cartCount, cartSubtotal, cartTotals, hasCourseItem, hasPhysicalItem, removeLine, setLineQty, type CartLine } from '../cart';
import { buildSrcDoc, SANDBOX_ATTR } from '../code/SandboxFrame';
import { emptyCodePageData, isCodePage, mapImportedHref, readCodePageProps } from '../code/codePage';
import { isReservedSlug, parseSitePath } from '../routes';
import { fetchSiteData, isSiteDataSource, SITE_DATA_SOURCES } from '../dataSources';
import { fetchListSource, toItems } from '../blocks/portal-data';
import type { SiteApi } from '../api';
import { applyBindings, evalRule, evalVisibility, getPath, hasVisibility, hideClasses, scopeTokens, setPath, withBinding, type VisRule } from '../binding';
import { toBanglaDigits } from '../format';
import { buildCollectionQuery, detectIncludes, itemPath, matchTemplateRoute, paramsKey, publicCollections, templateCollections } from '../collections';
import { dataListColumns } from '../blocks/portal-data';
import { DEFAULT_TEMPLATE_COLLECTIONS, defaultTemplatePage } from '../templates/collectionDefaults';
import { resolveTemplateSeo } from '../public/templateSeo';
import { findComponent } from '../tree';

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

test('profile tokens (C4): eiin, nameBn, mpo, recognition, head name/designation', () => {
  const withProfile = buildSiteTokens({
    institution: { name: 'Green Valley School', contact: {} },
    profile: { nameBn: 'গ্রিন ভ্যালি স্কুল', eiin: '123456', mpoInfo: 'MPO-9988', recognitionInfo: 'Recognised 1998', headOfInstitution: { name: 'A. Karim', designation: 'Head teacher' } },
  });
  eq(fillTokens('{{institution.eiin}}', withProfile), '123456');
  eq(fillTokens('{{institution.mpo}}', withProfile), 'MPO-9988');
  eq(fillTokens('{{institution.recognition}}', withProfile), 'Recognised 1998');
  eq(fillTokens('{{head.name}} — {{head.designation}}', withProfile), 'A. Karim — Head teacher');
  eq(fillTokens('{{institution.nameBn}}', withProfile), 'গ্রিন ভ্যালি স্কুল');
});

test('profile tokens render empty (not literal braces) before the profile has loaded', () => {
  const noProfile = buildSiteTokens({ institution: { name: 'X', contact: {} } });
  eq(fillTokens('{{institution.eiin}}', noProfile), '');
  eq(fillTokens('{{head.name}}', noProfile), '');
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

/* ── Header/footer/layout + settings normalisation (C1) ─────────────────── */

test('every header/footer style and layout mode is a distinct, valid key', () => {
  eq(HEADER_STYLES.map(([k]) => k).sort(), ['banner', 'centered', 'corporate', 'minimal', 'modern', 'portal'].sort());
  eq(FOOTER_STYLES.map(([k]) => k).sort(), ['columns', 'corporate', 'minimal', 'modern', 'portal'].sort());
  eq(LAYOUT_MODES.map(([k]) => k).sort(), ['boxed', 'full'].sort());
});

test('normaliseTheme: headerStyle/footerStyle/layout/pageBackground tolerate partial or bad input', () => {
  const t = normaliseTheme({ headerStyle: 'portal', footerStyle: 'corporate', layout: 'boxed', pageBackground: 'dots' });
  eq(t.headerStyle, 'portal');
  eq(t.footerStyle, 'corporate');
  eq(t.layout, 'boxed');
  eq(t.pageBackground, 'dots');
  const bad = normaliseTheme({ headerStyle: 'not-a-style', footerStyle: 123, layout: 'nope', pageBackground: 'javascript:alert(1)' });
  eq(bad.headerStyle, 'modern');
  eq(bad.footerStyle, 'modern');
  eq(bad.layout, 'full');
  eq(bad.pageBackground, 'none', 'an unrecognised, non-https pattern value is dropped, never executed');
  eq(normaliseTheme({ pageBackground: 'https://example.org/bg.jpg' }).pageBackground, 'https://example.org/bg.jpg');
  eq(normaliseTheme({ pageBackground: 'ftp://example.org/bg.jpg' }).pageBackground, 'none', 'only https image URLs pass through');
});

test('normaliseSettings: topBar, hotlines, importantLinks, eServices (§7.6 whitelist)', () => {
  const s = normaliseSettings({
    topBar: { showDate: true, loginLinks: [{ label: 'Login', href: '/account/login' }] },
    hotlines: [{ number: '999', label: 'Emergency' }, { number: '' }],
    importantLinks: [{ label: 'Result', href: '/results' }],
    eServices: [{ label: 'Birth cert', href: '/e/birth', icon: 'star' }],
  });
  eq(s.topBar?.showDate, true);
  eq(s.topBar?.loginLinks?.[0]?.label, 'Login');
  eq(s.hotlines?.length, 1, 'an entry with no number is dropped');
  eq(s.hotlines?.[0]?.number, '999');
  eq(s.importantLinks?.[0]?.href, '/results');
  eq(s.eServices?.[0]?.icon, 'star');
  const empty = normaliseSettings({});
  eq(empty.topBar, undefined);
  eq(empty.hotlines, undefined);
  eq(empty.importantLinks, undefined);
  eq(empty.eServices, undefined);
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

test('twenty-three templates, each with valid pages and the six standard slugs', () => {
  eq(SITE_TEMPLATES.length, 23);
  eq(new Set(SITE_TEMPLATES.map((t) => t.key)).size, 23);
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

/** Every block type used anywhere in a template (recurses into slot content, e.g. `SidebarLayout`/`SidebarCard`/`Columns`). */
function collectBlockTypes(pages: Array<{ data: { content: unknown } }>): Set<string> {
  const types = new Set<string>();
  const walk = (items: unknown): void => {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!it || typeof it !== 'object' || typeof (it as { type?: unknown }).type !== 'string') continue;
      types.add((it as { type: string }).type);
      for (const v of Object.values((it as { props?: Record<string, unknown> }).props ?? {})) {
        if (Array.isArray(v) && v[0] && typeof v[0] === 'object' && typeof (v[0] as { type?: unknown }).type === 'string') walk(v);
      }
    }
  };
  for (const p of pages) walk(p.data.content);
  return types;
}

/** The eight "portal" templates built on `templates/portal-builders.ts` — the ones DSHE-completeness applies to. */
const PORTAL_TEMPLATE_KEYS = [
  'bangla-portal', 'english-medium-corporate', 'portal-green', 'madrasa-portal', 'college-classic', 'kindergarten-bright',
  'modern-bangla', 'newspaper-style',
];

test('every portal template covers the 11 DSHE items via data-bound blocks', () => {
  const required = ['ProfileFacts', 'ClassStats', 'ClassRoutine', 'DownloadsList', 'ContactInfo', 'HeadMessage', 'StaffDirectory', 'CommitteeList'];
  const portalTemplates = SITE_TEMPLATES.filter((t) => PORTAL_TEMPLATE_KEYS.includes(t.key));
  eq(portalTemplates.length, 8, 'all eight portal templates are registered');
  for (const t of portalTemplates) {
    const types = collectBlockTypes(t.pages);
    for (const type of required) ok(types.has(type), `${t.key} is missing a "${type}" block (DSHE coverage)`);
    ok(types.has('Notices') || types.has('NoticeBoard'), `${t.key} is missing a notices block (DSHE item 5)`);
    for (const s of ['administration', 'results', 'gallery', 'downloads']) ok(t.pages.some((p) => p.slug === s), `${t.key} missing page "${s}"`);
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

/* ── SITE.data() bridge allow-list (C4) ──────────────────────────────────── */

test('isSiteDataSource: only the shared allow-list is accepted', () => {
  for (const s of SITE_DATA_SOURCES) ok(isSiteDataSource(s), `${s} should be allowed`);
  ok(!isSiteDataSource('admin-only'));
  ok(!isSiteDataSource('__proto__'));
  ok(!isSiteDataSource(123));
  ok(!isSiteDataSource(null));
  ok(!isSiteDataSource(undefined));
});

test('buildSrcDoc exposes SITE.data() and the same allow-list the parent enforces', () => {
  const doc = buildSrcDoc({ html: '', theme: DEFAULT_THEME });
  ok(doc.includes('window.SITE'), 'exposes window.SITE');
  ok(doc.includes('pendingData'), 'SITE.data() tracks pending requests by id');
  ok(doc.includes('dataSources'), 'lists the allowed sources for callers to introspect');
  ok(doc.includes('data-result'), 'listens for the parent’s typed reply');
  for (const s of ['notices', 'committee', 'albums', 'admissions', 'profile']) ok(doc.includes(`"${s}"`), `allow-list mentions "${s}"`);
});

test('fetchSiteData dispatches to the matching SiteApi method for every source (never an unrelated one)', () => {
  const calls: string[] = [];
  const method = (name: string) => (...args: unknown[]) => { calls.push(`${name}(${JSON.stringify(args)})`); return Promise.resolve(null); };
  const api = {
    notices: method('notices'), events: method('events'), teachers: method('teachers'), staff: method('staff'),
    posts: method('posts'), courses: method('courses'), products: method('products'), profile: method('profile'),
    stats: method('stats'), toppers: method('toppers'), routine: method('routine'), feesLink: method('feesLink'),
    classStats: method('classStats'), subjects: method('subjects'), examRoutine: method('examRoutine'),
    resultSummary: method('resultSummary'), resultsArchive: method('resultsArchive'), feeChart: method('feeChart'),
    holidaysCalendar: method('holidaysCalendar'), library: method('library'), transport: method('transport'),
    branches: method('branches'), committee: method('committee'), albums: method('albums'), downloads: method('downloads'),
    admissions: method('admissions'),
  } as unknown as SiteApi;
  for (const source of SITE_DATA_SOURCES) void fetchSiteData('site1', api, source, {});
  eq(calls.length, SITE_DATA_SOURCES.length, 'every source resolves to exactly one API call');
  // Spot-check a few non-obvious ones (name differs from the source key, or the source key is shared by two sub-categories).
  ok(calls.some((c) => c.startsWith('staff(')), '"teachers" and "staff" sources both call api.staff with a category');
  ok(calls.some((c) => c.startsWith('holidaysCalendar(')), '"holidays" source calls api.holidaysCalendar');
  ok(calls.some((c) => c.startsWith('resultsArchive(')), '"results-archive" source calls api.resultsArchive');
});

/* ── Generic DataList: source/param mapping + item normalisation (C2) ──── */

test('DataList: fetchListSource maps each preset source to the right call and params', () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const method = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); return Promise.resolve(null); };
  const api = {
    notices: method('notices'), staff: method('staff'), committee: method('committee'), downloads: method('downloads'),
    albums: method('albums'), admissions: method('admissions'), holidaysCalendar: method('holidaysCalendar'),
    branches: method('branches'), resultsArchive: method('resultsArchive'),
  } as unknown as SiteApi;

  void fetchListSource('teachers', 'site1', api, {});
  void fetchListSource('staff', 'site1', api, {});
  eq(calls.filter((c) => c.name === 'staff').map((c) => c.args[1]), [{ category: 'teachers' }, { category: 'staff' }], '"teachers"/"staff" both call api.staff, distinguished only by category');

  void fetchListSource('downloads', 'site1', api, { category: 'syllabus' });
  eq(calls.find((c) => c.name === 'downloads')?.args[1], { category: 'syllabus' }, 'the category prop passes through to the API call');

  void fetchListSource('holidays', 'site1', api, { year: 2027 });
  eq(calls.find((c) => c.name === 'holidaysCalendar')?.args[1], { year: 2027 });

  void fetchListSource('notices', 'site1', api, { limit: 3 });
  eq(calls.find((c) => c.name === 'notices')?.args[1], 3, 'limit is clamped/passed as a plain number for notices');

  void fetchListSource('results-archive', 'site1', api, {});
  ok(calls.some((c) => c.name === 'resultsArchive'));
});

test('DataList: toItems maps every source to the common { id, title, href, date, badge } shape', () => {
  const notices = toItems('notices', [{ id: 'n1', title: 'Exam routine published', body: 'Details inside', date: '2026-01-05', priority: 'high' }], 'en');
  eq(notices[0], { id: 'n1', title: 'Exam routine published', description: 'Details inside', date: '2026-01-05', href: '/notices/n1', badge: '!' });

  const albums = toItems('albums', { items: [{ id: 'a1', title: 'Sports day', titleBn: 'ক্রীড়া দিবস', coverUrl: 'https://x/y.jpg', photoCount: 12, eventDate: '2026-02-01' }] }, 'bn');
  eq(albums[0].title, 'ক্রীড়া দিবস', 'Bangla title picked when lang=bn');
  eq(albums[0].href, '/gallery/a1', 'album detail href matches the sitemap path');
  eq(albums[0].subtitle, '12 photos');

  const admissions = toItems('admissions', { items: [{ id: 'ad1', title: 'Class 6 admission', classNames: ['Six'], session: '2026-27', closed: true }] }, 'en');
  eq(admissions[0].href, '/admissions/ad1');
  eq(admissions[0].badge, 'Closed');

  const committee = toItems('committee', [{ name: 'Md. Karim', role: 'Chairman', phone: null }], 'en');
  eq(committee[0].description, undefined, 'a committee member with no visible phone shows no description line');

  const holidays = toItems('holidays', { items: [{ date: '2026-04-14', title: 'Bengali New Year', isTentative: true }] }, 'en');
  eq(holidays[0].badge, 'Tentative');
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

/* ── Imported-link mapping (Track D — ZIP/HTML import) ──────────────────── */

test('mapImportedHref: common static-export link shapes', () => {
  eq(mapImportedHref('index.html'), '/');
  eq(mapImportedHref('about.html'), '/about');
  eq(mapImportedHref('about/'), '/about');
  eq(mapImportedHref('about'), '/about');
  eq(mapImportedHref('./about.html'), '/about');
  eq(mapImportedHref('about/index.html'), '/about');
});

test('mapImportedHref: nested paths join with -, and a reserved slug gets the -page suffix Track D actually saved it under', () => {
  eq(mapImportedHref('blog/index.html'), '/blog-page');
  eq(mapImportedHref('blog/index.html', ['blog-page', 'about']), '/blog-page');
  eq(mapImportedHref('academics/admission/index.html'), '/academics-admission');
});

test('mapImportedHref: keeps #hash and ?query', () => {
  eq(mapImportedHref('about.html#team'), '/about#team');
  eq(mapImportedHref('about.html?ref=1'), '/about?ref=1');
});

test('mapImportedHref: external, mailto/tel/javascript and hash-only links return null', () => {
  eq(mapImportedHref('https://example.com'), null);
  eq(mapImportedHref('//example.com/x'), null);
  eq(mapImportedHref('mailto:a@b.com'), null);
  eq(mapImportedHref('tel:+8801700000000'), null);
  eq(mapImportedHref('javascript:void(0)'), null);
  eq(mapImportedHref('#top'), null);
  eq(mapImportedHref(''), null);
});

test('bridge srcdoc intercepts imported-style links and maps them through window.SITE.navigate', () => {
  const doc = buildSrcDoc({ html: '<a href="about.html">About</a>', js: '', theme: DEFAULT_THEME });
  ok(doc.includes("addEventListener('click'"), 'listens for clicks');
  ok(doc.includes('mapHref'), 'maps hrefs before navigating');
  ok(doc.includes('window.SITE.navigate(mapped)'), 'calls the existing SITE.navigate bridge');
  ok(doc.includes("a.target === '_blank'"), 'skips target=_blank');
  ok(doc.includes('e.metaKey'), 'skips modifier-key clicks (open in new tab)');
  ok(doc.includes("/^#/.test(href)"), 'leaves hash-only anchors to native in-frame scrolling');
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

test('parseSitePath: notice/album/admission detail routes (C3 — must match the sitemap exactly)', () => {
  eq(parseSitePath('notices/abc123'), { kind: 'notice-detail', id: 'abc123' });
  eq(parseSitePath('gallery/abc123'), { kind: 'album-detail', id: 'abc123' });
  eq(parseSitePath('admissions/abc123'), { kind: 'admission-detail', id: 'abc123' });
  // The single-segment form stays a normal content page (several templates ship a page with exactly this slug).
  eq(parseSitePath('notices'), { kind: 'page', slug: 'notices' });
  eq(parseSitePath('gallery'), { kind: 'page', slug: 'gallery' });
  eq(parseSitePath('admissions'), { kind: 'page', slug: 'admissions' });
  // A third segment falls back to a plain page (no such detail route).
  eq(parseSitePath('notices/abc/extra'), { kind: 'page', slug: 'notices/abc/extra' });
});

test('parseSitePath: account/forgot and account/reset-password (C3 site-customer recovery)', () => {
  eq(parseSitePath('account/forgot'), { kind: 'account', sub: 'forgot' });
  eq(parseSitePath('account/reset-password'), { kind: 'account', sub: 'reset-password' });
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

/* ── Data binding, scopes, visibility, collections (Website Builder W2–W6) ── */

test('getPath / setPath handle dots, indexes and block prototype keys', () => {
  const o = { a: { b: [{ c: 'x' }] } };
  eq(getPath(o, 'a.b[0].c'), 'x');
  eq(getPath(o, 'a.b.0.c'), 'x');
  eq(getPath(o, '__proto__.x'), undefined);
  eq(setPath({ items: [{ t: 'a' }] }, 'items[0].t', 'z'), { items: [{ t: 'z' }] });
  eq(setPath({}, 'a.b', 1), { a: { b: 1 } });
});

test('applyBindings: item/parent/page/site, fmt, fallback, missing scope keeps literal', () => {
  const scope = { item: { name: 'Rahim', date: '2026-03-12', fee: 1500, empty: '' }, parent: { name: 'Class 8' }, page: { slug: 'p' }, site: { 'institution.name': 'Green Valley' } };
  const props = {
    heading: 'literal', sub: 'literal', when: 'literal', price: 'literal', blank: 'literal', cls: 'literal', who: 'literal', up: 'literal',
    _bind: {
      heading: { src: 'item', path: 'name' }, sub: { src: 'parent', path: 'name' }, when: { src: 'item', path: 'date', fmt: 'date:long' },
      price: { src: 'item', path: 'fee', fmt: 'money' }, blank: { src: 'item', path: 'empty', fallback: 'n/a' }, cls: { src: 'item', path: 'nope' },
      who: { src: 'site', path: 'institution.name' }, up: { src: 'item', path: 'name', fmt: 'upper' },
    },
  };
  const out = applyBindings(props, scope) as Record<string, unknown>;
  eq(out.heading, 'Rahim');
  eq(out.sub, 'Class 8');
  eq(out.when, '12 March 2026');
  eq(out.price, '৳1,500');
  eq(out.blank, 'n/a');
  eq(out.cls, '', 'scope present but field missing gives empty, never stale placeholder');
  eq(out.who, 'Green Valley');
  eq(out.up, 'RAHIM');
  eq((applyBindings({ a: 'lit', _bind: { a: { src: 'item', path: 'name' } } }, {}) as Record<string, unknown>).a, 'lit');
  eq((applyBindings({ list: [{ t: 'x' }], _bind: { 'list[0].t': { src: 'item', path: 'name' } } }, scope) as { list: { t: string }[] }).list[0].t, 'Rahim');
  eq(toBanglaDigits('2026'), '২০২৬');
});

test('withBinding adds, replaces and removes entries', () => {
  const a = withBinding(undefined, 'text', { src: 'item', path: 'name' });
  eq(Object.keys(a ?? {}), ['text']);
  const b = withBinding(a, 'href', { src: 'item', path: '_url' });
  eq(Object.keys(b ?? {}).sort(), ['href', 'text']);
  eq(withBinding(b, 'href', null), { text: { src: 'item', path: 'name' } });
  eq(withBinding(a, 'text', null), undefined);
});

test('scope tokens: item / parent / url with |fmt, escaping, kept for templates', () => {
  const scope = { item: { title: 'Open Day', when: '2026-03-12', tags: ['a', 'b'], nested: { deep: 'ok' } }, parent: { name: 'Class 8' }, url: { q: 'physics' } };
  const t = { ...tokens, ...scopeTokens(scope) };
  eq(fillTokens('{{item.title}} / {{parent.name}} / {{url.q}} / {{item.nested.deep}} / {{item.tags}}', t), 'Open Day / Class 8 / physics / ok / a, b');
  eq(fillTokens('{{item.when|date:long}}', t, { lang: 'en' }), '12 March 2026');
  eq(fillTokens('{{ item.title | upper }}', t), 'OPEN DAY');
  eq(fillTokens('{{item.missing}}', t), '');
  eq(fillTokens('<b>{{item.title}}</b>', { 'item.title': '<i>' }, { escape: true }), '<b>&lt;i&gt;</b>');
  eq(fillTokens('{{item.title}} {{year}}', tokens, { keepScopeTokens: true }), '{{item.title}} 2026');
  eq(fillTokensDeep({ a: '{{item.x}} {{institution.name}}' }, tokens, { keepScopeTokens: true }), { a: '{{item.x}} Green Valley School' });
});

test('visibility: operators, match all/any, device classes', () => {
  const scope = { item: { name: 'A', n: 5, d: '2026-03-12', tags: ['x', 'y'], e: '', closed: false }, url: { dept: 'Science' } };
  const r = (rule: VisRule) => evalRule(rule, scope);
  ok(r({ src: 'item', path: 'e', op: 'empty' }));
  ok(r({ src: 'item', path: 'name', op: 'notEmpty' }));
  ok(r({ src: 'item', path: 'name', op: 'eq', value: 'a' }), 'case-insensitive');
  ok(r({ src: 'item', path: 'name', op: 'neq', value: 'b' }));
  ok(r({ src: 'item', path: 'n', op: 'gt', value: '4' }));
  ok(!r({ src: 'item', path: 'n', op: 'lt', value: '4' }));
  ok(r({ src: 'item', path: 'd', op: 'gt', value: '2026-01-01' }), 'dates');
  ok(r({ src: 'item', path: 'tags', op: 'contains', value: 'y' }));
  ok(!r({ src: 'item', path: 'name', op: 'contains', value: '' }));
  ok(r({ src: 'url', path: 'dept', op: 'eq', value: 'science' }));
  ok(r({ src: 'item', path: 'closed', op: 'neq', value: 'true' }));
  const yes: VisRule = { src: 'item', path: 'name', op: 'notEmpty' };
  const no: VisRule = { src: 'item', path: 'e', op: 'notEmpty' };
  ok(evalVisibility({ match: 'all', when: [yes, yes] }, scope));
  ok(!evalVisibility({ match: 'all', when: [yes, no] }, scope));
  ok(evalVisibility({ match: 'any', when: [yes, no] }, scope));
  ok(evalVisibility(undefined, scope) && evalVisibility({ when: [] }, scope), 'no rules means visible');
  eq(hideClasses({ hideOn: ['sm', 'lg', 'sm'] }), 'site-hide-sm site-hide-lg');
  ok(hasVisibility({ hideOn: ['md'] }) && !hasVisibility({ when: [], hideOn: [] }) && !hasVisibility(undefined));
});

test('every block (and the designer blocks) carries _visible; CollectionList is registered', () => {
  for (const k of ['Text', 'Picture', 'LinkButton', 'Badge', 'Stack', 'Grid', 'CollectionList', 'Heading', 'DataList']) {
    ok(k in SITE_COMPONENTS, `missing ${k}`);
    ok('_visible' in ((SITE_COMPONENTS as Record<string, { fields?: object }>)[k].fields ?? {}), `${k} lacks _visible`);
  }
});

test('DataList columns setting is honoured (was ignored)', () => {
  eq(dataListColumns('2'), { sm: 1, md: 2, lg: 2 });
  eq(dataListColumns('3'), { sm: 1, md: 2, lg: 3 });
  eq(dataListColumns('4'), { sm: 1, md: 2, lg: 4 });
  eq(dataListColumns(undefined), { sm: 1, md: 2, lg: 3 });
});

test('collection query building: filters from literal/url/item, skipping empties, sort, search, paging', () => {
  const scope = { item: { dept: 'Arts', level: 8 }, url: { dept: 'Science', q: 'phys' } };
  const q = buildCollectionQuery({
    filters: [
      { field: 'department', op: 'eq', source: 'url', value: 'dept' },
      { field: 'level', op: 'gte', source: 'item', value: 'level' },
      { field: 'subject', op: 'contains', source: 'literal', value: '{{url.q}}' },
      { field: 'name', op: 'eq', source: 'url', value: 'missing' },
      { field: 'department', op: 'eq', source: 'literal', value: 'dup' },
      { field: 'x', op: 'bogus' as never, source: 'literal', value: '1' },
    ],
    sortField: 'name', sortDir: 'desc', search: '{{url.q}}', limit: 100, paginate: 'pages', include: ['classes', 'classes'],
  }, scope, { page: 3 });
  eq(q, { 'filter[department][eq]': 'Science', 'filter[level][gte]': '8', 'filter[subject][contains]': 'phys', sort: '-name', q: 'phys', pageSize: 50, page: 3, include: 'classes' });
  eq(buildCollectionQuery({ limit: 6 }, {}), { pageSize: 6, page: 1 });
  eq(buildCollectionQuery({ paginate: 'more' }, {}).pageSize, 12);
  eq(buildCollectionQuery({}, {}).pageSize, 50);
  eq(paramsKey({ b: 1, a: 2 }), 'a=2&b=1');
});

test('detectIncludes finds relations read by bindings, tokens and nested lists', () => {
  const content = [
    { type: 'Text', props: { id: 'a', _bind: { text: { src: 'item', path: 'classes[0].name' } } } },
    { type: 'Text', props: { id: 'b', text: '{{item.subjects}}' } },
    { type: 'CollectionList', props: { id: 'c', sourceKind: 'relation', relation: 'routine', item: [] } },
    { type: 'Text', props: { id: 'd', text: 'classesroom {{item.className}}' } },
  ];
  eq(detectIncludes(content, ['classes', 'subjects', 'routine', 'photos', 'class']), ['classes', 'subjects', 'routine']);
  eq(detectIncludes(content, []), []);
});

test('template routes: match base/:slug only, decode, list page stays a page', () => {
  const routes = [{ collection: 'teachers', base: '/teachers', pageSlug: 'template-teachers' }, { collection: 'albums', base: '/gallery', pageSlug: 'template-albums' }];
  eq(matchTemplateRoute('teachers/rahim-k3f9a2', routes)?.slug, 'rahim-k3f9a2');
  eq(matchTemplateRoute('/gallery/abc/', routes)?.route.collection, 'albums');
  eq(matchTemplateRoute('teachers', routes), null);
  eq(matchTemplateRoute('teachers/a/b', routes), null);
  eq(matchTemplateRoute('classes/x', routes), null);
  eq(matchTemplateRoute('teachers/x', undefined), null);
  eq(matchTemplateRoute('teachers/a%20b', routes)?.slug, 'a b');
  eq(itemPath({ routeBase: '/teachers' }, 'rahim'), '/teachers/rahim');
  eq(itemPath({ routeBase: null }, 'x'), null);
});

test('privacy: no students collection is ever offered', () => {
  const mk = (key: string, route: string | null) => ({ key, label: key, labelPlural: key, available: true, unavailableReason: null, titleField: 'name', routeBase: route, defaultSort: '', maxPageSize: 50, fields: [], relations: [] });
  const list = [mk('teachers', '/teachers'), mk('students', '/students'), mk('guardians', null), mk('classes', '/classes'), mk('downloads', null)];
  eq(publicCollections(list).map((c) => c.key), ['teachers', 'classes', 'downloads']);
  eq(templateCollections(list).map((c) => c.key), ['teachers', 'classes']);
});

test('default template pages: valid page data, unique ids, SEO tokens', () => {
  eq([...DEFAULT_TEMPLATE_COLLECTIONS].sort(), ['admissions', 'albums', 'classes', 'events', 'notices', 'teachers']);
  for (const key of DEFAULT_TEMPLATE_COLLECTIONS) {
    const d = defaultTemplatePage(key)!;
    ok(isValidPageData(d.data), `${key} template is valid page data`);
    const json = JSON.stringify(d.data);
    const ids = [...json.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
    eq(new Set(ids).size, ids.length, `${key} block ids are unique`);
    ok(String(d.seo.title).includes('{{item.'), 'SEO title uses item tokens');
  }
  ok(defaultTemplatePage('students') === null);
});

test('template SEO: tokens filled from the item; falls back to API seo, then title field', () => {
  const base = { item: { name: 'Rahim Uddin', slug: 's' }, titleField: 'name', siteName: 'Green Valley', siteTokens: tokens, lang: 'en' as const, itemSeo: { title: 'API title', description: 'API desc', image: 'https://x/i.png' } };
  eq(resolveTemplateSeo({ ...base, pageSeo: { title: '{{item.name}} - Faculty | {{site.name}}', description: '' } }).title, 'Rahim Uddin - Faculty | Green Valley School');
  const fb = resolveTemplateSeo({ ...base, pageSeo: {} });
  eq(fb.title, 'API title | Green Valley');
  eq(fb.description, 'API desc');
  eq(fb.ogImage, 'https://x/i.png');
  eq(resolveTemplateSeo({ ...base, itemSeo: undefined, pageSeo: {} }).title, 'Rahim Uddin | Green Valley');
});

test('findComponent locates blocks inside slots', () => {
  const data = { content: [{ type: 'Stack', props: { id: 's', content: [{ type: 'CollectionList', props: { id: 'L', item: [{ type: 'Text', props: { id: 't' } }] } }] } }] };
  eq(findComponent(data, 'L')?.type, 'CollectionList');
  eq(findComponent(data, 't')?.type, 'Text');
  eq(findComponent(data, 'zz'), null);
});

/* ── Report ─────────────────────────────────────────────────────────────── */

test('settings accept the admin screen spellings (phone/url) for hotlines and links', () => {
  const s = normaliseSettings({
    hotlines: [{ phone: '999', label: 'Emergency' }, { number: '109' }, { label: 'no number' }],
    importantLinks: [{ label: 'Board', url: 'https://dhakaeducationboard.gov.bd' }, { label: 'Old', href: '/old' }],
    eServices: [{ label: 'Pay fees', url: '/fees', icon: 'card' }],
  });
  eq(s.hotlines?.map((h) => h.number), ['999', '109']);
  eq(s.importantLinks?.map((l) => l.href), ['https://dhakaeducationboard.gov.bd', '/old']);
  eq(s.eServices?.[0]?.href, '/fees');
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
} else {
  console.log(`site-logic: ${passed} tests passed`);
}
