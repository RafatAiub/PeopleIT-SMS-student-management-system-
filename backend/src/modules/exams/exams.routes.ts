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
  PublishExamDto,
  ExamListQueryDto,
  IdParamDto,
  CreateTimetableDto,
  UpdateTimetableEntryDto,
  TimetableQueryDto,
  SaveGradesDto,
  ExamResultQueryDto,
} from './exams.dto';
import * as examsController from './exams.controller';

// Exam module (Exam > Create Exam / Exam Timetable / Exam Result / Exam
// Grade). Marks entry and report cards stay in the results module.
const router = Router();

router.use(authenticate, setTenant, auditLog);

// Admin manages exams, timetables and grades; teachers can read them and
// view class results (they already enter marks via /results).
const WRITE_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const READ_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER);

router.get('/meta/session-years', READ_ROLES, examsController.listSessionYears);

// Static paths before the /:id wildcards.
router.get('/timetable', READ_ROLES, validate({ query: TimetableQueryDto }), examsController.listTimetable);
router.post('/timetable', WRITE_ROLES, validate({ body: CreateTimetableDto }), examsController.createTimetable);
router.put(
  '/timetable/:id',
  WRITE_ROLES,
  validate({ params: IdParamDto, body: UpdateTimetableEntryDto }),
  examsController.updateTimetableEntry,
);
router.delete('/timetable/:id', WRITE_ROLES, validate({ params: IdParamDto }), examsController.deleteTimetableEntry);

router.get('/grades', READ_ROLES, examsController.listGrades);
router.put('/grades', WRITE_ROLES, validate({ body: SaveGradesDto }), examsController.saveGrades);

router.get('/results', READ_ROLES, validate({ query: ExamResultQueryDto }), examsController.getClassResults);

router.get('/', READ_ROLES, validate({ query: ExamListQueryDto }), examsController.listExams);
router.post('/', WRITE_ROLES, validate({ body: CreateExamDto }), examsController.createExam);
router.put('/:id', WRITE_ROLES, validate({ params: IdParamDto, body: UpdateExamDto }), examsController.updateExam);
router.patch(
  '/:id/publish',
  WRITE_ROLES,
  validate({ params: IdParamDto, body: PublishExamDto }),
  examsController.setExamPublished,
);
router.delete('/:id', WRITE_ROLES, validate({ params: IdParamDto }), examsController.deleteExam);

export default router;
