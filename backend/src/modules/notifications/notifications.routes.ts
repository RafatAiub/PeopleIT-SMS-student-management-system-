import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { UserRole } from '@prisma/client';
import {
  NotificationQueryDto,
  NotificationIdParamDto,
  UpdatePreferencesDto,
  TemplateParamsDto,
  UpsertTemplateDto,
  SendTestDto,
} from './notifications.dto';
import * as notificationsController from './notifications.controller';

const router = Router();

router.use(authenticate, setTenant);

// Deliberately no requireRole: a notification is addressed to a specific user,
// so every authenticated role may read its own. Ownership (not role) is the
// boundary here, and it is enforced server-side in the service/repository via
// req.user.sub — never from a client-supplied user id.
router.get(
  '/',
  validate({ query: NotificationQueryDto }),
  notificationsController.listMyNotifications,
);

router.post('/read-all', notificationsController.markAllNotificationsRead);

// Preferences are per-user, same ownership-not-role boundary as the inbox.
// Declared before /:id/read so "preferences" is never parsed as an id.
router.get('/preferences', notificationsController.getMyPreferences);
router.put(
  '/preferences',
  validate({ body: UpdatePreferencesDto }),
  notificationsController.updateMyPreferences,
);

// Template management is an institution-wide setting, so unlike the inbox it
// IS role-gated. auditLog is applied here only — the read/preferences routes
// are high-frequency and would flood the audit table.
const TEMPLATE_ADMIN = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

router.get('/templates', TEMPLATE_ADMIN, notificationsController.listTemplates);
router.put(
  '/templates/:key/:channel',
  TEMPLATE_ADMIN,
  auditLog,
  validate({ params: TemplateParamsDto, body: UpsertTemplateDto }),
  notificationsController.upsertTemplate,
);
router.post(
  '/test',
  TEMPLATE_ADMIN,
  validate({ body: SendTestDto }),
  notificationsController.sendTestNotification,
);

router.post(
  '/:id/read',
  validate({ params: NotificationIdParamDto }),
  notificationsController.markNotificationRead,
);

export default router;
