import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { SubjectOfferingQueryDto } from './curriculum.dto';
import * as curriculumController from './curriculum.controller';

const router = Router();

router.use(authenticate, setTenant);

// Staff-only for now (same role set as Results' STAFF_ROLES) — this only
// feeds the mark-entry subject list; no student/guardian screen consumes it
// yet.
router.get(
  '/subjects',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER),
  validate({ query: SubjectOfferingQueryDto }),
  curriculumController.listSubjectOfferings,
);

export default router;
