import { Request, Response, NextFunction } from 'express';
import { successResponse, paginatedResponse } from '../../utils/response';
import { mapSitesError } from './sites.config';
import * as sites from './sites.service';
import * as content from './sites.content.service';
import * as domains from './sites.domains.service';
import * as publicSvc from './sites.public.service';
import * as data from './sites.data.service';
import { generateSite } from './sites.ai';
import type { SitesCtx } from './sites.service';

// =============================================================================
// Sites controllers — thin: parse the request, call the service, respond.
// Errors (including "migration not applied") go through next().
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
  institutionId: sites.assertTenant(req.tenantId),
  userId: req.user!.sub,
  role: req.user!.role,
});

const q = (req: Request) => req.query as any;
const paged = (res: Response, r: { items: unknown[]; total: number }, req: Request, extra?: Record<string, unknown>) =>
  paginatedResponse(res, r.items, r.total, Number(q(req).page ?? 1), Number(q(req).pageSize ?? r.items.length ?? 20), 'Success', extra);

// ── Admin: site ─────────────────────────────────────────────────────────────

export const getMe = wrap(async (req, res) => successResponse(res, await sites.getMe(ctxOf(req))));
export const updateMe = wrap(async (req, res) => successResponse(res, await sites.updateMe(ctxOf(req), req.body), 'Site updated'));
export const applyTemplate = wrap(async (req, res) =>
  successResponse(res, await sites.applyTemplate(ctxOf(req), req.body), 'Template applied'),
);
export const publishSite = wrap(async (req, res) => successResponse(res, await sites.publishSite(ctxOf(req)), 'Site published'));
export const unpublishSite = wrap(async (req, res) => successResponse(res, await sites.unpublishSite(ctxOf(req)), 'Site unpublished'));
export const previewToken = wrap(async (req, res) => successResponse(res, await sites.issuePreviewToken(ctxOf(req))));
export const generate = wrap(async (req, res) => {
  const ctx = ctxOf(req);
  successResponse(res, await generateSite({ institutionId: ctx.institutionId, userId: ctx.userId }, req.body), 'Draft pages generated');
});

// ── Admin: pages ────────────────────────────────────────────────────────────

export const listPages = wrap(async (req, res) => paged(res, await sites.listPages(ctxOf(req), q(req)), req));
export const createPage = wrap(async (req, res) => successResponse(res, await sites.createPage(ctxOf(req), req.body), 'Page created', 201));
export const getPage = wrap(async (req, res) => successResponse(res, await sites.getPage(ctxOf(req), req.params.id)));
export const updatePage = wrap(async (req, res) =>
  successResponse(res, await sites.updatePage(ctxOf(req), req.params.id, req.body), 'Page saved'),
);
export const deletePage = wrap(async (req, res) => successResponse(res, await sites.deletePage(ctxOf(req), req.params.id), 'Page deleted'));
export const publishPage = wrap(async (req, res) =>
  successResponse(res, await sites.publishPage(ctxOf(req), req.params.id, req.body?.note), 'Page published'),
);
export const reorderPages = wrap(async (req, res) => successResponse(res, await sites.reorderPages(ctxOf(req), req.body.ids), 'Order saved'));
export const listVersions = wrap(async (req, res) => paged(res, await sites.listVersions(ctxOf(req), req.params.id, q(req)), req));
export const restoreVersion = wrap(async (req, res) =>
  successResponse(res, await sites.restoreVersion(ctxOf(req), req.params.id, req.params.versionId), 'Version restored to draft'),
);

// ── Admin: media ────────────────────────────────────────────────────────────

export const listMedia = wrap(async (req, res) => paged(res, await content.listMedia(ctxOf(req), q(req)), req));
export const createMedia = wrap(async (req, res) => successResponse(res, await content.createMedia(ctxOf(req), req.body), 'Media saved', 201));
export const deleteMedia = wrap(async (req, res) => successResponse(res, await content.deleteMedia(ctxOf(req), req.params.id), 'Media removed'));

// ── Admin: posts ────────────────────────────────────────────────────────────

export const listPosts = wrap(async (req, res) => paged(res, await content.listPosts(ctxOf(req), q(req)), req));
export const createPost = wrap(async (req, res) => successResponse(res, await content.createPost(ctxOf(req), req.body), 'Post created', 201));
export const getPost = wrap(async (req, res) => successResponse(res, await content.getPost(ctxOf(req), req.params.id)));
export const updatePost = wrap(async (req, res) =>
  successResponse(res, await content.updatePost(ctxOf(req), req.params.id, req.body), 'Post saved'),
);
export const deletePost = wrap(async (req, res) => successResponse(res, await content.deletePost(ctxOf(req), req.params.id), 'Post deleted'));

// ── Admin: forms ────────────────────────────────────────────────────────────

export const listForms = wrap(async (req, res) => paged(res, await content.listForms(ctxOf(req), q(req)), req));
export const createForm = wrap(async (req, res) => successResponse(res, await content.createForm(ctxOf(req), req.body), 'Form created', 201));
export const updateForm = wrap(async (req, res) =>
  successResponse(res, await content.updateForm(ctxOf(req), req.params.id, req.body), 'Form saved'),
);
export const deleteForm = wrap(async (req, res) => successResponse(res, await content.deleteForm(ctxOf(req), req.params.id), 'Form deleted'));
export const listSubmissions = wrap(async (req, res) => {
  const r = await content.listSubmissions(ctxOf(req), req.params.id, q(req));
  paged(res, r, req, { form: r.form });
});
export const markSubmission = wrap(async (req, res) =>
  successResponse(
    res,
    await content.markSubmissionRead(ctxOf(req), req.params.id, req.params.submissionId, req.body?.read !== false),
  ),
);

