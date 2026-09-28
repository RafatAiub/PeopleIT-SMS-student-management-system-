// =============================================================================
// Sites — LMS service (Website Builder v2): courses, lessons, enrollments,
// and the learner experience (curriculum, progress).
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { sanitizeHtml, slugify, uniqueSlug } from './sites.logic';
import { getOrCreateSite, type SitesCtx } from './sites.service';
import { visibleSite } from './sites.public.service';
import { currentCustomer } from './sites.commerce.service';
import { unclaimedPasswordHash } from './sites.customer.auth';
import type {
  CreateCourseDtoType,
  CreateLessonDtoType,
  CourseQueryDtoType,
  EnrollmentQueryDtoType,
  GrantEnrollmentDtoType,
  PublicCourseQueryDtoType,
  UpdateCourseDtoType,
  UpdateLessonDtoType,
} from './sites.lms.dto';

const num = (v: Prisma.Decimal | null | undefined): number | null => (v == null ? null : Number(v));

// ── Admin: courses ───────────────────────────────────────────────────────────

function toAdminCourse(c: { price: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null; [k: string]: unknown }) {
  return { ...c, price: Number(c.price), compareAtPrice: num(c.compareAtPrice) };
}

function toAdminLesson(l: unknown) {
  return l;
}

async function resolveCourseSlug(siteId: string, provided: string | undefined, title: string): Promise<string> {
  if (provided) {
    const clash = await prisma.siteCourse.findUnique({ where: { siteId_slug: { siteId, slug: provided } }, select: { id: true } });
    if (clash) throw new ConflictError(`A course with slug "${provided}" already exists`);
    return provided;
  }
  const base = slugify(title) || 'course';
  const taken = (await prisma.siteCourse.findMany({ where: { siteId, slug: { startsWith: base } }, select: { slug: true } })).map((r) => r.slug);
  return uniqueSlug(base, taken);
}

export async function listCourses(ctx: SitesCtx, q: CourseQueryDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SiteCourseWhereInput = {
    institutionId: ctx.institutionId,
    siteId: site.id,
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.siteCourse.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteCourse.count({ where }),
  ]);
  return { items: items.map(toAdminCourse), total };
}

async function courseOrThrow(ctx: SitesCtx, id: string) {
  const c = await prisma.siteCourse.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!c) throw new NotFoundError('Course not found');
  return c;
}

