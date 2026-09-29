import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  CreateWebhookDto,
  DeliveryIdParamDto,
  ListDeliveriesQueryDto,
  ListWebhooksQueryDto,
  UpdateWebhookDto,
  WebhookIdParamDto,
} from './webhooks.dto';
import * as controller from './webhooks.controller';

// =============================================================================
// /api/v1/webhooks  (SUPER_ADMIN, ADMIN of the tenant)
//   GET    /meta                                 events list + signature scheme
//   GET    /                                     list endpoints (secret masked)
//   POST   /                                     create { url(https), events[], isActive? } -> secret ONCE
//   PATCH  /:id                                  update { url?, events?, isActive? }
//   POST   /:id/rotate-secret                    new secret -> returned ONCE
//   DELETE /:id                                  delete endpoint + its delivery log
//   GET    /:id/deliveries                       delivery log ?page&pageSize&success
//   POST   /:id/test                             send webhook.test now, return outcome
//   POST   /deliveries/:deliveryId/redeliver     re-send a logged envelope
// =============================================================================

const router = Router();

router.use(authenticate, setTenant, requireTenant, auditLog, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

router.get('/meta', controller.meta);
router.get('/', validate({ query: ListWebhooksQueryDto }), controller.list);
router.post('/', validate({ body: CreateWebhookDto }), controller.create);
router.post('/deliveries/:deliveryId/redeliver', validate({ params: DeliveryIdParamDto }), controller.redeliver);
router.patch('/:id', validate({ params: WebhookIdParamDto, body: UpdateWebhookDto }), controller.update);
router.post('/:id/rotate-secret', validate({ params: WebhookIdParamDto }), controller.rotateSecret);
router.delete('/:id', validate({ params: WebhookIdParamDto }), controller.remove);
router.get('/:id/deliveries', validate({ params: WebhookIdParamDto, query: ListDeliveriesQueryDto }), controller.deliveries);
router.post('/:id/test', validate({ params: WebhookIdParamDto }), controller.test);

export default router;
