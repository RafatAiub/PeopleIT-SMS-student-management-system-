import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { apiKeyAuth, apiKeyRateLimit, requireApiScope } from './apiKeyAuth.middleware';
import {
  ApiKeyIdParamDto,
  CreateApiKeyDto,
  ListApiKeysQueryDto,
  PublicAttendanceSummaryQueryDto,
  PublicInvoicesQueryDto,
  PublicStudentsQueryDto,
} from './apiKeys.dto';
import * as controller from './apiKeys.controller';

// =============================================================================
// /api/v1/api-keys  (JWT; SUPER_ADMIN, ADMIN of the tenant)
//   GET    /scopes        available read-only scopes
//   GET    /              list keys (prefix only)           ?page&pageSize&includeRevoked
//   POST   /              create { name, scopes[] } -> returns `key` ONCE
//   DELETE /:id           revoke (soft; keeps the row for audit)
// =============================================================================

export const apiKeysRouter = Router();

apiKeysRouter.use(authenticate, setTenant, requireTenant, auditLog, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

apiKeysRouter.get('/scopes', controller.listScopes);
apiKeysRouter.get('/', validate({ query: ListApiKeysQueryDto }), controller.list);
apiKeysRouter.post('/', validate({ body: CreateApiKeyDto }), controller.create);
apiKeysRouter.delete('/:id', validate({ params: ApiKeyIdParamDto }), controller.revoke);

// =============================================================================
// /api/v1/public-api  (API key; X-API-Key header or Authorization: Bearer psk_…)
//   GET /students             scope students:read    ?page&pageSize&classId&sectionId&status&updatedSince
//   GET /attendance/summary   scope attendance:read  ?from&to (YYYY-MM-DD, ≤ 92 days)&classId&sectionId
//   GET /invoices             scope fees:read        ?page&pageSize&status&studentId&dueFrom&dueTo
// Read-only. Rate limited per key (PUBLIC_API_RATE_LIMIT_PER_MIN, default 60).
// =============================================================================

export const publicApiRouter = Router();

publicApiRouter.use(apiKeyAuth, apiKeyRateLimit);

publicApiRouter.get('/students', requireApiScope('students:read'), validate({ query: PublicStudentsQueryDto }), controller.publicStudents);
publicApiRouter.get(
  '/attendance/summary',
  requireApiScope('attendance:read'),
  validate({ query: PublicAttendanceSummaryQueryDto }),
  controller.publicAttendanceSummary,
);
publicApiRouter.get('/invoices', requireApiScope('fees:read'), validate({ query: PublicInvoicesQueryDto }), controller.publicInvoices);

export default apiKeysRouter;
