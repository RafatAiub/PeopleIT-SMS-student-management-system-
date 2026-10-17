import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import * as c from './families.controller';
import {
  AddMembersDto,
  CreateFamilyDto,
  DemoConfirmDto,
  GatewayCallbackParamDto,
  GuardianParamDto,
  IdParamDto,
  ListQueryDto,
  MemberParamDto,
  MergeDto,
  NoteDto,
  NoteParamDto,
  OfflinePaymentDto,
  PayOnlineDto,
  SearchQueryDto,
  SiblingConcessionDto,
  StudentParamDto,
  UpdateFamilyDto,
} from './families.dto';

// =============================================================================
// Family profile (T3) — /api/v1/families (every school; no module switch).
// authenticate → setTenant → requireTenant → auditLog on every route.
//   STAFF    ADMIN / ACCOUNTANT / MANAGEMENT (+ SUPER_ADMIN support session)
//   TEACHER  read-only, own sections' families (checked in the service)
//   GUARDIAN only their own family (/mine, /:id when it is theirs, pay online)
// =============================================================================

export const familiesRouter = Router();
familiesRouter.use(authenticate, setTenant, requireTenant, auditLog);

const SA = UserRole.SUPER_ADMIN;
const STAFF = requireRole(SA, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGEMENT);
const READ = requireRole(SA, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGEMENT, UserRole.TEACHER, UserRole.GUARDIAN);
const LOOKUP = requireRole(SA, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGEMENT, UserRole.TEACHER);
const CASHIER = requireRole(SA, UserRole.ADMIN, UserRole.ACCOUNTANT);
const ADMIN_ONLY = requireRole(SA, UserRole.ADMIN);
const id = validate({ params: IdParamDto });

familiesRouter.get('/', STAFF, validate({ query: ListQueryDto }), c.list);
familiesRouter.get('/search', STAFF, validate({ query: SearchQueryDto }), c.search);
familiesRouter.get('/mine', requireRole(UserRole.GUARDIAN), c.mine);
familiesRouter.get('/by-student/:studentId', LOOKUP, validate({ params: StudentParamDto }), c.byStudent);
familiesRouter.get('/by-guardian/:guardianId', STAFF, validate({ params: GuardianParamDto }), c.byGuardian);

// Payments (status + demo checkout) — before /:id so "payments" is not an id.
familiesRouter.get('/payments/:id', READ, id, c.getPayment);
familiesRouter.post('/payments/:id/demo-confirm', requireRole(UserRole.GUARDIAN), id, validate({ body: DemoConfirmDto }), c.demoConfirm);

familiesRouter.post('/', STAFF, validate({ body: CreateFamilyDto }), c.create);
familiesRouter.get('/:id', READ, id, c.get);
familiesRouter.put('/:id', STAFF, id, validate({ body: UpdateFamilyDto }), c.update);
familiesRouter.post('/:id/members', STAFF, id, validate({ body: AddMembersDto }), c.addMembers);
familiesRouter.delete('/:id/students/:memberId', STAFF, validate({ params: MemberParamDto }), c.removeStudent);
familiesRouter.delete('/:id/guardians/:memberId', STAFF, validate({ params: MemberParamDto }), c.removeGuardian);
familiesRouter.post('/:id/merge', STAFF, id, validate({ body: MergeDto }), c.merge);

familiesRouter.post('/:id/notes', STAFF, id, validate({ body: NoteDto }), c.addNote);
familiesRouter.delete('/:id/notes/:noteId', STAFF, validate({ params: NoteParamDto }), c.deleteNote);
familiesRouter.post('/:id/sibling-concession', ADMIN_ONLY, id, validate({ body: SiblingConcessionDto }), c.siblingConcession);

familiesRouter.post('/:id/pay-online', requireRole(UserRole.GUARDIAN), id, validate({ body: PayOnlineDto }), c.payOnline);
familiesRouter.post('/:id/payments/offline', CASHIER, id, validate({ body: OfflinePaymentDto }), c.payOffline);

// =============================================================================
// PUBLIC gateway callbacks for family pay-all. Mount in app.ts BEFORE the fee
// gateway router: app.use('/api/v1/fees/gateway/family', familyGatewayRouter)
//   GET|POST /:gateway/:kind   gateway ∈ sslcommerz|bkash|nagad
// =============================================================================

export const familyGatewayRouter = Router();
familyGatewayRouter.get('/:gateway/:kind', validate({ params: GatewayCallbackParamDto }), c.gatewayCallback);
familyGatewayRouter.post('/:gateway/:kind', validate({ params: GatewayCallbackParamDto }), c.gatewayCallback);

export default familiesRouter;
