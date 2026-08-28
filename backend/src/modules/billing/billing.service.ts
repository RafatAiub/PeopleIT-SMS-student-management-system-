import { BillingCycle, SubscriptionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { getSystemActorUserId } from '../../utils/systemActor';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError';
import * as billingRepository from './billing.repository';
import { SslCommerzClient } from './gateways/sslcommerz.client';
import { computeEffectiveSubscriptionState } from './subscriptionLifecycle';
import type {
  CreatePlanDtoType,
  UpdatePlanDtoType,
  SetPlanPriceDtoType,
  InitiateCheckoutDtoType,
  ManualOverrideDtoType,
  ListSubscriptionsQueryDtoType,
  GeneratePaymentLinkDtoType,
  InitiateRefundDtoType,
  AnalyticsQueryDtoType,
} from './billing.dto';

// =============================================================================
// Billing Service — plan catalogue, checkout, gateway callback crediting,
// and super-admin manual override / cross-tenant subscription management.
// =============================================================================

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

  const effective = computeEffectiveSubscriptionState(subscription, new Date());

  const pendingPayment = await billingRepository.findLatestPendingSuperAdminPayment(tenantId);
  const pendingPaymentRequest = pendingPayment
    ? {
        id: pendingPayment.id,
        planId: pendingPayment.planPrice?.planId ?? null,
        planName: pendingPayment.planPrice?.plan?.name ?? null,
        billingCycle: pendingPayment.billingCycle,
        amount: pendingPayment.amount,
        currency: pendingPayment.currency,
        requestedAt: pendingPayment.createdAt,
      }
    : null;

  return {
    ...subscription,
    status: effective.effectiveStatus,
    graceEndsAt: effective.effectiveGraceEndsAt,
    daysRemaining: effective.daysRemaining,
    bannerLevel: effective.bannerLevel,
    isPaywalled: effective.isPaywalled,
    pendingPaymentRequest,
  };
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

export async function getMyPayments(tenantId: string) {
  return billingRepository.listSubscriptionPaymentsForInstitution(tenantId);
}

/**
 * institutionId !== tenantId (or the payment doesn't exist at all) is
 * reported identically as NotFoundError — never ForbiddenError — so a
 * tenant admin probing another institution's payment IDs cannot use the
 * response to infer whether that ID exists.
 */
export async function getPaymentReceipt(tenantId: string, paymentId: string) {
  const payment = await billingRepository.findPaymentById(paymentId);
  if (!payment || payment.institutionId !== tenantId) {
    throw new NotFoundError(`Payment with ID '${paymentId}' not found`);
  }
  return payment;
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

/**
 * Super-admin-initiated equivalent of initiateCheckout: generates a
 * gateway payment URL for an explicit target institution (rather than the
 * session's own tenant), so a super admin can hand it to an institution
 * that can't/won't self-checkout. Distinguished from a tenant self-checkout
 * payment purely via generatedBySuperAdmin: true (no separate table).
 */
export async function generatePaymentLinkForInstitution(
  actorUserId: string,
  institutionId: string,
  dto: GeneratePaymentLinkDtoType,
) {
  const subscription = await billingRepository.findSubscriptionByInstitutionId(institutionId);
  if (!subscription) {
    throw new NotFoundError('No subscription found for this institution');
  }

  const price = await billingRepository.findActivePlanPrice(dto.planId, dto.billingCycle);
  if (!price) {
    throw new NotFoundError('No active price found for the selected plan and billing cycle');
  }

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { name: true, contactEmail: true, email: true },
  });

  const primaryAdmin = await billingRepository.findPrimaryAdminUser(institutionId);
  const customerEmail = primaryAdmin?.email ?? institution?.contactEmail ?? institution?.email;
  if (!customerEmail) {
    throw new BadRequestError(
      'This institution has no admin or contact email on file to generate a payment link for.',
    );
  }

  const tranId = `SUB-${institutionId.slice(0, 8)}-${Date.now()}`;

  const payment = await billingRepository.createSubscriptionPayment({
    subscriptionId: subscription.id,
    institutionId,
    planPriceId: price.id,
    amount: price.amount,
    currency: price.currency,
    billingCycle: dto.billingCycle,
    status: 'INITIATED',
    gatewayTransactionId: tranId,
    initiatedByUserId: actorUserId,
    generatedBySuperAdmin: true,
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
    customerEmail,
  });

  if (!result.success || !result.paymentUrl) {
    await billingRepository.updatePaymentById(payment.id, { status: 'FAILED' });
    logger.error('SSLCommerz super-admin payment link generation failed', {
      tranId,
      institutionId,
      message: result.message,
    });
    throw new BadRequestError(result.message || 'Failed to initiate SSLCommerz checkout session');
  }

  await billingRepository.updatePaymentById(payment.id, { gatewayPaymentUrl: result.paymentUrl });

  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId: actorUserId,
        action: 'SUBSCRIPTION_PAYMENT_LINK_GENERATED',
        resource: 'SubscriptionPayment',
        resourceId: payment.id,
        metadata: {
          planId: dto.planId,
          billingCycle: dto.billingCycle,
          amount: Number(price.amount),
          currency: price.currency,
          customerEmail,
        },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for super-admin payment link generation', {
        error: err.message,
        institutionId,
        paymentId: payment.id,
      });
    });

  return { paymentUrl: result.paymentUrl, paymentId: payment.id };
}

