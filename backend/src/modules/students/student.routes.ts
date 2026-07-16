import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateStudentDto,
  UpdateStudentDto,
  StudentQueryDto,
  StudentIdParamDto,
  CreateStudentDocumentDto,
} from './student.dto';
import * as studentController from './student.controller';

const READ_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.LIBRARIAN];
const WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER];

// =============================================================================
// Student Routes
// GET    /api/v1/students
// POST   /api/v1/students
// GET    /api/v1/students/:id
// PUT    /api/v1/students/:id
// DELETE /api/v1/students/:id
// GET    /api/v1/students/:id/documents
// POST   /api/v1/students/:id/documents
// =============================================================================

const router = Router();

// Apply auth + tenant to all student routes
router.use(authenticate, setTenant, auditLog);

router.get('/', requireRole(...READ_ROLES), validate({ query: StudentQueryDto }), studentController.listStudents);

// Self-service — any authenticated role, scoped server-side to req.user.sub.
router.get('/me', studentController.getMe);

router.get('/meta/classes', requireRole(...READ_ROLES), studentController.listClasses);
router.get('/meta/sections', requireRole(...READ_ROLES), studentController.listSections);

router.post(
  '/',
  requireRole(...WRITE_ROLES),
  validate({ body: CreateStudentDto }),
  studentController.createStudent,
);

// STUDENT/GUARDIAN are intentionally excluded here — they must use /me,
// which is scoped server-side. This route accepts an arbitrary :id.
router.get(
  '/:id',
  requireRole(...READ_ROLES),
  validate({ params: StudentIdParamDto }),
  studentController.getStudent,
);

router.put(
  '/:id',
  requireRole(...WRITE_ROLES),
  validate({ params: StudentIdParamDto, body: UpdateStudentDto }),
  studentController.updateStudent,
);

router.delete(
  '/:id',
  requireRole(...WRITE_ROLES),
  validate({ params: StudentIdParamDto }),
  studentController.deleteStudent,
);

router.get(
  '/:id/documents',
  requireRole(...READ_ROLES),
  validate({ params: StudentIdParamDto }),
  studentController.getStudentDocuments,
);

router.post(
  '/:id/documents',
  requireRole(...WRITE_ROLES),
  validate({ params: StudentIdParamDto, body: CreateStudentDocumentDto }),
  studentController.addStudentDocument,
);

export default router;
