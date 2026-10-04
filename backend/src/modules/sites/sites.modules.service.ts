// =============================================================================
// Website custom modules (W13) — admin + public service.
//
// Draft on SiteModule; Publish snapshots it into SiteModuleVersion (version N)
// and pages render ONLY the published snapshot (public endpoint below). Every
// query is scoped by the tenant's site (siteId + institutionId), so one school
// can never read or change another school's modules.
//
// Who may edit module code: SUPER_ADMIN / ADMIN, plus — the hook for the
// planned "Website developer" role — any user whose id is listed in the
// site's `settings.websiteDeveloperUserIds`. See `canEditModuleCode`.
// =============================================================================

import { Prisma, type SiteModule } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { getOrCreateSite, type SitesCtx } from './sites.service';
import { visibleSite } from './sites.public.service';
import {
  MODULE_MAX_PER_SITE,
  MODULE_MAX_VERSIONS,
  codeSizeProblem,
  countModuleUsage,
  exportDoc,
  moduleKeyFrom,
  parseModuleFields,
  readModuleDoc,
  uniqueModuleKey,
  validateCss,
  validateTemplate,
  type ModuleField,
  type TemplateIssue,
} from './sites.modules.logic';
import type { CreateModuleDtoType, ModuleQueryDtoType, UpdateModuleDtoType, ValidateModuleDtoType } from './sites.modules.dto';

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ── Permission hook ("Website developer") ───────────────────────────────────

const CODE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

/** SUPER_ADMIN/ADMIN, or a user listed in `site.settings.websiteDeveloperUserIds` (future "Website developer" permission). */
export function canEditModuleCode(role: string, userId: string, settings: unknown): boolean {
  if (CODE_ROLES.has(role)) return true;
  const s = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  const list = s.websiteDeveloperUserIds;
  return Array.isArray(list) && list.includes(userId);
}

