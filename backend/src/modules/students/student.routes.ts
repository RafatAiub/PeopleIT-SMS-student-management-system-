import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import {
  CreateStudentDto,
  UpdateStudentDto,
  StudentQueryDto,
  StudentIdParamDto,
  CreateStudentDocumentDto,
} from './student.dto';
import * as studentController from './student.controller';

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

router.get('/', validate({ query: StudentQueryDto }), studentController.listStudents);

router.get('/me', studentController.getMe);

router.get('/meta/classes', studentController.listClasses);
router.get('/meta/sections', studentController.listSections);

router.post(
  '/',
  validate({ body: CreateStudentDto }),
  studentController.createStudent,
);

router.get(
  '/:id',
  validate({ params: StudentIdParamDto }),
  studentController.getStudent,
);

router.put(
  '/:id',
  validate({ params: StudentIdParamDto, body: UpdateStudentDto }),
  studentController.updateStudent,
);

router.delete(
  '/:id',
  validate({ params: StudentIdParamDto }),
  studentController.deleteStudent,
);

router.get(
  '/:id/documents',
  validate({ params: StudentIdParamDto }),
  studentController.getStudentDocuments,
);

router.post(
  '/:id/documents',
  validate({ params: StudentIdParamDto, body: CreateStudentDocumentDto }),
  studentController.addStudentDocument,
);

export default router;
