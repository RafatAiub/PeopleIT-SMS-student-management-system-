import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateTimetableSlotDto,
  UpdateTimetableSlotDto,
  TimetableSlotQueryDto,
  TimetableSlotIdParamDto,
} from './timetables.dto';
import * as timetablesController from './timetables.controller';

const router = Router();

// Apply auth + tenant to all timetable routes
router.use(authenticate, setTenant, auditLog);

const WRITE_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

// Reads intentionally open to all authenticated roles — everyone (incl.
// teachers/students/guardians) reads the timetable, per the README matrix.
router.post('/', WRITE_ROLES, validate({ body: CreateTimetableSlotDto }), timetablesController.createSlot);
router.get('/', validate({ query: TimetableSlotQueryDto }), timetablesController.listSlots);
router.get('/:id', validate({ params: TimetableSlotIdParamDto }), timetablesController.getSlot);
router.put('/:id', WRITE_ROLES, validate({ params: TimetableSlotIdParamDto, body: UpdateTimetableSlotDto }), timetablesController.updateSlot);
router.delete('/:id', WRITE_ROLES, validate({ params: TimetableSlotIdParamDto }), timetablesController.deleteSlot);

export default router;
