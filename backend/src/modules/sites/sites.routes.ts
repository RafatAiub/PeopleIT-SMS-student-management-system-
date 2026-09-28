import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as c from './sites.controller';
import {
  ApplyTemplateDto,
  CaddyAskQueryDto,
  CreateDomainDto,
  CreateFormDto,
  CreateMediaDto,
  CreatePageDto,
  CreatePostDto,
  DataEventsQueryDto,
  DataNoticesQueryDto,
  DataPreviewOnlyQueryDto,
  DataRoutineQueryDto,
  DataToppersQueryDto,
  FormQueryDto,
  GenerateSiteDto,
  IdParamDto,
  MediaQueryDto,
  PageOrderDto,
  PageQueryDto,
  PostQueryDto,
  PublicFormParamDto,
  PublicPageParamDto,
  PublicPostParamDto,
  PublicPostQueryDto,
  PublicPreviewQueryDto,
  PublicSiteParamDto,
  PublishPageDto,
  ResolveQueryDto,
  ResultsLookupDto,
  SubmissionParamDto,
  SubmissionQueryDto,
  SubmitFormDto,
  UpdateFormDto,
  UpdatePageDto,
  UpdatePostDto,
  UpdateSiteDto,
  VersionParamDto,
  VersionQueryDto,
} from './sites.dto';

// =============================================================================
// Admin API — mounted at /api/v1/sites
//   SUPER_ADMIN / ADMIN manage everything; TEACHER may create and edit posts
//   (their own, as drafts — an admin publishes).
// =============================================================================

export const sitesRouter = Router();
sitesRouter.use(authenticate, setTenant, requireTenant, auditLog);

const MANAGE = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const POSTS = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER);

// Site
sitesRouter.get('/me', MANAGE, c.getMe);
sitesRouter.put('/me', MANAGE, validate({ body: UpdateSiteDto }), c.updateMe);
sitesRouter.post('/me/apply-template', MANAGE, validate({ body: ApplyTemplateDto }), c.applyTemplate);
sitesRouter.post('/me/publish', MANAGE, c.publishSite);
sitesRouter.post('/me/unpublish', MANAGE, c.unpublishSite);
sitesRouter.post('/me/preview-token', MANAGE, c.previewToken);
sitesRouter.post('/me/generate', MANAGE, validate({ body: GenerateSiteDto }), c.generate);

// Pages — /pages/order before /pages/:id
sitesRouter.get('/pages', MANAGE, validate({ query: PageQueryDto }), c.listPages);
sitesRouter.post('/pages', MANAGE, validate({ body: CreatePageDto }), c.createPage);
sitesRouter.put('/pages/order', MANAGE, validate({ body: PageOrderDto }), c.reorderPages);
sitesRouter.get('/pages/:id', MANAGE, validate({ params: IdParamDto }), c.getPage);
sitesRouter.put('/pages/:id', MANAGE, validate({ params: IdParamDto, body: UpdatePageDto }), c.updatePage);
sitesRouter.delete('/pages/:id', MANAGE, validate({ params: IdParamDto }), c.deletePage);
sitesRouter.post('/pages/:id/publish', MANAGE, validate({ params: IdParamDto, body: PublishPageDto }), c.publishPage);
sitesRouter.get('/pages/:id/versions', MANAGE, validate({ params: IdParamDto, query: VersionQueryDto }), c.listVersions);
sitesRouter.post('/pages/:id/versions/:versionId/restore', MANAGE, validate({ params: VersionParamDto }), c.restoreVersion);

// Media (metadata; files go browser → Cloudinary)
sitesRouter.get('/media', MANAGE, validate({ query: MediaQueryDto }), c.listMedia);
sitesRouter.post('/media', MANAGE, validate({ body: CreateMediaDto }), c.createMedia);
sitesRouter.delete('/media/:id', MANAGE, validate({ params: IdParamDto }), c.deleteMedia);

// Posts
sitesRouter.get('/posts', POSTS, validate({ query: PostQueryDto }), c.listPosts);
sitesRouter.post('/posts', POSTS, validate({ body: CreatePostDto }), c.createPost);
sitesRouter.get('/posts/:id', POSTS, validate({ params: IdParamDto }), c.getPost);
sitesRouter.put('/posts/:id', POSTS, validate({ params: IdParamDto, body: UpdatePostDto }), c.updatePost);
sitesRouter.delete('/posts/:id', MANAGE, validate({ params: IdParamDto }), c.deletePost);

