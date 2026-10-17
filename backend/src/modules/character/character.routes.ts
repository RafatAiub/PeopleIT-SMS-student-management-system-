import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { requireModule } from '../../middleware/requireModule.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import * as c from './character.controller';
import {
  AdjustPointsDto,
  AutoAwardDto,
  AwardBadgeDto,
  AwardQueryDto,
  CreateBadgeDto,
  CreatePeriodDto,
  CreateTraitDto,
  GridQueryDto,
  IdParamDto,
  LeaderboardQueryDto,
  PeriodQueryDto,
  ReorderTraitsDto,
  RevokeAwardDto,
  SaveGridDto,
  StudentParamDto,
  UpdateBadgeDto,
  UpdatePeriodDto,
  UpdateSettingsDto,
  UpdateTraitDto,
} from './character.dto';

// =============================================================================
// Character (আখলাক) scoring & badges (T2) — /api/v1/character
// Every route: authenticate → setTenant → requireTenant →
// requireModule('islamic.character') → auditLog.
//   MANAGE  (ADMIN, MANAGEMENT, SUPER_ADMIN in a support session): settings,
//           traits, periods, badge definitions.
//   ASSESS  (MANAGE + TEACHER): score grids, award/revoke, auto-award, points.
//           Teachers are limited to their sections in the service.
//   VIEW    (any signed-in user): student summary (row-level checked), /mine,
//           leaderboard (school setting).
// =============================================================================

export const characterRouter = Router();
characterRouter.use(authenticate, setTenant, requireTenant, requireModule('islamic.character'), auditLog);

const MANAGE = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGEMENT);
const ASSESS = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGEMENT, UserRole.TEACHER);
const STAFF_READ = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGEMENT, UserRole.TEACHER, UserRole.ACCOUNTANT);
const id = validate({ params: IdParamDto });

// Settings
characterRouter.get('/settings', c.getSettings);
characterRouter.put('/settings', MANAGE, validate({ body: UpdateSettingsDto }), c.updateSettings);

// Traits (teachers read them for the grid)
characterRouter.get('/traits', STAFF_READ, c.listTraits);
characterRouter.post('/traits/defaults', MANAGE, c.seedTraits);
characterRouter.put('/traits/order', MANAGE, validate({ body: ReorderTraitsDto }), c.reorderTraits);
characterRouter.post('/traits', MANAGE, validate({ body: CreateTraitDto }), c.createTrait);
characterRouter.put('/traits/:id', MANAGE, id, validate({ body: UpdateTraitDto }), c.updateTrait);
characterRouter.delete('/traits/:id', MANAGE, id, c.deleteTrait);

// Periods
characterRouter.get('/periods', STAFF_READ, validate({ query: PeriodQueryDto }), c.listPeriods);
characterRouter.post('/periods', MANAGE, validate({ body: CreatePeriodDto }), c.createPeriod);
characterRouter.put('/periods/:id', MANAGE, id, validate({ body: UpdatePeriodDto }), c.updatePeriod);
characterRouter.delete('/periods/:id', MANAGE, id, c.deletePeriod);

// Score grid
characterRouter.get('/sections', ASSESS, c.mySections);
characterRouter.get('/grid', ASSESS, validate({ query: GridQueryDto }), c.getGrid);
characterRouter.put('/grid', ASSESS, validate({ body: SaveGridDto }), c.saveGrid);

// Badges
characterRouter.get('/badges', STAFF_READ, c.listBadges);
characterRouter.post('/badges/defaults', MANAGE, c.seedBadges);
characterRouter.post('/badges', MANAGE, validate({ body: CreateBadgeDto }), c.createBadge);
characterRouter.put('/badges/:id', MANAGE, id, validate({ body: UpdateBadgeDto }), c.updateBadge);
characterRouter.delete('/badges/:id', MANAGE, id, c.deleteBadge);

// Awards + points
characterRouter.get('/awards', STAFF_READ, validate({ query: AwardQueryDto }), c.listAwards);
characterRouter.post('/awards', ASSESS, validate({ body: AwardBadgeDto }), c.awardBadge);
characterRouter.post('/awards/auto', ASSESS, validate({ body: AutoAwardDto }), c.autoAward);
characterRouter.post('/awards/:id/revoke', ASSESS, id, validate({ body: RevokeAwardDto }), c.revokeAward);
characterRouter.post('/points', ASSESS, validate({ body: AdjustPointsDto }), c.adjustPoints);
characterRouter.get('/points/:studentId', validate({ params: StudentParamDto }), c.listPoints);

// Views
characterRouter.get('/overview', STAFF_READ, c.overview);
characterRouter.get('/mine', c.mine);
characterRouter.get('/leaderboard', validate({ query: LeaderboardQueryDto }), c.leaderboard);
characterRouter.get('/students/:studentId/summary', validate({ params: StudentParamDto }), c.studentSummary);

export default characterRouter;
