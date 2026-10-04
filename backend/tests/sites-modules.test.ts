// DB-backed tests for website custom modules (W13): CRUD, tenant isolation,
// publish + versions + restore, import/export (re-key on conflict),
// validation with line numbers, size caps, the "Website developer" hook and
// the public endpoint (published snapshot only; drafts need a preview token).
// Run against a disposable database (DATABASE_URL), e.g. sms_track_mod.

import { cleanupInstitution, createTestInstitution, disconnectFixtures, prisma, type InstitutionFixture } from './helpers/fixtures';
import * as mods from '../src/modules/sites/sites.modules.service';
import * as sitesSvc from '../src/modules/sites/sites.service';
import {
  MODULE_CODE_MAX_BYTES, countModuleUsage, parseCollectionTagArgs, parseModuleFields, uniqueModuleKey, validateCss, validateTemplate,
} from '../src/modules/sites/sites.modules.logic';
import { signPreviewToken } from '../src/modules/sites/sites.preview';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../src/utils/AppError';

jest.setTimeout(120_000);

// The guide's §7.2 "Teacher spotlight" example, verbatim.
const SPOTLIGHT_FIELDS = [
  { key: 'heading', type: 'text', label: 'Heading', bn: true, default: 'Our teachers' },
  { key: 'teachers', type: 'collection', collection: 'teachers', limit: 6, sort: 'name' },
  { key: 'show_subject', type: 'boolean', label: 'Show subject', default: true },
];
const SPOTLIGHT_TEMPLATE = `<section class="spotlight">
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
const SPOTLIGHT_CSS = `.spotlight .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.spotlight .card { border-radius: var(--site-radius); padding: 12px; background: var(--site-surface); text-decoration: none; }`;

let A: InstitutionFixture;
let B: InstitutionFixture;
let ctxA: { institutionId: string; userId: string; role: string };
let ctxB: { institutionId: string; userId: string; role: string };
let siteA: { id: string };
let siteB: { id: string };

beforeAll(async () => {
  A = await createTestInstitution('modA');
  B = await createTestInstitution('modB');
  ctxA = { institutionId: A.institutionId, userId: A.usersByRole.ADMIN.userId, role: 'ADMIN' };
  ctxB = { institutionId: B.institutionId, userId: B.usersByRole.ADMIN.userId, role: 'ADMIN' };
  const sa = await sitesSvc.getOrCreateSite(A.institutionId);
  const sb = await sitesSvc.getOrCreateSite(B.institutionId);
  await prisma.site.update({ where: { id: sa.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  siteA = { id: sa.id };
  siteB = { id: sb.id };
});

afterAll(async () => {
  for (const f of [A, B]) {
    if (!f) continue;
    await prisma.site.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
    await cleanupInstitution(f);
  }
  await disconnectFixtures();
});

describe('pure logic', () => {
  test('guide example fields schema is valid and normalised', () => {
    const { fields, issues } = parseModuleFields(SPOTLIGHT_FIELDS);
    expect(issues).toEqual([]);
    expect(fields.map((f) => f.type)).toEqual(['text', 'collection', 'boolean']);
    expect(fields[1]).toMatchObject({ collection: 'teachers', limit: 6, sort: 'name' });
  });

  test('fields: aliases, unknown types, duplicates, unknown and private collections, caps', () => {
    expect(parseModuleFields([{ key: 'c', type: 'colour' }, { key: 'r', type: 'rich' }]).fields.map((f) => f.type)).toEqual(['color', 'richtext']);
    expect(parseModuleFields([{ key: 'x', type: 'wat' }]).issues[0].message).toMatch(/Unknown field type/);
    expect(parseModuleFields([{ key: 'a', type: 'text' }, { key: 'a', type: 'text' }]).issues[0].message).toMatch(/Duplicate/);
    expect(parseModuleFields([{ key: 's', type: 'collection', collection: 'students' }]).issues[0].message).toMatch(/Unknown collection "students"/);
    expect(parseModuleFields([{ key: 's', type: 'select' }]).issues[0].message).toMatch(/options/);
    expect(parseModuleFields([{ key: 'r', type: 'repeater', fields: [{ key: 'q', type: 'repeater', fields: [{ key: 'z', type: 'text' }] }] }]).issues.length).toBeGreaterThan(0);
    const many = Array.from({ length: 51 }, (_, i) => ({ key: `f${i}`, type: 'text' }));
    expect(parseModuleFields(many).issues.length).toBeGreaterThan(0);
    const shorthand = parseModuleFields([{ key: 't', type: 'collection', collection: 'teachers', filter: { department: 'Science' } }]).fields[0];
    expect(shorthand.filters).toEqual([{ field: 'department', op: 'eq', value: 'Science' }]);
  });

  test('template validation: guide example passes; errors carry line numbers', () => {
    const ok = validateTemplate(SPOTLIGHT_TEMPLATE, parseModuleFields(SPOTLIGHT_FIELDS).fields);
    expect(ok.errors).toEqual([]);
    expect(ok.warnings).toEqual([]);
    const bad = validateTemplate('<p>ok</p>\n<p>{{ x | nope }}</p>');
    expect(bad.errors[0].line).toBe(2);
    expect(bad.errors[0].message).toMatch(/undefined filter: nope/);
    const unclosed = validateTemplate('line1\nline2\n{% if a %}\n<p>x</p>');
    expect(unclosed.errors[0].line).toBe(3);
    expect(validateTemplate('{% include "x" %}').errors[0].message).toMatch(/not available/);
    expect(validateTemplate('{% render "x" %}').errors.length).toBe(1);
    expect(validateTemplate('{{ module.missing }}', []).warnings[0].message).toMatch(/module.missing/);
  });

  test('collection tag grammar', () => {
    const r = parseCollectionTagArgs(`"notices" limit:5 sort:"-publishedAt" filter.title.contains:"exam" q:url.query.q as notices`);
    expect(r.collection).toBe('notices');
    expect(r.as).toBe('notices');
    expect(r.options).toEqual([
      { name: 'limit', value: { kind: 'number', value: 5 } },
      { name: 'sort', value: { kind: 'string', value: '-publishedAt' } },
      { name: 'filter.title.contains', value: { kind: 'string', value: 'exam' } },
      { name: 'q', value: { kind: 'var', value: 'url.query.q' } },
    ]);
    expect(parseCollectionTagArgs(`"events"`).as).toBe('events');
    expect(() => parseCollectionTagArgs('notices')).toThrow(/quoted/);
    expect(() => parseCollectionTagArgs('"notices" bogus:1')).toThrow(/Unknown option/);
    expect(() => parseCollectionTagArgs('"notices" limit:500')).toThrow(/1–50/);
    expect(validateTemplate('{% collection "students" as s %}').errors[0].message).toMatch(/Unknown collection/);
    expect(validateTemplate('{% collection "notices" limit:5 sort:"-publishedAt" as notices %}{% for n in notices %}{{ n.title }}{% endfor %}').errors).toEqual([]);
  });

  test('css checks, usage counting, unique keys', () => {
    expect(validateCss('.a { color: red; }')).toEqual([]);
    expect(validateCss('.a { color: red;\n')[0].message).toMatch(/never closed/);
    expect(validateCss('@import url(x.css);')[0].message).toMatch(/@import/);
    const page = { content: [{ type: 'CustomModule', props: { moduleKey: 'x' } }, { type: 'Section', props: { body: [{ type: 'CustomModule', props: { moduleKey: 'x' } }] } }] };
    expect(countModuleUsage(page, 'x')).toBe(2);
    expect(countModuleUsage(page, 'y')).toBe(0);
    expect(uniqueModuleKey('spot', ['spot', 'spot-2'])).toBe('spot-3');
  });
});

describe('admin API (service) against the database', () => {
  let spotlightId = '';

  test('create (guide example) + get + list with search/status', async () => {
    const m = await mods.createModule(ctxA, {
      name: 'Teacher spotlight', nameBn: 'শিক্ষক পরিচিতি', category: 'people', fields: SPOTLIGHT_FIELDS, template: SPOTLIGHT_TEMPLATE, css: SPOTLIGHT_CSS, js: '',
    } as never);
    spotlightId = m.id;
    expect(m.key).toBe('teacher-spotlight');
    expect(m.status).toBe('DRAFT');
    const got = await mods.getModule(ctxA, m.id);
    expect(got.usage.count).toBe(0);
    const list = await mods.listModules(ctxA, { page: 1, pageSize: 50, search: 'spot' } as never);
    expect(list.items.map((x) => x.key)).toEqual(['teacher-spotlight']);
    expect((await mods.listModules(ctxA, { page: 1, pageSize: 50, status: 'PUBLISHED' } as never)).total).toBe(0);
    await expect(mods.createModule(ctxA, { key: 'teacher-spotlight', name: 'Dup', category: 'general', fields: [], template: '', css: '', js: '' } as never)).rejects.toBeInstanceOf(ConflictError);
  });

  test('tenant isolation: B cannot see, edit, publish or delete A’s module', async () => {
    expect((await mods.listModules(ctxB, { page: 1, pageSize: 50 } as never)).total).toBe(0);
    await expect(mods.getModule(ctxB, spotlightId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mods.updateModule(ctxB, spotlightId, { name: 'hack' } as never)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mods.publishModule(ctxB, spotlightId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mods.deleteModule(ctxB, spotlightId, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mods.exportModule(ctxB, spotlightId)).rejects.toBeInstanceOf(NotFoundError);
  });

  test('roles: teachers are refused unless listed as website developers', async () => {
    const teacher = { institutionId: A.institutionId, userId: A.usersByRole.TEACHER.userId, role: 'TEACHER' };
    await expect(mods.createModule(teacher, { name: 'X', category: 'general', fields: [], template: '', css: '', js: '' } as never)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mods.canEditModuleCode('TEACHER', 'u1', { websiteDeveloperUserIds: ['u1'] })).toBe(true);
    expect(mods.canEditModuleCode('TEACHER', 'u2', { websiteDeveloperUserIds: ['u1'] })).toBe(false);
    expect(mods.canEditModuleCode('ADMIN', 'u2', {})).toBe(true);
  });

  test('validation and size caps', async () => {
    const big = 'x'.repeat(MODULE_CODE_MAX_BYTES + 1);
    await expect(mods.updateModule(ctxA, spotlightId, { css: big } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(mods.updateModule(ctxA, spotlightId, { fields: [{ key: 'a', type: 'nope' }] } as never)).rejects.toBeInstanceOf(ValidationError);
    const v = mods.validateModule({ fields: SPOTLIGHT_FIELDS, template: '<h2>{{ module.heading | t }}</h2>\n{% for x in y %}', css: '', js: '' });
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatchObject({ source: 'template', line: 2 });
    expect(mods.validateModule({ fields: SPOTLIGHT_FIELDS, template: SPOTLIGHT_TEMPLATE, css: SPOTLIGHT_CSS, js: '' }).ok).toBe(true);
    // Broken draft cannot be published.
    const broken = await mods.createModule(ctxA, { name: 'Broken', category: 'general', fields: [], template: '{% if %}', css: '', js: '' } as never);
    await expect(mods.publishModule(ctxA, broken.id)).rejects.toBeInstanceOf(ValidationError);
    await mods.deleteModule(ctxA, broken.id, false);
  });

  test('public endpoint: nothing before publish; drafts only with a preview token', async () => {
    expect((await mods.publicModules(siteA.id, undefined)).modules).toEqual([]);
    const token = signPreviewToken(siteA.id, ctxA.userId);
    const drafts = await mods.publicModules(siteA.id, token, { drafts: true });
    expect(drafts.modules.map((m) => [m.key, m.draft])).toEqual([['teacher-spotlight', true]]);
    // drafts=1 without a token is ignored
    expect((await mods.publicModules(siteA.id, undefined, { drafts: true })).modules).toEqual([]);
    // B's (unpublished) site is not visible at all
    await expect(mods.publicModules(siteB.id, undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  test('publish → version 1 snapshot; draft edits stay private; publish again → v2; restore v1', async () => {
    const p1 = await mods.publishModule(ctxA, spotlightId, 'first');
    expect(p1.module).toMatchObject({ version: 1, publishedVersion: 1, status: 'PUBLISHED', hasDraftChanges: false });
    await mods.updateModule(ctxA, spotlightId, { template: '<p>v2 {{ module.heading }}</p>' } as never);
    const pub = await mods.publicModules(siteA.id, undefined);
    expect(pub.modules).toHaveLength(1);
    expect(pub.modules[0]).toMatchObject({ key: 'teacher-spotlight', version: 1, draft: false });
    expect(pub.modules[0].template).toBe(SPOTLIGHT_TEMPLATE); // the published snapshot, not the draft
    expect(pub.modules[0].fields).toEqual(parseModuleFields(SPOTLIGHT_FIELDS).fields);

    await mods.publishModule(ctxA, spotlightId);
    expect((await mods.publicModules(siteA.id, undefined)).modules[0].template).toBe('<p>v2 {{ module.heading }}</p>');
    const pinned = await mods.publicModuleVersion(siteA.id, 'teacher-spotlight', 1);
    expect(pinned.module.template).toBe(SPOTLIGHT_TEMPLATE);

    const versions = await mods.listModuleVersions(ctxA, spotlightId, { page: 1, pageSize: 20 });
    expect(versions.items.map((v) => [v.version, v.isPublished])).toEqual([[2, true], [1, false]]);
    const v1 = versions.items.find((v) => v.version === 1)!;
    const restored = await mods.restoreModuleVersion(ctxA, spotlightId, v1.id);
    expect(restored.template).toBe(SPOTLIGHT_TEMPLATE);
    expect(restored.hasDraftChanges).toBe(true);
    expect((await mods.publicModules(siteA.id, undefined)).modules[0].version).toBe(2); // restore ≠ publish
    // Published key is frozen
    await expect(mods.updateModule(ctxA, spotlightId, { key: 'renamed' } as never)).rejects.toBeInstanceOf(ValidationError);
  });

  test('export → import into another school; import again re-keys', async () => {
    const doc = await mods.exportModule(ctxA, spotlightId);
    expect(doc.format).toBe('peoplenit-site-module');
    const inB = await mods.importModule(ctxB, JSON.parse(JSON.stringify(doc)));
    expect(inB.module.key).toBe('teacher-spotlight');
    expect(inB.rekeyed).toBe(false);
    expect(inB.module.institutionId).toBe(B.institutionId);
    const again = await mods.importModule(ctxB, doc);
    expect(again.module.key).toBe('teacher-spotlight-2');
    expect(again.rekeyed).toBe(true);
    await expect(mods.importModule(ctxB, { hello: 'world' })).rejects.toBeInstanceOf(ValidationError);
    // A still has exactly its own one module
    expect((await mods.listModules(ctxA, { page: 1, pageSize: 50 } as never)).total).toBe(1);
  });

  test('delete warns when pages use the module, force deletes', async () => {
    const page = await sitesSvc.createPage(ctxA as never, {
      slug: 'with-module', title: 'With module',
      data: { root: { props: {} }, content: [{ type: 'CustomModule', props: { id: 'CustomModule-1', moduleKey: 'teacher-spotlight', values: { heading: 'Hi' } } }] },
    } as never);
    const list = await mods.listModules(ctxA, { page: 1, pageSize: 50 } as never);
    expect(list.items[0].usageCount).toBe(1);
    await expect(mods.deleteModule(ctxA, spotlightId, false)).rejects.toBeInstanceOf(ConflictError);
    const r = await mods.deleteModule(ctxA, spotlightId, true);
    expect(r.usage.pages.map((p) => p.id)).toEqual([page.id]);
    expect(await prisma.siteModuleVersion.count({ where: { moduleId: spotlightId } })).toBe(0); // cascade
  });
});
