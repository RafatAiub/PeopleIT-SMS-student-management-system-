// =============================================================================
// Module switch registry (T0) — THE single list of switchable modules.
//
// Later tracks add a key here and in the mirrored frontend constant
// (frontend/src/lib/modules.ts — keep the two in the same order). Nothing
// else needs to change: storage keeps only explicit choices, so a new key
// simply starts at its `defaultEnabled` for every school.
//
// Pure — no DB, no Express. Unit-tested in tests/module-switches.test.ts.
//
// Each key is also a plan-entitlement feature key (saas/entitlements.logic.ts
// FEATURE_CATALOG), so a plan can exclude a module; see modules.service.ts.
// =============================================================================

export type ModuleGroup = 'islamic' | 'optional';

export interface ModuleDefinition {
  key: string;
  group: ModuleGroup;
  defaultEnabled: boolean;
  label: string;
  labelBn: string;
  description: string;
  descriptionBn: string;
}

export const MODULE_REGISTRY = [
  {
    key: 'islamic.donations',
    group: 'islamic',
    defaultEnabled: false,
    label: 'Donations, Zakat & Sadaqah',
    labelBn: 'দান, যাকাত ও সদকা',
    description: 'Funds, donors, one-off and monthly giving, receipts, campaigns and a public donate page.',
    descriptionBn: 'ফান্ড, দাতা, এককালীন ও মাসিক দান, রসিদ, ক্যাম্পেইন এবং ওয়েবসাইটে অনলাইন দানের পাতা।',
  },
  {
    key: 'islamic.character',
    group: 'islamic',
    defaultEnabled: false,
    label: 'Character (Akhlaq) scoring & badges',
    labelBn: 'আখলাক মূল্যায়ন ও ব্যাজ',
    description: 'Score traits such as punctuality, manners and salah; award badges and points.',
    descriptionBn: 'সময়ানুবর্তিতা, আদব, সালাতের মতো গুণাবলির নম্বর দিন; ব্যাজ ও পয়েন্ট দিন।',
  },
  {
    key: 'islamic.hifz',
    group: 'islamic',
    defaultEnabled: false,
    label: "Qur'an / Hifz tracker",
    labelBn: 'কুরআন / হিফজ ট্র্যাকার',
    description: 'Daily sabaq, sabqi and manzil, para and surah progress, and a monthly Hifz report.',
    descriptionBn: 'দৈনিক সবক, সবকি ও মানজিল, পারা ও সূরার অগ্রগতি এবং মাসিক হিফজ রিপোর্ট।',
  },
  {
    key: 'tutor_payouts',
    group: 'optional',
    defaultEnabled: true,
    label: 'Tutor sessions & payouts',
    labelBn: 'টিউটর সেশন ও পেমেন্ট',
    description: 'Pay part-time tutors per session or hour, with timesheets and payout statements.',
    descriptionBn: 'খণ্ডকালীন শিক্ষকদের সেশন বা ঘণ্টা হিসেবে পেমেন্ট, টাইমশিট ও পেমেন্ট বিবরণী।',
  },
  {
    key: 'appointments',
    group: 'optional',
    defaultEnabled: true,
    label: 'Parent–teacher appointments',
    labelBn: 'অভিভাবক–শিক্ষক সাক্ষাৎ',
    description: 'Staff publish available slots; guardians book them from their portal.',
    descriptionBn: 'শিক্ষকরা খালি সময় দেন; অভিভাবকরা পোর্টাল থেকে সময় বুক করেন।',
  },
  {
    key: 'mailbox',
    group: 'optional',
    defaultEnabled: true,
    label: 'Shared school mailbox',
    labelBn: 'স্কুলের যৌথ ইমেইল ইনবক্স',
    description: "Incoming email to the school's address shown as threads and assigned to staff.",
    descriptionBn: 'স্কুলের ঠিকানায় আসা ইমেইল থ্রেড আকারে দেখা যায় এবং কর্মীদের দায়িত্ব দেওয়া যায়।',
  },
] as const satisfies readonly ModuleDefinition[];

export type ModuleKey = (typeof MODULE_REGISTRY)[number]['key'];

