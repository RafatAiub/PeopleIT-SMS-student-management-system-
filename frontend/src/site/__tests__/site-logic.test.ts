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
import { checkThemeContrast, contrastRatio, ensureContrast, meetsAA, normaliseTheme, readableTextOn } from '../theme';
import { isValidPageData } from '../render';
import { SITE_TEMPLATES } from '../templates';
import { SITE_COMPONENTS, BLOCK_CATEGORIES } from '../config';

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

test('ten templates, each with valid pages and the six standard slugs', () => {
  eq(SITE_TEMPLATES.length, 10);
  eq(new Set(SITE_TEMPLATES.map((t) => t.key)).size, 10);
  for (const t of SITE_TEMPLATES) {
    const slugs = t.pages.map((p) => p.slug);
    for (const s of ['', 'about', 'admissions', 'academics', 'notices', 'contact']) ok(slugs.includes(s), `${t.key} missing page "${s}"`);
    eq(new Set(slugs).size, slugs.length, `${t.key} duplicate slugs`);
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

/* ── Report ─────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
} else {
  console.log(`site-logic: ${passed} tests passed`);
}