export async function assertModuleDeveloper(ctx: SitesCtx) {
  if (CODE_ROLES.has(ctx.role)) return;
  const site = await prisma.site.findUnique({ where: { institutionId: ctx.institutionId }, select: { settings: true } });
  if (!site || !canEditModuleCode(ctx.role, ctx.userId, site.settings)) {
    throw new ForbiddenError('Only admins and website developers can edit modules');
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const LIGHT_SELECT = {
  id: true, key: true, name: true, nameBn: true, description: true, category: true, icon: true, status: true, version: true,
  publishedVersion: true, publishedAt: true, hasDraftChanges: true, createdAt: true, updatedAt: true,
} satisfies Prisma.SiteModuleSelect;

function fieldsOrThrow(input: unknown): ModuleField[] {
  const { fields, issues } = parseModuleFields(input);
  if (issues.length) throw new ValidationError(`Fields: ${issues[0].path} — ${issues[0].message}`, { fields: issues });
  return fields;
}

function sizeOrThrow(code: { template?: string | null; css?: string | null; js?: string | null }) {
  const problem = codeSizeProblem(code);
  if (problem) throw new ValidationError(problem);
}

async function moduleOrThrow(ctx: SitesCtx, id: string): Promise<SiteModule> {
  const site = await getOrCreateSite(ctx.institutionId);
  const m = await prisma.siteModule.findFirst({ where: { id, siteId: site.id, institutionId: ctx.institutionId } });
  if (!m) throw new NotFoundError('Module not found');
  return m;
}

async function takenKeys(siteId: string): Promise<string[]> {
  return (await prisma.siteModule.findMany({ where: { siteId }, select: { key: true } })).map((r) => r.key);
}

/** Page usage of every key on the site, from drafts and published versions. */
async function usageByKey(siteId: string, institutionId: string, keys: string[]) {
  const out = new Map<string, { count: number; pages: { id: string; title: string; slug: string }[] }>();
  if (!keys.length) return out;
  const pages = await prisma.sitePage.findMany({
    where: { siteId, institutionId },
    select: { id: true, title: true, slug: true, draft: true, published: true },
  });
  for (const key of keys) {
    const hit = { count: 0, pages: [] as { id: string; title: string; slug: string }[] };
    const needle = `"moduleKey":"${key}"`;
    for (const p of pages) {
      const draftStr = JSON.stringify(p.draft ?? null);
      const pubStr = JSON.stringify(p.published ?? null);
      if (!draftStr.includes(needle) && !pubStr.includes(needle)) continue;
      const n = Math.max(countModuleUsage(p.draft, key), countModuleUsage(p.published, key));
      if (n > 0) {
        hit.count += n;
        hit.pages.push({ id: p.id, title: p.title, slug: p.slug });
      }
    }
    out.set(key, hit);
  }
  return out;
}

function snapshotOf(m: Pick<SiteModule, 'name' | 'nameBn' | 'description' | 'category' | 'icon' | 'fields' | 'template' | 'css' | 'js'>) {
  return {
    name: m.name, nameBn: m.nameBn, description: m.description, category: m.category, icon: m.icon,
    fields: m.fields, template: m.template, css: m.css, js: m.js,
  };
}

// ── Admin: CRUD ─────────────────────────────────────────────────────────────

export async function listModules(ctx: SitesCtx, q: ModuleQueryDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SiteModuleWhereInput = {
    siteId: site.id,
    institutionId: ctx.institutionId,
    ...(q.category ? { category: q.category } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { key: { contains: q.search, mode: 'insensitive' } }, { nameBn: { contains: q.search, mode: 'insensitive' } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.siteModule.findMany({ where, select: LIGHT_SELECT, orderBy: [{ category: 'asc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteModule.count({ where }),
  ]);
  const usage = await usageByKey(site.id, ctx.institutionId, rows.map((r) => r.key));
  return { items: rows.map((r) => ({ ...r, usageCount: usage.get(r.key)?.count ?? 0 })), total };
}

export async function getModule(ctx: SitesCtx, id: string) {
  const m = await moduleOrThrow(ctx, id);
  const usage = await usageByKey(m.siteId, ctx.institutionId, [m.key]);
  return { ...m, usage: usage.get(m.key) ?? { count: 0, pages: [] } };
}

export async function createModule(ctx: SitesCtx, data: CreateModuleDtoType) {
  await assertModuleDeveloper(ctx);
  const site = await getOrCreateSite(ctx.institutionId);
  const fields = fieldsOrThrow(data.fields);
  sizeOrThrow(data);
  const count = await prisma.siteModule.count({ where: { siteId: site.id } });
  if (count >= MODULE_MAX_PER_SITE) throw new ValidationError(`A site can have at most ${MODULE_MAX_PER_SITE} modules`);
  const taken = await takenKeys(site.id);
  let key: string;
  if (data.key) {
    if (taken.includes(data.key)) throw new ConflictError(`A module with key "${data.key}" already exists`);
    key = data.key;
  } else key = uniqueModuleKey(moduleKeyFrom(data.name), taken);
  try {
    const m = await prisma.siteModule.create({
      data: {
        siteId: site.id, institutionId: ctx.institutionId, key, name: data.name, nameBn: data.nameBn ?? null, description: data.description ?? null,
        category: data.category, icon: data.icon ?? null, fields: json(fields), template: data.template, css: data.css, js: data.js,
        createdByUserId: ctx.userId, updatedByUserId: ctx.userId,
      },
    });
    logger.info('Site module created', { institutionId: ctx.institutionId, moduleId: m.id, key });
    return m;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError(`A module with key "${key}" already exists`);
    throw error;
  }
}

export async function updateModule(ctx: SitesCtx, id: string, data: UpdateModuleDtoType) {
  await assertModuleDeveloper(ctx);
  const m = await moduleOrThrow(ctx, id);
  sizeOrThrow(data);
  const patch: Prisma.SiteModuleUpdateInput = { updatedByUserId: ctx.userId, hasDraftChanges: true };
  if (data.key !== undefined && data.key !== m.key) {
    // Pages reference modules by key: renaming a published module would orphan them.
    if (m.publishedVersion != null) throw new ValidationError('The key of a published module cannot change (pages use it). Duplicate the module instead.');
    if ((await takenKeys(m.siteId)).includes(data.key)) throw new ConflictError(`A module with key "${data.key}" already exists`);
    patch.key = data.key;
  }
  if (data.name !== undefined) patch.name = data.name;
  if (data.nameBn !== undefined) patch.nameBn = data.nameBn;
  if (data.description !== undefined) patch.description = data.description;
  if (data.category !== undefined) patch.category = data.category;
  if (data.icon !== undefined) patch.icon = data.icon;
  if (data.fields !== undefined) patch.fields = json(fieldsOrThrow(data.fields));
  if (data.template !== undefined) patch.template = data.template;
  if (data.css !== undefined) patch.css = data.css;
  if (data.js !== undefined) patch.js = data.js;
  const updated = await prisma.siteModule.update({ where: { id: m.id }, data: patch });
  // The editor shows these after every save (it does not call /validate while typing,
  // which would write an audit row per keystroke pause).
  return { ...updated, validation: validateModule({ fields: updated.fields, template: updated.template, css: updated.css, js: updated.js }) };
}

export async function deleteModule(ctx: SitesCtx, id: string, force: boolean) {
  await assertModuleDeveloper(ctx);
  const m = await moduleOrThrow(ctx, id);
  const usage = (await usageByKey(m.siteId, ctx.institutionId, [m.key])).get(m.key) ?? { count: 0, pages: [] };
  if (usage.count > 0 && !force) {
    throw new ConflictError(`This module is used ${usage.count} time(s) on ${usage.pages.length} page(s): ${usage.pages.map((p) => p.title).join(', ')}. Delete anyway with force.`);
  }
  await prisma.siteModule.delete({ where: { id: m.id } });
  logger.info('Site module deleted', { institutionId: ctx.institutionId, moduleId: m.id, key: m.key, usage: usage.count });
  return { id: m.id, key: m.key, usage };
}

// ── Validate / publish / versions ───────────────────────────────────────────

export interface ModuleValidation {
  ok: boolean;
  errors: Array<TemplateIssue & { source: 'fields' | 'template' | 'css' | 'js'; path?: string }>;
  warnings: Array<TemplateIssue & { source: 'template' }>;
}

export function validateModule(data: ValidateModuleDtoType): ModuleValidation {
  const errors: ModuleValidation['errors'] = [];
  const { fields, issues } = parseModuleFields(data.fields ?? []);
  for (const i of issues) errors.push({ source: 'fields', path: i.path, line: null, col: null, message: `${i.path}: ${i.message}` });
  const size = codeSizeProblem(data);
  if (size) errors.push({ source: /CSS/.test(size) ? 'css' : /JS/.test(size) ? 'js' : 'template', line: null, col: null, message: size });
  const t = validateTemplate(data.template ?? '', fields);
  for (const e of t.errors) errors.push({ source: 'template', ...e });
  for (const e of validateCss(data.css ?? '')) errors.push({ source: 'css', ...e });
  return { ok: errors.length === 0, errors, warnings: t.warnings.map((w) => ({ source: 'template' as const, ...w })) };
}

export async function publishModule(ctx: SitesCtx, id: string, note?: string | null) {
  await assertModuleDeveloper(ctx);
  const m = await moduleOrThrow(ctx, id);
  const check = validateModule({ fields: m.fields, template: m.template, css: m.css, js: m.js });
  if (!check.ok) throw new ValidationError(`Fix the errors before publishing: ${check.errors[0].message}`, { errors: check.errors });
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.siteModule.findUniqueOrThrow({ where: { id: m.id } });
    const version = fresh.version + 1;
    await tx.siteModuleVersion.create({
      data: { moduleId: m.id, version, snapshot: json(snapshotOf(fresh)), note: note ?? null, createdByUserId: ctx.userId },
    });
    // Keep the newest MODULE_MAX_VERSIONS snapshots (the published one is always the newest).
    const old = await tx.siteModuleVersion.findMany({ where: { moduleId: m.id }, orderBy: { version: 'desc' }, skip: MODULE_MAX_VERSIONS, select: { id: true } });
    if (old.length) await tx.siteModuleVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return tx.siteModule.update({
      where: { id: m.id },
      data: { version, publishedVersion: version, publishedAt: now, status: 'PUBLISHED', hasDraftChanges: false, updatedByUserId: ctx.userId },
    });
  });
  logger.info('Site module published', { institutionId: ctx.institutionId, moduleId: m.id, key: m.key, version: updated.version });
  return { module: updated, warnings: check.warnings };
}

export async function listModuleVersions(ctx: SitesCtx, id: string, q: { page: number; pageSize: number }) {
  const m = await moduleOrThrow(ctx, id);
  const [rows, total] = await Promise.all([
    prisma.siteModuleVersion.findMany({
      where: { moduleId: m.id },
      select: { id: true, version: true, note: true, createdByUserId: true, createdAt: true },
      orderBy: { version: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.siteModuleVersion.count({ where: { moduleId: m.id } }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.createdByUserId))] }, institutionId: ctx.institutionId },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  return {
    items: rows.map((r) => ({ ...r, createdByName: names.get(r.createdByUserId) ?? null, isPublished: r.version === m.publishedVersion })),
    total,
  };
}

/** Copies a version's snapshot into the draft (publish again to make it live). */
export async function restoreModuleVersion(ctx: SitesCtx, id: string, versionId: string) {
  await assertModuleDeveloper(ctx);
  const m = await moduleOrThrow(ctx, id);
  const v = await prisma.siteModuleVersion.findFirst({ where: { id: versionId, moduleId: m.id } });
  if (!v) throw new NotFoundError('Version not found');
  const s = (v.snapshot && typeof v.snapshot === 'object' ? v.snapshot : {}) as Record<string, unknown>;
  const str = (x: unknown, fallback: string) => (typeof x === 'string' ? x : fallback);
  const nul = (x: unknown) => (typeof x === 'string' ? x : null);
  return prisma.siteModule.update({
    where: { id: m.id },
    data: {
      name: str(s.name, m.name), nameBn: nul(s.nameBn), description: nul(s.description), category: str(s.category, m.category), icon: nul(s.icon),
      fields: json(s.fields ?? []), template: str(s.template, ''), css: str(s.css, ''), js: str(s.js, ''),
      hasDraftChanges: true, updatedByUserId: ctx.userId,
    },
  });
}

// ── Import / export ─────────────────────────────────────────────────────────

export async function exportModule(ctx: SitesCtx, id: string) {
  const m = await moduleOrThrow(ctx, id);
  return exportDoc({ ...m, fields: m.fields });
}

/** Creates a DRAFT module from an exported document; the key gets a suffix when taken. */
export async function importModule(ctx: SitesCtx, body: unknown) {
  await assertModuleDeveloper(ctx);
  const read = readModuleDoc(body);
  if ('error' in read) throw new ValidationError(read.error);
  const d = read.doc;
  const site = await getOrCreateSite(ctx.institutionId);
  const fields = fieldsOrThrow(d.fields);
  const code = { template: d.template, css: d.css ?? '', js: d.js ?? '' };
  sizeOrThrow(code);
  const count = await prisma.siteModule.count({ where: { siteId: site.id } });
  if (count >= MODULE_MAX_PER_SITE) throw new ValidationError(`A site can have at most ${MODULE_MAX_PER_SITE} modules`);
  const wanted = d.key && /^[a-z][a-z0-9_-]{0,59}$/.test(d.key) ? d.key : moduleKeyFrom(d.name);
  const key = uniqueModuleKey(wanted, await takenKeys(site.id));
  const m = await prisma.siteModule.create({
    data: {
      siteId: site.id, institutionId: ctx.institutionId, key, name: d.name, nameBn: d.nameBn ?? null, description: d.description ?? null,
      category: d.category || 'general', icon: d.icon ?? null, fields: json(fields), ...code, createdByUserId: ctx.userId, updatedByUserId: ctx.userId,
    },
  });
  logger.info('Site module imported', { institutionId: ctx.institutionId, moduleId: m.id, key, rekeyed: key !== wanted });
  return { module: m, rekeyed: key !== wanted, originalKey: wanted };
}

// ── Public ──────────────────────────────────────────────────────────────────

export interface PublicModuleDef {
  key: string;
  version: number | null;
  draft: boolean;
  name: string;
  nameBn: string | null;
  category: string;
  icon: string | null;
  fields: unknown;
  template: string;
  css: string;
  js: string;
}

function fromSnapshot(key: string, version: number, snap: unknown): PublicModuleDef {
  const s = (snap && typeof snap === 'object' ? snap : {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  return {
    key, version, draft: false, name: str(s.name), nameBn: typeof s.nameBn === 'string' ? s.nameBn : null, category: str(s.category) || 'general',
    icon: typeof s.icon === 'string' ? s.icon : null, fields: Array.isArray(s.fields) ? s.fields : [], template: str(s.template), css: str(s.css), js: str(s.js),
  };
}

/**
 * Published module definitions of a visible site (published snapshot only).
 * `drafts` is honoured only with a valid preview token: then unpublished
 * modules and unpublished changes are returned as `draft: true`.
 */
export async function publicModules(siteId: string, previewToken: string | undefined, opts: { drafts?: boolean; key?: string } = {}) {
  const { site, preview } = await visibleSite(siteId, previewToken);
  const wantDrafts = preview && opts.drafts === true;
  const modules = await prisma.siteModule.findMany({
    where: { siteId: site.id, institutionId: site.institutionId, ...(opts.key ? { key: opts.key } : {}), ...(wantDrafts ? {} : { publishedVersion: { not: null } }) },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  const published = modules.filter((m) => m.publishedVersion != null);
  const snaps = published.length
    ? await prisma.siteModuleVersion.findMany({
        where: { OR: published.map((m) => ({ moduleId: m.id, version: m.publishedVersion as number })) },
        select: { moduleId: true, version: true, snapshot: true },
      })
    : [];
  const byId = new Map(snaps.map((s) => [s.moduleId, s]));
  const out: PublicModuleDef[] = [];
  for (const m of modules) {
    if (wantDrafts && (m.publishedVersion == null || m.hasDraftChanges)) {
      out.push({ key: m.key, version: m.publishedVersion, draft: true, name: m.name, nameBn: m.nameBn, category: m.category, icon: m.icon, fields: m.fields, template: m.template, css: m.css, js: m.js });
      continue;
    }
    const s = byId.get(m.id);
    if (s) out.push(fromSnapshot(m.key, s.version, s.snapshot));
  }
  return { preview, modules: out };
}

/** One specific published version (pages that pin `version`). */
export async function publicModuleVersion(siteId: string, key: string, version: number, previewToken?: string) {
  const { site, preview } = await visibleSite(siteId, previewToken);
  const m = await prisma.siteModule.findFirst({ where: { siteId: site.id, institutionId: site.institutionId, key }, select: { id: true, publishedVersion: true } });
  if (!m || m.publishedVersion == null || version > m.publishedVersion) throw new NotFoundError('Module version not found');
  const v = await prisma.siteModuleVersion.findFirst({ where: { moduleId: m.id, version }, select: { version: true, snapshot: true } });
  if (!v) throw new NotFoundError('Module version not found');
  return { preview, module: fromSnapshot(key, v.version, v.snapshot) };
}
