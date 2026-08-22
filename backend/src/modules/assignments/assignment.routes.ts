import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  AssignmentQueryDto,
  AssignmentIdParamDto,
} from './assignment.dto';
import * as assignmentController from './assignment.controller';

const router = Router();

router.use(authenticate, setTenant, auditLog);

// Institution-wide browse — Admin is read-only here by design.
const BROWSE_ROLES = requireRole(UserRole.ADMIN, UserRole.TEACHER);
// Only Teacher and Student may create/edit/delete Classwork assignments.
const WRITE_ROLES = requireRole(UserRole.TEACHER, UserRole.STUDENT);

// Self-service — STUDENT/GUARDIAN view assignments for their own (or linked
// child's) class/section, scoped server-side. Declared before ':id' routes.
router.get('/me', requireRole(UserRole.STUDENT, UserRole.GUARDIAN), assignmentController.getMyAssignments);

router.post('/', WRITE_ROLES, validate({ body: CreateAssignmentDto }), assignmentController.createAssignment);
router.get('/', BROWSE_ROLES, validate({ query: AssignmentQueryDto }), assignmentController.listAssignments);
router.get('/:id', BROWSE_ROLES, validate({ params: AssignmentIdParamDto }), assignmentController.getAssignment);
router.put(
  '/:id',
  WRITE_ROLES,
  validate({ params: AssignmentIdParamDto, body: UpdateAssignmentDto }),
  assignmentController.updateAssignment,
);
router.delete(
  '/:id',
  WRITE_ROLES,
  validate({ params: AssignmentIdParamDto }),
  assignmentController.deleteAssignment,
);

export default router;
