/**
 * Module switch registry (T0) — frontend mirror of
 * backend/src/modules/institution/modules.registry.ts. Keep the two lists in
 * the same order; a later track adds its key in both places and nothing else.
 *
 * Pure (no React, no network) so it can be unit-tested; the hook lives in
 * hooks/useModules.ts and the gate in components/common/ModuleGate.tsx.
 */

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

export const MODULE_GROUPS: { key: ModuleGroup; title: string; titleBn: string; hint: string; hintBn: string }[] = [
  {
    key: 'islamic',
    title: 'Islamic / Madrasah',
    titleBn: 'ইসলামিক / মাদ্রাসা',
    hint: 'Off by default. Switch on what your madrasah or Islamic school uses.',
    hintBn: 'শুরুতে বন্ধ থাকে। আপনার মাদ্রাসা বা ইসলামিক স্কুলে যা লাগবে তা চালু করুন।',
  },
  {
    key: 'optional',
    title: 'Optional modules',
    titleBn: 'ঐচ্ছিক মডিউল',
    hint: 'On by default. Switch off anything your school does not use.',
    hintBn: 'শুরুতে চালু থাকে। আপনার স্কুলে যা লাগে না তা বন্ধ করুন।',
  },
];

/** One resolved module, as returned by GET /institution/modules. */
export interface ResolvedModule {
  key: ModuleKey;
  group: ModuleGroup;
  label: string;
  labelBn: string;
  description: string;
  descriptionBn: string;
  defaultEnabled: boolean;
  switchedOn: boolean;
  entitled: boolean;
  enabled: boolean;
}

export interface ModulesResponse {
  modules: ResolvedModule[];
  enabled: Record<string, boolean>;
}

/**
 * Is `key` enabled? `enabled` is the server map, or undefined while it is
 * still loading/unavailable. While unknown, a module falls back to its
 * registry default — Islamic modules stay hidden, optional ones stay visible,
 * so nothing flashes into view and then disappears for most schools.
 */
export function isModuleOn(key: string | undefined, enabled: Record<string, boolean> | undefined): boolean {
  if (!key) return true;
  if (enabled && key in enabled) return enabled[key] === true;
  const def = MODULE_REGISTRY.find((m) => m.key === key);
  return def ? def.defaultEnabled : false;
}

/** Drops items whose `module` is off. Items without a module always stay. */
export function filterByModule<T extends { module?: string }>(items: T[], enabled: Record<string, boolean> | undefined): T[] {
  return items.filter((i) => isModuleOn(i.module, enabled));
}

/** Sidebar-shaped entries: links carry `module`; categories carry children that may. Empty categories vanish. */
type NavLike =
  | { kind: 'link'; module?: string }
  | { kind: 'category'; module?: string; children: { module?: string }[] };

export function filterNavEntries<E extends NavLike>(entries: E[], enabled: Record<string, boolean> | undefined): E[] {
  const out: E[] = [];
  for (const e of entries) {
    if (!isModuleOn(e.module, enabled)) continue;
    if (e.kind === 'category') {
      const children = filterByModule(e.children, enabled);
      if (children.length === 0) continue;
      out.push({ ...e, children } as E);
    } else {
      out.push(e);
    }
  }
  return out;
}
