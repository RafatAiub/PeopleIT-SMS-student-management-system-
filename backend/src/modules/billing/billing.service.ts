import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { getSystemActorUserId } from '../../utils/systemActor';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError';
import * as billingRepository from './billing.repository';
import { SslCommerzClient } from './gateways/sslcommerz.client';
import type {
  CreatePlanDtoType,
  UpdatePlanDtoType,
  SetPlanPriceDtoType,
  InitiateCheckoutDtoType,
  ManualOverrideDtoType,
  ListSubscriptionsQueryDtoType,
} from './billing.dto';

// =============================================================================
// Billing Service — plan catalogue, checkout, gateway callback crediting,
// and super-admin manual override / cross-tenant subscription management.
// =============================================================================

type BannerLevel = 'none' | 'trial-ending' | 'renewal-due' | 'grace';

/** Whole-day difference between `target` and `from` (positive = in the future), floor-clamped at 0. */
function daysUntil(target: Date, from: Date): number {
  const diffMs = target.getTime() - from.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

/** Adds one billing cycle's worth of calendar time to `date`. */
function addBillingCycle(date: Date, cycle: BillingCycle): Date {
  const result = new Date(date);
  switch (cycle) {
    case 'MONTHLY':
      result.setMonth(result.getMonth() + 1);
      break;
    case 'QUARTERLY':
      result.setMonth(result.getMonth() + 3);
      break;
    case 'HALF_YEARLY':
      result.setMonth(result.getMonth() + 6);
      break;
    case 'YEARLY':
      result.setFullYear(result.getFullYear() + 1);
      break;
  }
  return result;
}

/**
 * Computes the new currentPeriodStart/currentPeriodEnd for a subscription
 * being extended by one billing cycle — renewing before expiry extends from
 * the current period end (not from "now"), standard SaaS renewal semantics.
 */
function computeExtendedPeriod(
  subscription: { status: SubscriptionStatus; currentPeriodEnd: Date | null; currentPeriodStart: Date | null },
  billingCycle: BillingCycle,
) {
  const now = new Date();
  const baseDate =
    subscription.currentPeriodEnd && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
  const currentPeriodEnd = addBillingCycle(baseDate, billingCycle);
  const isFirstPaidPeriod = subscription.status === 'TRIALING' || subscription.status === 'EXPIRED';
  const currentPeriodStart = isFirstPaidPeriod ? now : subscription.currentPeriodStart ?? now;
  return { currentPeriodStart, currentPeriodEnd };
}

// ── Public / tenant-admin ────────────────────────────────────────────────

export async function getPlans() {
  return billingRepository.listActivePlansWithPrices();
}

export async function getMySubscription(tenantId: string) {
  const subscription = await billingRepository.findSubscriptionByInstitutionId(tenantId);
  if (!subscription) {
    throw new NotFoundError('No subscription found for this institution');
  }

  const now = new Date();
  let daysRemaining = 0;
  let bannerLevel: BannerLevel = 'none';

  if (subscription.status === 'TRIALING') {
    daysRemaining = subscription.trialEndsAt ? daysUntil(subscription.trialEndsAt, now) : 0;
    bannerLevel = daysRemaining <= 3 ? 'trial-ending' : 'none';
  } else if (subscription.status === 'ACTIVE') {
    daysRemaining = subscription.currentPeriodEnd ? daysUntil(subscription.currentPeriodEnd, now) : 0;
    bannerLevel = daysRemaining <= 5 ? 'renewal-due' : 'none';
  } else if (subscription.status === 'GRACE') {
    daysRemaining = subscription.graceEndsAt ? daysUntil(subscription.graceEndsAt, now) : 0;
    bannerLevel = 'grace';
  } else {
    // EXPIRED / CANCELLED — institution is presumably already isActive=false
    // via the background lifecycle job by this point, so this path is
    // mostly unreachable for a logged-in tenant user; handled gracefully.
    daysRemaining = 0;
    bannerLevel = 'grace';
  }

  return { ...subscription, daysRemaining, bannerLevel };
}

export async function initiateCheckout(
  tenantId: string,
  userId: string,
  userEmail: string,
  dto: InitiateCheckoutDtoType,
) {
  const price = await billingRepository.findActivePlanPrice(dto.planId, dto.billingCycle);
  if (!price) {
    throw new NotFoundError('No active price found for the selected plan and billing cycle');
  }

  const subscription = await billingRepository.findSubscriptionByInstitutionId(tenantId);
  if (!subscription) {
    throw new NotFoundError('No subscription found for this institution');
  }

  const institution = await prisma.institution.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const tranId = `SUB-${tenantId.slice(0, 8)}-${Date.now()}`;

  const payment = await billingRepository.createSubscriptionPayment({
    subscriptionId: subscription.id,
    institutionId: tenantId,
    planPriceId: price.id,
    amount: price.amount,
    currency: price.currency,
    billingCycle: dto.billingCycle,
    status: 'INITIATED',
    gatewayTransactionId: tranId,
    initiatedByUserId: userId,
  });

  const result = await SslCommerzClient.initiateSession({
    tranId,
    amount: Number(price.amount),
    currency: price.currency,
    successUrl: `${env.APP_URL}/api/v1/billing/gateway/success`,
    failUrl: `${env.APP_URL}/api/v1/billing/gateway/fail`,
    cancelUrl: `${env.APP_URL}/api/v1/billing/gateway/cancel`,
    ipnUrl: `${env.APP_URL}/api/v1/billing/gateway/ipn`,
    customerName: institution?.name ?? 'Institution Admin',
    customerEmail: userEmail,
  });

  if (!result.success || !result.paymentUrl) {
    await billingRepository.updatePaymentById(payment.id, { status: 'FAILED' });
    logger.error('SSLCommerz checkout initiation failed', { tranId, message: result.message });
    throw new BadRequestError(result.message || 'Failed to initiate SSLCommerz checkout session');
  }

  return { paymentUrl: result.paymentUrl };
}

// ── Gateway callbacks (public, unauthenticated) ─────────────────────────

type PaymentWithRelations = NonNullable<
  Awaited<ReturnType<typeof billingRepository.findPaymentByGatewayTransactionId>>
>;

/**
 * The authoritative credit path — shared by handleIpn and handleRedirect
 * ('success') so whichever callback arrives first performs the crediting,
 * and the other is a guaranteed no-op via the SUCCESS-status guard.
 */
async function creditPayment(payment: PaymentWithRelations, valId: string | null | undefined): Promise<void> {
  if (!valId) {
    logger.error('Subscription payment callback missing val_id — cannot validate', {
      paymentId: payment.id,
      tranId: payment.gatewayTransactionId,
    });
    return;
  }

  // Only trusted source of truth for whether the payment is genuinely valid.
  const validation = await SslCommerzClient.validateTransaction(valId);

  const amountMatches =
    validation.valid && validation.amount !== undefined && Math.abs(validation.amount - Number(payment.amount)) < 0.01;
  const currencyMatches = !validation.currency || validation.currency === payment.currency;

  if (!validation.valid || !amountMatches || !currencyMatches) {
    await billingRepository.updatePaymentById(payment.id, {
      status: 'FAILED',
      rawGatewayResponse: (validation.raw ?? null) as any,
    });
    logger.error('Subscription payment validation failed or amount/currency mismatch — potential tampering', {
      paymentId: payment.id,
      tranId: payment.gatewayTransactionId,
      expectedAmount: Number(payment.amount),
      expectedCurrency: payment.currency,
      validation,
    });
    return;
  }

  const systemActorId = payment.initiatedByUserId ?? (await getSystemActorUserId());

  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, status: { not: 'SUCCESS' } },
      data: {
        status: 'SUCCESS',
        gatewayValId: valId,
        rawGatewayResponse: validation.raw as any,
      },
    });

    // Lost the race to a concurrent IPN/redirect delivery for the same
    // payment — it's already been credited, do not extend the period twice.
    if (updateResult.count !== 1) {
      return;
    }

    const subscription = await tx.subscription.findUnique({ where: { id: payment.subscriptionId } });
    if (!subscription) {
      logger.error('Subscription payment credited but its Subscription row is missing', {
        paymentId: payment.id,
        subscriptionId: payment.subscriptionId,
      });
      return;
    }

    const { currentPeriodStart, currentPeriodEnd } = computeExtendedPeriod(subscription, payment.billingCycle);

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        planId: payment.planPrice?.planId ?? subscription.planId,
        billingCycle: payment.billingCycle,
        currentPeriodStart,
        currentPeriodEnd,
        graceEndsAt: null,
      },
    });

    if (systemActorId) {
      await tx.auditLog.create({
        data: {
          institutionId: payment.institutionId,
          userId: systemActorId,
          action: 'SUBSCRIPTION_PAYMENT_SUCCESS',
          resource: 'Subscription',
          resourceId: subscription.id,
          metadata: {
            tranId: payment.gatewayTransactionId,
            valId,
            amount: Number(payment.amount),
            currency: payment.currency,
            billingCycle: payment.billingCycle,
          },
        },
      });
    } else {
      logger.warn('Skipped SUBSCRIPTION_PAYMENT_SUCCESS audit log: no actor and no SUPER_ADMIN user exists', {
        institutionId: payment.institutionId,
        paymentId: payment.id,
      });
    }
  });

  logger.info('Subscription payment credited', {
    paymentId: payment.id,
    institutionId: payment.institutionId,
    tranId: payment.gatewayTransactionId,
  });
}