export async function getCourse(ctx: SitesCtx, id: string) {
  const course = await courseOrThrow(ctx, id);
  const [lessons, enrollmentCount] = await Promise.all([
    prisma.siteCourseLesson.findMany({ where: { courseId: course.id, institutionId: ctx.institutionId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.siteEnrollment.count({ where: { courseId: course.id, institutionId: ctx.institutionId, status: 'ACTIVE' } }),
  ]);
  return { ...toAdminCourse(course), lessons: lessons.map(toAdminLesson), enrollmentCount };
}

export async function createCourse(ctx: SitesCtx, data: CreateCourseDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const slug = await resolveCourseSlug(site.id, data.slug, data.title);
  const last = await prisma.siteCourse.aggregate({ where: { siteId: site.id }, _max: { sortOrder: true } });
  const course = await prisma.siteCourse.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      slug,
      title: data.title,
      titleBn: data.titleBn ?? null,
      summary: data.summary ?? null,
      description: sanitizeHtml(data.description),
      coverUrl: data.coverUrl ?? null,
      price: new Prisma.Decimal(data.price),
      compareAtPrice: data.compareAtPrice != null ? new Prisma.Decimal(data.compareAtPrice) : null,
      level: data.level ?? null,
      language: data.language ?? null,
      category: data.category ?? null,
      instructorName: data.instructorName ?? null,
      instructorBio: data.instructorBio ?? null,
      instructorPhoto: data.instructorPhoto ?? null,
      durationText: data.durationText ?? null,
      status: data.status,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
  });
  return toAdminCourse(course);
}

export async function updateCourse(ctx: SitesCtx, id: string, data: UpdateCourseDtoType) {
  const course = await courseOrThrow(ctx, id);
  const patch: Prisma.SiteCourseUpdateInput = {};
  if (data.slug !== undefined && data.slug !== course.slug) {
    const clash = await prisma.siteCourse.findUnique({ where: { siteId_slug: { siteId: course.siteId, slug: data.slug } }, select: { id: true } });
    if (clash) throw new ConflictError(`A course with slug "${data.slug}" already exists`);
    patch.slug = data.slug;
  }
  if (data.title !== undefined) patch.title = data.title;
  if (data.titleBn !== undefined) patch.titleBn = data.titleBn;
  if (data.summary !== undefined) patch.summary = data.summary;
  if (data.description !== undefined) patch.description = sanitizeHtml(data.description);
  if (data.coverUrl !== undefined) patch.coverUrl = data.coverUrl;
  if (data.price !== undefined) patch.price = new Prisma.Decimal(data.price);
  if (data.compareAtPrice !== undefined) patch.compareAtPrice = data.compareAtPrice == null ? null : new Prisma.Decimal(data.compareAtPrice);
  if (data.level !== undefined) patch.level = data.level;
  if (data.language !== undefined) patch.language = data.language;
  if (data.category !== undefined) patch.category = data.category;
  if (data.instructorName !== undefined) patch.instructorName = data.instructorName;
  if (data.instructorBio !== undefined) patch.instructorBio = data.instructorBio;
  if (data.instructorPhoto !== undefined) patch.instructorPhoto = data.instructorPhoto;
  if (data.durationText !== undefined) patch.durationText = data.durationText;
  if (data.status !== undefined) patch.status = data.status;
  return toAdminCourse(await prisma.siteCourse.update({ where: { id: course.id }, data: patch }));
}

export async function deleteCourse(ctx: SitesCtx, id: string) {
  const course = await courseOrThrow(ctx, id);
  await prisma.siteCourse.delete({ where: { id: course.id } });
  return { id: course.id };
}

// ── Admin: lessons ───────────────────────────────────────────────────────────

export async function createLesson(ctx: SitesCtx, courseId: string, data: CreateLessonDtoType) {
  const course = await courseOrThrow(ctx, courseId);
  const last = await prisma.siteCourseLesson.aggregate({ where: { courseId: course.id }, _max: { sortOrder: true } });
  const lesson = await prisma.siteCourseLesson.create({
    data: {
      courseId: course.id,
      institutionId: ctx.institutionId,
      module: data.module ?? null,
      title: data.title,
      kind: data.kind,
      videoUrl: data.videoUrl ?? null,
      body: data.body !== undefined ? sanitizeHtml(data.body) : null,
      fileUrl: data.fileUrl ?? null,
      durationMin: data.durationMin ?? null,
      isFreePreview: data.isFreePreview,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
  });
  return toAdminLesson(lesson);
}

async function lessonOrThrow(ctx: SitesCtx, courseId: string, lessonId: string) {
  const lesson = await prisma.siteCourseLesson.findFirst({ where: { id: lessonId, courseId, institutionId: ctx.institutionId } });
  if (!lesson) throw new NotFoundError('Lesson not found');
  return lesson;
}

export async function updateLesson(ctx: SitesCtx, courseId: string, lessonId: string, data: UpdateLessonDtoType) {
  await courseOrThrow(ctx, courseId);
  const lesson = await lessonOrThrow(ctx, courseId, lessonId);
  const patch: Prisma.SiteCourseLessonUpdateInput = {};
  if (data.module !== undefined) patch.module = data.module;
  if (data.title !== undefined) patch.title = data.title;
  if (data.kind !== undefined) patch.kind = data.kind;
  if (data.videoUrl !== undefined) patch.videoUrl = data.videoUrl;
  if (data.body !== undefined) patch.body = sanitizeHtml(data.body);
  if (data.fileUrl !== undefined) patch.fileUrl = data.fileUrl;
  if (data.durationMin !== undefined) patch.durationMin = data.durationMin;
  if (data.isFreePreview !== undefined) patch.isFreePreview = data.isFreePreview;
  return toAdminLesson(await prisma.siteCourseLesson.update({ where: { id: lesson.id }, data: patch }));
}

export async function deleteLesson(ctx: SitesCtx, courseId: string, lessonId: string) {
  await courseOrThrow(ctx, courseId);
  const lesson = await lessonOrThrow(ctx, courseId, lessonId);
  await prisma.siteCourseLesson.delete({ where: { id: lesson.id } });
  return { id: lesson.id };
}

export async function reorderLessons(ctx: SitesCtx, courseId: string, ids: string[]) {
  await courseOrThrow(ctx, courseId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Lesson ids must be unique');
  const owned = await prisma.siteCourseLesson.findMany({ where: { id: { in: ids }, courseId, institutionId: ctx.institutionId }, select: { id: true } });
  if (owned.length !== ids.length) throw new NotFoundError('One or more lessons were not found');
  await prisma.$transaction(ids.map((lessonId, i) => prisma.siteCourseLesson.update({ where: { id: lessonId }, data: { sortOrder: i } })));
  const rows = await prisma.siteCourseLesson.findMany({ where: { courseId }, orderBy: [{ sortOrder: 'asc' }] });
  return rows.map(toAdminLesson);
}

// ── Admin: enrollments ───────────────────────────────────────────────────────

export async function listEnrollments(ctx: SitesCtx, courseId: string, q: EnrollmentQueryDtoType) {
  const course = await courseOrThrow(ctx, courseId);
  const where: Prisma.SiteEnrollmentWhereInput = { courseId: course.id, institutionId: ctx.institutionId };
  const [rows, total, lessonCount] = await Promise.all([
    prisma.siteEnrollment.findMany({
      where,
      include: { customer: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.siteEnrollment.count({ where }),
    prisma.siteCourseLesson.count({ where: { courseId: course.id } }),
  ]);
  const progressCounts = rows.length
    ? await prisma.siteLessonProgress.groupBy({ by: ['enrollmentId'], where: { enrollmentId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    : [];
  const doneBy = new Map(progressCounts.map((p) => [p.enrollmentId, p._count._all]));
  return {
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      customer: r.customer,
      progress: lessonCount ? Math.round(((doneBy.get(r.id) ?? 0) / lessonCount) * 100) : 0,
    })),
    total,
  };
}

export async function grantEnrollment(ctx: SitesCtx, courseId: string, data: GrantEnrollmentDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const course = await courseOrThrow(ctx, courseId);
  let customer = await prisma.siteCustomer.findUnique({ where: { siteId_email: { siteId: site.id, email: data.email } } });
  if (!customer) {
    customer = await prisma.siteCustomer.create({
      data: { siteId: site.id, institutionId: ctx.institutionId, email: data.email, name: data.name || data.email, passwordHash: unclaimedPasswordHash() },
    });
  }
  const existing = await prisma.siteEnrollment.findUnique({ where: { courseId_customerId: { courseId: course.id, customerId: customer.id } } });
  if (existing) {
    if (existing.status === 'ACTIVE') throw new ConflictError('This learner already has access to the course');
    const reactivated = await prisma.siteEnrollment.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
    return { id: reactivated.id, status: reactivated.status, customer: { id: customer.id, name: customer.name, email: customer.email } };
  }
  const enrollment = await prisma.siteEnrollment.create({
    data: { siteId: site.id, courseId: course.id, customerId: customer.id, institutionId: ctx.institutionId, status: 'ACTIVE' },
  });
  return { id: enrollment.id, status: enrollment.status, customer: { id: customer.id, name: customer.name, email: customer.email } };
}

export async function revokeEnrollment(ctx: SitesCtx, enrollmentId: string) {
  const enrollment = await prisma.siteEnrollment.findFirst({ where: { id: enrollmentId, institutionId: ctx.institutionId } });
  if (!enrollment) throw new NotFoundError('Enrollment not found');
  await prisma.siteEnrollment.update({ where: { id: enrollment.id }, data: { status: 'REVOKED' } });
  return { id: enrollment.id };
}

// ── Public: catalogue ────────────────────────────────────────────────────────

function toPublicCourse(
  c: {
    id: string;
    slug: string;
    title: string;
    titleBn: string | null;
    summary: string | null;
    description: string;
    coverUrl: string | null;
    price: Prisma.Decimal;
    compareAtPrice: Prisma.Decimal | null;
    level: string | null;
    language: string | null;
    category: string | null;
    instructorName: string | null;
    instructorBio: string | null;
    instructorPhoto: string | null;
    durationText: string | null;
  },
  agg: { count: number; minutes: number },
) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    titleBn: c.titleBn,
    summary: c.summary,
    description: c.description,
    coverUrl: c.coverUrl,
    price: Number(c.price),
    compareAtPrice: num(c.compareAtPrice),
    currency: 'BDT' as const,
    level: c.level,
    language: c.language,
    category: c.category,
    instructorName: c.instructorName,
    instructorBio: c.instructorBio,
    instructorPhoto: c.instructorPhoto,
    durationText: c.durationText,
    lessonCount: agg.count,
    totalMinutes: agg.minutes,
  };
}

async function lessonAggByCourse(courseIds: string[]): Promise<Map<string, { count: number; minutes: number }>> {
  if (!courseIds.length) return new Map();
  const agg = await prisma.siteCourseLesson.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: { _all: true }, _sum: { durationMin: true } });
  return new Map(agg.map((a) => [a.courseId, { count: a._count._all, minutes: a._sum.durationMin ?? 0 }]));
}

export async function listPublicCourses(siteId: string, q: PublicCourseQueryDtoType) {
  const { site, preview } = await visibleSite(siteId, q.preview);
  const where: Prisma.SiteCourseWhereInput = {
    siteId: site.id,
    institutionId: site.institutionId,
    ...(preview ? {} : { status: 'PUBLISHED' }),
    ...(q.category ? { category: q.category } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { summary: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.siteCourse.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteCourse.count({ where }),
  ]);
  const byId = await lessonAggByCourse(items.map((c) => c.id));
  return { items: items.map((c) => toPublicCourse(c, byId.get(c.id) ?? { count: 0, minutes: 0 })), total, preview };
}

export async function getPublicCourse(siteId: string, slugParam: string, preview?: string) {
  const { site, preview: isPreview } = await visibleSite(siteId, preview);
  const course = await prisma.siteCourse.findFirst({
    where: { siteId: site.id, institutionId: site.institutionId, slug: slugParam, ...(isPreview ? {} : { status: 'PUBLISHED' }) },
  });
  if (!course) throw new NotFoundError('Course not found');
  const lessons = await prisma.siteCourseLesson.findMany({ where: { courseId: course.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const totalMinutes = lessons.reduce((sum, l) => sum + (l.durationMin ?? 0), 0);
  const curriculum = lessons.map((l) => ({
    id: l.id,
    module: l.module,
    title: l.title,
    kind: l.kind,
    durationMin: l.durationMin,
    isFreePreview: l.isFreePreview,
    ...(l.isFreePreview ? { preview: { videoUrl: l.videoUrl ?? undefined, body: l.body ?? undefined, fileUrl: l.fileUrl ?? undefined } } : {}),
  }));
  return {
    course: toPublicCourse(course, { count: lessons.length, minutes: totalMinutes }),
    curriculum,
    lessonCount: lessons.length,
    totalMinutes,
    preview: isPreview,
  };
}

// ── Public: enrollment + learning ────────────────────────────────────────────

export async function enrollFreeCourse(siteId: string, slugParam: string, authHeader: string | undefined) {
  const { site } = await visibleSite(siteId, null);
  const course = await prisma.siteCourse.findFirst({ where: { siteId: site.id, institutionId: site.institutionId, slug: slugParam, status: 'PUBLISHED' } });
  if (!course) throw new NotFoundError('Course not found');
  if (Number(course.price) !== 0) throw new ForbiddenError('This course is not free — purchase it through checkout');
  const customer = await currentCustomer(siteId, authHeader);
  const existing = await prisma.siteEnrollment.findUnique({ where: { courseId_customerId: { courseId: course.id, customerId: customer.id } } });
  if (existing?.status === 'ACTIVE') throw new ConflictError('You are already enrolled in this course');
  if (existing) {
    await prisma.siteEnrollment.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
  } else {
    await prisma.siteEnrollment.create({
      data: { siteId: site.id, courseId: course.id, customerId: customer.id, institutionId: site.institutionId, status: 'ACTIVE' },
    });
  }
  return { enrolled: true };
}

async function activeEnrollment(siteId: string, courseSlug: string, authHeader: string | undefined) {
  const { site } = await visibleSite(siteId, null);
  const course = await prisma.siteCourse.findFirst({ where: { siteId: site.id, institutionId: site.institutionId, slug: courseSlug } });
  if (!course) throw new NotFoundError('Course not found');
  const customer = await currentCustomer(siteId, authHeader);
  const enrollment = await prisma.siteEnrollment.findUnique({ where: { courseId_customerId: { courseId: course.id, customerId: customer.id } } });
  if (!enrollment || enrollment.status !== 'ACTIVE') throw new ForbiddenError('You do not have access to this course');
  return { course, enrollment, customer };
}

export async function learnCourse(siteId: string, courseSlug: string, authHeader: string | undefined) {
  const { course, enrollment } = await activeEnrollment(siteId, courseSlug, authHeader);
  const lessons = await prisma.siteCourseLesson.findMany({ where: { courseId: course.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const progressRows = await prisma.siteLessonProgress.findMany({ where: { enrollmentId: enrollment.id }, select: { lessonId: true } });
  const completed = new Set(progressRows.map((p) => p.lessonId));
  const curriculum = lessons.map((l) => ({
    id: l.id,
    module: l.module,
    title: l.title,
    kind: l.kind,
    videoUrl: l.videoUrl,
    body: l.body,
    fileUrl: l.fileUrl,
    durationMin: l.durationMin,
    isFreePreview: l.isFreePreview,
    completed: completed.has(l.id),
  }));
  const progress = lessons.length ? Math.round((completed.size / lessons.length) * 100) : 0;
  return {
    course: toPublicCourse(course, { count: lessons.length, minutes: lessons.reduce((sum, l) => sum + (l.durationMin ?? 0), 0) }),
    curriculum,
    completedLessonIds: [...completed],
    progress,
  };
}

async function setLessonComplete(siteId: string, courseSlug: string, lessonId: string, authHeader: string | undefined, completed: boolean) {
  const { course, enrollment } = await activeEnrollment(siteId, courseSlug, authHeader);
  const lesson = await prisma.siteCourseLesson.findFirst({ where: { id: lessonId, courseId: course.id } });
  if (!lesson) throw new NotFoundError('Lesson not found');
  if (completed) {
    await prisma.siteLessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
      update: {},
      create: { enrollmentId: enrollment.id, lessonId: lesson.id },
    });
  } else {
    await prisma.siteLessonProgress.deleteMany({ where: { enrollmentId: enrollment.id, lessonId: lesson.id } });
  }
  const [total, done] = await Promise.all([
    prisma.siteCourseLesson.count({ where: { courseId: course.id } }),
    prisma.siteLessonProgress.count({ where: { enrollmentId: enrollment.id } }),
  ]);
  return { progress: total ? Math.round((done / total) * 100) : 0 };
}

export const completeLesson = (siteId: string, courseSlug: string, lessonId: string, authHeader: string | undefined) =>
  setLessonComplete(siteId, courseSlug, lessonId, authHeader, true);

export const uncompleteLesson = (siteId: string, courseSlug: string, lessonId: string, authHeader: string | undefined) =>
  setLessonComplete(siteId, courseSlug, lessonId, authHeader, false);

/** GET /account/courses — enrolled courses with progress %, for the customer account area. */
export async function accountCourses(siteId: string, authHeader: string | undefined) {
  const customer = await currentCustomer(siteId, authHeader);
  const enrollments = await prisma.siteEnrollment.findMany({ where: { siteId, customerId: customer.id, status: 'ACTIVE' }, include: { course: true } });
  const items = [];
  for (const e of enrollments) {
    const lessons = await prisma.siteCourseLesson.findMany({ where: { courseId: e.courseId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, durationMin: true } });
    const done = await prisma.siteLessonProgress.findMany({ where: { enrollmentId: e.id }, select: { lessonId: true } });
    const doneSet = new Set(done.map((d) => d.lessonId));
    const nextLesson = lessons.find((l) => !doneSet.has(l.id));
    items.push({
      ...toPublicCourse(e.course, { count: lessons.length, minutes: lessons.reduce((sum, l) => sum + (l.durationMin ?? 0), 0) }),
      progress: lessons.length ? Math.round((doneSet.size / lessons.length) * 100) : 0,
      nextLessonId: nextLesson?.id ?? null,
    });
  }
  return { items };
}
