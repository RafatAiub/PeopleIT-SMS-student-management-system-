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
  DataCoursesQueryDto,
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
import * as cc from './sites.commerce.controller';
import * as lc from './sites.lms.controller';
import {
  CreateOrderDto,
  CreateProductDto,
  CustomerQueryDto,
  DemoPayDto,
  LoginCustomerDto,
  OrderQueryDto,
  PayCallbackParamDto,
  ProductQueryDto,
  PublicOrderParamDto,
  PublicOrderQueryDto,
  PublicProductParamDto,
  PublicProductQueryDto,
  RegisterCustomerDto,
  UpdateOrderDto,
  UpdateProductDto,
} from './sites.commerce.dto';
import {
  CourseQueryDto,
  CreateCourseDto,
  CreateLessonDto,
  EnrollmentQueryDto,
  GrantEnrollmentDto,
  LearnLessonParamDto,
  LearnParamDto,
  LessonOrderDto,
  PublicCourseParamDto,
  PublicCourseQueryDto,
  UpdateCourseDto,
  UpdateLessonDto,
} from './sites.lms.dto';

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
// Website Builder v2 — Shop (commerce) and Courses (LMS), admin side.
// =============================================================================

// Products
sitesRouter.get('/products', MANAGE, validate({ query: ProductQueryDto }), cc.listProducts);
sitesRouter.post('/products', MANAGE, validate({ body: CreateProductDto }), cc.createProduct);
sitesRouter.get('/products/:id', MANAGE, validate({ params: IdParamDto }), cc.getProduct);
sitesRouter.put('/products/:id', MANAGE, validate({ params: IdParamDto, body: UpdateProductDto }), cc.updateProduct);
sitesRouter.delete('/products/:id', MANAGE, validate({ params: IdParamDto }), cc.deleteProduct);

// Courses
sitesRouter.get('/courses', MANAGE, validate({ query: CourseQueryDto }), lc.listCourses);
sitesRouter.post('/courses', MANAGE, validate({ body: CreateCourseDto }), lc.createCourse);
sitesRouter.get('/courses/:id', MANAGE, validate({ params: IdParamDto }), lc.getCourse);
sitesRouter.put('/courses/:id', MANAGE, validate({ params: IdParamDto, body: UpdateCourseDto }), lc.updateCourse);
sitesRouter.delete('/courses/:id', MANAGE, validate({ params: IdParamDto }), lc.deleteCourse);

// Lessons — /lessons/order before /lessons/:lessonId
sitesRouter.post('/courses/:id/lessons', MANAGE, validate({ params: IdParamDto, body: CreateLessonDto }), lc.createLesson);
sitesRouter.put('/courses/:id/lessons/order', MANAGE, validate({ params: IdParamDto, body: LessonOrderDto }), lc.reorderLessons);
sitesRouter.put(
  '/courses/:id/lessons/:lessonId',
  MANAGE,
  validate({ params: IdParamDto.extend({ lessonId: IdParamDto.shape.id }), body: UpdateLessonDto }),
  lc.updateLesson,
);
sitesRouter.delete(
  '/courses/:id/lessons/:lessonId',
  MANAGE,
  validate({ params: IdParamDto.extend({ lessonId: IdParamDto.shape.id }) }),
  lc.deleteLesson,
);

// Enrollments
sitesRouter.get('/courses/:id/enrollments', MANAGE, validate({ params: IdParamDto, query: EnrollmentQueryDto }), lc.listEnrollments);
sitesRouter.post('/courses/:id/enrollments', MANAGE, validate({ params: IdParamDto, body: GrantEnrollmentDto }), lc.grantEnrollment);
sitesRouter.delete('/enrollments/:id', MANAGE, validate({ params: IdParamDto }), lc.revokeEnrollment);

// Orders
sitesRouter.get('/orders', MANAGE, validate({ query: OrderQueryDto }), cc.listOrders);
sitesRouter.get('/orders/:id', MANAGE, validate({ params: IdParamDto }), cc.getOrder);
sitesRouter.put('/orders/:id', MANAGE, validate({ params: IdParamDto, body: UpdateOrderDto }), cc.updateOrder);

// Customers
sitesRouter.get('/customers', MANAGE, validate({ query: CustomerQueryDto }), cc.listCustomers);