// ── Admin: domains ──────────────────────────────────────────────────────────

export const listDomains = wrap(async (req, res) => {
  const r = await domains.listDomains(ctxOf(req));
  paginatedResponse(res, r.items, r.total, 1, Math.max(r.total, 1), 'Success', { provider: r.provider });
});
export const addDomain = wrap(async (req, res) =>
  successResponse(res, await domains.addDomain(ctxOf(req), req.body.hostname), 'Domain added — now set the DNS records', 201),
);
export const verifyDomain = wrap(async (req, res) => successResponse(res, await domains.verifyDomain(ctxOf(req), req.params.id)));
export const setPrimaryDomain = wrap(async (req, res) =>
  successResponse(res, await domains.setPrimaryDomain(ctxOf(req), req.params.id), 'Primary domain set'),
);
export const removeDomain = wrap(async (req, res) => successResponse(res, await domains.removeDomain(ctxOf(req), req.params.id), 'Domain removed'));

// ── Public ──────────────────────────────────────────────────────────────────

const previewOf = (req: Request): string | undefined =>
  (typeof req.query.preview === 'string' ? req.query.preview : undefined) ??
  (typeof req.headers['x-site-preview'] === 'string' ? (req.headers['x-site-preview'] as string) : undefined);

/** Published responses may be cached briefly by browsers/CDNs; previews never. */
function cache(res: Response, preview: boolean, seconds = 60) {
  res.setHeader('Cache-Control', preview ? 'private, no-store' : `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
}

export const resolve = wrap(async (req, res) => {
  const r = await publicSvc.resolveSite({ ...q(req), preview: previewOf(req) });
  cache(res, r.preview);
  successResponse(res, r);
});
export const publicPage = wrap(async (req, res) => {
  const r = await publicSvc.getPublicPage(req.params.siteId, req.params.slug, previewOf(req));
  cache(res, r.preview);
  successResponse(res, r);
});
export const publicPosts = wrap(async (req, res) => {
  const r = await publicSvc.listPublicPosts(req.params.siteId, q(req), previewOf(req));
  cache(res, r.preview);
  paged(res, r, req);
});
export const publicPost = wrap(async (req, res) => {
  const r = await publicSvc.getPublicPost(req.params.siteId, req.params.slug, previewOf(req));
  cache(res, r.preview);
  successResponse(res, r);
});
export const publicForm = wrap(async (req, res) => {
  cache(res, true);
  successResponse(res, await publicSvc.getPublicForm(req.params.siteId, req.params.formId, previewOf(req)));
});
export const submitForm = wrap(async (req, res) => {
  const r = await publicSvc.submitForm(req.params.siteId, req.params.formId, req.body ?? {}, {
    ip: req.ip ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  });
  successResponse(res, r, 'Thank you — your message has been received', 201);
});
export const sitemap = wrap(async (req, res) => {
  const xml = await publicSvc.sitemap(req.params.siteId);
  cache(res, false, 3600);
  res.type('application/xml').send(xml);
});
export const robots = wrap(async (req, res) => {
  const txt = await publicSvc.robots(req.params.siteId);
  cache(res, false, 3600);
  res.type('text/plain').send(txt);
});
export const caddyAsk = wrap(async (req, res) => {
  const ok = await publicSvc.caddyAllows(String(req.query.domain ?? ''));
  res.status(ok ? 200 : 404).type('text/plain').send(ok ? 'ok' : 'unknown domain');
});

// ── Public: live data ───────────────────────────────────────────────────────

const dataHandler = (fn: (req: Request) => Promise<unknown>, seconds = 120) =>
  wrap(async (req, res) => {
    const r = await fn(req);
    cache(res, Boolean(previewOf(req)), seconds);
    successResponse(res, r);
  });

export const dataNotices = dataHandler((req) => data.notices(req.params.siteId, { ...q(req), preview: previewOf(req) }));
export const dataEvents = dataHandler((req) => data.events(req.params.siteId, { ...q(req), preview: previewOf(req) }));
export const dataTeachers = dataHandler((req) => data.teachers(req.params.siteId, previewOf(req)), 600);
export const dataExams = dataHandler((req) => data.exams(req.params.siteId, previewOf(req)), 600);
export const dataToppers = dataHandler((req) => data.toppers(req.params.siteId, { ...q(req), preview: previewOf(req) }), 600);
export const dataRoutine = dataHandler((req) => data.routine(req.params.siteId, { ...q(req), preview: previewOf(req) }), 600);
export const dataStats = dataHandler((req) => data.stats(req.params.siteId, previewOf(req)), 600);
export const dataFeesLink = dataHandler((req) => data.feesLink(req.params.siteId, previewOf(req)), 600);
export const dataCourses = dataHandler((req) => data.courses(req.params.siteId, previewOf(req)), 600);
export const dataResultsLookup = wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  successResponse(res, await data.resultsLookup(req.params.siteId, req.body, previewOf(req)));
});
