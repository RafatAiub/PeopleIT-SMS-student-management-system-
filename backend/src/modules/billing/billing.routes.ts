import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreatePlanDto,
  UpdatePlanDto,
  SetPlanPriceDto,
  InitiateCheckoutDto,
  ManualOverrideDto,
  ListSubscriptionsQueryDto,
} from './billing.dto';
import * as billingController from './billing.controller';

// =============================================================================
// Three separate routers, mounted separately in app.ts:
//   - tenantBillingRouter    -> /api/v1/billing
//   - superAdminBillingRouter -> /api/v1/billing/super-admin
//   - gatewayBillingRouter   -> /api/v1/billing/gateway (public, no auth)
// =============================================================================

// ── Tenant-admin ──────────────────────────────────────────────────────────

export const tenantBillingRouter = Router();

tenantBillingRouter.get('/plans', authenticate, billingController.getPlans);

tenantBillingRouter.get(
  '/subscription',
  authenticate,
  setTenant,
  requireRole(UserRole.ADMIN),
  billingController.getMySubscription,
);

tenantBillingRouter.post(
  '/checkout',
  authenticate,
  setTenant,
  requireRole(UserRole.ADMIN),
  validate({ body: InitiateCheckoutDto }),
  billingController.initiateCheckout,
);

// ── Super-admin (cross-tenant, no setTenant) ─────────────────────────────

export const superAdminBillingRouter = Router();

superAdminBillingRouter.get(
  '/plans',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  billingController.listAllPlans,
);

superAdminBillingRouter.post(
  '/plans',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ body: CreatePlanDto }),
  billingController.createPlan,
);

superAdminBillingRouter.patch(
  '/plans/:id',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ body: UpdatePlanDto }),
  billingController.updatePlan,
);

superAdminBillingRouter.post(
  '/plans/:id/archive',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  billingController.archivePlan,
);

superAdminBillingRouter.put(
  '/plans/:id/price',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ body: SetPlanPriceDto }),
  billingController.setPlanPrice,
);

superAdminBillingRouter.get(
  '/subscriptions',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ query: ListSubscriptionsQueryDto }),
  billingController.listSubscriptions,
);

superAdminBillingRouter.get(
  '/subscriptions/:institutionId',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  billingController.getSubscriptionDetail,
);

superAdminBillingRouter.post(
  '/subscriptions/:institutionId/override',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ body: ManualOverrideDto }),
  billingController.manualOverride,
);

// ── Public gateway callbacks (no authenticate/setTenant — SSLCommerz cannot
// send our JWT) ───────────────────────────────────────────────────────────

export const gatewayBillingRouter = Router();

gatewayBillingRouter.post('/ipn', billingController.handleIpn);

// SSLCommerz redirects the browser to success_url/fail_url/cancel_url via an
// auto-submitting POST form (not a GET with query params, despite what the
// "IPN URL (HTTP/HTTPS)" dashboard label might suggest) — both methods are
// registered so the callback works regardless of how a given SSLCommerz flow
// (card/mobile-banking/net-banking) happens to redirect.
gatewayBillingRouter.get('/success', billingController.handleSuccessRedirect);
gatewayBillingRouter.post('/success', billingController.handleSuccessRedirect);
gatewayBillingRouter.get('/fail', billingController.handleFailRedirect);
gatewayBillingRouter.post('/fail', billingController.handleFailRedirect);
gatewayBillingRouter.get('/cancel', billingController.handleCancelRedirect);
gatewayBillingRouter.post('/cancel', billingController.handleCancelRedirect);
