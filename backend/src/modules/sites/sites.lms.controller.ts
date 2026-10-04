import { Request, Response, NextFunction } from 'express';
import { successResponse, paginatedResponse } from '../../utils/response';
import { mapSitesError } from './sites.config';
import * as lms from './sites.lms.service';
import { assertTenant, type SitesCtx } from './sites.service';

// =============================================================================
// Sites LMS controllers — thin: parse the request, call the service, respond.
// =============================================================================

type Handler = (req: Request, res: Response) => Promise<unknown>;

const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapSitesError(error));
  }
};

const ctxOf = (req: Request): SitesCtx => ({
  institutionId: assertTenant(req.tenantId),
  userId: req.user!.sub,
  role: req.user!.role,
});

const q = (req: Request) => req.query as any;
const paged = (res: Response, r: { items: unknown[]; total: number }, req: Request, extra?: Record<string, unknown>) =>
  paginatedResponse(res, r.items, r.total, Number(q(req).page ?? 1), Number(q(req).pageSize ?? r.items.length ?? 20), 'Success', extra);

const previewOf = (req: Request): string | undefined =>
  (typeof req.query.preview === 'string' ? req.query.preview : undefined) ??
  (typeof req.headers['x-site-preview'] === 'string' ? (req.headers['x-site-preview'] as string) : undefined);

function cache(res: Response, preview: boolean, seconds = 60) {
  res.setHeader('Cache-Control', preview ? 'private, no-store' : `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
}

// ── Admin: courses ───────────────────────────────────────────────────────────

export const listCourses = wrap(async (req, res) => paged(res, await lms.listCourses(ctxOf(req), q(req)), req));
export const createCourse = wrap(async (req, res) => successResponse(res, await lms.createCourse(ctxOf(req), req.body), 'Course created', 201));
export const getCourse = wrap(async (req, res) => successResponse(res, await lms.getCourse(ctxOf(req), req.params.id)));
export const updateCourse = wrap(async (req, res) => successResponse(res, await lms.updateCourse(ctxOf(req), req.params.id, req.body), 'Course saved'));
export const deleteCourse = wrap(async (req, res) => successResponse(res, await lms.deleteCourse(ctxOf(req), req.params.id), 'Course deleted'));

// ── Admin: lessons ───────────────────────────────────────────────────────────

export const createLesson = wrap(async (req, res) => successResponse(res, await lms.createLesson(ctxOf(req), req.params.id, req.body), 'Lesson created', 201));
export const updateLesson = wrap(async (req, res) =>
  successResponse(res, await lms.updateLesson(ctxOf(req), req.params.id, req.params.lessonId, req.body), 'Lesson saved'),
);
export const deleteLesson = wrap(async (req, res) =>
  successResponse(res, await lms.deleteLesson(ctxOf(req), req.params.id, req.params.lessonId), 'Lesson deleted'),
);
export const reorderLessons = wrap(async (req, res) => successResponse(res, await lms.reorderLessons(ctxOf(req), req.params.id, req.body.ids), 'Order saved'));

// ── Admin: enrollments ───────────────────────────────────────────────────────

export const listEnrollments = wrap(async (req, res) => paged(res, await lms.listEnrollments(ctxOf(req), req.params.id, q(req)), req));
export const grantEnrollment = wrap(async (req, res) =>
  successResponse(res, await lms.grantEnrollment(ctxOf(req), req.params.id, req.body), 'Access granted', 201),
);
export const revokeEnrollment = wrap(async (req, res) => successResponse(res, await lms.revokeEnrollment(ctxOf(req), req.params.id), 'Access revoked'));

// ── Public: catalogue ────────────────────────────────────────────────────────

export const publicCourses = wrap(async (req, res) => {
  const r = await lms.listPublicCourses(req.params.siteId, { ...q(req), preview: previewOf(req) });
  cache(res, r.preview);
  paged(res, r, req);
});
export const publicCourse = wrap(async (req, res) => {
  const r = await lms.getPublicCourse(req.params.siteId, req.params.slug, previewOf(req));
  cache(res, r.preview);
  successResponse(res, r);
});

// ── Public: enrollment + learning (Bearer required) ──────────────────────────

export const enrollFreeCourse = wrap(async (req, res) =>
  successResponse(res, await lms.enrollFreeCourse(req.params.siteId, req.params.slug, req.headers.authorization), 'Enrolled', 201),
);
export const accountCourses = wrap(async (req, res) => successResponse(res, await lms.accountCourses(req.params.siteId, req.headers.authorization)));
export const learnCourse = wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  successResponse(res, await lms.learnCourse(req.params.siteId, req.params.courseSlug, req.headers.authorization));
});
export const completeLesson = wrap(async (req, res) =>
  successResponse(res, await lms.completeLesson(req.params.siteId, req.params.courseSlug, req.params.lessonId, req.headers.authorization)),
);
export const uncompleteLesson = wrap(async (req, res) =>
  successResponse(res, await lms.uncompleteLesson(req.params.siteId, req.params.courseSlug, req.params.lessonId, req.headers.authorization)),
);
