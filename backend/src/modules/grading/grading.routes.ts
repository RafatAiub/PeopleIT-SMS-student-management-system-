import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  CreateGradingScaleDto,
  GradingScaleIdParamDto,
  GradingScaleQueryDto,
  SeedBangladeshDto,
  UpdateGradingScaleDto,
} from './grading.dto';
import * as gradingController from './grading.controller';

// Mount: app.use('/api/v1/grading', gradingRouter)
const router = Router();

router.use(authenticate, setTenant, auditLog);

const MANAGE = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
// The effective scale (bands + grade points) is shown as a legend on report
// cards, transcripts and "my results" — it carries no per-student data.
const READ_EFFECTIVE = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.STUDENT,
  UserRole.GUARDIAN,
);

// Static paths before /:id.
router.get('/scales/effective', READ_EFFECTIVE, gradingController.getEffectiveScale);
router.post('/scales/seed-bangladesh', MANAGE, validate({ body: SeedBangladeshDto }), gradingController.seedBangladesh);

router.get('/scales', MANAGE, validate({ query: GradingScaleQueryDto }), gradingController.listScales);
router.post('/scales', MANAGE, validate({ body: CreateGradingScaleDto }), gradingController.createScale);
router.get('/scales/:id', MANAGE, validate({ params: GradingScaleIdParamDto }), gradingController.getScale);
router.put(
  '/scales/:id',
  MANAGE,
  validate({ params: GradingScaleIdParamDto, body: UpdateGradingScaleDto }),
  gradingController.updateScale,
);
router.post('/scales/:id/set-default', MANAGE, validate({ params: GradingScaleIdParamDto }), gradingController.setDefault);
router.delete('/scales/:id', MANAGE, validate({ params: GradingScaleIdParamDto }), gradingController.deleteScale);

export default router;
