import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { CreateVehicleDto, CreateRouteDto, CreateAssignmentDto } from './transport.dto';
import * as transportController from './transport.controller';

const router = Router();

router.use(authenticate, setTenant);

const STAFF_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TRANSPORT_OFFICER);

// Self-service — STUDENT/GUARDIAN view their own (or linked children's)
// transport assignment, scoped server-side. Must be declared before any
// ':id'-style routes.
router.get('/me/assignment', requireRole(UserRole.STUDENT, UserRole.GUARDIAN), transportController.getMyAssignment);

router.post('/vehicles', STAFF_ROLES, validate({ body: CreateVehicleDto }), transportController.createVehicle);
router.get('/vehicles', STAFF_ROLES, transportController.getVehicles);

router.post('/routes', STAFF_ROLES, validate({ body: CreateRouteDto }), transportController.createRoute);
router.get('/routes', STAFF_ROLES, transportController.getRoutes);

router.post('/assignments', STAFF_ROLES, validate({ body: CreateAssignmentDto }), transportController.createAssignment);
router.get('/assignments', STAFF_ROLES, transportController.getAssignments);

export default router;
