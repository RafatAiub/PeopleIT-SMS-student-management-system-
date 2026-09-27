import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  CreateRouteDto,
  UpdateRouteDto,
  CreateAssignmentDto,
  UpdateAssignmentDto,
  StopFieldsDto,
  UpdateStopDto,
  ReorderStopsDto,
  IdParamDto,
  StopIdParamDto,
  VehicleLocationDto,
  TransportFeeDto,
} from './transport.dto';
import * as transportController from './transport.controller';

const router = Router();

router.use(authenticate, setTenant, auditLog);

const STAFF_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TRANSPORT_OFFICER);

// Self-service — STUDENT/GUARDIAN view their own (or linked children's)
// transport assignment, scoped server-side. Must be declared before any
// ':id'-style routes.
router.get('/me/assignment', requireRole(UserRole.STUDENT, UserRole.GUARDIAN), transportController.getMyAssignment);

router.post('/vehicles', STAFF_ROLES, validate({ body: CreateVehicleDto }), transportController.createVehicle);
router.get('/vehicles', STAFF_ROLES, transportController.getVehicles);
router.put('/vehicles/:id', STAFF_ROLES, validate({ body: UpdateVehicleDto }), transportController.updateVehicle);
router.delete('/vehicles/:id', STAFF_ROLES, transportController.deleteVehicle);

router.post('/routes', STAFF_ROLES, validate({ body: CreateRouteDto }), transportController.createRoute);
router.get('/routes', STAFF_ROLES, transportController.getRoutes);
router.put('/routes/:id', STAFF_ROLES, validate({ body: UpdateRouteDto }), transportController.updateRoute);
router.delete('/routes/:id', STAFF_ROLES, transportController.deleteRoute);

router.post('/assignments', STAFF_ROLES, validate({ body: CreateAssignmentDto }), transportController.createAssignment);
router.get('/assignments', STAFF_ROLES, transportController.getAssignments);

// ── Wave C ──────────────────────────────────────────────────────────────────
// Billing creates invoices, so it is SUPER_ADMIN / ADMIN only (not
// TRANSPORT_OFFICER).
const BILLING_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const idParam = validate({ params: IdParamDto });
const stopParam = validate({ params: StopIdParamDto });

router.put('/assignments/:id', STAFF_ROLES, idParam, validate({ body: UpdateAssignmentDto }), transportController.updateAssignment);
router.delete('/assignments/:id', STAFF_ROLES, idParam, transportController.deleteAssignment);

router.get('/routes/:id/stops', STAFF_ROLES, idParam, transportController.listStops);
router.post('/routes/:id/stops', STAFF_ROLES, idParam, validate({ body: StopFieldsDto }), transportController.createStop);
router.put('/routes/:id/stops/order', STAFF_ROLES, idParam, validate({ body: ReorderStopsDto }), transportController.reorderStops);
router.put('/stops/:stopId', STAFF_ROLES, stopParam, validate({ body: UpdateStopDto }), transportController.updateStop);
router.delete('/stops/:stopId', STAFF_ROLES, stopParam, transportController.deleteStop);

// GPS-device readiness: last-known position per vehicle.
router.get('/vehicles/live', STAFF_ROLES, transportController.getLivePositions);
router.post('/vehicles/:id/location', STAFF_ROLES, idParam, validate({ body: VehicleLocationDto }), transportController.updateVehicleLocation);

router.get('/reports/routes', STAFF_ROLES, transportController.getRouteReport);

router.post('/fees/preview', BILLING_ROLES, validate({ body: TransportFeeDto }), transportController.previewTransportFees);
router.post('/fees/generate', BILLING_ROLES, validate({ body: TransportFeeDto }), transportController.generateTransportFees);

export default router;
