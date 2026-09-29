import { Router, Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { env } from '../../config/env';
import {
  GenerateCommentDto,
  BulkCommentsDto,
  DraftQueryDto,
  EditDraftDto,
  ApproveDraftDto,
  RejectDraftDto,
  IdParamDto,
  StudentIdParamDto,
  RiskQueryDto,
  AttendancePatternQueryDto,
  FeeRiskQueryDto,
  FeeReminderDto,
  DraftMessageDto,
  DashboardInsightQueryDto,
  WorkloadQueryDto,
  ForecastQueryDto,
  KnowledgeQueryDto,
  CreateKnowledgeDto,
  UpdateKnowledgeDto,
  AskDto,
  GuardianChatDto,
  AdmissionAssistantDto,
  CleanupQueryDto,
} from './ai.dto';
import * as c from './ai.controller';

// =============================================================================
// AI routes — mounted at /api/v1/ai (already in app.ts; no new mount needed).
// =============================================================================

const router = Router();
const isDev = env.NODE_ENV === 'development';
const skipInTests = () => env.NODE_ENV === 'test';

// ── Public: admission enquiry assistant ─────────────────────────────────────
// Registered BEFORE router.use(authenticate) so it never needs a JWT.
const admissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many questions from this IP, please try again later' },
  skip: skipInTests,
});
router.post('/admission-assistant', admissionLimiter, validate({ body: AdmissionAssistantDto }), c.admissionAssistant);

// ── Everything below requires a logged-in tenant user ───────────────────────
router.use(authenticate, setTenant, auditLog);

const SA = UserRole.SUPER_ADMIN;
const A = UserRole.ADMIN;
const T = UserRole.TEACHER;
const STAFF_AI = requireRole(SA, A, T);
const ADMIN_ONLY = requireRole(SA, A);
const ALL_STAFF = requireRole(SA, A, T, UserRole.ACCOUNTANT, UserRole.LIBRARIAN, UserRole.TRANSPORT_OFFICER, UserRole.MANAGEMENT);

const guardianLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `guardian-chat:${req.user?.sub ?? 'anon'}`,
  message: { success: false, message: 'You have asked a lot of questions recently. Please try again in a few minutes.' },
  skip: skipInTests,
});

// Status / usage (drives the Demo-mode banner)
router.get('/status', ALL_STAFF, c.getStatus);

// 1. Report-card comments
router.post('/comment', STAFF_AI, validate({ body: GenerateCommentDto }), c.generateComment);
router.post('/comments/bulk', STAFF_AI, validate({ body: BulkCommentsDto }), c.bulkGenerateComments);

// AiDraft review queue
router.get('/drafts', STAFF_AI, validate({ query: DraftQueryDto }), c.listDrafts);
router.patch('/drafts/:id', STAFF_AI, validate({ params: IdParamDto, body: EditDraftDto }), c.editDraft);
router.post('/drafts/:id/approve', STAFF_AI, validate({ params: IdParamDto, body: ApproveDraftDto }), c.approveDraft);
router.post('/drafts/:id/reject', STAFF_AI, validate({ params: IdParamDto, body: RejectDraftDto }), c.rejectDraft);

// 2. Academic risk scoring
router.get('/risk-scoring', STAFF_AI, validate({ query: RiskQueryDto }), c.getAcademicRiskScoring);
router.get('/risk-scoring/:studentId/explain', STAFF_AI, validate({ params: StudentIdParamDto }), c.explainRisk);

// 3. Attendance patterns
router.get('/attendance-patterns', STAFF_AI, validate({ query: AttendancePatternQueryDto }), c.getAttendancePatterns);

// 4. Fee collection risk (Accountant too — they own collections)
const FEE_ROLES = requireRole(SA, A, UserRole.ACCOUNTANT);
router.get('/fee-risk', FEE_ROLES, validate({ query: FeeRiskQueryDto }), c.getFeeRisk);
router.post('/fee-risk/:studentId/draft-reminder', FEE_ROLES, validate({ params: StudentIdParamDto, body: FeeReminderDto }), c.draftFeeReminder);

// 5. Communication drafting
router.post('/draft-message', STAFF_AI, validate({ body: DraftMessageDto }), c.draftMessage);

// 6. Dashboard insights
router.get('/dashboard-insights', STAFF_AI, validate({ query: DashboardInsightQueryDto }), c.getDashboardInsights);

// 7. Teacher workload
router.get('/teacher-workload', ADMIN_ONLY, validate({ query: WorkloadQueryDto }), c.getTeacherWorkload);

// 8. Enrolment forecast
router.get('/enrolment-forecast', ADMIN_ONLY, validate({ query: ForecastQueryDto }), c.getEnrolmentForecast);

// 9. Knowledge base + staff assistant
router.get('/knowledge', ADMIN_ONLY, validate({ query: KnowledgeQueryDto }), c.listKnowledge);
router.post('/knowledge', ADMIN_ONLY, validate({ body: CreateKnowledgeDto }), c.createKnowledge);
router.patch('/knowledge/:id', ADMIN_ONLY, validate({ params: IdParamDto, body: UpdateKnowledgeDto }), c.updateKnowledge);
router.delete('/knowledge/:id', ADMIN_ONLY, validate({ params: IdParamDto }), c.deleteKnowledge);
router.post('/ask', ALL_STAFF, validate({ body: AskDto }), c.askKnowledge);

// 10. Guardian support chatbot
const GUARDIAN = requireRole(UserRole.GUARDIAN);
router.post('/guardian-chat', GUARDIAN, guardianLimiter, validate({ body: GuardianChatDto }), c.guardianChat);
router.get('/guardian-chat/replies', GUARDIAN, c.guardianReplies);

// 12. Data clean-up suggestions
router.get('/data-cleanup', ADMIN_ONLY, validate({ query: CleanupQueryDto }), c.getDataCleanup);

export default router;