export async function handleIpn(payload: Record<string, unknown>): Promise<void> {
  const tranId = payload?.tran_id as string | undefined;
  const valId = payload?.val_id as string | undefined;

  if (!tranId) {
    logger.warn('Billing IPN received without tran_id', { payload });
    return;
  }

  const payment = await billingRepository.findPaymentByGatewayTransactionId(tranId);
  if (!payment) {
    logger.warn('Billing IPN received for unknown tran_id', { tranId });
    return;
  }

  if (payment.status === 'SUCCESS') {
    // Idempotent no-op — already credited, do not re-validate or re-extend.
    return;
  }

  await creditPayment(payment, valId);
}

export async function handleRedirect(
  kind: 'success' | 'fail' | 'cancel',
  payload: Record<string, unknown>,
): Promise<string> {
  const tranId = payload?.tran_id as string | undefined;

  if (kind === 'success' && tranId) {
    const payment = await billingRepository.findPaymentByGatewayTransactionId(tranId);
    if (payment && payment.status !== 'SUCCESS') {
      const valId = payload?.val_id as string | undefined;
      try {
        await creditPayment(payment, valId);
      } catch (error) {
        logger.error('Failed to credit subscription payment on success redirect', {
          error: error instanceof Error ? error.message : String(error),
          tranId,
        });
      }
    }
  }

  return `${env.FRONTEND_URL}/billing/checkout-result?status=${kind}`;
}

