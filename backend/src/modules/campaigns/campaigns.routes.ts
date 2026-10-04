import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { env } from '../../config/env';
import {
  CampaignQueryDto,
  CreateCampaignDto,
  CreateGroupDto,
  DeliveryQueryDto,
  GroupMemberParamDto,
  GroupMembersDto,
  GroupQueryDto,
  IdParamDto,
  MemberCandidateQueryDto,
  PreviewAudienceDto,
  SendCampaignDto,
  UpdateCampaignDto,
  UpdateGroupDto,
} from './campaigns.dto';
import * as controller from './campaigns.controller';
import { startCampaignScheduler } from './campaigns.scheduler';

// =============================================================================
// Bulk messaging campaigns — mounted at /api/v1/campaigns
// Message groups            — mounted at /api/v1/message-groups
//
// SUPER_ADMIN/ADMIN: every campaign/group in the tenant.
// TEACHER: only their own campaigns/groups, and only reaching students and
// guardians of sections they are class teacher of (enforced in the service).
// =============================================================================

const SENDERS = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER);

export const campaignsRouter = Router();
campaignsRouter.use(authenticate, setTenant, auditLog);

campaignsRouter.get('/config', SENDERS, controller.getConfig);
campaignsRouter.post('/preview', SENDERS, validate({ body: PreviewAudienceDto }), controller.preview);
campaignsRouter.get('/', SENDERS, validate({ query: CampaignQueryDto }), controller.list);
campaignsRouter.post('/', SENDERS, validate({ body: CreateCampaignDto }), controller.create);
campaignsRouter.get('/:id', SENDERS, validate({ params: IdParamDto }), controller.get);
campaignsRouter.get(
  '/:id/deliveries',
  SENDERS,
  validate({ params: IdParamDto, query: DeliveryQueryDto }),
  controller.deliveries,
);
campaignsRouter.put('/:id', SENDERS, validate({ params: IdParamDto, body: UpdateCampaignDto }), controller.update);
campaignsRouter.delete('/:id', SENDERS, validate({ params: IdParamDto }), controller.remove);
campaignsRouter.post('/:id/send', SENDERS, validate({ params: IdParamDto, body: SendCampaignDto }), controller.send);
campaignsRouter.post('/:id/cancel', SENDERS, validate({ params: IdParamDto }), controller.cancel);

export const messageGroupsRouter = Router();
messageGroupsRouter.use(authenticate, setTenant, auditLog);

messageGroupsRouter.get('/', SENDERS, validate({ query: GroupQueryDto }), controller.listGroups);
// Declared before '/:id' so "candidates" is never read as a group id.
messageGroupsRouter.get(
  '/candidates',
  SENDERS,
  validate({ query: MemberCandidateQueryDto }),
  controller.memberCandidates,
);
messageGroupsRouter.post('/', SENDERS, validate({ body: CreateGroupDto }), controller.createGroup);
messageGroupsRouter.get('/:id', SENDERS, validate({ params: IdParamDto }), controller.getGroup);
messageGroupsRouter.put('/:id', SENDERS, validate({ params: IdParamDto, body: UpdateGroupDto }), controller.updateGroup);
messageGroupsRouter.delete('/:id', SENDERS, validate({ params: IdParamDto }), controller.deleteGroup);
messageGroupsRouter.post(
  '/:id/members',
  SENDERS,
  validate({ params: IdParamDto, body: GroupMembersDto }),
  controller.addMembers,
);
messageGroupsRouter.delete(
  '/:id/members/:userId',
  SENDERS,
  validate({ params: GroupMemberParamDto }),
  controller.removeMember,
);

// Scheduled campaigns are dispatched by an in-process timer (no Redis). It is
// started here, on first import of this router, so mounting the router in
// app.ts is the only wiring needed; the call is idempotent and the timer is
// unref'd, and it never runs under jest.
if (env.NODE_ENV !== 'test') startCampaignScheduler();

export default campaignsRouter;
