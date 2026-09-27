import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { BulkStaffAttendanceDto, StaffAttendanceQueryDto } from './staffAttendance.dto';
import * as staffAttendanceController from './staffAttendance.controller';

// Mounted at /api/v1/staff-attendance.
const router = Router();

router.use(authenticate, setTenant, auditLog, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

router.get('/', validate({ query: StaffAttendanceQueryDto }), staffAttendanceController.getDailyAttendance);
router.post('/bulk', validate({ body: BulkStaffAttendanceDto }), staffAttendanceController.bulkMark);

export default router;
