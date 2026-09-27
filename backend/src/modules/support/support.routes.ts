import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  CreateTicketDto,
  ListTicketsQueryDto,
  PlatformListTicketsQueryDto,
  PlatformUpdateTicketDto,
  TicketIdParamDto,
  TicketMessageDto,
  UpdateTicketDto,
} from './support.dto';
import * as controller from './support.controller';

// =============================================================================
// /api/v1/support
//
// Platform console (SUPER_ADMIN, cross-tenant, no setTenant — mirrors
// billing's superAdminBillingRouter). Declared FIRST so the tenant chain
// below never runs for these paths:
//   GET   /platform/tickets                ?page&pageSize&status&priority&search&institutionId&assignedToMe
//   GET   /platform/agents                 active SUPER_ADMIN users (assignees)
//   GET   /platform/tickets/:id
//   POST  /platform/tickets/:id/messages   { body }
//   PATCH /platform/tickets/:id            { status?, priority?, assignedToUserId? }
//
// Tenant (all roles; SUPER_ADMIN/ADMIN see every ticket of the institution,
// everyone else only their own):
//   GET   /tickets                         ?page&pageSize&status&priority&search&mine
//   POST  /tickets                         { subject, description, priority? }
//   GET   /tickets/:id
//   POST  /tickets/:id/messages            { body }
//   PATCH /tickets/:id                     { status?, priority? } (non-admin creator: close/reopen only)
// =============================================================================

const router = Router();

const platform = Router();
platform.use(authenticate, requireRole(UserRole.SUPER_ADMIN));
platform.get('/tickets', validate({ query: PlatformListTicketsQueryDto }), controller.platformList);
platform.get('/agents', controller.platformAgents);
platform.get('/tickets/:id', validate({ params: TicketIdParamDto }), controller.platformGet);
platform.post('/tickets/:id/messages', validate({ params: TicketIdParamDto, body: TicketMessageDto }), controller.platformReply);
platform.patch('/tickets/:id', validate({ params: TicketIdParamDto, body: PlatformUpdateTicketDto }), controller.platformUpdate);
router.use('/platform', platform);

const tenant = Router();
tenant.use(authenticate, setTenant, requireTenant, auditLog);
tenant.get('/', validate({ query: ListTicketsQueryDto }), controller.list);
tenant.post('/', validate({ body: CreateTicketDto }), controller.create);
tenant.get('/:id', validate({ params: TicketIdParamDto }), controller.get);
tenant.post('/:id/messages', validate({ params: TicketIdParamDto, body: TicketMessageDto }), controller.reply);
tenant.patch('/:id', validate({ params: TicketIdParamDto, body: UpdateTicketDto }), controller.update);
router.use('/tickets', tenant);

export default router;