export async function initiateRefund(actorUserId: string, paymentId: string, dto: InitiateRefundDtoType) {
  const payment = await billingRepository.findPaymentById(paymentId);
  if (!payment) {
    throw new NotFoundError(`Payment with ID '${paymentId}' not found`);
  }
  if (payment.status !== 'SUCCESS') {
    throw new BadRequestError('Only a successfully paid payment can be refunded');
  }
  if (payment.refundedAt !== null) {
    throw new BadRequestError('This payment has already been refunded');
  }

  const rawResponse = payment.rawGatewayResponse as any;
  const bankTranId =
    rawResponse && typeof rawResponse === 'object' && typeof rawResponse.bank_tran_id === 'string'
      ? (rawResponse.bank_tran_id as string)
      : undefined;
  if (!bankTranId) {
    throw new BadRequestError('This payment is missing the bank transaction ID needed to process a refund.');
  }

  const refundTransId = `REFUND-${paymentId.slice(0, 8)}-${Date.now()}`;

  const result = await SslCommerzClient.initiateRefund({
    bankTranId,
    refundTransId,
    refundAmount: dto.refundAmount,
    refundRemarks: dto.refundRemarks,
    refeId: dto.refeId,
  });

  if (!result.success) {
    logger.error('SSLCommerz refund initiation failed', {
      paymentId,
      refundTransId,
      errorReason: result.errorReason,
    });
    throw new BadRequestError(result.errorReason || 'Failed to initiate refund via SSLCommerz');
  }

  const updated = await billingRepository.updatePaymentById(paymentId, {
    refundRefId: result.refundRefId ?? refundTransId,
    refundRawResponse: result.raw as any,
    refundedByUserId: actorUserId,
  });

  await prisma.auditLog
    .create({
      data: {
        institutionId: payment.institutionId,
        userId: actorUserId,
        action: 'SUBSCRIPTION_REFUND_INITIATED',
        resource: 'SubscriptionPayment',
        resourceId: paymentId,
        metadata: {
          refundAmount: dto.refundAmount,
          refundRemarks: dto.refundRemarks,
          refundRefId: result.refundRefId ?? null,
          gatewayStatus: result.gatewayStatus ?? null,
        },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for subscription refund initiation', {
        error: err.message,
        paymentId,
      });
    });

  return updated;
}

/**
 * Queries the live refund status from SSLCommerz. Only persists
 * status: 'REFUNDED' once the gateway itself confirms completion — an
 * initiateRefund response of 'processing' is expected and does not mean
 * failure, it just isn't final yet. The live gateway status is always
 * returned to the caller regardless of whether anything was persisted.
 */
export async function queryRefundStatus(paymentId: string) {
  const payment = await billingRepository.findPaymentById(paymentId);
  if (!payment) {
    throw new NotFoundError(`Payment with ID '${paymentId}' not found`);
  }
  if (!payment.refundRefId) {
    throw new BadRequestError('No refund has been initiated for this payment.');
  }

  const result = await SslCommerzClient.queryRefund(payment.refundRefId);
  // No actorUserId is passed into this function (see billing.controller.ts /
  // billing.routes.ts — it's a read/status-check endpoint), so resolve an
  // actor the same way background/unauthenticated crediting paths do:
  // whoever initiated the refund, falling back to the system actor, and
  // skip the audit write (with a warning) if neither exists.
  const actorId = payment.refundedByUserId ?? (await getSystemActorUserId());
  const completed = result.status === 'refunded';

  if (completed) {
    await billingRepository.updatePaymentById(paymentId, {
      status: 'REFUNDED',
      refundedAt: new Date(),
      refundRawResponse: result.raw as any,
    });
  }

  const action = completed ? 'SUBSCRIPTION_REFUND_COMPLETED' : 'SUBSCRIPTION_REFUND_QUERY';
  if (actorId) {
    await prisma.auditLog
      .create({
        data: {
          institutionId: payment.institutionId,
          userId: actorId,
          action,
          resource: 'SubscriptionPayment',
          resourceId: paymentId,
          metadata: {
            refundRefId: payment.refundRefId,
            gatewayStatus: result.status ?? null,
            refundedOn: result.refundedOn ?? null,
          },
        },
      })
      .catch((err: Error) => {
        logger.error(`Failed to write audit log for ${action}`, {
          error: err.message,
          paymentId,
        });
      });
  } else {
    logger.warn(`Skipped ${action} audit log: no actor and no SUPER_ADMIN user exists`, { paymentId });
  }

  // Always report the freshest live value, regardless of whether it was
  // persisted (a non-'refunded' status is intentionally not written back).
  return {
    paymentId,
    refundRefId: payment.refundRefId,
    liveStatus: result.status ?? null,
    refundedOn: result.refundedOn ?? null,
    persisted: completed,
  };
}

