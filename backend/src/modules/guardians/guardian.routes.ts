import { Router } from 'express';
import * as guardianController from './guardian.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateGuardianDto,
  UpdateGuardianDto,
  GuardianQueryDto,
  LinkGuardianDto,
} from './guardian.dto';

const router = Router();

// Secure all routes
router.use(authenticate, setTenant);

// CRUD
router.post(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ body: CreateGuardianDto }),
  guardianController.createGuardian
);

router.get(
  '/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT),
  guardianController.getGuardian
);

router.get(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT),
  validate({ query: GuardianQueryDto }),
  guardianController.listGuardians
);

router.put(
  '/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ body: UpdateGuardianDto }),
  guardianController.updateGuardian
);

router.delete(
  '/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  guardianController.deleteGuardian
);

// Link/Unlink guardian with students
router.post(
  '/students/:studentId/link',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ body: LinkGuardianDto }),
  guardianController.linkGuardian
);

router.delete(
  '/students/:studentId/unlink/:guardianId',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  guardianController.unlinkGuardian
);

export default router;
