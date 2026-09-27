import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { ExportIdParamDto, ListExportsQueryDto } from './dataExport.dto';
import * as controller from './dataExport.controller';

// =============================================================================
// /api/v1/data-export  (SUPER_ADMIN, ADMIN of the tenant)
//   GET  /                 list export jobs ?page&pageSize
//   POST /                 request a new export (202; built in the background)
//   GET  /:id              job status
//   GET  /:id/download     ZIP (students, guardians, staff, attendance, results,
//                          invoices, payments CSVs + manifest.json); 7-day expiry;
//                          each download is audit-logged (DATA_EXPORT_DOWNLOAD)
// =============================================================================

const router = Router();

router.use(authenticate, setTenant, requireTenant, auditLog, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

router.get('/', validate({ query: ListExportsQueryDto }), controller.list);
router.post('/', controller.request);
router.get('/:id', validate({ params: ExportIdParamDto }), controller.get);
router.get('/:id/download', validate({ params: ExportIdParamDto }), controller.download);

export default router;
