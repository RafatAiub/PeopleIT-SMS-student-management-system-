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
// No STUDENT/GUARDIAN-scoped "my results" route exists yet — tracked separately.
router.post('/submit', STAFF_ROLES, validate({ body: SubmitExamResultsDto }), resultsController.submitResults);
router.get('/results-list', STAFF_ROLES, validate({ query: ExamResultQueryDto }), resultsController.listResults);
router.delete('/results-list/:id', STAFF_ROLES, validate({ params: ResultIdParamDto }), resultsController.deleteResult);

// Exam routes (Wildcard paths last)
router.post('/', STAFF_ROLES, validate({ body: CreateExamDto }), resultsController.createExam);
router.get('/', STAFF_ROLES, validate({ query: ExamQueryDto }), resultsController.listExams);
router.get('/:id', STAFF_ROLES, validate({ params: ExamIdParamDto }), resultsController.getExam);
router.put('/:id', STAFF_ROLES, validate({ params: ExamIdParamDto, body: UpdateExamDto }), resultsController.updateExam);
router.delete('/:id', STAFF_ROLES, validate({ params: ExamIdParamDto }), resultsController.deleteExam);

export default router;
