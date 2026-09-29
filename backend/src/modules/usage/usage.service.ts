import { prisma } from '../../config/prisma';
import { PLATFORM_INSTITUTION_SLUG } from '../../config/platformInstitution';
import { BadRequestError } from '../../utils/AppError';
import { isMissingSchemaError } from '../../utils/schemaMissing';
import { estimateCost, messagingUnits, monthRange, totalCost, unitPricesFrom, type MeteredMetric, type UnitPrices } from './usage.logic';

// =============================================================================
// Usage & cost report.
//   Sources: UsageRecord (AI_CALL written by the AI module; SMS/EMAIL written
//   by campaigns), NotificationDelivery (transactional SMS/email — campaign
//   rows excluded to avoid double counting), Notification (in-app, free).
//   Costs are ESTIMATES from env unit prices (COST_PER_*_BDT); a metric with
//   no configured price shows cost null.
// =============================================================================

const CAMPAIGN_TEMPLATE_PREFIX = 'CAMPAIGN:'; // mirrors campaigns.runner.ts

interface RawCounts {
  usage: Partial<Record<MeteredMetric, number>>;
  aiDemo: number;
  sent: { SMS: number; EMAIL: number };
  skipped: { SMS: number; EMAIL: number };
  inApp: number;
}

const emptyCounts = (): RawCounts => ({ usage: {}, aiDemo: 0, sent: { SMS: 0, EMAIL: 0 }, skipped: { SMS: 0, EMAIL: 0 }, inApp: 0 });

function lines(c: RawCounts, prices: UnitPrices) {
  const smsBillable = messagingUnits({ usageRecordUnits: c.usage.SMS ?? 0, transactionalSent: c.sent.SMS });
  const emailBillable = messagingUnits({ usageRecordUnits: c.usage.EMAIL ?? 0, transactionalSent: c.sent.EMAIL });
  const aiTotal = c.usage.AI_CALL ?? 0;
  const aiBillable = Math.max(0, aiTotal - c.aiDemo);
  const storage = c.usage.STORAGE_MB ?? 0;
  const items = [
    { metric: 'SMS' as const, label: 'SMS (segments)', billableUnits: smsBillable, notBilled: c.skipped.SMS, unitPrice: prices.SMS, estimatedCostBdt: estimateCost(smsBillable, prices.SMS) },
    { metric: 'EMAIL' as const, label: 'Email', billableUnits: emailBillable, notBilled: c.skipped.EMAIL, unitPrice: prices.EMAIL, estimatedCostBdt: estimateCost(emailBillable, prices.EMAIL) },
    { metric: 'AI_CALL' as const, label: 'AI calls', billableUnits: aiBillable, notBilled: c.aiDemo, unitPrice: prices.AI_CALL, estimatedCostBdt: estimateCost(aiBillable, prices.AI_CALL) },
    { metric: 'STORAGE_MB' as const, label: 'Storage (MB)', billableUnits: storage, notBilled: 0, unitPrice: prices.STORAGE_MB, estimatedCostBdt: estimateCost(storage, prices.STORAGE_MB) },
  ];
  return { items, inAppNotifications: c.inApp, estimatedTotalBdt: totalCost(items.map((i) => i.estimatedCostBdt)) };
}

