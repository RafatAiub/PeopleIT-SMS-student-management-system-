import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { fromPaisa, monthLabel, monthRange, toPaisa } from './dues.logic';
import { institutionTz, invoiceMonthSql, tableExists } from './dues.sql';
import type { ReportColumn, ReportDoc, ReportTable } from './export';

// =============================================================================
// P4 fee reports (Fees → Reports). Each builder returns one ReportDoc that the
// UI previews and export.ts renders as xlsx / csv / pdf.
// Dates are the school's local dates (Institution.timezone, Asia/Dhaka).
// Money totals are summed in paisa.
// =============================================================================

export const REPORT_KEYS = ['cash-book', 'monthly-summary', 'outstanding', 'concessions', 'student-statement', 'late-fines', 'refunds'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export interface ReportParams {
  from?: string; // YYYY-MM-DD (date reports) or YYYY-MM (month reports)
  to?: string;
  classId?: string;
  sectionId?: string;
  collectorId?: string;
  method?: string;
  studentId?: string;
}

const ROW_CAP = 20000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const money = (v: unknown) => fromPaisa(toPaisa(v));
const sumBy = (rows: Array<Record<string, unknown>>, key: string) => fromPaisa(rows.reduce((s, r) => s + toPaisa(r[key]), 0));
const nameOf = (f?: string | null, l?: string | null) => `${f ?? ''} ${l ?? ''}`.trim();
const classOf = (c?: string | null, s?: string | null) => [c, s].filter(Boolean).join(' - ');

function dateRange(p: ReportParams, tz: string): { from: string; to: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const from = p.from && DATE_RE.test(p.from) ? p.from : `${today.slice(0, 8)}01`;
  const to = p.to && DATE_RE.test(p.to) ? p.to : today;
  if (from > to) throw new BadRequestError('"From" date is after "To" date');
  return { from, to };
}

function monthParams(p: ReportParams, tz: string): { from: string; to: string } {
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const from = p.from && /^\d{4}-\d{2}/.test(p.from) ? p.from.slice(0, 7) : `${now.slice(0, 4)}-01`;
  const to = p.to && /^\d{4}-\d{2}/.test(p.to) ? p.to.slice(0, 7) : `${from.slice(0, 4)}-12`;
  if (from > to) throw new BadRequestError('"From" month is after "To" month');
  if (monthRange(from, to).length > 24) throw new BadRequestError('Pick at most 24 months');
  return { from, to };
}

/** Local date of a UTC timestamp column, as SQL. */
const localDate = (col: Prisma.Sql, tz: string) => Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date`;
const localMonth = (col: Prisma.Sql, tz: string) => Prisma.sql`to_char((${col} AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM')`;

async function className(institutionId: string, classId?: string, sectionId?: string): Promise<string | null> {
  if (!classId && !sectionId) return null;
  const sec = sectionId ? await prisma.section.findFirst({ where: { id: sectionId, class: { branch: { institutionId } } }, select: { name: true, class: { select: { name: true } } } }) : null;
  if (sec) return classOf(sec.class.name, sec.name);
  const cls = classId ? await prisma.class.findFirst({ where: { id: classId, branch: { institutionId } }, select: { name: true } }) : null;
  return cls?.name ?? null;
}

function doc(key: ReportKey, title: string, filters: ReportDoc['filters'], tables: ReportTable[], notes: string[] = []): ReportDoc {
  return { key, title, filters, tables, notes, generatedAt: new Date().toISOString() };
}

// ── 1. Daily collection / cash book ────────────────────────────────────────

async function cashBook(institutionId: string, p: ReportParams): Promise<ReportDoc> {
  const { tz } = await institutionTz(institutionId);
  const { from, to } = dateRange(p, tz);
  const day = localDate(Prisma.sql`p."paidAt"`, tz);
  const conds: Prisma.Sql[] = [
    Prisma.sql`i."institutionId" = ${institutionId}`,
    Prisma.sql`p.status = 'COMPLETED'`,
    Prisma.sql`${day} BETWEEN ${from}::date AND ${to}::date`,
  ];
  if (p.collectorId) conds.push(Prisma.sql`p."recordedBy" = ${p.collectorId}`);
  if (p.method) conds.push(Prisma.sql`p.method = ${p.method}`);
  if (p.classId) conds.push(Prisma.sql`st."classId" = ${p.classId}`);
  if (p.sectionId) conds.push(Prisma.sql`st."sectionId" = ${p.sectionId}`);
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT to_char(${day}, 'YYYY-MM-DD') AS day, p."paidAt", p."receiptNo", p.method, p.amount, p."transactionRef", p."recordedBy",
      i."invoiceNo", st."studentId" AS code, st."firstName", st."lastName", c.name AS cls, sec.name AS sec,
      u."firstName" AS uf, u."lastName" AS ul
    FROM "Payment" p
    JOIN "Invoice" i ON i.id = p."invoiceId"
    JOIN "Student" st ON st.id = i."studentId"
    LEFT JOIN "Class" c ON c.id = st."classId"
    LEFT JOIN "Section" sec ON sec.id = st."sectionId"
    LEFT JOIN "User" u ON u.id = p."recordedBy"
    WHERE ${Prisma.join(conds, ' AND ')}
    ORDER BY p."paidAt", p.id
    LIMIT ${ROW_CAP + 1}`;
  const truncated = rows.length > ROW_CAP;
  const list = rows.slice(0, ROW_CAP).map((r) => ({
    date: r.day,
    receiptNo: r.receiptNo ?? '',
    student: nameOf(r.firstName as string, r.lastName as string),
    studentCode: r.code,
    class: classOf(r.cls as string, r.sec as string),
    invoiceNo: r.invoiceNo,
    method: r.method,
    collector: r.uf ? nameOf(r.uf as string, r.ul as string) : 'Online / system',
    collectorId: r.recordedBy,
    reference: r.transactionRef ?? '',
    amount: money(r.amount),
  }));
  const group = (key: 'method' | 'collector' | 'date') => {
    const m = new Map<string, { count: number; paisa: number }>();
    for (const r of list) {
      const k = String(r[key] ?? '—');
      const g = m.get(k) ?? { count: 0, paisa: 0 };
      g.count += 1;
      g.paisa += toPaisa(r.amount);
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => (key === 'date' ? a[0].localeCompare(b[0]) : b[1].paisa - a[1].paisa)).map(([k, g]) => ({ key: k, count: g.count, amount: fromPaisa(g.paisa) }));
  };
  const total = sumBy(list, 'amount');
  const filters = [{ label: 'From', value: from }, { label: 'To', value: to }];
  if (p.method) filters.push({ label: 'Method', value: p.method });
  if (p.collectorId) filters.push({ label: 'Collector', value: list[0]?.collector ?? p.collectorId });
  const cls = await className(institutionId, p.classId, p.sectionId);
  if (cls) filters.push({ label: 'Class', value: cls });
  const summaryCols = (label: string): ReportColumn[] => [{ key: 'key', label, width: 1.6 }, { key: 'count', label: 'Payments', type: 'number' }, { key: 'amount', label: 'Amount', type: 'money' }];
  return doc('cash-book', 'Daily collection (cash book)', filters, [
    {
      title: 'Payments',
      columns: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'receiptNo', label: 'Receipt', width: 1.2 },
        { key: 'student', label: 'Student', width: 1.5 },
        { key: 'studentCode', label: 'Student ID' },
        { key: 'class', label: 'Class' },
        { key: 'invoiceNo', label: 'Invoice', width: 1.2 },
        { key: 'method', label: 'Method' },
        { key: 'collector', label: 'Collected by', width: 1.2 },
        { key: 'amount', label: 'Amount', type: 'money' },
      ],
      rows: list,
      totals: { date: 'Total', amount: total },
    },
    { title: 'By day', columns: summaryCols('Date'), rows: group('date'), totals: { key: 'Total', count: list.length, amount: total } },
    { title: 'By method', columns: summaryCols('Method'), rows: group('method'), totals: { key: 'Total', count: list.length, amount: total } },
    { title: 'By collector', columns: summaryCols('Collected by'), rows: group('collector'), totals: { key: 'Total', count: list.length, amount: total } },
  ], truncated ? [`Only the first ${ROW_CAP} payments are listed — narrow the date range.`] : []);
}

// ── 2. Monthly collection summary ─────────────────────────────────────────

async function monthlySummary(institutionId: string, p: ReportParams): Promise<ReportDoc> {
  const { tz } = await institutionTz(institutionId);
  const { from, to } = monthParams(p, tz);
  const months = monthRange(from, to);
  const pm = localMonth(Prisma.sql`p."paidAt"`, tz);
  const classCond = Prisma.sql`${p.classId ? Prisma.sql`AND st."classId" = ${p.classId}` : Prisma.empty} ${p.sectionId ? Prisma.sql`AND st."sectionId" = ${p.sectionId}` : Prisma.empty}`;

  const byClass = await prisma.$queryRaw<Array<{ m: string; cid: string | null; cname: string | null; level: number | null; amount: unknown; n: bigint }>>`
    SELECT ${pm} AS m, c.id AS cid, c.name AS cname, c.level, SUM(p.amount) AS amount, COUNT(*) AS n
    FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" JOIN "Student" st ON st.id = i."studentId"
    LEFT JOIN "Class" c ON c.id = st."classId"
    WHERE i."institutionId" = ${institutionId} AND p.status = 'COMPLETED' AND ${pm} BETWEEN ${from} AND ${to} ${classCond}
    GROUP BY 1, 2, 3, 4`;
  const byCat = await prisma.$queryRaw<Array<{ m: string; cname: string; amount: unknown }>>`
    SELECT ${pm} AS m, fc.name AS cname,
      SUM(CASE WHEN i."totalAmount" > 0 THEN p.amount * ii."netAmount" / i."totalAmount" ELSE 0 END) AS amount
    FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" JOIN "Student" st ON st.id = i."studentId"
    JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id JOIN "FeeCategory" fc ON fc.id = ii."feeCategoryId"
    WHERE i."institutionId" = ${institutionId} AND p.status = 'COMPLETED' AND ${pm} BETWEEN ${from} AND ${to} ${classCond}
    GROUP BY 1, 2`;
  const { join, month } = await invoiceMonthSql(tz);
  const billed = await prisma.$queryRaw<Array<{ m: string; billed: unknown; due: unknown }>>`
    SELECT ${month} AS m, SUM(i."totalAmount") AS billed, SUM(i."dueAmount") AS due
    FROM "Invoice" i ${join} JOIN "Student" st ON st.id = i."studentId"
    WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL AND st."deletedAt" IS NULL AND i.status <> 'CANCELLED' ${classCond}
      AND ${month} BETWEEN ${from} AND ${to}
    GROUP BY 1`;

  const monthCols: ReportColumn[] = months.map((m) => ({ key: m, label: monthLabel(m), type: 'money' as const }));
  const pivot = (rows: Array<{ m: string; label: string; amount: unknown; sort?: string }>) => {
    const by = new Map<string, Record<string, unknown> & { _p: Record<string, number>; _sort: string }>();
    for (const r of rows) {
      const g = by.get(r.label) ?? { label: r.label, _p: {}, _sort: r.sort ?? r.label };
      g._p[r.m] = (g._p[r.m] ?? 0) + toPaisa(r.amount);
      by.set(r.label, g);
    }
    const out = [...by.values()].sort((a, b) => a._sort.localeCompare(b._sort, undefined, { numeric: true })).map((g) => {
      const row: Record<string, unknown> = { label: g.label };
      let tot = 0;
      for (const m of months) {
        row[m] = fromPaisa(g._p[m] ?? 0);
        tot += g._p[m] ?? 0;
      }
      row.total = fromPaisa(tot);
      return row;
    });
    const totals: Record<string, unknown> = { label: 'Total' };
    for (const m of [...months, 'total']) totals[m] = sumBy(out, m);
    return { rows: out, totals };
  };
  const cls = pivot(byClass.map((r) => ({ m: r.m, label: r.cname ?? 'No class', amount: r.amount, sort: `${String(r.level ?? 999).padStart(4, '0')} ${r.cname ?? ''}` })));
  const cat = pivot(byCat.map((r) => ({ m: r.m, label: r.cname, amount: r.amount })));

  const collectedBy = new Map<string, { paisa: number; n: number }>();
  for (const r of byClass) {
    const g = collectedBy.get(r.m) ?? { paisa: 0, n: 0 };
    g.paisa += toPaisa(r.amount);
    g.n += Number(r.n);
    collectedBy.set(r.m, g);
  }
  const billedBy = new Map(billed.map((b) => [b.m, b]));
  const monthRows = months.map((m) => {
    const b = toPaisa(billedBy.get(m)?.billed);
    const c = collectedBy.get(m)?.paisa ?? 0;
    return { month: monthLabel(m), billed: fromPaisa(b), outstanding: money(billedBy.get(m)?.due), payments: collectedBy.get(m)?.n ?? 0, collected: fromPaisa(c) };
  });
  const filters = [{ label: 'From', value: monthLabel(from) }, { label: 'To', value: monthLabel(to) }];
  const cname = await className(institutionId, p.classId, p.sectionId);
  if (cname) filters.push({ label: 'Class', value: cname });
  return doc('monthly-summary', 'Monthly collection summary', filters, [
    {
      title: 'By month',
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'billed', label: 'Billed (for the month)', type: 'money' },
        { key: 'outstanding', label: 'Still due (for the month)', type: 'money' },
        { key: 'payments', label: 'Payments received', type: 'number' },
        { key: 'collected', label: 'Collected (in the month)', type: 'money' },
      ],
      rows: monthRows,
      totals: { month: 'Total', billed: sumBy(monthRows, 'billed'), outstanding: sumBy(monthRows, 'outstanding'), payments: monthRows.reduce((s, r) => s + r.payments, 0), collected: sumBy(monthRows, 'collected') },
    },
    { title: 'Collected by class', columns: [{ key: 'label', label: 'Class', width: 1.4 }, ...monthCols, { key: 'total', label: 'Total', type: 'money' }], rows: cls.rows, totals: cls.totals },
    { title: 'Collected by fee category', columns: [{ key: 'label', label: 'Category', width: 1.4 }, ...monthCols, { key: 'total', label: 'Total', type: 'money' }], rows: cat.rows, totals: cat.totals },
  ], ['"Collected in the month" counts money received that month. Category amounts split each payment by the share of each fee line on its invoice.']);
}

// ── 3. Outstanding dues by class / section ────────────────────────────────

async function outstanding(institutionId: string, p: ReportParams): Promise<ReportDoc> {
  const classCond = Prisma.sql`${p.classId ? Prisma.sql`AND st."classId" = ${p.classId}` : Prisma.empty} ${p.sectionId ? Prisma.sql`AND st."sectionId" = ${p.sectionId}` : Prisma.empty}`;
  const rows = await prisma.$queryRaw<Array<{ cid: string | null; cname: string | null; level: number | null; sid: string | null; sname: string | null; students: bigint; with_dues: bigint; billed: unknown; paid: unknown; overdue: unknown; upcoming: unknown }>>`
    WITH inv AS (
      SELECT i."studentId", i."totalAmount", i."paidAmount", i."dueAmount", i."dueDate"
      FROM "Invoice" i WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL AND i.status <> 'CANCELLED'
    )
    SELECT c.id AS cid, c.name AS cname, c.level, sec.id AS sid, sec.name AS sname,
      COUNT(DISTINCT st.id) AS students,
      COUNT(DISTINCT st.id) FILTER (WHERE inv."dueAmount" > 0 AND inv."dueDate" <= now()) AS with_dues,
      COALESCE(SUM(inv."totalAmount"), 0) AS billed, COALESCE(SUM(inv."paidAmount"), 0) AS paid,
      COALESCE(SUM(inv."dueAmount") FILTER (WHERE inv."dueDate" <= now()), 0) AS overdue,
      COALESCE(SUM(inv."dueAmount") FILTER (WHERE inv."dueDate" > now()), 0) AS upcoming
    FROM "Student" st
    LEFT JOIN inv ON inv."studentId" = st.id
    LEFT JOIN "Class" c ON c.id = st."classId"
    LEFT JOIN "Section" sec ON sec.id = st."sectionId"
    WHERE st."institutionId" = ${institutionId} AND st."deletedAt" IS NULL AND st.status = 'ACTIVE' ${classCond}
    GROUP BY c.id, c.name, c.level, sec.id, sec.name
    ORDER BY c.level NULLS LAST, c.name NULLS LAST, sec.name NULLS LAST`;
  const list = rows.map((r) => ({
    class: r.cname ?? 'No class',
    section: r.sname ?? '—',
    students: Number(r.students),
    withDues: Number(r.with_dues),
    billed: money(r.billed),
    collected: money(r.paid),
    overdue: money(r.overdue),
    upcoming: money(r.upcoming),
  }));
  const filters = [{ label: 'As of', value: new Date().toISOString().slice(0, 10) }];
  const cname = await className(institutionId, p.classId, p.sectionId);
  if (cname) filters.push({ label: 'Class', value: cname });
  return doc('outstanding', 'Outstanding dues by class and section', filters, [
    {
      columns: [
        { key: 'class', label: 'Class' },
        { key: 'section', label: 'Section' },
        { key: 'students', label: 'Students', type: 'number' },
        { key: 'withDues', label: 'With dues', type: 'number' },
        { key: 'billed', label: 'Billed', type: 'money' },
        { key: 'collected', label: 'Collected', type: 'money' },
        { key: 'overdue', label: 'Due now', type: 'money' },
        { key: 'upcoming', label: 'Not yet due', type: 'money' },
      ],
      rows: list,
      totals: {
        class: 'Total', students: list.reduce((s, r) => s + r.students, 0), withDues: list.reduce((s, r) => s + r.withDues, 0),
        billed: sumBy(list, 'billed'), collected: sumBy(list, 'collected'), overdue: sumBy(list, 'overdue'), upcoming: sumBy(list, 'upcoming'),
      },
    },
  ], ['Active students only. "Due now" = past the due date; cancelled and trashed invoices are excluded.']);
}

// ── 4. Concessions and waivers given ──────────────────────────────────────

async function concessions(institutionId: string, p: ReportParams): Promise<ReportDoc> {
  const { tz } = await institutionTz(institutionId);
  const { from, to } = dateRange(p, tz);
  const created = localDate(Prisma.sql`i."createdAt"`, tz);
  const classCond = Prisma.sql`${p.classId ? Prisma.sql`AND st."classId" = ${p.classId}` : Prisma.empty} ${p.sectionId ? Prisma.sql`AND st."sectionId" = ${p.sectionId}` : Prisma.empty}`;
  const discounts = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT to_char(${created}, 'YYYY-MM-DD') AS day, i."invoiceNo", st."studentId" AS code, st."firstName", st."lastName", c.name AS cls, sec.name AS sec,
      fc.name AS category, ii.description, ii.amount, ii.discount, ii."netAmount"
    FROM "InvoiceItem" ii JOIN "Invoice" i ON i.id = ii."invoiceId" JOIN "Student" st ON st.id = i."studentId"
    JOIN "FeeCategory" fc ON fc.id = ii."feeCategoryId"
    LEFT JOIN "Class" c ON c.id = st."classId" LEFT JOIN "Section" sec ON sec.id = st."sectionId"
    WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL AND ii.discount > 0
      AND ${created} BETWEEN ${from}::date AND ${to}::date ${classCond}
    ORDER BY i."createdAt" LIMIT ${ROW_CAP}`;
  const updated = localDate(Prisma.sql`i."updatedAt"`, tz);
  const cancelled = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT to_char(${updated}, 'YYYY-MM-DD') AS day, i."invoiceNo", st."studentId" AS code, st."firstName", st."lastName", c.name AS cls, sec.name AS sec,
      i."totalAmount", i."paidAmount", i.notes
    FROM "Invoice" i JOIN "Student" st ON st.id = i."studentId"
    LEFT JOIN "Class" c ON c.id = st."classId" LEFT JOIN "Section" sec ON sec.id = st."sectionId"
    WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL AND i.status = 'CANCELLED'
      AND ${updated} BETWEEN ${from}::date AND ${to}::date ${classCond}
    ORDER BY i."updatedAt" LIMIT ${ROW_CAP}`;

  const dRows = discounts.map((r) => ({
    date: r.day, invoiceNo: r.invoiceNo, student: nameOf(r.firstName as string, r.lastName as string), studentCode: r.code, class: classOf(r.cls as string, r.sec as string),
    category: r.category, description: r.description, gross: money(r.amount), discount: money(r.discount), net: money(r.netAmount),
  }));
  const cRows = cancelled.map((r) => ({
    date: r.day, invoiceNo: r.invoiceNo, student: nameOf(r.firstName as string, r.lastName as string), studentCode: r.code, class: classOf(r.cls as string, r.sec as string),
    amount: money(r.totalAmount), paid: money(r.paidAmount), notes: r.notes ?? '',
  }));
  const tables: ReportTable[] = [
    {
      title: 'Discounts and concessions on invoice lines',
      columns: [
        { key: 'date', label: 'Invoice date', type: 'date' }, { key: 'invoiceNo', label: 'Invoice', width: 1.2 }, { key: 'student', label: 'Student', width: 1.4 },
        { key: 'class', label: 'Class' }, { key: 'category', label: 'Category' }, { key: 'description', label: 'Description', width: 1.4 },
        { key: 'gross', label: 'Fee', type: 'money' }, { key: 'discount', label: 'Discount', type: 'money' }, { key: 'net', label: 'Charged', type: 'money' },
      ],
      rows: dRows,
      totals: { date: 'Total', gross: sumBy(dRows, 'gross'), discount: sumBy(dRows, 'discount'), net: sumBy(dRows, 'net') },
    },
    {
      title: 'Cancelled (waived) invoices',
      columns: [
        { key: 'date', label: 'Cancelled on', type: 'date' }, { key: 'invoiceNo', label: 'Invoice', width: 1.2 }, { key: 'student', label: 'Student', width: 1.4 },
        { key: 'class', label: 'Class' }, { key: 'amount', label: 'Invoice amount', type: 'money' }, { key: 'paid', label: 'Paid before cancel', type: 'money' },
        { key: 'notes', label: 'Notes', width: 1.6 },
      ],
      rows: cRows,
      totals: { date: 'Total', amount: sumBy(cRows, 'amount'), paid: sumBy(cRows, 'paid') },
    },
  ];
  const notes = ['"Cancelled on" is the date the invoice was last changed.'];
  if (await tableExists('FeeAdjustment')) {
    const at = localDate(Prisma.sql`a."createdAt"`, tz);
    const adj = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT to_char(${at}, 'YYYY-MM-DD') AS day, a.kind, a.amount, a.reason, i."invoiceNo", st."firstName", st."lastName", st."studentId" AS code,
        u."firstName" AS uf, u."lastName" AS ul
      FROM "FeeAdjustment" a
      LEFT JOIN "Invoice" i ON i.id = a."invoiceId"
      LEFT JOIN "Student" st ON st.id = a."studentId"
      LEFT JOIN "User" u ON u.id = a."actorUserId"
      WHERE a."institutionId" = ${institutionId} AND ${at} BETWEEN ${from}::date AND ${to}::date
        ${p.classId ? Prisma.sql`AND st."classId" = ${p.classId}` : Prisma.empty} ${p.sectionId ? Prisma.sql`AND st."sectionId" = ${p.sectionId}` : Prisma.empty}
      ORDER BY a."createdAt" LIMIT ${ROW_CAP}`;
    const aRows = adj.map((r) => ({
      date: r.day, kind: r.kind, invoiceNo: r.invoiceNo ?? '', student: nameOf(r.firstName as string, r.lastName as string), amount: money(r.amount), reason: r.reason,
      by: nameOf(r.uf as string, r.ul as string),
    }));
    tables.push({
      title: 'Adjustments log (cancels, counter discounts, fine waivers)',
      columns: [
        { key: 'date', label: 'Date', type: 'date' }, { key: 'kind', label: 'Type' }, { key: 'invoiceNo', label: 'Invoice', width: 1.2 }, { key: 'student', label: 'Student', width: 1.4 },
        { key: 'amount', label: 'Amount', type: 'money' }, { key: 'reason', label: 'Reason', width: 1.6 }, { key: 'by', label: 'By' },
      ],
      rows: aRows,
      totals: { date: 'Total', amount: sumBy(aRows, 'amount') },
    });
  }
  const filters = [{ label: 'From', value: from }, { label: 'To', value: to }];
  const cname = await className(institutionId, p.classId, p.sectionId);
  if (cname) filters.push({ label: 'Class', value: cname });
  return doc('concessions', 'Concessions and waivers given', filters, tables, notes);
}

// ── 5. Student yearly fee statement ───────────────────────────────────────

async function studentStatement(institutionId: string, p: ReportParams): Promise<ReportDoc> {
  if (!p.studentId) throw new BadRequestError('Pick a student');
  const { tz } = await institutionTz(institutionId);
  const { from, to } = monthParams(p, tz);
  const student = await prisma.student.findFirst({
    where: { id: p.studentId, institutionId },
    select: {
      id: true, studentId: true, firstName: true, lastName: true, rollNumber: true,
      class: { select: { name: true } }, section: { select: { name: true } },
      guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { firstName: true, lastName: true, phone: true } } } },
    },
  });
  if (!student) throw new NotFoundError('Student not found');
  const { join, month } = await invoiceMonthSql(tz);
  const inv = await prisma.$queryRaw<Array<{ id: string; m: string; invoiceNo: string; dueDate: Date; status: string; totalAmount: unknown; paidAmount: unknown; dueAmount: unknown; items: string | null }>>`
    SELECT i.id, ${month} AS m, i."invoiceNo", i."dueDate", i.status, i."totalAmount", i."paidAmount", i."dueAmount",
      (SELECT string_agg(ii.description, ', ' ORDER BY ii.id) FROM "InvoiceItem" ii WHERE ii."invoiceId" = i.id) AS items
    FROM "Invoice" i ${join}
    WHERE i."institutionId" = ${institutionId} AND i."studentId" = ${p.studentId} AND i."deletedAt" IS NULL
      AND ${month} BETWEEN ${from} AND ${to}
    ORDER BY 2, i."dueDate"`;
  const opening = await prisma.$queryRaw<Array<{ due: unknown }>>`
    SELECT SUM(i."dueAmount") AS due FROM "Invoice" i ${join}
    WHERE i."institutionId" = ${institutionId} AND i."studentId" = ${p.studentId} AND i."deletedAt" IS NULL AND i.status <> 'CANCELLED'
      AND ${month} < ${from}`;
  const ids = inv.map((i) => i.id);
  const pays = ids.length
    ? await prisma.payment.findMany({
        where: { invoiceId: { in: ids } },
        orderBy: { paidAt: 'asc' },
        select: { paidAt: true, receiptNo: true, method: true, amount: true, status: true, invoice: { select: { invoiceNo: true } } },
      })
    : [];
  const invRows = inv.map((i) => ({
    month: monthLabel(i.m), invoiceNo: i.invoiceNo, dueDate: i.dueDate.toISOString().slice(0, 10), items: i.items ?? '', status: i.status,
    billed: i.status === 'CANCELLED' ? 0 : money(i.totalAmount), paid: i.status === 'CANCELLED' ? 0 : money(i.paidAmount), due: i.status === 'CANCELLED' ? 0 : money(i.dueAmount),
  }));
  const payRows = pays.map((x) => ({
    date: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(x.paidAt), receiptNo: x.receiptNo ?? '', invoiceNo: x.invoice.invoiceNo, method: x.method, status: x.status, amount: money(x.amount),
  }));
  const g = student.guardians[0]?.guardian;
  const filters = [
    { label: 'Student', value: `${nameOf(student.firstName, student.lastName)} (${student.studentId})` },
    { label: 'Class', value: classOf(student.class?.name, student.section?.name) || '—' },
    { label: 'Roll', value: student.rollNumber ?? '—' },
    { label: 'Guardian', value: g ? `${nameOf(g.firstName, g.lastName)} ${g.phone ?? ''}`.trim() : '—' },
    { label: 'Period', value: `${monthLabel(from)} – ${monthLabel(to)}` },
  ];
  const completedPaid = fromPaisa(payRows.filter((r) => r.status === 'COMPLETED').reduce((s, r) => s + toPaisa(r.amount), 0));
  return doc('student-statement', 'Student fee statement', filters, [
    {
      title: 'Invoices',
      columns: [
        { key: 'month', label: 'Month' }, { key: 'invoiceNo', label: 'Invoice', width: 1.2 }, { key: 'dueDate', label: 'Due date', type: 'date' },
        { key: 'items', label: 'Fees', width: 2 }, { key: 'status', label: 'Status' },
        { key: 'billed', label: 'Billed', type: 'money' }, { key: 'paid', label: 'Paid', type: 'money' }, { key: 'due', label: 'Due', type: 'money' },
      ],
      rows: invRows,
      totals: { month: 'Total', billed: sumBy(invRows, 'billed'), paid: sumBy(invRows, 'paid'), due: sumBy(invRows, 'due') },
    },
    {
      title: 'Payments',
      columns: [
        { key: 'date', label: 'Date', type: 'date' }, { key: 'receiptNo', label: 'Receipt', width: 1.2 }, { key: 'invoiceNo', label: 'Invoice', width: 1.2 },
        { key: 'method', label: 'Method' }, { key: 'status', label: 'Status' }, { key: 'amount', label: 'Amount', type: 'money' },
      ],
      rows: payRows,
      totals: { date: 'Total received', amount: completedPaid },
    },
  ], [`Dues from before ${monthLabel(from)}: ${money(opening[0]?.due).toFixed(2)}. Cancelled invoices are listed with zero amounts.`]);
}

