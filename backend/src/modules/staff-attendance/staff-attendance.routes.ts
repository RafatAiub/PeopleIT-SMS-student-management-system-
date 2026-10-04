import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  StaffRegisterQueryDto,
  StaffBulkSubmitDto,
  StaffReportQueryDto,
  StaffUserParamDto,
} from './staff-attendance.dto';
import * as controller from './staff-attendance.controller';

const router = Router();
router.use(authenticate, setTenant, auditLog);

const ADMIN_ONLY = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const STAFF_SELF = requireRole(
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
  UserRole.TRANSPORT_OFFICER,
  UserRole.MANAGEMENT,
);

router.get('/register', ADMIN_ONLY, validate({ query: StaffRegisterQueryDto }), controller.getRegister);
router.post('/bulk', ADMIN_ONLY, validate({ body: StaffBulkSubmitDto }), controller.submitBulk);
router.get('/report', ADMIN_ONLY, validate({ query: StaffReportQueryDto }), controller.getMonthlyReport);
router.get('/me', STAFF_SELF, validate({ query: StaffReportQueryDto }), controller.getMine);
router.get(
  '/report/:staffUserId',
  ADMIN_ONLY,
  validate({ params: StaffUserParamDto, query: StaffReportQueryDto }),
  controller.getStaffDetail,
);

export default router;
