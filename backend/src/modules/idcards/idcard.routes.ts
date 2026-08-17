import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateIdCardTemplateDto,
  UpdateIdCardTemplateDto,
  GenerateIdCardsDto,
  IdCardQueryDto,
  IdParamDto,
} from './idcard.dto';
import * as idCardController from './idcard.controller';

const READ_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER];
const WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

// =============================================================================
// ID Card Routes (authenticated) — mounted at /api/v1/id-cards
// GET    /templates
// POST   /templates
// PUT    /templates/:id
// DELETE /templates/:id
// POST   /generate
// GET    /
// GET    /me
// GET    /me/pdf
// GET    /:id
// GET    /:id/pdf
// PATCH  /:id/revoke
//
// NOTE: the public /verify/:token route lives in idcard.public.routes.ts and
// is mounted separately in app.ts — it must NOT go through the
// authenticate/setTenant middleware below.
// =============================================================================

const router = Router();

router.use(authenticate, setTenant, auditLog);

router.get('/templates', requireRole(...READ_ROLES), idCardController.listTemplates);

router.post(
  '/templates',
  requireRole(...WRITE_ROLES),
  validate({ body: CreateIdCardTemplateDto }),
  idCardController.createTemplate,
);

router.put(
  '/templates/:id',
  requireRole(...WRITE_ROLES),
  validate({ params: IdParamDto, body: UpdateIdCardTemplateDto }),
  idCardController.updateTemplate,
);

router.delete(
  '/templates/:id',
  requireRole(...WRITE_ROLES),
  validate({ params: IdParamDto }),
  idCardController.deleteTemplate,
);

router.post(
  '/generate',
  requireRole(...WRITE_ROLES),
  validate({ body: GenerateIdCardsDto }),
  idCardController.generateCards,
);

router.get('/', requireRole(...READ_ROLES), validate({ query: IdCardQueryDto }), idCardController.listCards);

// Self-service — any authenticated role, scoped server-side to req.user.sub.
router.get('/me', idCardController.getMyCard);
router.get('/me/pdf', idCardController.getMyCardPdf);

router.get(
  '/:id',
  requireRole(...READ_ROLES),
  validate({ params: IdParamDto }),
  idCardController.getCard,
);

router.get(
  '/:id/pdf',
  requireRole(...READ_ROLES),
  validate({ params: IdParamDto }),
  idCardController.getCardPdf,
);

router.patch(
  '/:id/revoke',
  requireRole(...WRITE_ROLES),
  validate({ params: IdParamDto }),
  idCardController.revokeCard,
);

export default router;
