import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import {
  CreateNoticeDto,
  UpdateNoticeDto,
  NoticeQueryDto,
  NoticeIdParamDto,
} from './notices.dto';
import * as noticesController from './notices.controller';

const router = Router();

// Apply auth + tenant to all notice routes
router.use(authenticate, setTenant, auditLog);

router.post('/', validate({ body: CreateNoticeDto }), noticesController.createNotice);
router.get('/', validate({ query: NoticeQueryDto }), noticesController.listNotices);
router.get('/:id', validate({ params: NoticeIdParamDto }), noticesController.getNotice);
router.put('/:id', validate({ params: NoticeIdParamDto, body: UpdateNoticeDto }), noticesController.updateNotice);
router.delete('/:id', validate({ params: NoticeIdParamDto }), noticesController.deleteNotice);

export default router;
