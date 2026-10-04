/**
 * Pure-logic tests for website custom modules (W13–W17): Liquid filters, the
 * {% collection %} tag (grammar, params, async fetch), the CSS scoper, the
 * fields-schema → Puck fields mapping, palette-alias normalisation, value
 * resolution, and the guide's "Teacher spotlight" example rendered with
 * sample data (docs/website-builder/GUIDE.md §7.2) — plus every starter.
 *
 * Self-running (no test runner in the frontend), like site-logic.test.ts:
 *
 *   npx esbuild src/site/__tests__/modules-logic.test.ts --bundle --platform=node \
 *     --loader:.css=empty --jsx=automatic --outfile=<tmp>/modules-tests.cjs && node <tmp>/modules-tests.cjs
 */
import type { Field } from '@puckeditor/core';
import { daysUntil, formatNum, formatTaka, renderLiquid, translateValue, checkTemplate, MODULE_FILTER_NAMES, type LiquidEnv } from '../modules/engine';
import { parseCollectionTagArgs, tagQueryParams, isQueryableCollection } from '../modules/collectionTag';
import { scopeCss, scopeSelector, moduleScopeAttr, cssForStyleTag } from '../modules/cssScope';
import { renderMarkdown } from '../modules/markdown';
import { moduleFieldsToPuck, type FieldControls } from '../modules/puckFields';
import { normaliseModuleTypes } from '../modules/registry';
import { renderModule } from '../modules/moduleRender';
import { STARTER_MODULES } from '../modules/starters';
import {
  collectionFieldQuery, defaultValues, moduleAliasType, moduleItem, nestTokens, normaliseFields, resolveModuleValues, toModuleDef, type Rec,
} from '../modules/types';
import type { CollectionParams } from '../collections';

let passed = 0;
const failures: string[] = [];
const queue: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { queue.push({ name, fn }); }
function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}
function ok(cond: unknown, msg = 'expected truthy') { if (!cond) throw new Error(msg); }
function has(haystack: string, needle: string) { if (!haystack.includes(needle)) throw new Error(`expected output to contain ${JSON.stringify(needle)}\n--- output ---\n${haystack}`); }
function lacks(haystack: string, needle: string) { if (haystack.includes(needle)) throw new Error(`expected output NOT to contain ${JSON.stringify(needle)}\n--- output ---\n${haystack}`); }
async function throwsAsync(fn: () => Promise<unknown>, re: RegExp): Promise<Error & { line?: number | null }> {
  try { await fn(); } catch (e) {
    if (!re.test(String((e as Error).message))) throw new Error(`error ${JSON.stringify((e as Error).message)} does not match ${re}`);
    return e as Error & { line?: number | null };
  }
  throw new Error(`expected an error matching ${re}`);
}

const noFetch: LiquidEnv['fetchCollection'] = async () => [];
const env = (lang: 'en' | 'bn' = 'en', fetchCollection = noFetch): LiquidEnv => ({ lang, fetchCollection, now: () => new Date('2026-10-04T06:00:00Z') });

/* ── The guide's §7.2 example, verbatim ─────────────────────────────────── */

const GUIDE_FIELDS = [
  { key: 'heading', type: 'text', label: 'Heading', bn: true, default: 'Our teachers' },
  { key: 'teachers', type: 'collection', collection: 'teachers', limit: 6, sort: 'name' },
  { key: 'show_subject', type: 'boolean', label: 'Show subject', default: true },
];
const GUIDE_TEMPLATE = `<section class="spotlight">
  <h2>{{ module.heading | t }}</h2>
  <div class="grid">
  {% for t in module.teachers %}
    <a class="card" href="{{ t.url }}">
      <img src="{{ t.photo | img: 400 }}" alt="{{ t.name }}">
      <h3>{{ t.name }}</h3>
      {% if module.show_subject and t.subject %}<p>{{ t.subject }}</p>{% endif %}
    </a>
  {% else %}
    <p>{{ 'No teachers yet' | t }}</p>
  {% endfor %}
  </div>
</section>`;
const GUIDE_CSS = `.spotlight .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.spotlight .card { border-radius: var(--site-radius); padding: 12px; background: var(--site-surface); text-decoration: none; }`;

