import { Prisma } from '@prisma/client';

// =============================================================================
// T5 soft delete — one generic layer instead of hand-editing every query.
//
// Registered on the app's Prisma client (config/prisma.ts) as a query
// middleware ($use: unlike $extends it keeps the PrismaClient type, so the
// hundreds of existing call sites and Prisma.TransactionClient stay as-is).
// It rewrites READS (findUnique/First/Many[OrThrow], count, aggregate, groupBy)
// and updateMany so that trashed rows are invisible:
//
//  1. Top level: a trash-able model gets `deletedAt: null`.
//  2. Child rows that only make sense with their parent are hidden with it
//     (CHILD_SCOPED, e.g. a trashed student's attendance and guardian links,
//     a trashed user's teacher/staff profile).
//  3. Relation filters in `where` (some/none/is/direct) get the same rules,
//     so "students with a guardian named X" skips trashed guardians.
//  4. List relations in include/select and filtered `_count` are scoped too,
//     so section.students, guardian.students, family.students, … and their
//     counts skip trashed rows.
//
// NOT rewritten (by design):
//  - single-row writes (update, upsert, delete) and deleteMany/create — the
//    trash service and purge work on trashed rows; callers that update a row
//    look it up first (and that lookup is filtered);
//  - to-one includes (invoice.student still shows the student's name);
//  - MONEY / history models (RELATION_EXEMPT): an invoice, payment, donation,
//    payroll or audit row is never hidden because a related row was trashed.
//    Only trashed invoices themselves (unpaid/void only) are hidden;
//  - raw SQL — each $queryRaw on these tables adds `"deletedAt" IS NULL`
//    itself (see ai.repository.ts).
//
// Escape hatch: put an explicit `deletedAt` key in the top-level where (e.g.
// `deletedAt: { not: null }`, or `...WITH_TRASHED`) to opt that query out.
// =============================================================================

export const SOFT_DELETE_MODELS = new Set<string>([
  'Student',
  'Guardian',
  'User',
  'Invoice',
  'Notice',
  'Event',
  'AdmissionEnquiry',
  'SitePage',
  'SitePost',
  'DonationFund',
  'DonationCampaign',
  'Family',
]);

/** Child model → required relations whose trashed parent hides the row. */
export const CHILD_SCOPED: Record<string, string[]> = {
  Attendance: ['student'],
  SubjectAttendance: ['student'],
  ExamResult: ['student'],
  GuardianStudent: ['student', 'guardian'],
  StudentDocument: ['student'],
  TransportAssignment: ['student'],
  PromotionRecord: ['student'],
  CharacterScore: ['student'],
  CharacterAward: ['student'],
  CharacterPointEntry: ['student'],
  CharacterComment: ['student'],
  FamilyStudent: ['student'],
  FamilyGuardian: ['guardian'],
  Teacher: ['user'],
  StaffProfile: ['user'],
  StaffAttendance: ['staffUser'],
  DonationCampaign: ['fund'],
};

/** Never filtered through relations: money, ledgers, history, delivery logs. */
export const RELATION_EXEMPT = new Set<string>([
  'Invoice',
  'InvoiceItem',
  'Payment',
  'FeePaymentTransaction',
  'FamilyPayment',
  'FamilyPaymentAllocation',
  'Donation',
  'RecurringDonation',
  'DonationDisbursement',
  'PayrollRecord',
  'StudentConcession',
  'LibraryIssue',
  'AuditLog',
  'Notification',
  'NotificationDelivery',
  'EmailLog',
  'Message',
  'TrashEntry',
  'RefreshToken',
]);

/** Spread into a top-level where to include trashed rows. */
export const WITH_TRASHED = { deletedAt: undefined } as const;

const READ_ACTIONS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'updateMany']);
const MAX_DEPTH = 8;

interface RelField {
  type: string;
  isList: boolean;
}

