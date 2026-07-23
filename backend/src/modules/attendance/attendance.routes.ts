import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import * as attendanceController from './attendance.controller';
import {
  AdminRegisterQueryDto,
  AssignmentQueryDto,
  CorrectionRequestQueryDto,
  CreateAssignmentDto,
  CreateCorrectionRequestDto,
  DraftSaveDto,
  LockRegisterDto,
  MyAttendanceQueryDto,
  PatchRecordDto,
  ReopenRegisterDto,
  ReportsSummaryQueryDto,
  ResolveCorrectionRequestDto,
  RegisterIdParamDto,
  RegistersRosterQueryDto,
  RegistersTodayQueryDto,
  RecordIdParamDto,
  StudentIdParamDto,
  SubmitRegisterDto,
  TakeOnBehalfDto,
  IdParamDto,
} from './attendance.dto';

const router = Router();

router.use(authenticate, setTenant, auditLog);

// =============================================================================
// Teacher-facing
// =============================================================================

router.get(
  '/registers/today',
  requireRole(UserRole.TEACHER),
  validate({ query: RegistersTodayQueryDto }),
  attendanceController.getRegistersToday,
);

router.get(
  '/registers/roster',
  requireRole(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ query: RegistersRosterQueryDto }),
  attendanceController.getRosterBySectionDate,
);

router.put(
  '/registers/:registerId/draft',
  requireRole(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: RegisterIdParamDto, body: DraftSaveDto }),
  attendanceController.saveDraft,
);

router.post(
  '/registers/:registerId/take-on-behalf',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: RegisterIdParamDto, body: TakeOnBehalfDto }),
  attendanceController.takeOnBehalf,
);

router.post(
  '/registers/:registerId/submit',
  requireRole(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: RegisterIdParamDto, body: SubmitRegisterDto }),
  attendanceController.submitRegister,
);

// =============================================================================
// Admin-facing
// =============================================================================

router.get(
  '/admin/registers',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGEMENT),
  validate({ query: AdminRegisterQueryDto }),
  attendanceController.listAdminRegisters,
);

router.post(
  '/admin/registers/:registerId/reopen',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: RegisterIdParamDto, body: ReopenRegisterDto }),
  attendanceController.reopenRegister,
);

router.post(
  '/admin/registers/:registerId/lock',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: RegisterIdParamDto, body: LockRegisterDto }),
  attendanceController.lockRegister,
);

router.patch(
  '/admin/records/:recordId',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: RecordIdParamDto, body: PatchRecordDto }),
  attendanceController.patchRecord,
);

// =============================================================================
// Student / Guardian-facing
// =============================================================================

router.get(
  '/my-attendance',
  requireRole(UserRole.STUDENT),
  validate({ query: MyAttendanceQueryDto }),
  attendanceController.getMyAttendance,
);

router.get(
  '/child/:studentId',
  requireRole(UserRole.GUARDIAN),
  validate({ params: StudentIdParamDto, query: MyAttendanceQueryDto }),
  attendanceController.getChildAttendance,
);

router.get(
  '/reports/summary',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGEMENT, UserRole.TEACHER),
  validate({ query: ReportsSummaryQueryDto }),
  attendanceController.getReportsSummary,
);

router.post(
  '/correction-requests',
  requireRole(UserRole.STUDENT, UserRole.GUARDIAN),
  validate({ body: CreateCorrectionRequestDto }),
  attendanceController.createCorrectionRequest,
);

router.get(
  '/correction-requests',
  requireRole(UserRole.STUDENT, UserRole.GUARDIAN, UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ query: CorrectionRequestQueryDto }),
  attendanceController.listCorrectionRequests,
);

router.patch(
  '/correction-requests/:id/resolve',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: IdParamDto, body: ResolveCorrectionRequestDto }),
  attendanceController.resolveCorrectionRequest,
);

// =============================================================================
// Teacher-assignment CRUD (Admin)
// =============================================================================

router.post(
  '/assignments',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ body: CreateAssignmentDto }),
  attendanceController.createAssignment,
);

router.get(
  '/assignments',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ query: AssignmentQueryDto }),
  attendanceController.listAssignments,
);

// NOTE: body is intentionally NOT validated via the `validate()` middleware
// here — the controller must inspect the RAW body first to reject attempts
// to change teacherId/sectionId/subject (see spec) before any schema would
// silently strip those keys. The controller parses with UpdateAssignmentDto
// itself after that check.
router.patch(
  '/assignments/:id',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: IdParamDto }),
  attendanceController.updateAssignment,
);

router.delete(
  '/assignments/:id',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ params: IdParamDto }),
  attendanceController.deleteAssignment,
);

export default router;