// ── 6. Late fines ──────────────────────────────────────────────────────────

async function lateFines(institutionId: string, p: ReportParams): Promise<ReportDoc> {
  const { tz } = await institutionTz(institutionId);
  const { from, to } = dateRange(p, tz);
  const classCond = Prisma.sql`${p.classId ? Prisma.sql`AND st."classId" = ${p.classId}` : Prisma.empty} ${p.sectionId ? Prisma.sql`AND st."sectionId" = ${p.sectionId}` : Prisma.empty}`;
  const filters = [{ label: 'From', value: from }, { label: 'To', value: to }];
  const cname = await className(institutionId, p.classId, p.sectionId);
  if (cname) filters.push({ label: 'Class', value: cname });
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Charged on', type: 'date' }, { key: 'invoiceNo', label: 'Invoice', width: 1.2 }, { key: 'student', label: 'Student', width: 1.4 },
    { key: 'class', label: 'Class' }, { key: 'invoiceStatus', label: 'Invoice status' },
    { key: 'fine', label: 'Fine', type: 'money' }, { key: 'waived', label: 'Waived', type: 'money' }, { key: 'net', label: 'Net fine', type: 'money' },
    { key: 'collected', label: 'Collected', type: 'money' },
  ];
  let rows: Array<Record<string, unknown>>;
  const notes: string[] = [];
  if (await tableExists('InvoiceFine')) {
    const at = localDate(Prisma.sql`f."createdAt"`, tz);
    const raw = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT to_char(${at}, 'YYYY-MM-DD') AS day, f.amount, f."waivedAmount", i."invoiceNo", i.status, i."totalAmount", i."paidAmount",
        st."firstName", st."lastName", c.name AS cls, sec.name AS sec
      FROM "InvoiceFine" f JOIN "Invoice" i ON i.id = f."invoiceId" JOIN "Student" st ON st.id = i."studentId"
      LEFT JOIN "Class" c ON c.id = st."classId" LEFT JOIN "Section" sec ON sec.id = st."sectionId"
      WHERE f."institutionId" = ${institutionId} AND f."fineKey" <> 'STOP' AND i."deletedAt" IS NULL
        AND ${at} BETWEEN ${from}::date AND ${to}::date ${classCond}
      ORDER BY f."createdAt" LIMIT ${ROW_CAP}`;
    rows = raw.map((r) => fineRow(r, toPaisa(r.amount), toPaisa(r.waivedAmount)));
  } else {
    // Before track P2's fine tables: lines billed under a "late fine" category.
    const created = localDate(Prisma.sql`i."createdAt"`, tz);
    const raw = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT to_char(${created}, 'YYYY-MM-DD') AS day, ii."netAmount" AS amount, i."invoiceNo", i.status, i."totalAmount", i."paidAmount",
        st."firstName", st."lastName", c.name AS cls, sec.name AS sec
      FROM "InvoiceItem" ii JOIN "FeeCategory" fc ON fc.id = ii."feeCategoryId" JOIN "Invoice" i ON i.id = ii."invoiceId"
      JOIN "Student" st ON st.id = i."studentId"
      LEFT JOIN "Class" c ON c.id = st."classId" LEFT JOIN "Section" sec ON sec.id = st."sectionId"
      WHERE i."institutionId" = ${institutionId} AND i."deletedAt" IS NULL
        AND (fc.name ~* '(late|fine|জরিমানা)' OR ii.description ~* '(late fee|late fine|জরিমানা)')
        AND ${created} BETWEEN ${from}::date AND ${to}::date ${classCond}
      ORDER BY i."createdAt" LIMIT ${ROW_CAP}`;
    rows = raw.map((r) => fineRow(r, toPaisa(r.amount), 0));
    notes.push('Fines are the invoice lines billed under a fee category or description containing "late" / "fine".');
  }
  notes.push('"Collected" = net fine × the share of its invoice that has been paid.');
  return doc('late-fines', 'Late fines', filters, [
    { columns, rows, totals: { date: 'Total', fine: sumBy(rows, 'fine'), waived: sumBy(rows, 'waived'), net: sumBy(rows, 'net'), collected: sumBy(rows, 'collected') } },
  ], notes);
}

