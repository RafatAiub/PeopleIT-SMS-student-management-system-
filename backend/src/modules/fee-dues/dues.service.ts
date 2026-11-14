import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/AppError';
import {
  classifyCell, collectionRate, fromPaisa, monthKeyOf, monthRange, toPaisa,
  type CellStatus,
} from './dues.logic';
import { institutionTz, invoiceMonthSql, STUDENT_ORDER, studentWhere, type StudentFilter } from './dues.sql';

// =============================================================================
// P4 dues dashboard (month × student grid), student ledger, defaulter list,
// admin dashboard widget. All aggregation runs in Postgres; only one page of
// students (and their cells) is ever brought into Node.
// =============================================================================

export type GridStatusFilter = 'ALL' | 'DUE' | 'OVERDUE' | 'PARTIAL' | 'PAID' | 'NO_INVOICE';

export interface GridQuery extends StudentFilter {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  feeCategoryId?: string;
  status?: GridStatusFilter;
  page?: number;
  pageSize?: number;
}

export interface GridCell {
  month: string;
  status: CellStatus;
  billed: number;
  paid: number;
  due: number;
  invoices: number;
  overdue: boolean;
}

interface LineSql {
  ctes: Prisma.Sql;
}

/**
 * Builds the shared CTEs:
 *  stu   — students matching the filters
 *  lines — one row per invoice (or invoice line when a fee category is
 *          picked; paid is then pro-rated by the line's share of the invoice)
 *  t     — per-student totals over the month range
 *  fs    — filtered students (status filter applied) with their totals
 */
async function buildCtes(institutionId: string, q: GridQuery, tz: string): Promise<LineSql> {
  const { join, month } = await invoiceMonthSql(tz);
  const cat = q.feeCategoryId;
  const amounts = cat
    ? Prisma.sql`ii."netAmount" AS billed,
        CASE WHEN i."totalAmount" > 0 THEN i."paidAmount" * ii."netAmount" / i."totalAmount" ELSE 0 END AS paid`
    : Prisma.sql`i."totalAmount" AS billed, i."paidAmount" AS paid`;
  const catJoin = cat ? Prisma.sql`JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id AND ii."feeCategoryId" = ${cat}` : Prisma.empty;

  const statusCond: Record<GridStatusFilter, Prisma.Sql> = {
    ALL: Prisma.sql`TRUE`,
    DUE: Prisma.sql`COALESCE(t.due, 0) > 0.004`,
    OVERDUE: Prisma.sql`COALESCE(t.overdue, 0) > 0.004`,
    PARTIAL: Prisma.sql`COALESCE(t.paid, 0) > 0 AND COALESCE(t.due, 0) > 0.004`,
    PAID: Prisma.sql`COALESCE(t.billed, 0) > 0 AND COALESCE(t.due, 0) <= 0.004`,
    NO_INVOICE: Prisma.sql`COALESCE(t.n, 0) = 0`,
  };

  const ctes = Prisma.sql`WITH stu AS (
      SELECT st.id FROM "Student" st WHERE ${studentWhere(institutionId, q)}
    ),
    raw AS (
      SELECT i."studentId" AS sid, ${month} AS m, i.status AS st, i."dueDate" AS dd, ${amounts}
      FROM "Invoice" i
      ${join}
      ${catJoin}
      WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL
        AND i."studentId" IN (SELECT id FROM stu)
    ),
    lines AS (
      SELECT sid, m, st, dd, billed, paid,
        CASE WHEN st = 'CANCELLED' THEN 0 ELSE GREATEST(billed - paid, 0) END AS due
      FROM raw WHERE m >= ${q.from} AND m <= ${q.to}
    ),
    t AS (
      SELECT sid,
        SUM(billed) FILTER (WHERE st <> 'CANCELLED') AS billed,
        SUM(paid) FILTER (WHERE st <> 'CANCELLED') AS paid,
        SUM(due) AS due,
        SUM(due) FILTER (WHERE dd < now()) AS overdue,
        COUNT(*) AS n
      FROM lines GROUP BY sid
    ),
    fs AS (
      SELECT stu.id, t.billed, t.paid, t.due, t.overdue, t.n
      FROM stu LEFT JOIN t ON t.sid = stu.id
      WHERE ${statusCond[q.status ?? 'ALL']}
    )`;
  return { ctes };
}

