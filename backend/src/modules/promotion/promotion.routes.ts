import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  BatchIdParamDto,
  BatchQueryDto,
  CandidatesQueryDto,
  PromotionHistoryQueryDto,
  PromotionRequestDto,
} from './promotion.dto';
import * as promotionController from './promotion.controller';

// Mount: app.use('/api/v1/promotion', promotionRouter)
const router = Router();

router.use(authenticate, setTenant, auditLog);

const MANAGE = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

router.get('/candidates', MANAGE, validate({ query: CandidatesQueryDto }), promotionController.listCandidates);
router.post('/preview', MANAGE, validate({ body: PromotionRequestDto }), promotionController.preview);
router.post('/execute', MANAGE, validate({ body: PromotionRequestDto }), promotionController.execute);
router.get('/history', MANAGE, validate({ query: PromotionHistoryQueryDto }), promotionController.listHistory);
router.get('/batches', MANAGE, validate({ query: BatchQueryDto }), promotionController.listBatches);
router.post('/batches/:batchId/undo', MANAGE, validate({ params: BatchIdParamDto }), promotionController.undoBatch);

export default router;
