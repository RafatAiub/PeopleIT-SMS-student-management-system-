import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateLectureMaterialDto,
  UpdateLectureMaterialDto,
  LectureMaterialQueryDto,
  LectureMaterialIdParamDto,
} from './lecture.dto';
import * as lectureController from './lecture.controller';

const router = Router();

router.use(authenticate, setTenant, auditLog);

// Institution-wide browse (all classes/sections) — Admin is read-only here
// by design: it can list/view but never create/update/delete.
const BROWSE_ROLES = requireRole(UserRole.ADMIN, UserRole.TEACHER);
// Only Teacher and Student may upload/edit/delete lecture materials.
const WRITE_ROLES = requireRole(UserRole.TEACHER, UserRole.STUDENT);

// Self-service — STUDENT/GUARDIAN view materials for their own (or linked
// child's) class/section, scoped server-side. Declared before ':id' routes.
router.get('/me', requireRole(UserRole.STUDENT, UserRole.GUARDIAN), lectureController.getMyMaterials);

router.post('/', WRITE_ROLES, validate({ body: CreateLectureMaterialDto }), lectureController.createMaterial);
router.get('/', BROWSE_ROLES, validate({ query: LectureMaterialQueryDto }), lectureController.listMaterials);
router.get('/:id', BROWSE_ROLES, validate({ params: LectureMaterialIdParamDto }), lectureController.getMaterial);
router.put(
  '/:id',
  WRITE_ROLES,
  validate({ params: LectureMaterialIdParamDto, body: UpdateLectureMaterialDto }),
  lectureController.updateMaterial,
);
router.delete(
  '/:id',
  WRITE_ROLES,
  validate({ params: LectureMaterialIdParamDto }),
  lectureController.deleteMaterial,
);

export default router;
