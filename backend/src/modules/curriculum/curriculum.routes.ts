import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  SubjectOfferingQueryDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  SubjectIdParamDto,
} from './curriculum.dto';
import * as curriculumController from './curriculum.controller';

const router = Router();

router.use(authenticate, setTenant);

const WRITE_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

// Staff-only for now (same role set as Results' STAFF_ROLES) — this only
// feeds the mark-entry subject list; no student/guardian screen consumes it
// yet.
router.get(
  '/subjects',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER),
  validate({ query: SubjectOfferingQueryDto }),
  curriculumController.listSubjectOfferings,
);

// Flat, un-scoped Subject catalogue — backs the Subject admin CRUD page
// (Academics > Subject). Distinct from the className-scoped GET /subjects
// above, which returns SubjectOffering rows for mark entry.
router.get(
  '/subjects/catalog',
  WRITE_ROLES,
  curriculumController.listSubjects,
);

router.post(
  '/subjects',
  WRITE_ROLES,
  validate({ body: CreateSubjectDto }),
  curriculumController.createSubject,
);
router.put(
  '/subjects/:id',
  WRITE_ROLES,
  validate({ params: SubjectIdParamDto, body: UpdateSubjectDto }),
  curriculumController.updateSubject,
);
router.delete(
  '/subjects/:id',
  WRITE_ROLES,
  validate({ params: SubjectIdParamDto }),
  curriculumController.deleteSubject,
);

export default router;
