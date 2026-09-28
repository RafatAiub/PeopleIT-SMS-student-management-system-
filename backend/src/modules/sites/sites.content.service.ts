// =============================================================================
// Sites — admin service: media metadata, blog posts, forms and submissions.
// =============================================================================

import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import {
  FormField,
  PageDataError,
  normalizePuckData,
  sanitizeHtml,
  slugify,
  uniqueSlug,
  validateFormDefinition,
  MAX_PAGE_DATA_BYTES,
} from './sites.logic';
import { getOrCreateSite, type SitesCtx } from './sites.service';
import type {
  CreateFormDtoType,
  CreateMediaDtoType,
  CreatePostDtoType,
  MediaQueryDtoType,
  PaginationDtoType,
  PostQueryDtoType,
  SubmissionQueryDtoType,
  UpdateFormDtoType,
  UpdatePostDtoType,
} from './sites.dto';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const skipTake = (q: PaginationDtoType) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

// ── Media ───────────────────────────────────────────────────────────────────

export async function listMedia(ctx: SitesCtx, q: MediaQueryDtoType) {
  const where: Prisma.SiteMediaWhereInput = {
    institutionId: ctx.institutionId,
    ...(q.kind ? { kind: q.kind } : {}),
    ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { alt: { contains: q.search, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.siteMedia.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
    prisma.siteMedia.count({ where }),
  ]);
  return { items, total };
}

export function createMedia(ctx: SitesCtx, data: CreateMediaDtoType) {
  return prisma.siteMedia.create({
    data: {
      institutionId: ctx.institutionId,
      url: data.url,
      kind: data.kind,
      name: data.name,
      size: data.size ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      alt: data.alt ?? null,
      createdByUserId: ctx.userId,
    },
  });
}

export async function deleteMedia(ctx: SitesCtx, id: string) {
  const found = await prisma.siteMedia.findFirst({ where: { id, institutionId: ctx.institutionId }, select: { id: true } });
  if (!found) throw new NotFoundError('Media not found');
  await prisma.siteMedia.delete({ where: { id } });
  // The Cloudinary asset itself is not deleted (the browser uploaded it with
  // an unsigned preset; deleting needs the API secret, which we don't hold).
  return { id };
}

// ── Posts ───────────────────────────────────────────────────────────────────

const isManager = (role: string) => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

/** Post body: Puck data (object) or rich-text HTML (string). */
function normalizePostBody(body: unknown): Prisma.InputJsonValue {
  try {
    if (body === undefined || body === null) return json({ root: { props: {} }, content: [] });
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > MAX_PAGE_DATA_BYTES) throw new PageDataError('Post body is too large');
      return json({ html: sanitizeHtml(body) });
    }
    if (typeof body === 'object' && !Array.isArray(body) && typeof (body as Record<string, unknown>).html === 'string') {
      return json({ html: sanitizeHtml((body as Record<string, string>).html) });
    }
    return json(normalizePuckData(body));
  } catch (error) {
    if (error instanceof PageDataError) throw new ValidationError(error.message);
    throw error;
  }
}

export async function listPosts(ctx: SitesCtx, q: PostQueryDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SitePostWhereInput = {
    institutionId: ctx.institutionId,
    siteId: site.id,
    ...(q.status ? { status: q.status } : {}),
    ...(q.tag ? { tags: { has: q.tag } } : {}),
    ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.sitePost.findMany({
      where,
      select: {
        id: true, slug: true, title: true, excerpt: true, coverUrl: true, status: true, publishedAt: true,
        authorUserId: true, tags: true, createdAt: true, updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      ...skipTake(q),
    }),
    prisma.sitePost.count({ where }),
  ]);
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(items.map((p) => p.authorUserId))] }, institutionId: ctx.institutionId },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(authors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
  return { items: items.map((p) => ({ ...p, authorName: names.get(p.authorUserId) ?? null })), total };
}

async function postOrThrow(ctx: SitesCtx, id: string) {
  const post = await prisma.sitePost.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!post) throw new NotFoundError('Post not found');
  return post;
}

export function getPost(ctx: SitesCtx, id: string) {
  return postOrThrow(ctx, id);
}

async function takenPostSlugs(siteId: string, base: string) {
  const rows = await prisma.sitePost.findMany({ where: { siteId, slug: { startsWith: base } }, select: { slug: true } });
  return rows.map((r) => r.slug);
}

export async function createPost(ctx: SitesCtx, data: CreatePostDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  // Teachers write drafts; an admin publishes them.
  const status = isManager(ctx.role) ? data.status : 'DRAFT';
  let slug: string;
  if (data.slug) {
    const clash = await prisma.sitePost.findUnique({ where: { siteId_slug: { siteId: site.id, slug: data.slug } }, select: { id: true } });
    if (clash) throw new ConflictError(`A post with slug "${data.slug}" already exists`);
    slug = data.slug;
  } else {
    const base = slugify(data.title) || 'post';
    slug = uniqueSlug(base, await takenPostSlugs(site.id, base));
  }
  return prisma.sitePost.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      slug,
      title: data.title,
      excerpt: data.excerpt ?? null,
      coverUrl: data.coverUrl ?? null,
      body: normalizePostBody(data.body),
      status,
      publishedAt: status === 'PUBLISHED' ? (data.publishedAt ?? new Date()) : (data.publishedAt ?? null),
      authorUserId: ctx.userId,
      tags: [...new Set(data.tags)],
    },
  });
}

