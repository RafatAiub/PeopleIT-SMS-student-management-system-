// =============================================================================
// Entitlements — pure resolution logic (no DB, no Express). Unit-tested in
// tests/saas-logic.test.ts.
//
// Key conventions (stored in FeatureFlag.key / PlanFeature.featureKey /
// InstitutionFeatureOverride.featureKey):
//   • boolean module flags use the bare key, e.g. "library", "ai"
//   • numeric limits use "limit.<resource>", e.g. "limit.students"
//
// Resolution order, most specific first:
//   features: tenant override → (no plan ⇒ enabled) → plan feature →
//             FeatureFlag.defaultEnabled → enabled
//   limits:   tenant override → (no plan ⇒ unlimited) → plan feature →
//             Plan.studentCap (students only) → unlimited
// A disabled limit row (enabled = false) means a limit of 0. A limit row with
// limitValue = null means unlimited.
//
// "Nothing configured" always resolves to enabled/unlimited, so a tenant with
// no plan, or a plan without PlanFeature rows, behaves exactly as before.
// =============================================================================

export const LIMIT_PREFIX = 'limit.';

export const FEATURE_CATALOG = {
  library: 'Library',
  transport: 'Transport',
  hr: 'HR & payroll',
  inventory: 'Inventory & assets',
  online_payments: 'Online fee payments',
  sms: 'SMS messaging',
  campaigns: 'Message campaigns',
  admissions_crm: 'Admissions CRM',
  ai: 'AI assistant',
  analytics: 'Advanced analytics',
  qr_attendance: 'QR attendance',
  custom_fields: 'Custom fields',
  multi_branch: 'Multiple branches',
  api_access: 'API access & webhooks',
  // Website v3 (Track B5, owner decision 4): removes the "Powered by
  // PeopleNIT" footer credit from a school's public site. Resolved through
  // this same override → plan-feature → flag-default → enabled chain as
  // every other feature; see sites.portal.logic.ts resolvePoweredBy() for
  // how the Sites module combines it with settings.hidePoweredBy.
  website_remove_branding: 'Remove "Powered by" footer credit',
} as const;

export const LIMIT_CATALOG = {
  students: { label: 'Active students', period: 'total' },
  staff: { label: 'Active staff accounts', period: 'total' },
  branches: { label: 'Active branches', period: 'total' },
  sms_per_month: { label: 'SMS this month', period: 'month' },
  email_per_month: { label: 'Emails this month', period: 'month' },
  ai_calls_per_month: { label: 'AI requests this month', period: 'month' },
  storage_mb: { label: 'Storage (MB)', period: 'total' },
} as const;

export type LimitResource = keyof typeof LIMIT_CATALOG;
export const LIMIT_RESOURCES = Object.keys(LIMIT_CATALOG) as LimitResource[];

export type EntitlementSource = 'override' | 'plan' | 'plan-cap' | 'default' | 'no-plan';

export interface FlagRow {
  key: string;
  description?: string | null;
  defaultEnabled: boolean;
}

export interface FeatureRow {
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
}

export interface EntitlementInput {
  hasPlan: boolean;
  planStudentCap: number | null;
  flags: FlagRow[];
  planFeatures: FeatureRow[];
  overrides: FeatureRow[];
}

export interface ResolvedFeature {
  key: string;
  label: string;
  enabled: boolean;
  source: EntitlementSource;
}

export interface ResolvedLimit {
  resource: string;
  label: string;
  period: 'total' | 'month';
  limit: number | null; // null = unlimited
  source: EntitlementSource;
}

export function limitKey(resource: string): string {
  return `${LIMIT_PREFIX}${resource}`;
}

function byKey(rows: FeatureRow[]): Map<string, FeatureRow> {
  return new Map(rows.map((r) => [r.featureKey, r]));
}

function rowLimit(row: FeatureRow): number | null {
  if (!row.enabled) return 0;
  return row.limitValue === null || row.limitValue === undefined ? null : Math.max(0, row.limitValue);
}