// Forms
sitesRouter.get('/forms', MANAGE, validate({ query: FormQueryDto }), c.listForms);
sitesRouter.post('/forms', MANAGE, validate({ body: CreateFormDto }), c.createForm);
sitesRouter.put('/forms/:id', MANAGE, validate({ params: IdParamDto, body: UpdateFormDto }), c.updateForm);
sitesRouter.delete('/forms/:id', MANAGE, validate({ params: IdParamDto }), c.deleteForm);
sitesRouter.get('/forms/:id/submissions', MANAGE, validate({ params: IdParamDto, query: SubmissionQueryDto }), c.listSubmissions);
sitesRouter.put('/forms/:id/submissions/:submissionId/read', MANAGE, validate({ params: SubmissionParamDto }), c.markSubmission);

// Domains
sitesRouter.get('/domains', MANAGE, c.listDomains);
sitesRouter.post('/domains', MANAGE, validate({ body: CreateDomainDto }), c.addDomain);
sitesRouter.post('/domains/:id/verify', MANAGE, validate({ params: IdParamDto }), c.verifyDomain);
sitesRouter.put('/domains/:id/primary', MANAGE, validate({ params: IdParamDto }), c.setPrimaryDomain);
sitesRouter.delete('/domains/:id', MANAGE, validate({ params: IdParamDto }), c.removeDomain);

// =============================================================================
// Public API — mounted at /api/v1/public/sites (NO auth; any origin, see the
// CORS exemption in app.ts). Rate limits live here so mounting is one line.
// =============================================================================

const isDev = env.NODE_ENV === 'development';
const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max: isDev ? Math.max(max, 1000) : max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skip: () => env.NODE_ENV === 'test',
  });

const readLimiter = limiter(60 * 1000, 240, 'Too many requests, please slow down');
const submitLimiter = limiter(15 * 60 * 1000, 5, 'Too many submissions from this IP, please try again later');
const resultsLimiter = limiter(15 * 60 * 1000, 10, 'Too many result lookups from this IP, please try again later');

export const publicSitesRouter = Router();
publicSitesRouter.use(readLimiter);

publicSitesRouter.get('/resolve', validate({ query: ResolveQueryDto }), c.resolve);
publicSitesRouter.get('/caddy-ask', validate({ query: CaddyAskQueryDto }), c.caddyAsk);

publicSitesRouter.get('/:siteId/pages/:slug', validate({ params: PublicPageParamDto, query: PublicPreviewQueryDto }), c.publicPage);
publicSitesRouter.get(
  '/:siteId/posts',
  validate({ params: PublicSiteParamDto, query: PublicPostQueryDto.merge(PublicPreviewQueryDto) }),
  c.publicPosts,
);
publicSitesRouter.get('/:siteId/posts/:slug', validate({ params: PublicPostParamDto, query: PublicPreviewQueryDto }), c.publicPost);
publicSitesRouter.get('/:siteId/forms/:formId', validate({ params: PublicFormParamDto, query: PublicPreviewQueryDto }), c.publicForm);
publicSitesRouter.post(
  '/:siteId/forms/:formId/submit',
  submitLimiter,
  validate({ params: PublicFormParamDto, body: SubmitFormDto }),
  c.submitForm,
);
publicSitesRouter.get('/:siteId/sitemap.xml', validate({ params: PublicSiteParamDto }), c.sitemap);
publicSitesRouter.get('/:siteId/robots.txt', validate({ params: PublicSiteParamDto }), c.robots);

// Live school data
const site = { params: PublicSiteParamDto };
publicSitesRouter.get('/:siteId/data/notices', validate({ ...site, query: DataNoticesQueryDto }), c.dataNotices);
publicSitesRouter.get('/:siteId/data/events', validate({ ...site, query: DataEventsQueryDto }), c.dataEvents);
publicSitesRouter.get('/:siteId/data/teachers', validate({ ...site, query: DataPreviewOnlyQueryDto }), c.dataTeachers);
publicSitesRouter.get('/:siteId/data/exams', validate({ ...site, query: DataPreviewOnlyQueryDto }), c.dataExams);
publicSitesRouter.get('/:siteId/data/toppers', validate({ ...site, query: DataToppersQueryDto }), c.dataToppers);
publicSitesRouter.post(
  '/:siteId/data/results-lookup',
  resultsLimiter,
  validate({ ...site, query: DataPreviewOnlyQueryDto, body: ResultsLookupDto }),
  c.dataResultsLookup,
);
publicSitesRouter.get('/:siteId/data/routine', validate({ ...site, query: DataRoutineQueryDto }), c.dataRoutine);
publicSitesRouter.get('/:siteId/data/stats', validate({ ...site, query: DataPreviewOnlyQueryDto }), c.dataStats);
publicSitesRouter.get('/:siteId/data/fees-link', validate({ ...site, query: DataPreviewOnlyQueryDto }), c.dataFeesLink);
publicSitesRouter.get('/:siteId/data/courses', validate({ ...site, query: DataPreviewOnlyQueryDto }), c.dataCourses);

export default sitesRouter;