export async function getPaymentReceiptAdmin(paymentId: string) {
  const payment = await billingRepository.findPaymentById(paymentId);
  if (!payment) {
    throw new NotFoundError(`Payment with ID '${paymentId}' not found`);
  }
  return payment;
}

const MONTH_LENGTH_BY_CYCLE: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

export async function getBillingAnalytics(query: AnalyticsQueryDtoType) {
  const renewalWindowDays = query.renewalWindowDays ?? 7;
  const churnWindowDays = query.churnWindowDays ?? 30;
  const now = new Date();

  // ── MRR: sum, across all ACTIVE subscriptions, of that subscription's
  // own billing-cycle price normalized to a monthly-equivalent. Computed in
  // application code (rather than a raw SQL aggregate) — fine at this
  // table's expected scale of one row per institution. ──────────────────
  const activeSubscriptions = await prisma.subscription.findMany({
    where: { status: 'ACTIVE' },
    select: {
      billingCycle: true,
      plan: { select: { prices: { where: { isActive: true } } } },
    },
  });

  let mrr = 0;
  for (const sub of activeSubscriptions) {
    const price = sub.plan.prices.find((p) => p.billingCycle === sub.billingCycle);
    if (!price) continue;
    mrr += Number(price.amount) / MONTH_LENGTH_BY_CYCLE[sub.billingCycle];
  }

  // ── Revenue by plan ──────────────────────────────────────────────────
  const revenueGroups = await prisma.subscriptionPayment.groupBy({
    by: ['planPriceId'],
    where: { status: 'SUCCESS' },
    _sum: { amount: true },
  });

  const planPriceIds = revenueGroups
    .map((g) => g.planPriceId)
    .filter((id): id is string => id !== null);
  const planPrices = planPriceIds.length
    ? await prisma.planPrice.findMany({
        where: { id: { in: planPriceIds } },
        select: { id: true, billingCycle: true, plan: { select: { id: true, name: true } } },
      })
    : [];
  const planPriceById = new Map(planPrices.map((pp) => [pp.id, pp]));

  const revenueByPlan = revenueGroups.map((g) => {
    const planPrice = g.planPriceId ? planPriceById.get(g.planPriceId) : undefined;
    return {
      planPriceId: g.planPriceId,
      planId: planPrice?.plan.id ?? null,
      planName: planPrice?.plan.name ?? 'Unknown / manual override',
      billingCycle: planPrice?.billingCycle ?? null,
      totalRevenue: g._sum.amount ?? 0,
    };
  });

  // ── Churn count — APPROXIMATION: there is no dedicated churnedAt
  // timestamp on Subscription, so `updatedAt` (the closest available
  // signal) is used as a stand-in for "when this subscription most
  // recently transitioned to EXPIRED/CANCELLED". A subscription that
  // re-enters and leaves that state range within the window would only be
  // counted once, and any other unrelated update to the row within the
  // window (there are none today) would also count — acceptable given the
  // lack of a dedicated timestamp. ──────────────────────────────────────
  const churnSince = new Date(now.getTime() - churnWindowDays * 24 * 60 * 60 * 1000);
  const churnCount = await prisma.subscription.count({
    where: { status: { in: ['EXPIRED', 'CANCELLED'] }, updatedAt: { gte: churnSince } },
  });

  // ── Upcoming renewals ────────────────────────────────────────────────
  const renewalWindowEnd = new Date(now.getTime() + renewalWindowDays * 24 * 60 * 60 * 1000);
  const upcomingRenewalsWhere: Prisma.SubscriptionWhereInput = {
    status: 'ACTIVE',
    currentPeriodEnd: { gte: now, lte: renewalWindowEnd },
  };
  const [upcomingRenewalsCount, upcomingRenewalsList] = await Promise.all([
    prisma.subscription.count({ where: upcomingRenewalsWhere }),
    prisma.subscription.findMany({
      where: upcomingRenewalsWhere,
      take: 20,
      orderBy: { currentPeriodEnd: 'asc' },
      include: {
        institution: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    mrr: Math.round(mrr * 100) / 100,
    revenueByPlan,
    churnCount,
    upcomingRenewals: { count: upcomingRenewalsCount, list: upcomingRenewalsList },
  };
}
