import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { CheckConflictsDto, CreateSlotDto, SlotIdParamDto, SlotQueryDto, UpdateSlotDto } from './examTimetable.dto';
import * as controller from './examTimetable.controller';

// Mount: app.use('/api/v1/exam-timetable', examTimetableRouter)
const router = Router();

router.use(authenticate, setTenant, auditLog);

const MANAGE = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
// TEACHER / STUDENT / GUARDIAN are scoped to their own classes in the service.
const READ = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT, UserRole.GUARDIAN);

router.get('/', READ, validate({ query: SlotQueryDto }), controller.listSlots);
router.post('/check-conflicts', MANAGE, validate({ body: CheckConflictsDto }), controller.checkConflicts);
router.post('/', MANAGE, validate({ body: CreateSlotDto }), controller.createSlot);
router.put('/:id', MANAGE, validate({ params: SlotIdParamDto, body: UpdateSlotDto }), controller.updateSlot);
router.delete('/:id', MANAGE, validate({ params: SlotIdParamDto }), controller.deleteSlot);

export default router;