export async function getGrid(institutionId: string, q: GridQuery) {
  const { tz } = await institutionTz(institutionId);
  const months = monthRange(q.from, q.to);
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
  const { ctes } = await buildCtes(institutionId, q, tz);

  const pageRows = await prisma.$queryRaw<Array<{
    id: string; code: string; firstName: string; lastName: string; rollNumber: string | null;
    className: string | null; sectionName: string | null; billed: unknown; paid: unknown; due: unknown; overdue: unknown; total: bigint;
  }>>`${ctes}
    SELECT st.id, st."studentId" AS code, st."firstName", st."lastName", st."rollNumber",
      c.name AS "className", sec.name AS "sectionName",
      fs.billed, fs.paid, fs.due, fs.overdue, COUNT(*) OVER () AS total
    FROM fs
    JOIN "Student" st ON st.id = fs.id
    LEFT JOIN "Class" c ON c.id = st."classId"
    LEFT JOIN "Section" sec ON sec.id = st."sectionId"
    ORDER BY ${STUDENT_ORDER}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;

  const ids = pageRows.map((r) => r.id);
  const cellRows = ids.length
    ? await prisma.$queryRaw<Array<{ sid: string; m: string; billed: unknown; paid: unknown; due: unknown; n: bigint; cancelled: bigint; overdue: boolean }>>`${ctes}
        SELECT sid, m,
          SUM(billed) FILTER (WHERE st <> 'CANCELLED') AS billed,
          SUM(paid) FILTER (WHERE st <> 'CANCELLED') AS paid,
          SUM(due) AS due,
          COUNT(*) AS n,
          COUNT(*) FILTER (WHERE st = 'CANCELLED') AS cancelled,
          BOOL_OR(st <> 'CANCELLED' AND due > 0.004 AND dd < now()) AS overdue
        FROM lines WHERE sid IN (${Prisma.join(ids)})
        GROUP BY sid, m`
    : [];

  const [colRows, sumRows] = await Promise.all([
    prisma.$queryRaw<Array<{ m: string; billed: unknown; paid: unknown; due: unknown; students_due: bigint }>>`${ctes}
      SELECT m,
        SUM(billed) FILTER (WHERE st <> 'CANCELLED') AS billed,
        SUM(paid) FILTER (WHERE st <> 'CANCELLED') AS paid,
        SUM(due) AS due,
        COUNT(DISTINCT sid) FILTER (WHERE due > 0.004) AS students_due
      FROM lines WHERE sid IN (SELECT id FROM fs)
      GROUP BY m`,
    prisma.$queryRaw<Array<{ students: bigint; billed: unknown; paid: unknown; due: unknown; overdue: unknown; with_dues: bigint }>>`${ctes}
      SELECT COUNT(*) AS students, SUM(billed) AS billed, SUM(paid) AS paid, SUM(due) AS due, SUM(overdue) AS overdue,
        COUNT(*) FILTER (WHERE COALESCE(due, 0) > 0.004) AS with_dues
      FROM fs`,
  ]);

  const cellsBy = new Map<string, Map<string, GridCell>>();
  for (const r of cellRows) {
    const agg = {
      billed: toPaisa(r.billed), paid: toPaisa(r.paid), due: toPaisa(r.due),
      invoiceCount: Number(r.n), cancelledCount: Number(r.cancelled), overdue: !!r.overdue,
    };
    const cell: GridCell = {
      month: r.m, status: classifyCell(agg), billed: fromPaisa(agg.billed), paid: fromPaisa(agg.paid), due: fromPaisa(agg.due),
      invoices: agg.invoiceCount, overdue: agg.overdue,
    };
    if (!cellsBy.has(r.sid)) cellsBy.set(r.sid, new Map());
    cellsBy.get(r.sid)!.set(r.m, cell);
  }

  const rows = pageRows.map((r) => {
    const m = cellsBy.get(r.id);
    return {
      id: r.id,
      studentCode: r.code,
      name: `${r.firstName} ${r.lastName}`.trim(),
      rollNumber: r.rollNumber,
      className: r.className,
      sectionName: r.sectionName,
      totals: { billed: fromPaisa(toPaisa(r.billed)), paid: fromPaisa(toPaisa(r.paid)), due: fromPaisa(toPaisa(r.due)), overdue: fromPaisa(toPaisa(r.overdue)) },
      cells: months.map((month) => m?.get(month) ?? { month, status: 'NO_INVOICE' as CellStatus, billed: 0, paid: 0, due: 0, invoices: 0, overdue: false }),
    };
  });

  const colBy = new Map(colRows.map((c) => [c.m, c]));
  const columns = months.map((month) => {
    const c = colBy.get(month);
    const billed = toPaisa(c?.billed);
    const paid = toPaisa(c?.paid);
    return {
      month,
      billed: fromPaisa(billed),
      paid: fromPaisa(paid),
      due: fromPaisa(toPaisa(c?.due)),
      studentsWithDues: Number(c?.students_due ?? 0),
      collectionRate: collectionRate(billed, paid),
    };
  });

  const s = sumRows[0];
  const billed = toPaisa(s?.billed);
  const paid = toPaisa(s?.paid);
  const total = Number(pageRows[0]?.total ?? s?.students ?? 0);
  return {
    months,
    rows,
    columns,
    summary: {
      students: Number(s?.students ?? 0),
      billed: fromPaisa(billed),
      collected: fromPaisa(paid),
      outstanding: fromPaisa(toPaisa(s?.due)),
      overdue: fromPaisa(toPaisa(s?.overdue)),
      collectionRate: collectionRate(billed, paid),
      studentsWithDues: Number(s?.with_dues ?? 0),
    },
    page,
    pageSize,
    total,
  };
}

// ── Student ledger (drill-down) ─────────────────────────────────────────

export async function getStudentLedger(institutionId: string, studentId: string, range: { from: string; to: string }) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    select: {
      id: true, studentId: true, firstName: true, lastName: true, rollNumber: true, phone: true, status: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      guardians: {
        orderBy: { isPrimary: 'desc' },
        select: { isPrimary: true, relationship: true, guardian: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } } },
      },
    },
  });
  if (!student) throw new NotFoundError('Student not found');

  const grid = await getGrid(institutionId, { ...range, studentIds: [studentId], studentStatus: 'ALL', pageSize: 1 });
  const invoices = await prisma.invoice.findMany({
    where: { institutionId, studentId },
    orderBy: { dueDate: 'desc' },
    take: 200,
    select: {
      id: true, invoiceNo: true, totalAmount: true, paidAmount: true, dueAmount: true, dueDate: true, status: true, createdAt: true, notes: true,
      items: { select: { description: true, netAmount: true, discount: true, feeCategory: { select: { name: true } } } },
      payments: { orderBy: { paidAt: 'desc' }, select: { id: true, amount: true, method: true, paidAt: true, status: true, receiptNo: true } },
    },
  });
  const reminders = await prisma.feeDuesReminderLog.findMany({
    where: { institutionId, studentId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, channel: true, recipient: true, status: true, detail: true, createdAt: true },
  });
  return {
    student: {
      id: student.id, studentCode: student.studentId, name: `${student.firstName} ${student.lastName}`.trim(), rollNumber: student.rollNumber,
      status: student.status, className: student.class?.name ?? null, sectionName: student.section?.name ?? null,
      guardians: student.guardians.map((g) => ({
        id: g.guardian.id, name: `${g.guardian.firstName} ${g.guardian.lastName}`.trim(), phone: g.guardian.phone, email: g.guardian.email,
        isPrimary: g.isPrimary, relationship: g.relationship,
      })),
    },
    months: grid.months,
    cells: grid.rows[0]?.cells ?? [],
    totals: grid.rows[0]?.totals ?? { billed: 0, paid: 0, due: 0, overdue: 0 },
    invoices: invoices.map((i) => ({
      ...i,
      totalAmount: Number(i.totalAmount), paidAmount: Number(i.paidAmount), dueAmount: Number(i.dueAmount),
      items: i.items.map((it) => ({ description: it.description, category: it.feeCategory?.name ?? null, netAmount: Number(it.netAmount), discount: Number(it.discount) })),
      payments: i.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    })),
    reminders,
  };
}

// ── Defaulters ──────────────────────────────────────────────────────────

export interface DefaulterQuery extends StudentFilter {
  minMonths?: number;
  minAmount?: number; // taka
  page?: number;
  pageSize?: number;
}

export interface DefaulterRow {
  id: string;
  studentCode: string;
  name: string;
  rollNumber: string | null;
  className: string | null;
  sectionName: string | null;
  monthsDue: number;
  months: string[];
  amountDue: number;
  oldestDueDate: Date | null;
  lastPaymentAt: Date | null;
  lastRemindedAt: Date | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
}

/** Past-due outstanding per student (dueDate ≤ now, not cancelled, not trashed). */
export async function duesCte(institutionId: string, f: StudentFilter, tz: string): Promise<Prisma.Sql> {
  const { join, month } = await invoiceMonthSql(tz);
  return Prisma.sql`stu AS (
      SELECT st.id FROM "Student" st WHERE ${studentWhere(institutionId, f)}
    ),
    d AS (
      SELECT i."studentId" AS sid,
        COUNT(DISTINCT ${month})::int AS months_due,
        ARRAY_AGG(DISTINCT ${month}) AS months,
        SUM(i."dueAmount") AS amount_due,
        MIN(i."dueDate") AS oldest
      FROM "Invoice" i
      ${join}
      WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL
        AND i.status <> 'CANCELLED' AND i."dueAmount" > 0 AND i."dueDate" <= now()
        AND i."studentId" IN (SELECT id FROM stu)
      GROUP BY i."studentId"
    )`;
}

export async function listDefaulters(institutionId: string, q: DefaulterQuery) {
  const { tz } = await institutionTz(institutionId);
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, q.pageSize ?? 50));
  const minMonths = q.minMonths && q.minMonths > 0 ? q.minMonths : null;
  const minAmount = q.minAmount && q.minAmount > 0 ? q.minAmount : null;
  const threshold =
    minMonths && minAmount
      ? Prisma.sql`(d.months_due >= ${minMonths} OR d.amount_due >= ${minAmount})`
      : minMonths
        ? Prisma.sql`d.months_due >= ${minMonths}`
        : minAmount
          ? Prisma.sql`d.amount_due >= ${minAmount}`
          : Prisma.sql`d.amount_due > 0`;

  const rows = await prisma.$queryRaw<Array<{
    id: string; code: string; firstName: string; lastName: string; rollNumber: string | null; className: string | null; sectionName: string | null;
    months_due: number; months: string[]; amount_due: unknown; oldest: Date | null; last_paid: Date | null; last_reminded: Date | null;
    g_first: string | null; g_last: string | null; g_phone: string | null; g_email: string | null; total: bigint; total_amount: unknown;
  }>>`WITH ${await duesCte(institutionId, q, tz)}
    SELECT st.id, st."studentId" AS code, st."firstName", st."lastName", st."rollNumber",
      c.name AS "className", sec.name AS "sectionName",
      d.months_due, d.months, d.amount_due, d.oldest,
      (SELECT MAX(p."paidAt") FROM "Payment" p JOIN "Invoice" i2 ON i2.id = p."invoiceId"
         WHERE i2."studentId" = st.id AND i2."institutionId" = ${institutionId} AND p.status = 'COMPLETED') AS last_paid,
      (SELECT MAX(r."createdAt") FROM "FeeDuesReminderLog" r WHERE r."studentId" = st.id) AS last_reminded,
      g."firstName" AS g_first, g."lastName" AS g_last, g.phone AS g_phone, g.email AS g_email,
      COUNT(*) OVER () AS total, SUM(d.amount_due) OVER () AS total_amount
    FROM d
    JOIN "Student" st ON st.id = d.sid
    LEFT JOIN "Class" c ON c.id = st."classId"
    LEFT JOIN "Section" sec ON sec.id = st."sectionId"
    LEFT JOIN LATERAL (
      SELECT gg."firstName", gg."lastName", gg.phone, gg.email
      FROM "GuardianStudent" gs JOIN "Guardian" gg ON gg.id = gs."guardianId"
      WHERE gs."studentId" = st.id AND gg."institutionId" = ${institutionId} AND gg."deletedAt" IS NULL
      ORDER BY gs."isPrimary" DESC LIMIT 1
    ) g ON TRUE
    WHERE ${threshold}
    ORDER BY d.amount_due DESC, ${STUDENT_ORDER}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;

  const items: DefaulterRow[] = rows.map((r) => ({
    id: r.id,
    studentCode: r.code,
    name: `${r.firstName} ${r.lastName}`.trim(),
    rollNumber: r.rollNumber,
    className: r.className,
    sectionName: r.sectionName,
    monthsDue: Number(r.months_due),
    months: [...(r.months ?? [])].sort(),
    amountDue: fromPaisa(toPaisa(r.amount_due)),
    oldestDueDate: r.oldest,
    lastPaymentAt: r.last_paid,
    lastRemindedAt: r.last_reminded,
    guardianName: r.g_first ? `${r.g_first} ${r.g_last ?? ''}`.trim() : null,
    guardianPhone: r.g_phone,
    guardianEmail: r.g_email,
  }));
  return {
    items,
    total: Number(rows[0]?.total ?? 0),
    totalAmount: fromPaisa(toPaisa(rows[0]?.total_amount)),
    page,
    pageSize,
  };
}

