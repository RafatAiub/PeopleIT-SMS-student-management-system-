import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  SubjectOptionsQueryDto,
  SubjectSheetQueryDto,
  SubjectBulkSubmitDto,
  SubjectReportQueryDto,
  SubjectMyQueryDto,
  StudentIdParamDto,
} from './subject-attendance.dto';
import * as controller from './subject-attendance.controller';

const router = Router();
router.use(authenticate, setTenant, auditLog);

// TEACHER is further scoped in the service to subjects they teach (timetable)
// or every subject of a section they are class teacher of.
const MARKERS = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER);

router.get('/my-classes', requireRole(UserRole.TEACHER), controller.getTeacherClasses);
router.get('/options', MARKERS, validate({ query: SubjectOptionsQueryDto }), controller.getOptions);
router.get('/sheet', MARKERS, validate({ query: SubjectSheetQueryDto }), controller.getSheet);
router.post('/bulk', MARKERS, validate({ body: SubjectBulkSubmitDto }), controller.submit);
router.get('/report', MARKERS, validate({ query: SubjectReportQueryDto }), controller.getReport);
router.get('/my', requireRole(UserRole.STUDENT), validate({ query: SubjectMyQueryDto }), controller.getMine);
router.get(
  '/child/:studentId',
  requireRole(UserRole.GUARDIAN),
  validate({ params: StudentIdParamDto, query: SubjectMyQueryDto }),
  controller.getChild,
);

export default router;
