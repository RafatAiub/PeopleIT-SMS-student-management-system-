import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateLookupDto,
  UpdateLookupDto,
  CreateClassDto,
  UpdateClassDto,
  CreateSectionDto,
  UpdateSectionDto,
  SectionQueryDto,
  AcademicsIdParamDto,
} from './academics.dto';
import * as academicsController from './academics.controller';

// =============================================================================
// Academics Routes — Medium/Stream/Shift/Semester/Class/Section CRUD.
// Mounted at /api/v1/academics. Reads use the same staff role set as the
// existing /students/meta/classes and /meta/sections read endpoints; writes
// are SUPER_ADMIN/ADMIN only.
// =============================================================================

const router = Router();

router.use(authenticate, setTenant);

const READ_ROLES = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
);
const WRITE_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

// ── Mediums ─────────────────────────────────────────────────────────
router.get('/mediums', READ_ROLES, academicsController.listMediums);
router.post('/mediums', WRITE_ROLES, validate({ body: CreateLookupDto }), academicsController.createMedium);
router.put(
  '/mediums/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto, body: UpdateLookupDto }),
  academicsController.updateMedium,
);
router.delete(
  '/mediums/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto }),
  academicsController.deleteMedium,
);

// ── Streams ─────────────────────────────────────────────────────────
router.get('/streams', READ_ROLES, academicsController.listStreams);
router.post('/streams', WRITE_ROLES, validate({ body: CreateLookupDto }), academicsController.createStream);
router.put(
  '/streams/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto, body: UpdateLookupDto }),
  academicsController.updateStream,
);
router.delete(
  '/streams/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto }),
  academicsController.deleteStream,
);

// ── Shifts ──────────────────────────────────────────────────────────
router.get('/shifts', READ_ROLES, academicsController.listShifts);
router.post('/shifts', WRITE_ROLES, validate({ body: CreateLookupDto }), academicsController.createShift);
router.put(
  '/shifts/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto, body: UpdateLookupDto }),
  academicsController.updateShift,
);
router.delete(
  '/shifts/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto }),
  academicsController.deleteShift,
);

// ── Semesters ───────────────────────────────────────────────────────
router.get('/semesters', READ_ROLES, academicsController.listSemesters);
router.post('/semesters', WRITE_ROLES, validate({ body: CreateLookupDto }), academicsController.createSemester);
router.put(
  '/semesters/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto, body: UpdateLookupDto }),
  academicsController.updateSemester,
);
router.delete(
  '/semesters/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto }),
  academicsController.deleteSemester,
);

// ── Student Categories ──────────────────────────────────────────────
router.get('/student-categories', READ_ROLES, academicsController.listStudentCategories);
router.post(
  '/student-categories',
  WRITE_ROLES,
  validate({ body: CreateLookupDto }),
  academicsController.createStudentCategory,
);
router.put(
  '/student-categories/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto, body: UpdateLookupDto }),
  academicsController.updateStudentCategory,
);
router.delete(
  '/student-categories/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto }),
  academicsController.deleteStudentCategory,
);

// ── Classes ─────────────────────────────────────────────────────────
router.get('/classes', READ_ROLES, academicsController.listClasses);
router.post('/classes', WRITE_ROLES, validate({ body: CreateClassDto }), academicsController.createClass);
router.put(
  '/classes/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto, body: UpdateClassDto }),
  academicsController.updateClass,
);
router.delete(
  '/classes/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto }),
  academicsController.deleteClass,
);

// ── Sections ────────────────────────────────────────────────────────
// classId query param is optional: provided → sections for that one class
// (matches the existing GET /students/meta/sections?classId= convention);
// omitted → every section institution-wide (Assign Class Teacher screen).
router.get('/sections', READ_ROLES, validate({ query: SectionQueryDto }), academicsController.listSections);
router.post('/sections', WRITE_ROLES, validate({ body: CreateSectionDto }), academicsController.createSection);
router.put(
  '/sections/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto, body: UpdateSectionDto }),
  academicsController.updateSection,
);
router.delete(
  '/sections/:id',
  WRITE_ROLES,
  validate({ params: AcademicsIdParamDto }),
  academicsController.deleteSection,
);

export default router;
