import { Prisma, BillingCycle, SubscriptionStatus, SubscriptionPaymentStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';

// =============================================================================
// Billing Repository — Prisma data access only, no business logic.
// =============================================================================

// ── Plan ─────────────────────────────────────────────────────────────────

export async function listActivePlansWithPrices() {
  return prisma.plan.findMany({
    where: { isArchived: false },
    orderBy: { displayOrder: 'asc' },
    include: {
      prices: { where: { isActive: true } },
    },
  });
}

export async function listAllPlans() {
  return prisma.plan.findMany({
    orderBy: { displayOrder: 'asc' },
    include: {
      prices: { where: { isActive: true } },
    },
  });
}

export async function findPlanById(id: string) {
  return prisma.plan.findUnique({ where: { id } });
}

export async function findPlanBySlug(slug: string) {
  return prisma.plan.findUnique({ where: { slug } });
}

export async function createPlan(data: {
  name: string;
  slug: string;
  studentCap?: number | null;
  description?: string;
  displayOrder?: number;
}) {
  return prisma.plan.create({ data });
}

export async function updatePlan(
  id: string,
  data: Partial<{
    name: string;
    studentCap: number | null;
    description: string | null;
    displayOrder: number;
  }>,
) {
  return prisma.plan.update({ where: { id }, data });
}

export async function archivePlan(id: string) {
  return prisma.plan.update({ where: { id }, data: { isArchived: true } });
}

// ── PlanPrice ────────────────────────────────────────────────────────────

export async function findActivePlanPrice(planId: string, billingCycle: BillingCycle) {
  return prisma.planPrice.findFirst({
    where: { planId, billingCycle, isActive: true },
  });
}

export async function findPlanPriceById(id: string) {
  return prisma.planPrice.findUnique({ where: { id }, include: { plan: true } });
}

/**
 * Deactivates any existing active price for this plan+cycle, then inserts a
 * new active price row — keeps price history intact for historical
 * SubscriptionPayment FK integrity instead of mutating amounts in place.
 */
export async function setPlanPrice(
  planId: string,
  billingCycle: BillingCycle,
  amount: number,
  currency: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.planPrice.updateMany({
      where: { planId, billingCycle, isActive: true },
      data: { isActive: false },
    });

    return tx.planPrice.create({
      data: { planId, billingCycle, amount, currency },
    });
  });
}

// ── Subscription ─────────────────────────────────────────────────────────

export async function findSubscriptionByInstitutionId(institutionId: string) {
  return prisma.subscription.findUnique({
    where: { institutionId },
    include: { plan: true },
  });
}

export async function updateSubscription(
  id: string,
  data: Prisma.SubscriptionUpdateInput,
) {
  return prisma.subscription.update({ where: { id }, data });
}

// ── SubscriptionPayment ──────────────────────────────────────────────────

export async function createSubscriptionPayment(data: Prisma.SubscriptionPaymentUncheckedCreateInput) {
  return prisma.subscriptionPayment.create({ data });
}

export async function findPaymentByGatewayTransactionId(tranId: string) {
  return prisma.subscriptionPayment.findUnique({
    where: { gatewayTransactionId: tranId },
    include: { planPrice: { include: { plan: true } }, subscription: true },
  });
}

export async function updatePaymentById(id: string, data: Prisma.SubscriptionPaymentUpdateInput) {
  return prisma.subscriptionPayment.update({ where: { id }, data });
}

/**
 * Idempotent credit guard: only succeeds if the payment isn't already
 * SUCCESS. Returns the number of rows updated — callers must check
 * count === 1 before extending the subscription, guarding against a race
 * with a concurrent duplicate IPN/redirect delivery.
 */
export async function markPaymentSuccessIfNotAlready(
  id: string,
  data: { gatewayValId?: string | null; rawGatewayResponse: unknown },
) {
  return prisma.subscriptionPayment.updateMany({
    where: { id, status: { not: SubscriptionPaymentStatus.SUCCESS } },
    data: {
      status: SubscriptionPaymentStatus.SUCCESS,
      gatewayValId: data.gatewayValId,
      rawGatewayResponse: data.rawGatewayResponse as Prisma.InputJsonValue,
    },
  });
}

export async function listSubscriptionPaymentsForInstitution(institutionId: string) {
  return prisma.subscriptionPayment.findMany({
    where: { institutionId },
    orderBy: { createdAt: 'desc' },
    include: { planPrice: true },
  });
}

// ── Cross-tenant super-admin listing ────────────────────────────────────

export async function listSubscriptionsPaginated(params: {
  page: number;
  pageSize: number;
  status?: SubscriptionStatus;
  planId?: string;
  q?: string;
}) {
  const { page, pageSize, status, planId, q } = params;
  const skip = (page - 1) * pageSize;

  const where: Prisma.SubscriptionWhereInput = {
    ...(status ? { status } : {}),
    ...(planId ? { planId } : {}),
    ...(q
      ? {
          institution: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };

  const [total, data] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        institution: { select: { id: true, name: true, slug: true, isActive: true } },
        plan: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  return { data, total, page, pageSize };
}
