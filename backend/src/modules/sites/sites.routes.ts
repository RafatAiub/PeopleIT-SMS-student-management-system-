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
  PublicCollectionItemParamDto,
  PublicCollectionParamDto,
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
import * as pc from './sites.portal.controller';
import * as colc from './sites.collections.controller';
import * as modc from './sites.modules.controller';
import {
  CreateModuleDto,
  DeleteModuleQueryDto,
  ImportModuleDto,
  ModuleQueryDto,
  ModuleVersionParamDto,
  ModuleVersionsQueryDto,
  PublicModuleVersionParamDto,
  PublicModulesQueryDto,
  PublishModuleDto,
  UpdateModuleDto,
  ValidateModuleDto,
} from './sites.modules.dto';
import {
  CreateOrderDto,
  CreateProductDto,
  CustomerQueryDto,
  DemoPayDto,
  ForgotPasswordDto,
  LoginCustomerDto,
  OrderQueryDto,
  ResetPasswordDto,
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
import {
  AdmissionQueryDto,
  AlbumPhotoOrderDto,
  AlbumPhotoParamDto,
  AlbumQueryDto,
  CommitteeQueryDto,
  CreateAdmissionDto,
  CreateAlbumDto,
  CreateAlbumPhotoDto,
  CreateCommitteeMemberDto,
  CreateDownloadDto,
  DataAdmissionParamDto,
  DataAdmissionsQueryDto,
  DataAlbumParamDto,
  DataAlbumsQueryDto,
  DataBranchesQueryDto,
  DataClassStatsQueryDto,
  DataCommitteeQueryDto,
  DataDownloadsQueryDto,
  DataExamRoutineQueryDto,
  DataFeeChartQueryDto,
  DataHolidaysQueryDto,
  DataLibraryQueryDto,
  DataNoticeParamDto,
  DataProfileQueryDto,
  DataResultSummaryQueryDto,
  DataResultsArchiveQueryDto,
  DataStaffQueryDto,
  DataSubjectsQueryDto,
  DataTransportQueryDto,
  DownloadQueryDto,
  StaffVisibilityQueryDto,
  ToggleStaffVisibilityDto,
  UpdateAdmissionDto,
  UpdateAlbumDto,
  UpdateAlbumPhotoDto,
  UpdateCommitteeMemberDto,
  UpdateDownloadDto,
  UpdateProfileDto,
} from './sites.portal.dto';

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
// Website v3 (Track B) — institution profile, staff visibility, committee,
// albums, downloads, admission circulars, DSHE compliance. Admin side.
// =============================================================================

sitesRouter.get('/profile', MANAGE, pc.getProfile);
sitesRouter.put('/profile', MANAGE, validate({ body: UpdateProfileDto }), pc.updateProfile);
sitesRouter.get('/me/compliance', MANAGE, pc.getCompliance);

sitesRouter.get('/staff-visibility', MANAGE, validate({ query: StaffVisibilityQueryDto }), pc.listStaffVisibility);
sitesRouter.put('/staff-visibility', MANAGE, validate({ body: ToggleStaffVisibilityDto }), pc.setStaffVisibility);

sitesRouter.get('/committee', MANAGE, validate({ query: CommitteeQueryDto }), pc.listCommittee);
sitesRouter.post('/committee', MANAGE, validate({ body: CreateCommitteeMemberDto }), pc.createCommitteeMember);
sitesRouter.put('/committee/:id', MANAGE, validate({ params: IdParamDto, body: UpdateCommitteeMemberDto }), pc.updateCommitteeMember);
sitesRouter.delete('/committee/:id', MANAGE, validate({ params: IdParamDto }), pc.deleteCommitteeMember);

sitesRouter.get('/albums', MANAGE, validate({ query: AlbumQueryDto }), pc.listAlbums);
sitesRouter.post('/albums', MANAGE, validate({ body: CreateAlbumDto }), pc.createAlbum);
sitesRouter.get('/albums/:id', MANAGE, validate({ params: IdParamDto }), pc.getAlbum);
sitesRouter.put('/albums/:id', MANAGE, validate({ params: IdParamDto, body: UpdateAlbumDto }), pc.updateAlbum);
sitesRouter.delete('/albums/:id', MANAGE, validate({ params: IdParamDto }), pc.deleteAlbum);
sitesRouter.post('/albums/:id/photos', MANAGE, validate({ params: IdParamDto, body: CreateAlbumPhotoDto }), pc.addAlbumPhoto);
sitesRouter.put('/albums/:id/photos/order', MANAGE, validate({ params: IdParamDto, body: AlbumPhotoOrderDto }), pc.reorderAlbumPhotos);
sitesRouter.put(
  '/albums/:id/photos/:photoId',
  MANAGE,
  validate({ params: AlbumPhotoParamDto, body: UpdateAlbumPhotoDto }),
  pc.updateAlbumPhoto,
);
sitesRouter.delete('/albums/:id/photos/:photoId', MANAGE, validate({ params: AlbumPhotoParamDto }), pc.deleteAlbumPhoto);

sitesRouter.get('/downloads', MANAGE, validate({ query: DownloadQueryDto }), pc.listDownloads);
sitesRouter.post('/downloads', MANAGE, validate({ body: CreateDownloadDto }), pc.createDownload);
sitesRouter.put('/downloads/:id', MANAGE, validate({ params: IdParamDto, body: UpdateDownloadDto }), pc.updateDownload);
sitesRouter.delete('/downloads/:id', MANAGE, validate({ params: IdParamDto }), pc.deleteDownload);

sitesRouter.get('/admissions', MANAGE, validate({ query: AdmissionQueryDto }), pc.listAdmissions);
sitesRouter.post('/admissions', MANAGE, validate({ body: CreateAdmissionDto }), pc.createAdmission);
sitesRouter.get('/admissions/:id', MANAGE, validate({ params: IdParamDto }), pc.getAdmission);
sitesRouter.put('/admissions/:id', MANAGE, validate({ params: IdParamDto, body: UpdateAdmissionDto }), pc.updateAdmission);
sitesRouter.delete('/admissions/:id', MANAGE, validate({ params: IdParamDto }), pc.deleteAdmission);

// =============================================================================
// Website custom modules (W13, FEATURES_V4_PLAN §1b). Guard: SUPER_ADMIN/ADMIN
// or a user listed in site.settings.websiteDeveloperUserIds (hook for the
// planned "Website developer" role). /import and /validate before /:id.
// =============================================================================

const MODULE_DEV = modc.requireModuleDeveloper;
sitesRouter.get('/modules', MODULE_DEV, validate({ query: ModuleQueryDto }), modc.list);
sitesRouter.post('/modules', MODULE_DEV, validate({ body: CreateModuleDto }), modc.create);
sitesRouter.post('/modules/import', MODULE_DEV, validate({ body: ImportModuleDto }), modc.importOne);
sitesRouter.post('/modules/validate', MODULE_DEV, validate({ body: ValidateModuleDto }), modc.validateOne);
sitesRouter.get('/modules/:id', MODULE_DEV, validate({ params: IdParamDto }), modc.get);
sitesRouter.put('/modules/:id', MODULE_DEV, validate({ params: IdParamDto, body: UpdateModuleDto }), modc.update);
sitesRouter.delete('/modules/:id', MODULE_DEV, validate({ params: IdParamDto, query: DeleteModuleQueryDto }), modc.remove);
sitesRouter.post('/modules/:id/publish', MODULE_DEV, validate({ params: IdParamDto, body: PublishModuleDto }), modc.publish);
sitesRouter.get('/modules/:id/versions', MODULE_DEV, validate({ params: IdParamDto, query: ModuleVersionsQueryDto }), modc.versions);
sitesRouter.post('/modules/:id/versions/:versionId/restore', MODULE_DEV, validate({ params: ModuleVersionParamDto }), modc.restore);
sitesRouter.get('/modules/:id/export', MODULE_DEV, validate({ params: IdParamDto }), modc.exportOne);

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
// Website v3 (Track B3/B4) — profile, staff directory, class/gender counts,
// subjects, exam routine, results, fee chart, holidays, library, transport,
// branches, committee, albums, downloads, admission circulars, notice detail.
// See docs/redesign/WEBSITE_V3_PLAN.md §7 for the full contract.
// =============================================================================

publicSitesRouter.get('/:siteId/data/profile', validate({ ...site, query: DataProfileQueryDto }), pc.dataProfile);
publicSitesRouter.get('/:siteId/data/staff', validate({ ...site, query: DataStaffQueryDto }), pc.dataStaff);
publicSitesRouter.get('/:siteId/data/class-stats', validate({ ...site, query: DataClassStatsQueryDto }), pc.dataClassStats);
publicSitesRouter.get('/:siteId/data/subjects', validate({ ...site, query: DataSubjectsQueryDto }), pc.dataSubjects);
publicSitesRouter.get('/:siteId/data/exam-routine', validate({ ...site, query: DataExamRoutineQueryDto }), pc.dataExamRoutine);
publicSitesRouter.get('/:siteId/data/result-summary', validate({ ...site, query: DataResultSummaryQueryDto }), pc.dataResultSummary);
publicSitesRouter.get('/:siteId/data/results-archive', validate({ ...site, query: DataResultsArchiveQueryDto }), pc.dataResultsArchive);
publicSitesRouter.get('/:siteId/data/fee-chart', validate({ ...site, query: DataFeeChartQueryDto }), pc.dataFeeChart);
publicSitesRouter.get('/:siteId/data/holidays', validate({ ...site, query: DataHolidaysQueryDto }), pc.dataHolidays);
publicSitesRouter.get('/:siteId/data/library', validate({ ...site, query: DataLibraryQueryDto }), pc.dataLibrary);
publicSitesRouter.get('/:siteId/data/transport', validate({ ...site, query: DataTransportQueryDto }), pc.dataTransport);
publicSitesRouter.get('/:siteId/data/branches', validate({ ...site, query: DataBranchesQueryDto }), pc.dataBranches);
publicSitesRouter.get('/:siteId/data/committee', validate({ ...site, query: DataCommitteeQueryDto }), pc.dataCommittee);
publicSitesRouter.get('/:siteId/data/albums', validate({ ...site, query: DataAlbumsQueryDto }), pc.dataAlbums);
publicSitesRouter.get('/:siteId/data/albums/:id', validate({ params: DataAlbumParamDto, query: PublicPreviewQueryDto }), pc.dataAlbumDetail);
publicSitesRouter.get('/:siteId/data/downloads', validate({ ...site, query: DataDownloadsQueryDto }), pc.dataDownloads);
publicSitesRouter.get('/:siteId/data/admissions', validate({ ...site, query: DataAdmissionsQueryDto }), pc.dataAdmissions);
publicSitesRouter.get(
  '/:siteId/data/admissions/:id',
  validate({ params: DataAdmissionParamDto, query: PublicPreviewQueryDto }),
  pc.dataAdmissionDetail,
);
publicSitesRouter.get('/:siteId/data/notices/:id', validate({ params: DataNoticeParamDto, query: PublicPreviewQueryDto }), pc.dataNoticeDetail);

// =============================================================================
// Website collections (W1) — generic, whitelisted query API. The query string
// is parsed against the registry in the service (unknown field/op => 400), so
// only the path params are validated here. Contract: FEATURES_V4_PLAN.md §8.
// =============================================================================

publicSitesRouter.get('/:siteId/collections', validate({ params: PublicSiteParamDto }), colc.collectionsSchema);
publicSitesRouter.get('/:siteId/collections/:key', validate({ params: PublicCollectionParamDto }), colc.collectionList);
publicSitesRouter.get('/:siteId/collections/:key/items/:slug', validate({ params: PublicCollectionItemParamDto }), colc.collectionItem);

// Website custom modules: published definitions only (drafts need a preview token + ?drafts=1).
publicSitesRouter.get('/:siteId/modules', validate({ params: PublicSiteParamDto, query: PublicModulesQueryDto }), modc.publicList);
publicSitesRouter.get('/:siteId/modules/:key/versions/:version', validate({ params: PublicModuleVersionParamDto, query: PublicPreviewQueryDto }), modc.publicVersion);

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
publicSitesRouter.post('/:siteId/account/forgot', accountLimiter, validate({ params: PublicSiteParamDto, body: ForgotPasswordDto }), cc.forgotPassword);
publicSitesRouter.post('/:siteId/account/reset', accountLimiter, validate({ params: PublicSiteParamDto, body: ResetPasswordDto }), cc.resetPassword);
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
