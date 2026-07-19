import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateExamDto,
  UpdateExamDto,
  ExamQueryDto,
  ExamIdParamDto,
  SubmitExamResultsDto,
  ExamResultQueryDto,
  ResultIdParamDto,
} from './results.dto';
import * as resultsController from './results.controller';

const router = Router();

// Apply auth + tenant to all results routes
router.use(authenticate, setTenant, auditLog);

const STAFF_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER);

// Exam Result routes (Static paths first)
router.post('/submit', STAFF_ROLES, validate({ body: SubmitExamResultsDto }), resultsController.submitResults);
router.get('/results-list', STAFF_ROLES, validate({ query: ExamResultQueryDto }), resultsController.listResults);
router.delete('/results-list/:id', STAFF_ROLES, validate({ params: ResultIdParamDto }), resultsController.deleteResult);
// STUDENT/GUARDIAN "my results" — ownership-scoped in the service. Must be
// declared before the exam wildcard routes below (:id).
router.get('/me', requireRole(UserRole.STUDENT, UserRole.GUARDIAN), resultsController.getMyResults);
router.get(
  '/:studentId/report-card',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT, UserRole.GUARDIAN),
  resultsController.getReportCard,
);

// Exam routes (Wildcard paths last). List/get are readable more broadly —
// exam name/dates carry no per-student marks data, and STUDENT/GUARDIAN
// need this to pick an exam for their (ownership-scoped) report card.
const EXAM_READ_ROLES = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.STUDENT,
  UserRole.GUARDIAN,
);
router.post('/', STAFF_ROLES, validate({ body: CreateExamDto }), resultsController.createExam);
router.get('/', EXAM_READ_ROLES, validate({ query: ExamQueryDto }), resultsController.listExams);
router.get('/:id', EXAM_READ_ROLES, validate({ params: ExamIdParamDto }), resultsController.getExam);
router.put('/:id', STAFF_ROLES, validate({ params: ExamIdParamDto, body: UpdateExamDto }), resultsController.updateExam);
router.delete('/:id', STAFF_ROLES, validate({ params: ExamIdParamDto }), resultsController.deleteExam);

export default router;
