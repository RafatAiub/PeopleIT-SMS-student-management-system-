import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

// =============================================================================
// P4 dues — shared raw-SQL pieces.
//
// P4 only READS fee tables. Track P2 adds optional tables (InvoicePeriod for
// the billing month, InvoiceFine, PaymentReversal, FeeRefund, FeeAdjustment);
// they are used when present and skipped when not, so P4 never needs P2's
// migration to run. Every query here adds `"deletedAt" IS NULL` itself for
// Invoice / Student / Guardian (raw SQL bypasses the soft-delete layer).
// =============================================================================

const TABLE_TTL_MS = 5 * 60 * 1000;
const tableCache = new Map<string, { ok: boolean; at: number }>();

/** True when the table exists in the current database (cached for 5 minutes). */
export async function tableExists(name: string): Promise<boolean> {
  const hit = tableCache.get(name);
  if (hit && Date.now() - hit.at < TABLE_TTL_MS) return hit.ok;
  const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT to_regclass(${`"${name}"`}) IS NOT NULL AS ok`;
  const ok = !!rows[0]?.ok;
  tableCache.set(name, { ok, at: Date.now() });
  return ok;
}

export function resetTableCache() {
  tableCache.clear();
}

/** Local (school time zone) month key of invoice alias `i`, as SQL. */
export async function invoiceMonthSql(tz: string): Promise<{ join: Prisma.Sql; month: Prisma.Sql }> {
  const local = Prisma.sql`to_char((i."dueDate" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM')`;
  if (await tableExists('InvoicePeriod')) {
    return {
      join: Prisma.sql`LEFT JOIN "InvoicePeriod" ip ON ip."invoiceId" = i.id`,
      month: Prisma.sql`COALESCE(ip.period, ${local})`,
    };
  }
  return { join: Prisma.empty, month: local };
}

/** Optional AND-joined conditions. */
export function andAll(parts: Array<Prisma.Sql | null | undefined | false>): Prisma.Sql {
  const list = parts.filter((p): p is Prisma.Sql => !!p);
  return list.length ? Prisma.sql`AND ${Prisma.join(list, ' AND ')}` : Prisma.empty;
}

export interface StudentFilter {
  classId?: string;
  sectionId?: string;
  search?: string;
  /** ACTIVE (default) or ALL. */
  studentStatus?: 'ACTIVE' | 'ALL';
  studentIds?: string[];
}

/** WHERE conditions on Student alias `st` (tenant + trash always applied). */
export function studentWhere(institutionId: string, f: StudentFilter): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`st."institutionId" = ${institutionId}`, Prisma.sql`st."deletedAt" IS NULL`];
  if (f.classId) conds.push(Prisma.sql`st."classId" = ${f.classId}`);
  if (f.sectionId) conds.push(Prisma.sql`st."sectionId" = ${f.sectionId}`);
  if ((f.studentStatus ?? 'ACTIVE') === 'ACTIVE') conds.push(Prisma.sql`st.status = 'ACTIVE'`);
  if (f.studentIds) conds.push(f.studentIds.length ? Prisma.sql`st.id IN (${Prisma.join(f.studentIds)})` : Prisma.sql`FALSE`);
  const q = f.search?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(Prisma.sql`(
      (st."firstName" || ' ' || st."lastName") ILIKE ${like}
      OR st."studentId" ILIKE ${like}
      OR COALESCE(st."rollNumber", '') ILIKE ${like}
      OR COALESCE(st.phone, '') ILIKE ${like}
    )`);
  }
  return Prisma.join(conds, ' AND ');
}

/** Stable student ordering: class level, class, section, numeric roll, name. */
export const STUDENT_ORDER = Prisma.sql`c.level NULLS LAST, c.name NULLS LAST, sec.name NULLS LAST,
  NULLIF(regexp_replace(COALESCE(st."rollNumber", ''), '\\D', '', 'g'), '')::numeric NULLS LAST,
  st."firstName", st."lastName", st.id`;

export async function institutionTz(institutionId: string): Promise<{ tz: string; name: string; phone: string | null; email: string | null; address: string | null; logoUrl: string | null }> {
  const inst = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { timezone: true, name: true, phone: true, contactPhone: true, email: true, contactEmail: true, address: true, logoUrl: true },
  });
  return {
    tz: inst?.timezone || 'Asia/Dhaka',
    name: inst?.name ?? 'School',
    phone: inst?.contactPhone || inst?.phone || null,
    email: inst?.contactEmail || inst?.email || null,
    address: inst?.address ?? null,
    logoUrl: inst?.logoUrl ?? null,
  };
}