/** What the collections API returns for teachers (§8.3), after decorateItem added `_url`. */
const SAMPLE_TEACHERS: Rec[] = [
  { slug: 'rahim-uddin-k3f9a2', name: 'Rahim Uddin', photoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/rahim.jpg', designation: 'Senior Teacher', subject: 'Physics', _url: '/teachers/rahim-uddin-k3f9a2' },
  { slug: 'nasrin-akter-p2q8m1', name: 'Nasrin <Akter>', photoUrl: null, designation: 'Teacher', subject: null, _url: '/teachers/nasrin-akter-p2q8m1' },
];

/* ── Filters ────────────────────────────────────────────────────────────── */

test('money: ৳ with Bangladeshi grouping, Bangla digits in bn', () => {
  eq(formatTaka(1234567), '৳12,34,567');
  eq(formatTaka(999), '৳999');
  eq(formatTaka(1500.5), '৳1,500.50');
  eq(formatTaka(-25000), '-৳25,000');
  eq(formatTaka(1234567, 'bn'), '৳১২,৩৪,৫৬৭');
  eq(formatTaka('abc'), 'abc');
  eq(formatTaka(null), '');
});

test('num, days_until, t', () => {
  eq(formatNum(98.456, 'en', 1), '98.5');
  eq(formatNum(1234567, 'bn'), '১২,৩৪,৫৬৭');
  eq(daysUntil('2026-10-10', new Date('2026-10-04T06:00:00Z')), 6);
  eq(daysUntil('2026-10-01', new Date('2026-10-04T06:00:00Z')), -3);
  eq(daysUntil('nope'), null);
  eq(translateValue({ en: 'Hello', bn: 'হ্যালো' }, 'bn'), 'হ্যালো');
  eq(translateValue({ en: 'Hello', bn: '' }, 'bn'), 'Hello');
  eq(translateValue('No teachers yet', 'bn'), 'এখনো কোনো শিক্ষক নেই');
  eq(translateValue('No teachers yet', 'en'), 'No teachers yet');
  eq(translateValue('Apply', 'bn', 'আবেদন'), 'আবেদন');
  eq(translateValue('Something unknown', 'bn'), 'Something unknown');
});

test('filters in templates: date presets, strftime, bn_digits, img, markdown (escape-safe), escape on by default', async () => {
  eq(await renderLiquid(`{{ d | date: '%Y-%m-%d' }}`, { d: '2026-03-12T10:00:00Z' }, env()), '2026-03-12');
  has(await renderLiquid(`{{ d | date }}`, { d: '2026-03-12' }, env()), 'March 2026');
  has(await renderLiquid(`{{ d | date: 'long' }}`, { d: '2026-03-12' }, env('bn')), 'মার্চ');
  eq(await renderLiquid(`{{ '2026' | bn_digits }}`, {}, env()), '২০২৬');
  eq(await renderLiquid(`{{ u | img: 400 }}`, { u: 'https://res.cloudinary.com/x/image/upload/a.jpg' }, env()), 'https://res.cloudinary.com/x/image/upload/f_auto,q_auto,c_limit,w_400/a.jpg');
  eq(await renderLiquid(`{{ u | img: 400 }}`, { u: null }, env()), '');
  eq(await renderLiquid(`{{ x }}`, { x: '<script>alert(1)</script>' }, env()), '&lt;script&gt;alert(1)&lt;/script&gt;');
  eq(await renderLiquid(`{{ x | raw }}`, { x: '<b>ok</b>' }, env()), '<b>ok</b>');
  const md = await renderLiquid(`{{ x | markdown }}`, { x: '**Hi** <img src=x onerror=alert(1)>\n- a\n- [link](javascript:alert(1))\n- [ok](/about)' }, env());
  has(md, '<strong>Hi</strong> &lt;img');
  has(md, '<li><a href="/about">ok</a></li>');
  lacks(md, 'javascript:');
  lacks(md, '<img');
  eq(await renderLiquid(`{{ 1500 | money }}`, {}, env('bn')), '৳১,৫০০');
  eq(await renderLiquid(`{{ d | days_until }}`, { d: '2026-10-14' }, env()), '10');
  eq(MODULE_FILTER_NAMES.length, 7);
});

test('markdown helper', () => {
  eq(renderMarkdown('# Title\nline one\nline two\n\n1. a\n2. b'), '<h3>Title</h3>\n<p>line one<br>line two</p>\n<ol><li>a</li><li>b</li></ol>');
  eq(renderMarkdown('`<b>` and *it*'), '<p><code>&lt;b&gt;</code> and <em>it</em></p>');
});

/* ── Errors / safety ────────────────────────────────────────────────────── */

test('template errors carry line numbers; include/render/layout are blocked; unknown filters fail', async () => {
  const e1 = await throwsAsync(() => renderLiquid('<p>ok</p>\n<p>{{ x | nope }}</p>', {}, env()), /undefined filter: nope/);
  eq(e1.line, 2);
  const e2 = checkTemplate('a\nb\n{% if x %}\nno end');
  ok(e2 && e2.line === 3, `line of unclosed if: ${e2?.line}`);
  await throwsAsync(() => renderLiquid('{% include "secret" %}', {}, env()), /not available in modules/);
  await throwsAsync(() => renderLiquid('{% render "x" %}', {}, env()), /not available/);
  await throwsAsync(() => renderLiquid('{% layout "x" %}', {}, env()), /not available/);
  eq(checkTemplate('{{ a | t | bn_digits | money | num | img: 3 | markdown | days_until }}'), null);
});

test('scope is data only: functions/prototype are never reachable', async () => {
  eq(await renderLiquid(`{{ module.constructor }}{{ module.__proto__ }}{{ x.toString }}`, { module: {}, x: 'a' }, env()), '');
});

/* ── {% collection %} ───────────────────────────────────────────────────── */

test('collection tag: grammar', () => {
  const r = parseCollectionTagArgs(`"notices" limit:5 sort:"-publishedAt" filter.title.contains:'exam' q:url.query.q as notices`);
  eq(r, {
    collection: 'notices',
    options: [
      { name: 'limit', value: { kind: 'number', value: 5 } },
      { name: 'sort', value: { kind: 'string', value: '-publishedAt' } },
      { name: 'filter.title.contains', value: { kind: 'string', value: 'exam' } },
      { name: 'q', value: { kind: 'var', value: 'url.query.q' } },
    ],
    as: 'notices',
  });
  eq(parseCollectionTagArgs(`"exam-routine"`).as, 'exam_routine');
  const bad = (src: string, re: RegExp) => {
    try { parseCollectionTagArgs(src); } catch (e) { if (re.test((e as Error).message)) return; throw new Error(`wrong error for ${src}: ${(e as Error).message}`); }
    throw new Error(`expected ${src} to fail`);
  };
  bad('notices', /quoted/);
  bad('"notices" colour:"red"', /Unknown option/);
  bad('"notices" limit:0', /1–50/);
  bad('"notices" limit:5 limit:6', /twice/);
  bad('"notices" as n extra:1', /must come last/);
  bad('"notices" filter.title.like:"x"', /Unknown option/);
  ok(!isQueryableCollection('students'), 'students must never be queryable');
  ok(isQueryableCollection('teachers'));
});

test('collection tag: params (empty values dropped, caps)', () => {
  eq(tagQueryParams([{ name: 'limit', value: 5 }, { name: 'sort', value: '-date' }, { name: 'filter.department', value: 'Science' }, { name: 'q', value: '' }, { name: 'filter.level.in', value: [6, 7] }]),
    { pageSize: 5, sort: '-date', 'filter[department][eq]': 'Science', 'filter[level][in]': '6,7', page: 1 });
  eq(tagQueryParams([{ name: 'limit', value: 500 }]).pageSize, 50);
  eq(tagQueryParams([]), { pageSize: 10, page: 1 });
});

test('collection tag: queries through the host fetcher with evaluated variables, max 8 per render', async () => {
  const calls: Array<[string, CollectionParams]> = [];
  const fetcher: LiquidEnv['fetchCollection'] = async (key, params) => { calls.push([key, params]); return [{ title: `N-${key}` }]; };
  const out = await renderLiquid(
    `{% collection "notices" limit:2 sort:"-publishedAt" filter.title.contains:url.query.q as list %}{% for n in list %}[{{ n.title }}]{% endfor %}`,
    { url: { query: { q: 'exam' } } },
    env('en', fetcher),
  );
  eq(out, '[N-notices]');
  eq(calls, [['notices', { pageSize: 2, sort: '-publishedAt', 'filter[title][contains]': 'exam', page: 1 }]]);
  await throwsAsync(() => renderLiquid(`{% collection "students" as s %}`, {}, env('en', fetcher)), /Unknown collection/);
  const nine = Array.from({ length: 9 }, (_, i) => `{% collection "notices" page:${i + 1} as n${i} %}`).join('');
  await throwsAsync(() => renderLiquid(nine, {}, env('en', fetcher)), /Too many/);
});

/* ── CSS scoper ─────────────────────────────────────────────────────────── */

test('css scoper', () => {
  const S = moduleScopeAttr('CustomModule-abc');
  eq(S, '[data-module="CustomModule-abc"]');
  eq(moduleScopeAttr('a"]{x}'), '[data-module="a___x_"]');
  eq(scopeCss('.a, .b:hover { color: red }', S), `${S} .a, ${S} .b:hover { color: red }`);
  eq(scopeSelector(':root', S), S);
  eq(scopeSelector('body .x', S), `${S} .x`);
  eq(scopeSelector('html body .x', S), `${S} .x`);
  eq(scopeSelector('a[title="x,y"]', S), `${S} a[title="x,y"]`);
  const out = scopeCss(`/* c */ @import url(evil.css);
@media (max-width: 600px) { .a { x: 1 } .b, .c { y: 2 } }
@keyframes spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }
@font-face { font-family: X; src: url(x.woff2) }
.d:is(.e, .f) > p::before { content: "a, b { }" }`, S);
  lacks(out, '@import');
  lacks(out, '/* c */');
  has(out, `@media (max-width: 600px) {\n${S} .a { x: 1 }\n${S} .b, ${S} .c { y: 2 }\n}`);
  has(out, '@keyframes spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }');
  has(out, '@font-face { font-family: X; src: url(x.woff2) }');
  has(out, `${S} .d:is(.e, .f) > p::before { content: "a, b { }" }`);
  eq(scopeCss('', S), '');
  // Unknown block at-rules are scoped too (no escape hatch).
  eq(scopeCss('@starting-style { body { opacity: 0 } }', S), `@starting-style {
${S} { opacity: 0 }
}`);
  eq(cssForStyleTag('a{}</style><script>'), 'a{}<\\/style><script>');
  // The guide's CSS
  const g = scopeCss(GUIDE_CSS, S);
  has(g, `${S} .spotlight .grid {`);
  has(g, `${S} .spotlight .card {`);
});

/* ── Fields → Puck ──────────────────────────────────────────────────────── */

const stubControls: FieldControls = {
  color: (label) => ({ type: 'custom', label, render: () => null } as unknown as Field),
  date: (label) => ({ type: 'custom', label, render: () => null } as unknown as Field),
  image: (label) => ({ type: 'custom', label, render: () => null } as unknown as Field),
  collection: (f, label) => ({ type: 'custom', label: `${label}:${f.collection}`, render: () => null } as unknown as Field),
};

test('fields schema → Puck fields (Bangla twins, repeater → array, collection → picker)', () => {
  const fields = normaliseFields([
    ...GUIDE_FIELDS,
    { key: 'body', type: 'rich', bn: true },
    { key: 'count', type: 'number', min: 1, max: 9 },
    { key: 'tone', type: 'select', options: ['a', { value: 'b', label: 'Bee' }] },
    { key: 'accent', type: 'colour' },
    { key: 'when', type: 'date' },
    { key: 'pic', type: 'image' },
    { key: 'go', type: 'url' },
    { key: 'faq', type: 'repeater', fields: [{ key: 'q', type: 'text', bn: true }, { key: 'nested', type: 'repeater', fields: [] }] },
    { key: 'bad key', type: 'text' },
    { key: 'x', type: 'nonsense' },
  ]);
  const p = moduleFieldsToPuck(fields, stubControls) as unknown as Record<string, Record<string, unknown>>;
  eq(Object.keys(p), ['heading', 'headingBn', 'teachers', 'show_subject', 'body', 'bodyBn', 'count', 'tone', 'accent', 'when', 'pic', 'go', 'faq']);
  eq(p.heading, { type: 'text', label: 'Heading' });
  eq(p.headingBn, { type: 'text', label: 'Heading (বাংলা)' });
  eq(p.teachers.label, 'Teachers:teachers');
  eq(p.show_subject.type, 'radio');
  eq(p.body.type, 'richtext');
  eq([p.count.type, p.count.min, p.count.max], ['number', 1, 9]);
  eq(p.tone.options, [{ value: 'a', label: 'a' }, { value: 'b', label: 'Bee' }]);
  eq([p.accent.type, p.when.type, p.pic.type, p.go.type], ['custom', 'custom', 'custom', 'text']);
  eq(p.faq.type, 'array');
  eq(Object.keys(p.faq.arrayFields as object), ['q', 'qBn']); // nested repeater dropped
  eq(p.faq.defaultItemProps, { q: '', qBn: '' });
  eq((p.faq.getItemSummary as (i: Rec, n: number) => string)({ q: '' }, 1), 'Item 2');
});

test('default values, value resolution (language pick, empties → null), collection query', () => {
  const fields = normaliseFields(GUIDE_FIELDS);
  eq(defaultValues(fields), { heading: 'Our teachers', headingBn: '', teachers: {}, show_subject: true });
  const en = resolveModuleValues(fields, { heading: 'Teachers', headingBn: 'শিক্ষকবৃন্দ', show_subject: false }, 'en', { teachers: [{ a: 1 }] });
  eq(en, { heading: 'Teachers', heading_en: 'Teachers', heading_bn: 'শিক্ষকবৃন্দ', teachers: [{ a: 1 }], show_subject: false });
  eq(resolveModuleValues(fields, { heading: 'Teachers', headingBn: 'শিক্ষকবৃন্দ' }, 'bn').heading, 'শিক্ষকবৃন্দ');
  eq(resolveModuleValues(fields, { heading: 'Teachers', headingBn: '' }, 'bn').heading, 'Teachers');
  eq(resolveModuleValues(fields, {}, 'en').heading, 'Our teachers');
  eq(resolveModuleValues(normaliseFields([{ key: 'h', type: 'text', bn: true, default: { en: 'Fees', bn: 'ফি' } }]), {}, 'bn').h, 'ফি');
  eq(resolveModuleValues(normaliseFields([{ key: 's', type: 'text' }]), { s: '  ' }, 'en').s, null);
  eq(collectionFieldQuery(fields[1], undefined), { collection: 'teachers', limit: 6, sort: 'name', filters: [] });
  eq(collectionFieldQuery(fields[1], { limit: 3, sort: '-name', filters: [{ field: 'department', op: 'eq', value: 'Science' }] }),
    { collection: 'teachers', limit: 3, sort: '-name', filters: [{ field: 'department', op: 'eq', value: 'Science' }] });
  eq(normaliseFields([{ key: 't', type: 'collection', collection: 'teachers', filter: { department: 'Science' } }])[0].filters, [{ field: 'department', op: 'eq', value: 'Science' }]);
  eq(moduleItem({ name: 'A', _url: '/teachers/a', photoUrl: 'p.jpg', empty: '' }), { name: 'A', _url: '/teachers/a', photoUrl: 'p.jpg', empty: null, url: '/teachers/a', photo: 'p.jpg' });
  eq(nestTokens({ 'institution.name': 'X', 'site.name': 'Y', year: '2026' }), { institution: { name: 'X' }, site: { name: 'Y' }, _: { year: '2026' } });
  eq(toModuleDef({ key: 'k', name: 'N', fields: GUIDE_FIELDS, template: 't' })?.fields.length, 3);
  eq(toModuleDef({ name: 'no key' }), null);
});

test('palette aliases are normalised to CustomModule before saving (slots too)', () => {
  const alias = moduleAliasType('teacher-spotlight');
  eq(alias, 'CustomModule__teacher-spotlight');
  const data = {
    root: { props: {} },
    content: [
      { type: alias, props: { id: 'a1', moduleKey: 'teacher-spotlight', values: {} } },
      { type: 'Section', props: { id: 's1', content: [{ type: alias, props: { id: 'a2', values: {} } }] } },
      { type: 'Hero', props: { id: 'h1' } },
    ],
  };
  const out = normaliseModuleTypes(data);
  eq(out.content[0], { type: 'CustomModule', props: { id: 'a1', moduleKey: 'teacher-spotlight', values: {} } });
  eq((out.content[1].props as Rec).content, [{ type: 'CustomModule', props: { id: 'a2', values: {}, moduleKey: 'teacher-spotlight' } }]);
  ok(out.content[2] === data.content[2], 'untouched blocks keep identity');
  const clean = { root: { props: {} }, content: [{ type: 'Hero', props: {} }] };
  ok(normaliseModuleTypes(clean) === clean, 'no aliases → same object');
});

/* ── The guide's example, end to end ────────────────────────────────────── */

const SITE_TOKENS = { 'institution.name': 'Dhaka Model School', 'site.name': 'DMS', year: '2026' };

async function renderGuide(lang: 'en' | 'bn', values: Rec, items: Rec[]) {
  const calls: Array<[string, CollectionParams]> = [];
  const html = await renderModule({
    def: { fields: normaliseFields(GUIDE_FIELDS), template: GUIDE_TEMPLATE },
    values,
    lang,
    scope: {},
    tokens: SITE_TOKENS,
    siteId: 'site1',
    fetchCollection: async (key, params) => { calls.push([key, params]); return items.map((it) => moduleItem(it)); },
  });
  return { html, calls };
}

test('Teacher spotlight (guide §7.2) renders with sample data', async () => {
  const { html, calls } = await renderGuide('en', defaultValues(normaliseFields(GUIDE_FIELDS)), SAMPLE_TEACHERS);
  eq(calls, [['teachers', { pageSize: 6, page: 1, sort: 'name' }]]);
  has(html, '<section class="spotlight">');
  has(html, '<h2>Our teachers</h2>');
  has(html, '<a class="card" href="/teachers/rahim-uddin-k3f9a2">');
  has(html, '<img src="https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_400/v1/rahim.jpg" alt="Rahim Uddin">');
  has(html, '<h3>Rahim Uddin</h3>');
  has(html, '<p>Physics</p>');
  has(html, '<h3>Nasrin &lt;Akter&gt;</h3>'); // escaped
  has(html, '<img src="" alt="Nasrin &lt;Akter&gt;">'); // no photo → empty src
  eq((html.match(/<p>/g) ?? []).length, 1); // Nasrin has no subject
  lacks(html, 'No teachers yet');
});

test('Teacher spotlight: show_subject off, Bangla heading, empty list → translated empty text', async () => {
  const off = await renderGuide('en', { heading: 'Teachers', show_subject: false }, SAMPLE_TEACHERS);
  lacks(off.html, '<p>Physics</p>');
  const bn = await renderGuide('bn', { heading: 'Our teachers', headingBn: 'আমাদের শিক্ষকমণ্ডলী', show_subject: true }, []);
  has(bn.html, '<h2>আমাদের শিক্ষকমণ্ডলী</h2>');
  has(bn.html, '<p>এখনো কোনো শিক্ষক নেই</p>');
  const en = await renderGuide('en', {}, []);
  has(en.html, '<p>No teachers yet</p>');
  const bnDefault = await renderGuide('bn', {}, []);
  has(bnDefault.html, '<h2>আমাদের শিক্ষকগণ</h2>'); // no Bangla twin typed → phrase book via `| t`
});

test('template data: site, institution, item (inside collection lists), url.query', async () => {
  const html = await renderModule({
    def: { fields: [], template: '{{ site.name }}|{{ institution.name }}|{{ item.name }}|{{ item.url }}|{{ parent.name }}|{{ url.query.dept }}|{{ lang }}|{{ year }}' },
    values: {},
    lang: 'en',
    scope: { item: { name: 'Rahim', _url: '/teachers/r' }, parent: { name: 'Class 8' }, url: { dept: 'Science' } },
    tokens: SITE_TOKENS,
    siteId: 's',
    fetchCollection: noFetch,
  });
  eq(html, 'DMS|Dhaka Model School|Rahim|/teachers/r|Class 8|Science|en|2026');
});

test('every starter module renders in English and Bangla without errors', async () => {
  eq(STARTER_MODULES.length, 7);
  const starter = STARTER_MODULES.find((s) => s.key === 'teacher-spotlight')!;
  eq(starter.fields, GUIDE_FIELDS);
  eq(starter.template.trim(), GUIDE_TEMPLATE);
  eq(starter.css.trim(), GUIDE_CSS);
  const sample: Record<string, Rec[]> = {
    teachers: SAMPLE_TEACHERS,
    notices: [{ title: 'Exam routine published', publishedAt: '2026-09-30T00:00:00Z', _url: '/notices/1' }],
    events: [{ title: 'Science fair', startDate: '2026-10-20', venue: 'Main hall', startTime: '10:00', _url: '/events/2' }],
    exams: [{ name: 'Half-yearly 2026', endDate: '2026-07-10', classSummaries: [{ className: 'Class 8', appeared: 40, passed: 38, passRate: 95, gpa5Count: 12, suppressed: false }, { className: 'Class 9', suppressed: true }] }],
  };
  for (const s of STARTER_MODULES) {
    const fields = normaliseFields(s.fields);
    ok(fields.length === s.fields.length, `${s.key}: every field is valid`);
    eq(checkTemplate(s.template), null, `${s.key} parses`);
    for (const lang of ['en', 'bn'] as const) {
      const html = await renderModule({
        def: { fields, template: s.template }, values: defaultValues(fields), lang, scope: {}, tokens: SITE_TOKENS, siteId: 's',
        fetchCollection: async (key) => (sample[key] ?? []).map((x) => moduleItem(x)),
        now: () => new Date('2026-10-04T06:00:00Z'),
      });
      ok(html.trim().length > 40, `${s.key} (${lang}) produced HTML`);
      lacks(html, 'Liquid error');
      if (s.key === 'fee-cards') has(html, lang === 'bn' ? '৳২,২০০' : '৳2,200');
      if (s.key === 'faq-accordion') has(html, lang === 'bn' ? '<strong>নভেম্বর</strong>' : '<strong>November</strong>');
      if (s.key === 'result-highlights') { has(html, lang === 'bn' ? '৯৫%' : '95%'); lacks(html, 'Class 9'); }
      if (s.key === 'event-calendar-strip') has(html, 'Science fair');
      if (s.key === 'notice-ticker') has(html, 'Exam routine published');
    }
    const scoped = scopeCss(s.css, moduleScopeAttr('x'));
    ok(scoped.length > 0 || !s.css.trim(), `${s.key} CSS scopes`);
  }
});

/* ── Runner ─────────────────────────────────────────────────────────────── */

void (async () => {
  for (const t of queue) {
    try {
      await t.fn();
      passed++;
    } catch (e) {
      failures.push(`✗ ${t.name}\n  ${(e as Error).message}`);
    }
  }
  if (failures.length) {
    console.error(failures.join('\n\n'));
    console.error(`\n${failures.length} failed, ${passed} passed`);
    (globalThis as { process?: { exit: (c: number) => void } }).process?.exit(1);
  } else {
    console.log(`modules-logic: ${passed} passed`);
  }
})();
