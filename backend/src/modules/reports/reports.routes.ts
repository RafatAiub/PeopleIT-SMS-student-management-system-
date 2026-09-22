import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/dashboard', reportsController.getDashboard);
router.get('/admin-overview', reportsController.getAdminOverview);

export default router;
