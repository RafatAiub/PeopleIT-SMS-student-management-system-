import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { GenerateCommentDto } from './ai.dto';
import * as aiController from './ai.controller';

const router = Router();

// Apply auth + tenant middlewares to AI routes
router.use(authenticate, setTenant);

router.post('/comment', validate({ body: GenerateCommentDto }), aiController.generateComment);
router.get('/risk-scoring', aiController.getAcademicRiskScoring);
router.get('/dashboard-insights', aiController.getDashboardInsights);

export default router;