let relations: Map<string, Map<string, RelField>> | null = null;
function rel(model: string, field: string): RelField | undefined {
  if (!relations) {
    relations = new Map();
    for (const m of Prisma.dmmf.datamodel.models) {
      const map = new Map<string, RelField>();
      for (const f of m.fields) if (f.kind === 'object') map.set(f.name, { type: f.type, isList: f.isList });
      relations.set(m.name, map);
    }
  }
  return relations.get(model)?.get(field);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
const has = (o: Obj, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Adds the target's own and child-scope conditions to a relation filter. */
function scopeRelationFilter(target: string, filter: Obj, depth: number): Obj {
  let f = scopeWhere(target, filter, depth + 1);
  if (SOFT_DELETE_MODELS.has(target) && !has(f, 'deletedAt')) f = { ...f, deletedAt: null };
  return applyChildScope(target, f);
}

function applyChildScope(model: string, where: Obj): Obj {
  const rels = CHILD_SCOPED[model];
  if (!rels) return where;
  let out = where;
  for (const r of rels) {
    const target = rel(model, r)?.type;
    if (!target) continue;
    const cur = out[r];
    if (cur === undefined) out = { ...out, [r]: { deletedAt: null } };
    // An explicit filter was already scoped by scopeWhere (unless it opts out with its own deletedAt).
  }
  return out;
}

/** Walks a where tree and scopes every relation filter. */
export function scopeWhere(model: string, where: unknown, depth = 0): Obj {
  if (!isObj(where) || depth > MAX_DEPTH) return (where as Obj) ?? {};
  const out: Obj = { ...where };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      out[key] = Array.isArray(v) ? v.map((w) => scopeWhere(model, w, depth + 1)) : scopeWhere(model, v, depth + 1);
      continue;
    }
    const f = rel(model, key);
    if (!f || !isObj(v)) continue;
    if (f.isList) {
      const next: Obj = { ...v };
      for (const op of ['some', 'none'] as const) {
        if (next[op] !== undefined) next[op] = scopeRelationFilter(f.type, isObj(next[op]) ? (next[op] as Obj) : {}, depth);
      }
      // `every` keeps its meaning over all related rows (rarely used here).
      if (isObj(next.every)) next.every = scopeWhere(f.type, next.every, depth + 1);
      out[key] = next;
    } else if (has(v, 'is') || has(v, 'isNot')) {
      const next: Obj = { ...v };
      if (isObj(next.is)) next.is = scopeRelationFilter(f.type, next.is, depth);
      if (isObj(next.isNot)) next.isNot = scopeWhere(f.type, next.isNot, depth + 1);
      out[key] = next;
    } else {
      out[key] = scopeRelationFilter(f.type, v, depth);
    }
  }
  return out;
}

/** Scopes list relations (and filtered _count) inside include/select. */
export function scopeSelection(model: string, sel: unknown, depth = 0): unknown {
  if (!isObj(sel) || depth > MAX_DEPTH) return sel;
  const out: Obj = { ...sel };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (key === '_count') {
      if (isObj(v) && isObj(v.select)) {
        const counts: Obj = { ...v.select };
        for (const ck of Object.keys(counts)) {
          const f = rel(model, ck);
          const cv = counts[ck];
          if (!f || !f.isList || cv === false || cv === undefined) continue;
          if (!needsScope(f.type) && !(isObj(cv) && cv.where)) continue;
          const where = isObj(cv) && isObj(cv.where) ? cv.where : {};
          counts[ck] = { ...(isObj(cv) ? cv : {}), where: scopeRelationFilter(f.type, where, depth) };
        }
        out[key] = { ...v, select: counts };
      }
      continue;
    }
    const f = rel(model, key);
    if (!f || v === false || v === undefined || v === null) continue;
    if (f.isList) {
      const obj: Obj = isObj(v) ? { ...v } : {};
      if (needsScope(f.type) || isObj(obj.where)) obj.where = scopeRelationFilter(f.type, isObj(obj.where) ? obj.where : {}, depth);
      if (obj.select) obj.select = scopeSelection(f.type, obj.select, depth + 1);
      if (obj.include) obj.include = scopeSelection(f.type, obj.include, depth + 1);
      out[key] = Object.keys(obj).length ? obj : v;
    } else if (isObj(v)) {
      const obj: Obj = { ...v };
      if (obj.select) obj.select = scopeSelection(f.type, obj.select, depth + 1);
      if (obj.include) obj.include = scopeSelection(f.type, obj.include, depth + 1);
      out[key] = obj;
    }
  }
  return out;
}

function needsScope(model: string): boolean {
  return SOFT_DELETE_MODELS.has(model) || !!CHILD_SCOPED[model];
}

/** Rewrites one top-level query's args. Exported for tests. */
export function scopeArgs(model: string, action: string, args: Obj | undefined): Obj | undefined {
  if (!READ_ACTIONS.has(action)) return args;
  const a: Obj = { ...(args ?? {}) };
  let where: Obj = isObj(a.where) ? { ...a.where } : {};
  if (SOFT_DELETE_MODELS.has(model) && !has(where, 'deletedAt')) where.deletedAt = null;
  if (!RELATION_EXEMPT.has(model)) {
    where = applyChildScope(model, scopeWhere(model, where));
    if (a.include) a.include = scopeSelection(model, a.include);
    if (a.select) a.select = scopeSelection(model, a.select);
  }
  a.where = where;
  return a;
}

/** The middleware itself. */
export const softDeleteMiddleware: Prisma.Middleware = async (params, next) => {
  if (params.model && (needsScope(params.model) || !RELATION_EXEMPT.has(params.model))) {
    params.args = scopeArgs(params.model, params.action, params.args);
  }
  return next(params);
};
