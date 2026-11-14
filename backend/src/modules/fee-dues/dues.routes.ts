import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import * as c from './dues.controller';
import {
  BatchParamDto, DefaulterQueryDto, ExemptDto, GridQueryDto, LedgerQueryDto, ManualStateDto, ReminderDto, ReminderLogQueryDto,
  ReportParamDto, ReportQueryDto, RestrictedQueryDto, SettingsDto, StudentParamDto,
} from './dues.dto';

// =============================================================================
// P4 dues, fee reports and restrictions — /api/v1/fee-dues
//   Read (dashboard, defaulters, reports): SUPER_ADMIN, ADMIN, ACCOUNTANT, MANAGEMENT
//   Reminders + block/unblock/exempt:      SUPER_ADMIN, ADMIN, ACCOUNTANT
//   Restriction settings:                  SUPER_ADMIN, ADMIN
//   /me/status:                            STUDENT, GUARDIAN
// =============================================================================

const READ = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGEMENT);
const ACT = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT);
const ADMIN = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

export const feeDuesRouter = Router();
feeDuesRouter.use(authenticate, setTenant, auditLog);

feeDuesRouter.get('/me/status', requireRole(UserRole.STUDENT, UserRole.GUARDIAN), c.myStatus);

feeDuesRouter.get('/grid', READ, validate({ query: GridQueryDto }), c.grid);
feeDuesRouter.get('/widget', READ, c.widget);
feeDuesRouter.get('/students/:studentId/ledger', READ, validate({ params: StudentParamDto, query: LedgerQueryDto }), c.ledger);
feeDuesRouter.get('/defaulters', READ, validate({ query: DefaulterQueryDto }), c.defaulters);

feeDuesRouter.post('/reminders/preview', ACT, validate({ body: ReminderDto }), c.previewReminders);
feeDuesRouter.post('/reminders/send', ACT, validate({ body: ReminderDto }), c.sendReminders);
feeDuesRouter.get('/reminders/batches/:batchId', ACT, validate({ params: BatchParamDto }), c.batch);
feeDuesRouter.get('/reminders/log', READ, validate({ query: ReminderLogQueryDto }), c.reminderLog);

feeDuesRouter.get('/settings', READ, c.getSettings);
feeDuesRouter.put('/settings', ADMIN, validate({ body: SettingsDto }), c.updateSettings);
feeDuesRouter.get('/restricted', READ, validate({ query: RestrictedQueryDto }), c.restricted);
feeDuesRouter.post('/restricted/refresh', ACT, c.refresh);
feeDuesRouter.put('/students/:studentId/block', ACT, validate({ params: StudentParamDto, body: ManualStateDto }), c.setManual);
feeDuesRouter.put('/students/:studentId/exempt', ACT, validate({ params: StudentParamDto, body: ExemptDto }), c.setExempt);

feeDuesRouter.get('/reports/options', READ, c.reportOptions);
feeDuesRouter.get('/reports/:key', READ, validate({ params: ReportParamDto, query: ReportQueryDto }), c.report);
