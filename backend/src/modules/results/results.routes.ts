import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
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

// Exam Result routes (Static paths first)
router.post('/submit', validate({ body: SubmitExamResultsDto }), resultsController.submitResults);
router.get('/results-list', validate({ query: ExamResultQueryDto }), resultsController.listResults);
router.delete('/results-list/:id', validate({ params: ResultIdParamDto }), resultsController.deleteResult);

// Exam routes (Wildcard paths last)
router.post('/', validate({ body: CreateExamDto }), resultsController.createExam);
router.get('/', validate({ query: ExamQueryDto }), resultsController.listExams);
router.get('/:id', validate({ params: ExamIdParamDto }), resultsController.getExam);
router.put('/:id', validate({ params: ExamIdParamDto, body: UpdateExamDto }), resultsController.updateExam);
router.delete('/:id', validate({ params: ExamIdParamDto }), resultsController.deleteExam);

export default router;
