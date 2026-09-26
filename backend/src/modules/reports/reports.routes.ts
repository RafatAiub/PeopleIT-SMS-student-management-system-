import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate, setTenant);

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

export default router;