/** All defaulter ids for a filter (bulk "send to all"), capped. */
export async function defaulterIds(institutionId: string, q: DefaulterQuery, cap = 2000): Promise<string[]> {
  const res = await listDefaulters(institutionId, { ...q, page: 1, pageSize: Math.min(cap, 500) });
  if (res.total <= res.items.length) return res.items.map((r) => r.id);
  const ids = res.items.map((r) => r.id);
  for (let p = 2; ids.length < Math.min(cap, res.total); p += 1) {
    const next = await listDefaulters(institutionId, { ...q, page: p, pageSize: 500 });
    if (!next.items.length) break;
    ids.push(...next.items.map((r) => r.id));
  }
  return ids.slice(0, cap);
}

// ── Admin dashboard widget ─────────────────────────────────────────────

export async function getWidget(institutionId: string, now = new Date()) {
  const { tz } = await institutionTz(institutionId);
  const month = monthKeyOf(now, tz);
  const grid = await getGrid(institutionId, { from: month, to: month, studentStatus: 'ALL', pageSize: 1 });
  // Collected THIS month (cash received, whatever month it paid for).
  const collectedRows = await prisma.$queryRaw<Array<{ amount: unknown }>>`
    SELECT SUM(p.amount) AS amount FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
    WHERE i."institutionId" = ${institutionId} AND p.status = 'COMPLETED'
      AND to_char((p."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM') = ${month}`;
  const topClasses = await prisma.$queryRaw<Array<{ id: string | null; name: string | null; due: unknown; students: bigint }>>`
    SELECT c.id, c.name, SUM(i."dueAmount") AS due, COUNT(DISTINCT i."studentId") AS students
    FROM "Invoice" i
    JOIN "Student" st ON st.id = i."studentId" AND st."deletedAt" IS NULL
    LEFT JOIN "Class" c ON c.id = st."classId"
    WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL AND i.status <> 'CANCELLED'
      AND i."dueAmount" > 0 AND i."dueDate" <= now()
    GROUP BY c.id, c.name
    ORDER BY due DESC
    LIMIT 5`;
  return {
    month,
    billedThisMonth: grid.summary.billed,
    collectedForThisMonth: grid.summary.collected,
    collectedThisMonth: fromPaisa(toPaisa(collectedRows[0]?.amount)),
    collectionRate: grid.summary.collectionRate,
    topDefaulterClasses: topClasses.map((c) => ({ classId: c.id, className: c.name ?? 'No class', due: fromPaisa(toPaisa(c.due)), students: Number(c.students) })),
  };
}