function fineRow(r: Record<string, unknown>, finePaisa: number, waivedPaisa: number) {
  const net = Math.max(0, finePaisa - waivedPaisa);
  const total = toPaisa(r.totalAmount);
  const paid = toPaisa(r.paidAmount);
  const share = r.status === 'CANCELLED' ? 0 : total > 0 ? Math.min(1, paid / total) : 0;
  return {
    date: r.day, invoiceNo: r.invoiceNo, student: nameOf(r.firstName as string, r.lastName as string), class: classOf(r.cls as string, r.sec as string),
    invoiceStatus: r.status, fine: fromPaisa(finePaisa), waived: fromPaisa(waivedPaisa), net: fromPaisa(net), collected: fromPaisa(Math.round(net * share)),
  };
}

// ── 7. Payments reversed / refunded ───────────────────────────────────────

async function refunds(institutionId: string, p: ReportParams): Promise<ReportDoc> {
  const { tz } = await institutionTz(institutionId);
  const { from, to } = dateRange(p, tz);
  const tables: ReportTable[] = [];
  const notes: string[] = [];
  const hasRev = await tableExists('PaymentReversal');
  const hasRefund = await tableExists('FeeRefund');
  if (hasRev) {
    const at = localDate(Prisma.sql`r."createdAt"`, tz);
    const raw = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT to_char(${at}, 'YYYY-MM-DD') AS day, r.amount, r."appliedAmount", r.reason, p."receiptNo", p.method, i."invoiceNo",
        st."firstName", st."lastName", st."studentId" AS code, u."firstName" AS uf, u."lastName" AS ul
      FROM "PaymentReversal" r JOIN "Payment" p ON p.id = r."paymentId" JOIN "Invoice" i ON i.id = r."invoiceId"
      LEFT JOIN "Student" st ON st.id = r."studentId" LEFT JOIN "User" u ON u.id = r."reversedByUserId"
      WHERE r."institutionId" = ${institutionId} AND ${at} BETWEEN ${from}::date AND ${to}::date
      ORDER BY r."createdAt" LIMIT ${ROW_CAP}`;
    const rows = raw.map((r) => ({
      date: r.day, receiptNo: r.receiptNo ?? '', invoiceNo: r.invoiceNo, student: nameOf(r.firstName as string, r.lastName as string), method: r.method,
      amount: money(r.amount), applied: money(r.appliedAmount), reason: r.reason, by: nameOf(r.uf as string, r.ul as string),
    }));
    tables.push({
      title: 'Reversed payments',
      columns: [
        { key: 'date', label: 'Reversed on', type: 'date' }, { key: 'receiptNo', label: 'Receipt', width: 1.2 }, { key: 'invoiceNo', label: 'Invoice', width: 1.2 },
        { key: 'student', label: 'Student', width: 1.4 }, { key: 'method', label: 'Method' }, { key: 'amount', label: 'Payment', type: 'money' },
        { key: 'applied', label: 'Removed from invoice', type: 'money' }, { key: 'reason', label: 'Reason', width: 1.6 }, { key: 'by', label: 'By' },
      ],
      rows,
      totals: { date: 'Total', amount: sumBy(rows, 'amount'), applied: sumBy(rows, 'applied') },
    });
  }
  if (hasRefund) {
    const at = localDate(Prisma.sql`f."createdAt"`, tz);
    const raw = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT to_char(${at}, 'YYYY-MM-DD') AS day, f.source, f.amount, f.method, f.reference, f.reason, st."firstName", st."lastName",
        u."firstName" AS uf, u."lastName" AS ul
      FROM "FeeRefund" f LEFT JOIN "Student" st ON st.id = f."studentId" LEFT JOIN "User" u ON u.id = f."recordedByUserId"
      WHERE f."institutionId" = ${institutionId} AND ${at} BETWEEN ${from}::date AND ${to}::date
      ORDER BY f."createdAt" LIMIT ${ROW_CAP}`;
    const rows = raw.map((r) => ({
      date: r.day, student: nameOf(r.firstName as string, r.lastName as string), source: r.source, method: r.method, reference: r.reference ?? '',
      amount: money(r.amount), reason: r.reason, by: nameOf(r.uf as string, r.ul as string),
    }));
    tables.push({
      title: 'Refunds paid out',
      columns: [
        { key: 'date', label: 'Date', type: 'date' }, { key: 'student', label: 'Student', width: 1.4 }, { key: 'source', label: 'For' }, { key: 'method', label: 'Method' },
        { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'reason', label: 'Reason', width: 1.6 }, { key: 'by', label: 'By' },
      ],
      rows,
      totals: { date: 'Total', amount: sumBy(rows, 'amount') },
    });
  }
  // Payments marked REFUNDED / REVERSED without a reversal record (older data).
  const paid = localDate(Prisma.sql`p."paidAt"`, tz);
  const legacy = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT to_char(${paid}, 'YYYY-MM-DD') AS day, p."receiptNo", p.method, p.amount, p.status, i."invoiceNo", st."firstName", st."lastName"
    FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" JOIN "Student" st ON st.id = i."studentId"
    WHERE i."institutionId" = ${institutionId} AND p.status IN ('REFUNDED', 'REVERSED')
      ${hasRev ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "PaymentReversal" r WHERE r."paymentId" = p.id)` : Prisma.empty}
      AND ${paid} BETWEEN ${from}::date AND ${to}::date
    ORDER BY p."paidAt" LIMIT ${ROW_CAP}`;
  if (legacy.length || (!hasRev && !hasRefund)) {
    const rows = legacy.map((r) => ({
      date: r.day, receiptNo: r.receiptNo ?? '', invoiceNo: r.invoiceNo, student: nameOf(r.firstName as string, r.lastName as string), method: r.method, status: r.status, amount: money(r.amount),
    }));
    tables.push({
      title: 'Payments marked refunded / reversed',
      columns: [
        { key: 'date', label: 'Paid on', type: 'date' }, { key: 'receiptNo', label: 'Receipt', width: 1.2 }, { key: 'invoiceNo', label: 'Invoice', width: 1.2 },
        { key: 'student', label: 'Student', width: 1.4 }, { key: 'method', label: 'Method' }, { key: 'status', label: 'Status' }, { key: 'amount', label: 'Amount', type: 'money' },
      ],
      rows,
      totals: { date: 'Total', amount: sumBy(rows, 'amount') },
    });
  }
  if (!hasRev && !hasRefund) notes.push('Reversal and refund records are not available on this server yet — only payments marked refunded are shown.');
  return doc('refunds', 'Payments reversed and refunded', [{ label: 'From', value: from }, { label: 'To', value: to }], tables, notes);
}

