import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
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

router.post('/', validate({ body: CreateTimetableSlotDto }), timetablesController.createSlot);
router.get('/', validate({ query: TimetableSlotQueryDto }), timetablesController.listSlots);
router.get('/:id', validate({ params: TimetableSlotIdParamDto }), timetablesController.getSlot);
router.put('/:id', validate({ params: TimetableSlotIdParamDto, body: UpdateTimetableSlotDto }), timetablesController.updateSlot);
router.delete('/:id', validate({ params: TimetableSlotIdParamDto }), timetablesController.deleteSlot);

export default router;
