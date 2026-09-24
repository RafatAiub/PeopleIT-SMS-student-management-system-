import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateLeaveTypeDto,
  UpdateLeaveTypeDto,
  LeaveTypeQueryDto,
  CreateLeaveRequestDto,
  LeaveRequestQueryDto,
  MyLeaveRequestQueryDto,
  LeaveReportQueryDto,
  LeaveIdParamDto,
  ApproveLeaveRequestDto,
  RejectLeaveRequestDto,
} from './leave.dto';
import * as leaveController from './leave.controller';

const router = Router();

// Apply auth + tenant + audit logging to all leave routes
router.use(authenticate, setTenant, auditLog);

const ADMIN_ONLY = requireRole(UserRole.ADMIN);
// Self-service: submit/view/cancel one's own leave requests. Includes
// STUDENT (Student Leave's self-service side reuses these same endpoints —
// ownership scoping on /requests/mine, GET /requests/:id and cancel already
// pins results to the caller regardless of role, so no student-specific
// route was needed, only this role added to the gate).
const SELF_SERVICE = requireRole(
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
  UserRole.TRANSPORT_OFFICER,
  UserRole.MANAGEMENT,
  UserRole.STUDENT,
);

// Leave type endpoints
router.post('/types', ADMIN_ONLY, validate({ body: CreateLeaveTypeDto }), leaveController.createLeaveType);
router.get('/types', SELF_SERVICE, validate({ query: LeaveTypeQueryDto }), leaveController.listLeaveTypes);
router.patch(
  '/types/:id',
  ADMIN_ONLY,
  validate({ params: LeaveIdParamDto, body: UpdateLeaveTypeDto }),
  leaveController.updateLeaveType,
);
router.delete(
  '/types/:id',
  ADMIN_ONLY,
  validate({ params: LeaveIdParamDto }),
  leaveController.deleteLeaveType,
);

// Leave report — admin-only, monthly usage-vs-allocation view for one
// applicant at a time. Mounted under /report so it never collides with the
// /requests/:id family below.
router.get(
  '/report',
  ADMIN_ONLY,
  validate({ query: LeaveReportQueryDto }),
  leaveController.getLeaveReport,
);

// Leave request endpoints
router.post(
  '/requests',
  SELF_SERVICE,
  validate({ body: CreateLeaveRequestDto }),
  leaveController.createLeaveRequest,
);
router.get(
  '/requests',
  ADMIN_ONLY,
  validate({ query: LeaveRequestQueryDto }),
  leaveController.listAllLeaveRequests,
);
// IMPORTANT: mounted BEFORE /requests/:id — otherwise Express would match
// the literal "mine" segment as an :id param and this route would never run.
router.get(
  '/requests/mine',
  SELF_SERVICE,
  validate({ query: MyLeaveRequestQueryDto }),
  leaveController.listMyLeaveRequests,
);
router.get(
  '/requests/:id',
  SELF_SERVICE,
  validate({ params: LeaveIdParamDto }),
  leaveController.getLeaveRequest,
);
router.delete(
  '/requests/:id',
  ADMIN_ONLY,
  validate({ params: LeaveIdParamDto }),
  leaveController.deleteLeaveRequest,
);
router.post(
  '/requests/:id/cancel',
  SELF_SERVICE,
  validate({ params: LeaveIdParamDto }),
  leaveController.cancelLeaveRequest,
);
router.post(
  '/requests/:id/approve',
  ADMIN_ONLY,
  validate({ params: LeaveIdParamDto, body: ApproveLeaveRequestDto }),
  leaveController.approveLeaveRequest,
);
router.post(
  '/requests/:id/reject',
  ADMIN_ONLY,
  validate({ params: LeaveIdParamDto, body: RejectLeaveRequestDto }),
  leaveController.rejectLeaveRequest,
);

export default router;
