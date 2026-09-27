import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { UserRole } from '@prisma/client';
import * as analytics from './analytics.controller';
import { ANALYTICS_ROLES, REPORT_ROLES, SCHEDULE_ROLES } from './analytics.access';
import {
  AcademicQueryDto,
  AttendanceQueryDto,
  ChronicQueryDto,
  CreateSavedViewDto,
  CreateScheduleDto,
  CronPreviewDto,
  DefaultersQueryDto,
  ExportParamsDto,
  ExportQueryDto,
  FinanceQueryDto,
  IdParamDto,
  SavedViewQueryDto,
  ScheduleQueryDto,
  UpdateSavedViewDto,
  UpdateScheduleDto,
} from './analytics.dto';

const router = Router();

// auditLog only records POST/PUT/PATCH/DELETE, so the existing GET endpoints
// below behave exactly as before.
router.use(authenticate, setTenant, auditLog);

router.get(
  '/dashboard',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGEMENT),
  reportsController.getDashboard,
);
router.get(
  '/admin-overview',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGEMENT),
  reportsController.getAdminOverview,
);

// ── Analytics (role scope applied in analytics.scope.ts) ─────────────────────
const ANY = requireRole(...ANALYTICS_ROLES);

router.get('/analytics/filter-options', ANY, analytics.filterOptions);
router.get('/analytics/finance', requireRole(...REPORT_ROLES.finance), validate({ query: FinanceQueryDto }), analytics.finance);
router.get(
  '/analytics/finance/defaulters',
  requireRole(...REPORT_ROLES.finance),
  validate({ query: DefaultersQueryDto }),
  analytics.defaulters,
);
router.get(
  '/analytics/attendance',
  requireRole(...REPORT_ROLES.attendance),
  validate({ query: AttendanceQueryDto }),
  analytics.attendance,
);
router.get(
  '/analytics/attendance/chronic',
  requireRole(...REPORT_ROLES.attendance),
  validate({ query: ChronicQueryDto }),
  analytics.chronicAbsentees,
);
router.get('/analytics/academic', requireRole(...REPORT_ROLES.academic), validate({ query: AcademicQueryDto }), analytics.academic);
// Per-report access is re-checked in renderReportCsv.
router.get(
  '/analytics/:reportKey/export.csv',
  ANY,
  validate({ params: ExportParamsDto, query: ExportQueryDto }),
  analytics.exportCsv,
);

// ── Saved views ──────────────────────────────────────────────────────────────
router.get('/saved-views', ANY, validate({ query: SavedViewQueryDto }), analytics.listViews);
router.post('/saved-views', ANY, validate({ body: CreateSavedViewDto }), analytics.createView);
router.put('/saved-views/:id', ANY, validate({ params: IdParamDto, body: UpdateSavedViewDto }), analytics.updateView);
router.delete('/saved-views/:id', ANY, validate({ params: IdParamDto }), analytics.deleteView);

// ── Scheduled report emails ──────────────────────────────────────────────────
const SCHEDULERS = requireRole(...SCHEDULE_ROLES);

router.get('/schedules/preview', SCHEDULERS, validate({ query: CronPreviewDto }), analytics.previewCron);
router.get('/schedules/recipients', SCHEDULERS, analytics.recipientOptions);
router.get('/schedules', SCHEDULERS, validate({ query: ScheduleQueryDto }), analytics.listSchedules);
router.post('/schedules', SCHEDULERS, validate({ body: CreateScheduleDto }), analytics.createSchedule);
router.put('/schedules/:id', SCHEDULERS, validate({ params: IdParamDto, body: UpdateScheduleDto }), analytics.updateSchedule);
router.delete('/schedules/:id', SCHEDULERS, validate({ params: IdParamDto }), analytics.deleteSchedule);
router.post('/schedules/:id/run', SCHEDULERS, validate({ params: IdParamDto }), analytics.runSchedule);

export default router;