export const MODULE_KEYS: ModuleKey[] = MODULE_REGISTRY.map((m) => m.key);

export function isModuleKey(key: string): key is ModuleKey {
  return (MODULE_KEYS as string[]).includes(key);
}

export function moduleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key);
}

/**
 * Normalises whatever is stored in Institution.modules into a clean map of
 * explicit choices: unknown keys and non-boolean values are dropped, so a
 * hand-edited or legacy column can never switch on something odd.
 */
export function parseStoredModules(raw: unknown): Partial<Record<ModuleKey, boolean>> {
  const out: Partial<Record<ModuleKey, boolean>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isModuleKey(k) && typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** What the school has chosen: the stored value, or the registry default. */
export function resolveSwitches(raw: unknown): Record<ModuleKey, boolean> {
  const stored = parseStoredModules(raw);
  const out = {} as Record<ModuleKey, boolean>;
  for (const m of MODULE_REGISTRY) out[m.key] = stored[m.key] ?? m.defaultEnabled;
  return out;
}

export interface ResolvedModule {
  key: ModuleKey;
  group: ModuleGroup;
  label: string;
  labelBn: string;
  description: string;
  descriptionBn: string;
  defaultEnabled: boolean;
  /** The school's own switch (stored value or default). */
  switchedOn: boolean;
  /** The plan includes this module (or a super-admin override allows it). */
  entitled: boolean;
  /** What actually gates the feature: switched on AND entitled. */
  enabled: boolean;
}

/**
 * Combines the school's switches with plan entitlements. A module is enabled
 * only when it is switched on *and* the plan allows it.
 */
export function resolveModules(raw: unknown, entitled: (key: ModuleKey) => boolean): ResolvedModule[] {
  const switches = resolveSwitches(raw);
  return MODULE_REGISTRY.map((m) => {
    const isEntitled = entitled(m.key);
    return {
      key: m.key,
      group: m.group,
      label: m.label,
      labelBn: m.labelBn,
      description: m.description,
      descriptionBn: m.descriptionBn,
      defaultEnabled: m.defaultEnabled,
      switchedOn: switches[m.key],
      entitled: isEntitled,
      enabled: switches[m.key] && isEntitled,
    };
  });
}

export class ModuleUpdateError extends Error {
  constructor(message: string, public readonly keys: string[]) {
    super(message);
  }
}

/**
 * Validates a PUT body ({ key: boolean }) and merges it over what is stored.
 * Throws ModuleUpdateError for unknown keys, or for switching ON a module
 * the plan lacks (unless `allowUnentitled`, i.e. a super admin). Switching a
 * module OFF is always allowed.
 */
export function mergeModuleUpdate(
  storedRaw: unknown,
  update: Record<string, unknown>,
  entitled: (key: ModuleKey) => boolean,
  allowUnentitled: boolean,
): { next: Partial<Record<ModuleKey, boolean>>; changed: ModuleKey[]; needsOverride: ModuleKey[] } {
  const unknown = Object.keys(update).filter((k) => !isModuleKey(k));
  if (unknown.length) throw new ModuleUpdateError(`Unknown module: ${unknown.join(', ')}`, unknown);
  const badValue = Object.entries(update).filter(([, v]) => typeof v !== 'boolean').map(([k]) => k);
  if (badValue.length) throw new ModuleUpdateError(`Module switches must be true or false: ${badValue.join(', ')}`, badValue);

  const before = resolveSwitches(storedRaw);
  const next = parseStoredModules(storedRaw);
  const changed: ModuleKey[] = [];
  const needsOverride: ModuleKey[] = [];
  const blocked: ModuleKey[] = [];

  for (const [k, v] of Object.entries(update) as [ModuleKey, boolean][]) {
    if (v && !entitled(k)) {
      if (!allowUnentitled) {
        blocked.push(k);
        continue;
      }
      needsOverride.push(k);
    }
    next[k] = v;
    if (before[k] !== v) changed.push(k);
  }
  if (blocked.length) {
    const labels = blocked.map((k) => moduleDefinition(k)?.label ?? k).join(', ');
    throw new ModuleUpdateError(`Not included in your current plan: ${labels}`, blocked);
  }
  return { next, changed, needsOverride };
}
