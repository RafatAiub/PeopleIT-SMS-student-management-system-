import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import * as c from './crm.controller';
import {
  BoardFiltersDto,
  ContactQueryDto,
  CreateContactDto,
  CreateTaskDto,
  DuplicateCheckDto,
  IdParamDto,
  LogActivityDto,
  MergeDto,
  MoveStageDto,
  ReportQueryDto,
  SaveStagesDto,
  TaskQueryDto,
  UpdateContactDto,
  UpdateTaskDto,
} from './crm.dto';

// =============================================================================
// T4 Admissions CRM — /api/v1/crm (every school; no module switch).
// authenticate → setTenant → requireTenant → auditLog on every route.
//   MANAGERS  ADMIN (+ SUPER_ADMIN support session) — same as /enquiries
//   ASSIGNEES any staff role — only "my tasks" (scope enforced in the service)
// =============================================================================

export const crmRouter = Router();
crmRouter.use(authenticate, setTenant, requireTenant, auditLog);

const SA = UserRole.SUPER_ADMIN;
const MANAGERS = requireRole(SA, UserRole.ADMIN);
const ASSIGNEES = requireRole(
  SA,
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.MANAGEMENT,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
  UserRole.TRANSPORT_OFFICER,
);
const id = validate({ params: IdParamDto });

// Pipeline stages + board
crmRouter.get('/stages', MANAGERS, c.listStages);
crmRouter.put('/stages', MANAGERS, validate({ body: SaveStagesDto }), c.putStages);
crmRouter.get('/board', MANAGERS, validate({ query: BoardFiltersDto }), c.board);
crmRouter.get('/filter-options', MANAGERS, c.filterOptions);
crmRouter.patch('/enquiries/:id/stage', MANAGERS, id, validate({ body: MoveStageDto }), c.moveStage);

// Timeline
crmRouter.get('/enquiries/:id/timeline', MANAGERS, id, c.timeline);
crmRouter.post('/enquiries/:id/activities', MANAGERS, id, validate({ body: LogActivityDto }), c.addActivity);

// Tasks (literal paths before /:id)
crmRouter.get('/tasks/summary', ASSIGNEES, c.taskSummary);
crmRouter.get('/tasks', ASSIGNEES, validate({ query: TaskQueryDto }), c.listTasks);
crmRouter.post('/tasks', MANAGERS, validate({ body: CreateTaskDto }), c.createTask);
crmRouter.patch('/tasks/:id', ASSIGNEES, id, validate({ body: UpdateTaskDto }), c.updateTask);
crmRouter.delete('/tasks/:id', MANAGERS, id, c.deleteTask);

// Contacts
crmRouter.get('/contacts/tags', MANAGERS, c.contactTags);
crmRouter.get('/contacts', MANAGERS, validate({ query: ContactQueryDto }), c.listContacts);
crmRouter.post('/contacts', MANAGERS, validate({ body: CreateContactDto }), c.createContact);
crmRouter.put('/contacts/:id', MANAGERS, id, validate({ body: UpdateContactDto }), c.updateContact);
crmRouter.delete('/contacts/:id', MANAGERS, id, c.deleteContact);
crmRouter.post('/contacts/:id/link-donor', MANAGERS, id, c.linkDonor);

// Duplicates & merge
crmRouter.get('/duplicates', MANAGERS, c.duplicateGroups);
crmRouter.post('/duplicates/check', MANAGERS, validate({ body: DuplicateCheckDto }), c.duplicateCheck);
crmRouter.post('/merge', MANAGERS, validate({ body: MergeDto }), c.merge);

// Conversion report
crmRouter.get('/report', MANAGERS, validate({ query: ReportQueryDto }), c.report);
crmRouter.get('/report.csv', MANAGERS, validate({ query: ReportQueryDto }), c.reportCsv);

export default crmRouter;
