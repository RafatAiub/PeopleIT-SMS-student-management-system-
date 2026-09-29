import { UsageMetric, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { withSchemaFallback } from './schemaGuard';
import {
  allFeatureKeys,
  allLimitResources,
  evaluateLimit,
  monthStartUtc,
  resolveFeature,
  resolveLimit,
  type EntitlementInput,
  type FeatureRow,
  type FlagRow,
  type LimitEvaluation,
  type ResolvedFeature,
  type ResolvedLimit,
} from './entitlements.logic';

// =============================================================================
// Entitlements service — loads plan / feature / override / usage data for a
// tenant and hands it to the pure resolver. Everything that touches Wave C
// tables degrades to "not configured" (⇒ enabled / unlimited) when the
// migration hasn't been applied yet.
// =============================================================================

export const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
  UserRole.TRANSPORT_OFFICER,
  UserRole.MANAGEMENT,
];

const MONTHLY_METRIC: Record<string, UsageMetric> = {
  sms_per_month: UsageMetric.SMS,
  email_per_month: UsageMetric.EMAIL,
  ai_calls_per_month: UsageMetric.AI_CALL,
};

interface PlanContext {
  plan: { id: string; name: string; slug: string } | null;
  subscription: {
    status: string;
    billingCycle: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
  } | null;
  input: EntitlementInput;
  /** false when the Wave C feature tables are not available yet. */
  configured: boolean;
}

async function loadPlanContext(institutionId: string): Promise<PlanContext> {
  // Only pre-Wave-C columns here, so this works before the migration.
  const subscription = await prisma.subscription.findUnique({
    where: { institutionId },
    select: {
      status: true,
      billingCycle: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      plan: { select: { id: true, name: true, slug: true, studentCap: true } },
    },
  });

  const planId = subscription?.plan.id ?? null;
  let configured = true;
  const markMissing = <T>(value: T) => {
    configured = false;
    return value;
  };

  const [flags, planFeatures, overrides] = await Promise.all([
    withSchemaFallback<FlagRow[] | null>(
      'featureFlag',
      () => prisma.featureFlag.findMany({ select: { key: true, description: true, defaultEnabled: true } }),
      null,
    ),
    planId
      ? withSchemaFallback<FeatureRow[] | null>(
          'planFeature',
          () =>
            prisma.planFeature.findMany({
              where: { planId },
              select: { featureKey: true, enabled: true, limitValue: true },
            }),
          null,
        )
      : Promise.resolve<FeatureRow[]>([]),
    withSchemaFallback<FeatureRow[] | null>(
      'institutionFeatureOverride',
      () =>
        prisma.institutionFeatureOverride.findMany({
          where: { institutionId },
          select: { featureKey: true, enabled: true, limitValue: true },
        }),
      null,
    ),
  ]);

  return {
    plan: subscription ? { id: subscription.plan.id, name: subscription.plan.name, slug: subscription.plan.slug } : null,
    subscription: subscription
      ? {
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    input: {
      hasPlan: Boolean(subscription),
      planStudentCap: subscription?.plan.studentCap ?? null,
      flags: flags ?? markMissing([]),
      planFeatures: planFeatures ?? markMissing([]),
      overrides: overrides ?? markMissing([]),
    },
    configured,
  };
}

/** Current consumption for one limit resource; null when not measurable. */
export async function getUsage(institutionId: string, resource: string): Promise<number | null> {
  switch (resource) {
    case 'students':
      // PENDING online applications are not enrolled yet and don't count.
      return prisma.student.count({ where: { institutionId, status: 'ACTIVE' } });
    case 'staff':
      return prisma.user.count({ where: { institutionId, isActive: true, role: { in: STAFF_ROLES } } });
    case 'branches':
      return prisma.branch.count({ where: { institutionId, isActive: true } });
    default: {
      const metric = MONTHLY_METRIC[resource];
      if (!metric) return null; // e.g. storage_mb — not tracked yet
      return withSchemaFallback<number | null>(
        'usageRecord',
        async () => {
          const agg = await prisma.usageRecord.aggregate({
            where: { institutionId, metric, createdAt: { gte: monthStartUtc() } },
            _sum: { quantity: true },
          });
          return agg._sum.quantity ?? 0;
        },
        null,
      );
    }
  }
}

export interface LimitWithUsage extends ResolvedLimit, LimitEvaluation {}

export interface Entitlements {
  plan: PlanContext['plan'];
  subscription: PlanContext['subscription'];
  /** True when the tenant has no subscription — everything is unlimited. */
  unlimited: boolean;
  configured: boolean;
  features: Record<string, ResolvedFeature>;
  limits: Record<string, LimitWithUsage>;
}

export async function getEntitlements(institutionId: string): Promise<Entitlements> {
  const ctx = await loadPlanContext(institutionId);

  const features: Record<string, ResolvedFeature> = {};
  for (const key of allFeatureKeys(ctx.input)) features[key] = resolveFeature(key, ctx.input);

  const resources = allLimitResources(ctx.input);
  const usages = await Promise.all(resources.map((r) => getUsage(institutionId, r)));
  const limits: Record<string, LimitWithUsage> = {};
  resources.forEach((resource, i) => {
    const resolved = resolveLimit(resource, ctx.input);
    limits[resource] = { ...resolved, ...evaluateLimit(resolved.limit, usages[i], 0) };
  });

  return {
    plan: ctx.plan,
    subscription: ctx.subscription,
    unlimited: !ctx.input.hasPlan,
    configured: ctx.configured,
    features,
    limits,
  };
}

export async function isFeatureEnabled(institutionId: string, key: string): Promise<ResolvedFeature> {
  const ctx = await loadPlanContext(institutionId);
  return resolveFeature(key, ctx.input);
}

export async function evaluateResourceLimit(
  institutionId: string,
  resource: string,
  increment = 1,
): Promise<ResolvedLimit & LimitEvaluation> {
  const ctx = await loadPlanContext(institutionId);
  const resolved = resolveLimit(resource, ctx.input);
  // Skip the count query entirely when unlimited (the common case).
  if (resolved.limit === null) return { ...resolved, ...evaluateLimit(null, null, increment) };
  const used = await getUsage(institutionId, resource);
  return { ...resolved, ...evaluateLimit(resolved.limit, used, increment) };
}
