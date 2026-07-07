import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { BulkSubmitAttendanceDto, AttendanceQueryDto } from './attendance.dto';
import * as attendanceController from './attendance.controller';

const router = Router();

// Apply auth + tenant to all attendance routes
router.use(authenticate, setTenant, auditLog);

// 1. Mark sheet retrieval & bulk submits (Teacher/Admin)
router.post(
  '/bulk',
  validate({ body: BulkSubmitAttendanceDto }),
  attendanceController.submitAttendance,
);

router.get(
  '/sheet',
  attendanceController.getAttendanceSheet,
);

// 2. Teacher specific assigned sections
router.get(
  '/my-sections',
  requireRole(UserRole.TEACHER),
  attendanceController.listTeacherSections,
);

// 3. Student specific history & fines
router.get(
  '/my-attendance',
  requireRole(UserRole.STUDENT),
  attendanceController.getStudentAttendanceHistory,
);

// 4. Admin assignment routes
router.post(
  '/assign-teacher',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  attendanceController.assignTeacherToSection,
);

router.get(
  '/assignments',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  attendanceController.listAssignments,
);

// Fallback search route
router.get(
  '/',
  validate({ query: AttendanceQueryDto }),
  attendanceController.getAttendanceList,
);

export default router;