// ── Super-admin: plans & pricing ────────────────────────────────────────

export async function listAllPlans() {
  return billingRepository.listAllPlans();
}

export async function createPlan(dto: CreatePlanDtoType) {
  const existing = await billingRepository.findPlanBySlug(dto.slug);
  if (existing) {
    throw new ConflictError(`A plan with slug '${dto.slug}' already exists`);
  }
  return billingRepository.createPlan(dto);
}

export async function updatePlan(id: string, dto: UpdatePlanDtoType) {
  const existing = await billingRepository.findPlanById(id);
  if (!existing) {
    throw new NotFoundError(`Plan with ID '${id}' not found`);
  }
  return billingRepository.updatePlan(id, dto);
}

export async function archivePlan(id: string) {
  const existing = await billingRepository.findPlanById(id);
  if (!existing) {
    throw new NotFoundError(`Plan with ID '${id}' not found`);
  }
  return billingRepository.archivePlan(id);
}

export async function setPlanPrice(id: string, dto: SetPlanPriceDtoType) {
  const existing = await billingRepository.findPlanById(id);
  if (!existing) {
    throw new NotFoundError(`Plan with ID '${id}' not found`);
  }
  return billingRepository.setPlanPrice(id, dto.billingCycle, dto.amount, dto.currency ?? 'BDT');
}