// ── Dispatcher + filter options ───────────────────────────────────────────

export async function buildReport(institutionId: string, key: ReportKey, p: ReportParams): Promise<ReportDoc> {
  switch (key) {
    case 'cash-book':
      return cashBook(institutionId, p);
    case 'monthly-summary':
      return monthlySummary(institutionId, p);
    case 'outstanding':
      return outstanding(institutionId, p);
    case 'concessions':
      return concessions(institutionId, p);
    case 'student-statement':
      return studentStatement(institutionId, p);
    case 'late-fines':
      return lateFines(institutionId, p);
    case 'refunds':
      return refunds(institutionId, p);
    default:
      throw new BadRequestError('Unknown report');
  }
}

/** Classes/sections, fee categories, collectors and payment methods for filter dropdowns. */
export async function filterOptions(institutionId: string) {
  const [classes, categories, collectors, methods, years] = await Promise.all([
    prisma.class.findMany({
      where: { branch: { institutionId } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sections: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
    }),
    prisma.feeCategory.findMany({ where: { institutionId }, orderBy: { name: 'asc' }, select: { id: true, name: true, isActive: true } }),
    prisma.$queryRaw<Array<{ id: string; firstName: string; lastName: string; role: string }>>`
      SELECT DISTINCT u.id, u."firstName", u."lastName", u.role::text AS role
      FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" JOIN "User" u ON u.id = p."recordedBy"
      WHERE i."institutionId" = ${institutionId} AND u.role::text NOT IN ('STUDENT', 'GUARDIAN')
      ORDER BY u."firstName" LIMIT 200`,
    prisma.$queryRaw<Array<{ method: string }>>`
      SELECT DISTINCT p.method FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" WHERE i."institutionId" = ${institutionId} ORDER BY 1`,
    prisma.academicYear.findMany({ where: { institutionId }, orderBy: { startDate: 'desc' }, select: { id: true, label: true, startDate: true, endDate: true, isCurrent: true } }),
  ]);
  const { tz } = await institutionTz(institutionId);
  return {
    timeZone: tz,
    classes,
    categories,
    collectors: collectors.map((c) => ({ id: c.id, name: nameOf(c.firstName, c.lastName), role: c.role })),
    methods: [...new Set(['CASH', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'SSLCOMMERZ', ...methods.map((m) => m.method)])],
    sessions: years.map((y) => ({
      ...y,
      fromMonth: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(y.startDate).slice(0, 7),
      toMonth: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(y.endDate).slice(0, 7),
    })),
  };
}
