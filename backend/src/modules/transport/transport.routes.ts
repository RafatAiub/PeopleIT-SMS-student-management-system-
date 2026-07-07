import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { CreateVehicleDto, CreateRouteDto, CreateAssignmentDto } from './transport.dto';
import * as transportController from './transport.controller';

const router = Router();

router.use(authenticate, setTenant);

router.post('/vehicles', validate({ body: CreateVehicleDto }), transportController.createVehicle);
router.get('/vehicles', transportController.getVehicles);

router.post('/routes', validate({ body: CreateRouteDto }), transportController.createRoute);
router.get('/routes', transportController.getRoutes);

router.post('/assignments', validate({ body: CreateAssignmentDto }), transportController.createAssignment);
router.get('/assignments', transportController.getAssignments);

export default router;