// ── Super-admin: cross-tenant subscription management ───────────────────

export async function listSubscriptions(query: ListSubscriptionsQueryDtoType) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return billingRepository.listSubscriptionsPaginated({
    page,
    pageSize,
    status: query.status as SubscriptionStatus | undefined,
    planId: query.planId,
    q: query.q,
  });
}

export async function getSubscriptionDetail(institutionId: string) {
  const subscription = await billingRepository.findSubscriptionByInstitutionId(institutionId);
  if (!subscription) {
    throw new NotFoundError(`No subscription found for institution '${institutionId}'`);
  }
  const payments = await billingRepository.listSubscriptionPaymentsForInstitution(institutionId);
  return { subscription, payments };
}

export async function manualOverride(actorUserId: string, institutionId: string, dto: ManualOverrideDtoType) {
  const subscription = await billingRepository.findSubscriptionByInstitutionId(institutionId);
  if (!subscription) {
    throw new NotFoundError(`No subscription found for institution '${institutionId}'`);
  }

  let result;

  switch (dto.action) {
    case 'EXTEND': {
      const extendDays = dto.extendDays ?? 30;
      const now = new Date();
      const baseDate =
        subscription.currentPeriodEnd && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
      const currentPeriodEnd = new Date(baseDate);
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + extendDays);

      result = await billingRepository.updateSubscription(subscription.id, {
        status: 'ACTIVE',
        currentPeriodEnd,
        graceEndsAt: null,
      });
      break;
    }

    case 'MARK_PAID': {
      if (!dto.planId || !dto.billingCycle) {
        throw new BadRequestError('planId and billingCycle are required for the MARK_PAID action');
      }

      const price = await billingRepository.findActivePlanPrice(dto.planId, dto.billingCycle);
      if (!price) {
        throw new NotFoundError('No active price found for the selected plan and billing cycle');
      }

      const { currentPeriodStart, currentPeriodEnd } = computeExtendedPeriod(subscription, dto.billingCycle);

      await billingRepository.createSubscriptionPayment({
        subscriptionId: subscription.id,
        institutionId,
        planPriceId: price.id,
        amount: price.amount,
        currency: price.currency,
        billingCycle: dto.billingCycle,
        status: 'SUCCESS',
        isManualOverride: true,
        overrideReason: dto.reason,
        overriddenByUserId: actorUserId,
      });

      result = await billingRepository.updateSubscription(subscription.id, {
        status: 'ACTIVE',
        plan: { connect: { id: dto.planId } },
        billingCycle: dto.billingCycle,
        currentPeriodStart,
        currentPeriodEnd,
        graceEndsAt: null,
      });
      break;
    }

    case 'FORCE_SUSPEND': {
      await prisma.institution.update({ where: { id: institutionId }, data: { isActive: false } });
      result = await billingRepository.updateSubscription(subscription.id, { status: 'EXPIRED' });
      break;
    }

    case 'FORCE_REACTIVATE': {
      const extendDays = dto.extendDays ?? 30;
      const currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + extendDays);

      await prisma.institution.update({ where: { id: institutionId }, data: { isActive: true } });
      result = await billingRepository.updateSubscription(subscription.id, {
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd,
        graceEndsAt: null,
      });
      break;
    }
  }

  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId: actorUserId,
        action: 'SUBSCRIPTION_MANUAL_OVERRIDE',
        resource: 'Subscription',
        resourceId: subscription.id,
        metadata: {
          action: dto.action,
          reason: dto.reason,
          planId: dto.planId ?? null,
          billingCycle: dto.billingCycle ?? null,
          extendDays: dto.extendDays ?? null,
        },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for subscription manual override', {
        error: err.message,
        institutionId,
        action: dto.action,
      });
    });

  logger.warn('Subscription manually overridden by super admin', {
    institutionId,
    actorUserId,
    action: dto.action,
    reason: dto.reason,
  });

  return result;
}