export function resolveFeature(key: string, input: EntitlementInput): ResolvedFeature {
  const label = (FEATURE_CATALOG as Record<string, string>)[key]
    ?? input.flags.find((f) => f.key === key)?.description
    ?? key;
  const override = byKey(input.overrides).get(key);
  if (override) return { key, label, enabled: override.enabled, source: 'override' };
  if (!input.hasPlan) return { key, label, enabled: true, source: 'no-plan' };
  const planRow = byKey(input.planFeatures).get(key);
  if (planRow) return { key, label, enabled: planRow.enabled, source: 'plan' };
  const flag = input.flags.find((f) => f.key === key);
  if (flag) return { key, label, enabled: flag.defaultEnabled, source: 'default' };
  return { key, label, enabled: true, source: 'default' };
}

export function resolveLimit(resource: string, input: EntitlementInput): ResolvedLimit {
  const meta = (LIMIT_CATALOG as Record<string, { label: string; period: 'total' | 'month' }>)[resource]
    ?? { label: resource, period: 'total' as const };
  const base = { resource, label: meta.label, period: meta.period };
  const key = limitKey(resource);

  const override = byKey(input.overrides).get(key);
  if (override) return { ...base, limit: rowLimit(override), source: 'override' };
  if (!input.hasPlan) return { ...base, limit: null, source: 'no-plan' };
  const planRow = byKey(input.planFeatures).get(key);
  if (planRow) return { ...base, limit: rowLimit(planRow), source: 'plan' };
  if (resource === 'students' && input.planStudentCap !== null && input.planStudentCap !== undefined) {
    return { ...base, limit: Math.max(0, input.planStudentCap), source: 'plan-cap' };
  }
  return { ...base, limit: null, source: 'default' };
}

/** Every feature key worth reporting: the catalogue plus anything configured in the DB. */
export function allFeatureKeys(input: EntitlementInput): string[] {
  const keys = new Set<string>(Object.keys(FEATURE_CATALOG));
  for (const f of input.flags) if (!f.key.startsWith(LIMIT_PREFIX)) keys.add(f.key);
  for (const r of [...input.planFeatures, ...input.overrides]) {
    if (!r.featureKey.startsWith(LIMIT_PREFIX)) keys.add(r.featureKey);
  }
  return [...keys];
}

export function allLimitResources(input: EntitlementInput): string[] {
  const keys = new Set<string>(LIMIT_RESOURCES);
  for (const f of input.flags) if (f.key.startsWith(LIMIT_PREFIX)) keys.add(f.key.slice(LIMIT_PREFIX.length));
  for (const r of [...input.planFeatures, ...input.overrides]) {
    if (r.featureKey.startsWith(LIMIT_PREFIX)) keys.add(r.featureKey.slice(LIMIT_PREFIX.length));
  }
  return [...keys];
}

export interface LimitEvaluation {
  allowed: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null; // null = unlimited or usage unknown
  percent: number | null; // 0–100 (capped), null = unlimited or unknown
}

/**
 * Would adding `increment` units stay within the limit? Unknown usage
 * (`used === null`, e.g. the metric isn't tracked yet) fails open — a
 * missing measurement must never block a school from working.
 */
export function evaluateLimit(limit: number | null, used: number | null, increment = 1): LimitEvaluation {
  if (limit === null) {
    return { allowed: true, limit: null, used, remaining: null, percent: null };
  }
  if (used === null) {
    return { allowed: true, limit, used: null, remaining: null, percent: null };
  }
  const remaining = Math.max(0, limit - used);
  const percent = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return { allowed: used + Math.max(0, increment) <= limit, limit, used, remaining, percent };
}

/** First instant of the current calendar month (UTC). */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function limitExceededMessage(label: string, limit: number): string {
  return limit === 0
    ? `${label} are not included in your current plan. Upgrade your plan to continue.`
    : `Your plan allows ${limit} ${label.toLowerCase()}. Upgrade your plan to add more.`;
}