export async function updatePost(ctx: SitesCtx, id: string, data: UpdatePostDtoType) {
  const post = await postOrThrow(ctx, id);
  if (!isManager(ctx.role)) {
    if (post.authorUserId !== ctx.userId) throw new ForbiddenError('You can only edit your own posts');
    if (post.status === 'PUBLISHED') throw new ForbiddenError('Published posts can only be changed by an admin');
    if (data.status === 'PUBLISHED') throw new ForbiddenError('Only an admin can publish posts');
  }
  const patch: Prisma.SitePostUpdateInput = {};
  if (data.slug !== undefined && data.slug !== post.slug) {
    const clash = await prisma.sitePost.findUnique({ where: { siteId_slug: { siteId: post.siteId, slug: data.slug } }, select: { id: true } });
    if (clash) throw new ConflictError(`A post with slug "${data.slug}" already exists`);
    patch.slug = data.slug;
  }
  if (data.title !== undefined) patch.title = data.title;
  if (data.excerpt !== undefined) patch.excerpt = data.excerpt;
  if (data.coverUrl !== undefined) patch.coverUrl = data.coverUrl;
  if (data.body !== undefined) patch.body = normalizePostBody(data.body);
  if (data.tags !== undefined) patch.tags = [...new Set(data.tags)];
  if (data.status !== undefined) patch.status = data.status;
  if (data.publishedAt !== undefined) patch.publishedAt = data.publishedAt;
  const becomesPublished = (data.status ?? post.status) === 'PUBLISHED';
  if (becomesPublished && !post.publishedAt && data.publishedAt === undefined) patch.publishedAt = new Date();
  return prisma.sitePost.update({ where: { id: post.id }, data: patch });
}

export async function deletePost(ctx: SitesCtx, id: string) {
  const post = await postOrThrow(ctx, id);
  await prisma.sitePost.delete({ where: { id: post.id } });
  return { id: post.id };
}

// ── Forms ───────────────────────────────────────────────────────────────────

function checkDefinition(fields: FormField[], target: 'ENQUIRY' | 'INBOX') {
  const errors = validateFormDefinition(fields, target);
  if (errors.length) throw new ValidationError(errors[0], errors.map((message) => ({ field: 'body.fields', message })));
}

export async function listForms(ctx: SitesCtx, q: PaginationDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where = { institutionId: ctx.institutionId, siteId: site.id };
  const [forms, total] = await Promise.all([
    prisma.siteForm.findMany({ where, orderBy: { createdAt: 'asc' }, ...skipTake(q), include: { _count: { select: { submissions: true } } } }),
    prisma.siteForm.count({ where }),
  ]);
  const unread = forms.length
    ? await prisma.siteFormSubmission.groupBy({
        by: ['formId'],
        where: { formId: { in: forms.map((f) => f.id) }, institutionId: ctx.institutionId, readAt: null },
        _count: { _all: true },
      })
    : [];
  const unreadBy = new Map(unread.map((u) => [u.formId, u._count._all]));
  return {
    items: forms.map(({ _count, ...f }) => ({ ...f, submissionCount: _count.submissions, unreadCount: unreadBy.get(f.id) ?? 0 })),
    total,
  };
}

async function formOrThrow(ctx: SitesCtx, id: string) {
  const form = await prisma.siteForm.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!form) throw new NotFoundError('Form not found');
  return form;
}

export async function createForm(ctx: SitesCtx, data: CreateFormDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  checkDefinition(data.fields as FormField[], data.target);
  return prisma.siteForm.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      name: data.name,
      fields: json(data.fields),
      target: data.target,
      notifyEmails: [...new Set(data.notifyEmails)],
    },
  });
}

export async function updateForm(ctx: SitesCtx, id: string, data: UpdateFormDtoType) {
  const form = await formOrThrow(ctx, id);
  const fields = (data.fields ?? form.fields) as unknown as FormField[];
  const target = data.target ?? form.target;
  checkDefinition(fields, target);
  return prisma.siteForm.update({
    where: { id: form.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.fields !== undefined ? { fields: json(data.fields) } : {}),
      ...(data.target !== undefined ? { target: data.target } : {}),
      ...(data.notifyEmails !== undefined ? { notifyEmails: [...new Set(data.notifyEmails)] } : {}),
    },
  });
}

export async function deleteForm(ctx: SitesCtx, id: string) {
  const form = await formOrThrow(ctx, id);
  await prisma.siteForm.delete({ where: { id: form.id } });
  return { id: form.id };
}

export async function listSubmissions(ctx: SitesCtx, formId: string, q: SubmissionQueryDtoType) {
  const form = await formOrThrow(ctx, formId);
  const where: Prisma.SiteFormSubmissionWhereInput = {
    formId: form.id,
    institutionId: ctx.institutionId,
    ...(q.unread === 'true' ? { readAt: null } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.siteFormSubmission.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
    prisma.siteFormSubmission.count({ where }),
  ]);
  return { items, total, form: { id: form.id, name: form.name, fields: form.fields, target: form.target } };
}

export async function markSubmissionRead(ctx: SitesCtx, formId: string, submissionId: string, read: boolean) {
  const form = await formOrThrow(ctx, formId);
  const sub = await prisma.siteFormSubmission.findFirst({
    where: { id: submissionId, formId: form.id, institutionId: ctx.institutionId },
    select: { id: true },
  });
  if (!sub) throw new NotFoundError('Submission not found');
  return prisma.siteFormSubmission.update({ where: { id: sub.id }, data: { readAt: read ? new Date() : null } });
}