function parseMonth(month: string | undefined) {
  try {
    return monthRange(month);
  } catch {
    throw new BadRequestError('month must be YYYY-MM');
  }
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<{ value: T; missing: boolean }> {
  try {
    return { value: await run(), missing: false };
  } catch (error) {
    if (isMissingSchemaError(error)) return { value: fallback, missing: true };
    throw error;
  }
}

type GroupRow = { institutionId: string; metric?: MeteredMetric; channel?: string; status?: string; _sum?: { quantity: number | null }; _count?: { _all: number } };

async function collect(where: { institutionId?: string }, start: Date, end: Date) {
  const createdAt = { gte: start, lt: end };
  const usage = await safe(
    () =>
      prisma.usageRecord.groupBy({ by: ['institutionId', 'metric'], where: { ...where, createdAt }, _sum: { quantity: true } }) as unknown as Promise<GroupRow[]>,
    [] as GroupRow[],
  );
  const aiDemo = await safe(
    () =>
      prisma.usageRecord.groupBy({
        by: ['institutionId'],
        where: { ...where, createdAt, metric: 'AI_CALL', meta: { path: ['isDemo'], equals: true } },
        _sum: { quantity: true },
      }) as unknown as Promise<GroupRow[]>,
    [] as GroupRow[],
  );
  const deliveries = (await prisma.notificationDelivery.groupBy({
    by: ['institutionId', 'channel', 'status'],
    where: {
      ...where,
      createdAt,
      channel: { in: ['SMS', 'EMAIL'] },
      status: { in: ['SENT', 'SKIPPED'] },
    },
    _count: { _all: true },
  })) as unknown as GroupRow[];
  // Campaign deliveries: only SKIPPED matter here (SENT ones are billed via UsageRecord).
  const campaignSent = (await prisma.notificationDelivery.groupBy({
    by: ['institutionId', 'channel'],
    where: { ...where, createdAt, channel: { in: ['SMS', 'EMAIL'] }, status: 'SENT', templateKey: { startsWith: CAMPAIGN_TEMPLATE_PREFIX } },
    _count: { _all: true },
  })) as unknown as GroupRow[];
  const inApp = (await prisma.notification.groupBy({ by: ['institutionId'], where: { ...where, createdAt }, _count: { _all: true } })) as unknown as GroupRow[];

  const byTenant = new Map<string, RawCounts>();
  const get = (id: string) => {
    let c = byTenant.get(id);
    if (!c) byTenant.set(id, (c = emptyCounts()));
    return c;
  };
  for (const r of usage.value) if (r.metric) get(r.institutionId).usage[r.metric] = r._sum?.quantity ?? 0;
  for (const r of aiDemo.value) get(r.institutionId).aiDemo = r._sum?.quantity ?? 0;
  for (const r of deliveries) {
    const ch = r.channel as 'SMS' | 'EMAIL';
    if (r.status === 'SENT') get(r.institutionId).sent[ch] += r._count?._all ?? 0;
    else get(r.institutionId).skipped[ch] += r._count?._all ?? 0;
  }
  for (const r of campaignSent) {
    const ch = r.channel as 'SMS' | 'EMAIL';
    get(r.institutionId).sent[ch] -= r._count?._all ?? 0; // counted via UsageRecord instead
  }
  for (const c of byTenant.values()) {
    c.sent.SMS = Math.max(0, c.sent.SMS);
    c.sent.EMAIL = Math.max(0, c.sent.EMAIL);
  }
  for (const r of inApp) get(r.institutionId).inApp = r._count?._all ?? 0;
  return { byTenant, usageSchemaMissing: usage.missing || aiDemo.missing };
}

function pricesNote(prices: UnitPrices) {
  const unset = (Object.entries(prices) as Array<[MeteredMetric, number | null]>).filter(([, v]) => v === null).map(([k]) => k);
  return { prices, unpricedMetrics: unset };
}

export async function tenantSummary(institutionId: string, month?: string) {
  const range = parseMonth(month);
  const prices = unitPricesFrom(process.env);
  const { byTenant, usageSchemaMissing } = await collect({ institutionId }, range.start, range.end);
  return {
    month: range.month,
    from: range.start.toISOString(),
    to: range.end.toISOString(),
    ...lines(byTenant.get(institutionId) ?? emptyCounts(), prices),
    ...pricesNote(prices),
    isEstimate: true,
    usageSchemaMissing,
  };
}

export async function platformSummary(month?: string) {
  const range = parseMonth(month);
  const prices = unitPricesFrom(process.env);
  const { byTenant, usageSchemaMissing } = await collect({}, range.start, range.end);
  const ids = Array.from(byTenant.keys());
  const institutions = ids.length
    ? await prisma.institution.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })
    : [];
  const meta = new Map(institutions.map((i) => [i.id, i]));

  const rows = ids
    .filter((id) => meta.get(id)?.slug !== PLATFORM_INSTITUTION_SLUG)
    .map((id) => {
      const l = lines(byTenant.get(id)!, prices);
      return { institutionId: id, institutionName: meta.get(id)?.name ?? 'Unknown institution', ...l };
    })
    .sort((a, b) => (b.estimatedTotalBdt ?? 0) - (a.estimatedTotalBdt ?? 0) || sumUnits(b.items) - sumUnits(a.items));

  const totals = emptyCounts();
  for (const id of ids) {
    if (meta.get(id)?.slug === PLATFORM_INSTITUTION_SLUG) continue;
    const c = byTenant.get(id)!;
    for (const k of Object.keys(c.usage) as MeteredMetric[]) totals.usage[k] = (totals.usage[k] ?? 0) + (c.usage[k] ?? 0);
    totals.aiDemo += c.aiDemo;
    totals.sent.SMS += c.sent.SMS;
    totals.sent.EMAIL += c.sent.EMAIL;
    totals.skipped.SMS += c.skipped.SMS;
    totals.skipped.EMAIL += c.skipped.EMAIL;
    totals.inApp += c.inApp;
  }

  return {
    month: range.month,
    from: range.start.toISOString(),
    to: range.end.toISOString(),
    totals: lines(totals, prices),
    institutions: rows,
    ...pricesNote(prices),
    isEstimate: true,
    usageSchemaMissing,
  };
}

function sumUnits(items: Array<{ billableUnits: number }>) {
  return items.reduce((a, b) => a + b.billableUnits, 0);
}
