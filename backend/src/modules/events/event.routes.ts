import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { CreateEventDto, UpdateEventDto, EventQueryDto, UpcomingEventQueryDto, EventIdParamDto } from './event.dto';
import * as eventController from './event.controller';

const router = Router();

router.use(authenticate, setTenant, auditLog);

const ADMIN_ONLY = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

// Reads are open to every role; the service only returns events whose
// audience includes the caller's role (admins see all).
router.get('/', validate({ query: EventQueryDto }), eventController.listEvents);
// Mounted before /:id so "upcoming" isn't read as an event id.
router.get('/upcoming', validate({ query: UpcomingEventQueryDto }), eventController.listUpcomingEvents);
router.get('/:id', validate({ params: EventIdParamDto }), eventController.getEvent);

router.post('/', ADMIN_ONLY, validate({ body: CreateEventDto }), eventController.createEvent);
router.put('/:id', ADMIN_ONLY, validate({ params: EventIdParamDto, body: UpdateEventDto }), eventController.updateEvent);
router.delete('/:id', ADMIN_ONLY, validate({ params: EventIdParamDto }), eventController.deleteEvent);

export default router;