// Commerce summary
sitesRouter.get('/commerce/summary', MANAGE, cc.commerceSummary);

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
// Website Builder v2 — commerce/LMS public rate limits (§3 of the brief).
const accountLimiter = limiter(15 * 60 * 1000, 10, 'Too many attempts — please wait a while and try again');
const ordersLimiter = limiter(15 * 60 * 1000, 20, 'Too many orders from this IP, please try again later');
const demoPayLimiter = limiter(15 * 60 * 1000, 20, 'Too many demo payments from this IP, please try again later');

export const publicSitesRouter = Router();
publicSitesRouter.use(readLimiter);

publicSitesRouter.get('/resolve', validate({ query: ResolveQueryDto }), c.resolve);
publicSitesRouter.get('/caddy-ask', validate({ query: CaddyAskQueryDto }), c.caddyAsk);

// Gateway callbacks — NOT nested under /:siteId (the gateway's own callback
// URL has no room for it); the order is looked up by its gatewayTranId /
// gatewayPaymentId instead. GET and POST, like the fee-payment gateway router.
publicSitesRouter.get('/pay/:gateway/:kind', validate({ params: PayCallbackParamDto }), cc.payCallback);
publicSitesRouter.post('/pay/:gateway/:kind', validate({ params: PayCallbackParamDto }), cc.payCallback);

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
publicSitesRouter.get('/:siteId/data/courses', validate({ ...site, query: DataCoursesQueryDto }), c.dataCourses);

// =============================================================================
// Website Builder v2 — Shop (commerce) and Courses (LMS), public side.
// =============================================================================

// Catalogue
publicSitesRouter.get('/:siteId/products', validate({ params: PublicSiteParamDto, query: PublicProductQueryDto }), cc.publicProducts);
publicSitesRouter.get('/:siteId/products/:slug', validate({ params: PublicProductParamDto, query: PublicPreviewQueryDto }), cc.publicProduct);
publicSitesRouter.get('/:siteId/courses', validate({ params: PublicSiteParamDto, query: PublicCourseQueryDto }), lc.publicCourses);
publicSitesRouter.get('/:siteId/courses/:slug', validate({ params: PublicCourseParamDto, query: PublicPreviewQueryDto }), lc.publicCourse);
publicSitesRouter.get('/:siteId/checkout/options', validate({ params: PublicSiteParamDto }), cc.checkoutOptions);

// Customer account
publicSitesRouter.post('/:siteId/account/register', accountLimiter, validate({ params: PublicSiteParamDto, body: RegisterCustomerDto }), cc.registerAccount);
publicSitesRouter.post('/:siteId/account/login', accountLimiter, validate({ params: PublicSiteParamDto, body: LoginCustomerDto }), cc.loginAccount);
publicSitesRouter.get('/:siteId/account/me', validate({ params: PublicSiteParamDto }), cc.accountMe);
publicSitesRouter.get('/:siteId/account/orders', validate({ params: PublicSiteParamDto }), cc.accountOrders);
publicSitesRouter.get('/:siteId/account/courses', validate({ params: PublicSiteParamDto }), lc.accountCourses);

// Orders and payment
publicSitesRouter.post('/:siteId/orders', ordersLimiter, validate({ params: PublicSiteParamDto, body: CreateOrderDto }), cc.createOrder);
publicSitesRouter.get('/:siteId/orders/:orderNo', validate({ params: PublicOrderParamDto, query: PublicOrderQueryDto }), cc.getPublicOrder);
publicSitesRouter.post(
  '/:siteId/orders/:orderNo/demo-pay',
  demoPayLimiter,
  validate({ params: PublicOrderParamDto, body: DemoPayDto }),
  cc.demoPay,
);

// Learning (Bearer required, enrollment ACTIVE)
publicSitesRouter.post('/:siteId/courses/:slug/enroll', validate({ params: PublicCourseParamDto }), lc.enrollFreeCourse);
publicSitesRouter.get('/:siteId/learn/:courseSlug', validate({ params: LearnParamDto }), lc.learnCourse);
publicSitesRouter.post('/:siteId/learn/:courseSlug/lessons/:lessonId/complete', validate({ params: LearnLessonParamDto }), lc.completeLesson);
publicSitesRouter.delete('/:siteId/learn/:courseSlug/lessons/:lessonId/complete', validate({ params: LearnLessonParamDto }), lc.uncompleteLesson);

export default sitesRouter;
