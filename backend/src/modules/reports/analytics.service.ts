// Read-only analytics over invoices/payments, attendance and exam results.
// Every query is tenant-scoped (institutionId) and runs through the role
// scope in analytics.scope.ts. Aggregation happens in analytics.logic.ts.
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { getDefaultScale } from '../grading/grading.resolver';
import { buildClassAnalytics, type ResultRow } from '../results/results.insights.logic';
import {
  addStatus,
  allocatePaymentsByHead,
  attendanceRate,
  bucketKey,
  buildAging,
  collectionRate,
  emptyCounts,
  findChronicAbsentees,
  fromDateKey,
  addDays,
  mergeCounts,
  paginate,
  rangeInstants,
  resolveGranularity,
  resolveRange,
  round2,
  seriesKeys,
  toDateKey,
  weekdayPattern,
  type DateRange,
  type InvoiceHeadLine,
  type StatusCounts,
} from './analytics.logic';
import { chunk, institutionClock, resolveStudentWhere, teacherSectionIds, type Requester } from './analytics.scope';
import type {
  AcademicQueryDtoType,
  AttendanceQueryDtoType,
  ChronicQueryDtoType,
  DefaultersQueryDtoType,
  FilterFieldsType,
  FinanceQueryDtoType,
} from './analytics.dto';

const OUTSTANDING_STATUSES = ['UNPAID', 'PARTIAL', 'OVERDUE'];

function rangeOrThrow(filters: Pick<FilterFieldsType, 'from' | 'to' | 'preset'>, todayKey: string): DateRange {
  try {
    return resolveRange(filters, todayKey);
  } catch (err) {
    throw new BadRequestError((err as Error).message);
  }
}

async function context(institutionId: string, requester: Requester, filters: FilterFieldsType) {
  const clock = await institutionClock(institutionId);
  const range = rangeOrThrow(filters, clock.todayKey);
  const studentWhere = await resolveStudentWhere(institutionId, requester, filters);
  return { clock, range, studentWhere };
}

const studentName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`.trim();

// ── Filter options ───────────────────────────────────────────────────────────

/** Branches, sessions, classes/sections and exams the requester may filter by. */
export async function getFilterOptions(institutionId: string, requester: Requester) {
  const isTeacher = requester.role === UserRole.TEACHER;
  const allowedSections = isTeacher ? await teacherSectionIds(institutionId, requester.sub) : null;
  const showExams = requester.role !== UserRole.ACCOUNTANT;

  const [branches, academicYears, classes, exams] = await Promise.all([
    prisma.branch.findMany({
      where: { institutionId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.academicYear.findMany({
      where: { institutionId },
      select: { id: true, label: true, isCurrent: true, startDate: true, endDate: true },
      orderBy: { startDate: 'desc' },
    }),
    prisma.class.findMany({
      where: {
        branch: { institutionId },
        ...(allowedSections ? { sections: { some: { id: { in: Array.from(allowedSections) } } } } : {}),
      },
      select: {
        id: true,
        name: true,
        level: true,
        branchId: true,
        sections: {
          where: allowedSections ? { id: { in: Array.from(allowedSections) } } : undefined,
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    }),
    showExams
      ? prisma.exam.findMany({
          where: { institutionId },
          select: { id: true, name: true, startDate: true, endDate: true },
          orderBy: { startDate: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  return { branches, academicYears, classes, exams, teacherScoped: isTeacher };
}

// ── Finance ──────────────────────────────────────────────────────────────────

async function invoiceLines(invoiceIds: string[]): Promise<Map<string, InvoiceHeadLine[]>> {
  const map = new Map<string, InvoiceHeadLine[]>();
  for (const ids of chunk(invoiceIds)) {
    const rows = await prisma.invoiceItem.findMany({
      where: { invoiceId: { in: ids } },
      select: { invoiceId: true, netAmount: true, feeCategory: { select: { id: true, name: true } } },
    });
    for (const r of rows) {
      const line = { headId: r.feeCategory.id, headName: r.feeCategory.name, netAmount: Number(r.netAmount) };
      const list = map.get(r.invoiceId);
      if (list) list.push(line);
      else map.set(r.invoiceId, [line]);
    }
  }
  return map;
}

export async function getFinanceAnalytics(institutionId: string, requester: Requester, q: FinanceQueryDtoType) {
  const { clock, range, studentWhere } = await context(institutionId, requester, q);
  const granularity = resolveGranularity(range, q.granularity);
  const instants = rangeInstants(range, clock.offset);
  const dueWindow = { gte: fromDateKey(range.from), lt: fromDateKey(addDays(range.to, 1)) };

  const invoiceScope: Prisma.InvoiceWhereInput = { institutionId, student: studentWhere };
  const billableScope: Prisma.InvoiceWhereInput = { ...invoiceScope, status: { not: 'CANCELLED' } };

  const [payments, dueInRange, billedByHead, outstanding] = await Promise.all([
    prisma.payment.findMany({
      where: { status: 'COMPLETED', paidAt: instants, invoice: invoiceScope },
      select: { invoiceId: true, amount: true, method: true, paidAt: true },
    }),
    prisma.invoice.aggregate({
      where: { ...billableScope, dueDate: dueWindow },
      _sum: { totalAmount: true, paidAmount: true, dueAmount: true },
      _count: { _all: true },
    }),
    prisma.invoiceItem.groupBy({
      by: ['feeCategoryId'],
      where: { invoice: { ...billableScope, dueDate: dueWindow } },
      _sum: { netAmount: true },
    }),
    prisma.invoice.findMany({
      where: { ...invoiceScope, status: { in: OUTSTANDING_STATUSES }, dueAmount: { gt: 0 } },
      select: { dueAmount: true, dueDate: true, studentId: true },
    }),
  ]);

  const numericPayments = payments.map((p) => ({ ...p, amount: Number(p.amount) }));

  // Collections over time.
  const series = new Map(seriesKeys(range, granularity).map((k) => [k, { amount: 0, count: 0 }]));
  for (const p of numericPayments) {
    const b = series.get(bucketKey(p.paidAt, granularity, clock.offset));
    if (b) {
      b.amount += p.amount;
      b.count += 1;
    }
  }
  const collections = Array.from(series.entries()).map(([period, v]) => ({ period, amount: round2(v.amount), count: v.count }));

  // By payment method.
  const methods = new Map<string, { amount: number; count: number }>();
  for (const p of numericPayments) {
    const key = p.method || 'UNKNOWN';
    const m = methods.get(key) ?? { amount: 0, count: 0 };
    m.amount += p.amount;
    m.count += 1;
    methods.set(key, m);
  }
  const byMethod = Array.from(methods.entries())
    .map(([method, v]) => ({ method, amount: round2(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  // By fee head: collections allocated pro-rata to invoice lines, plus billed.
  const lines = await invoiceLines(Array.from(new Set(numericPayments.map((p) => p.invoiceId))));
  const collectedByHead = allocatePaymentsByHead(numericPayments, lines);
  const headIds = billedByHead.map((b) => b.feeCategoryId);
  const heads = headIds.length
    ? await prisma.feeCategory.findMany({ where: { institutionId, id: { in: headIds } }, select: { id: true, name: true } })
    : [];
  const headName = new Map(heads.map((h) => [h.id, h.name]));
  for (const c of collectedByHead) if (!headName.has(c.id)) headName.set(c.id, c.name);
  const feeHeadIds = new Set([...headIds, ...collectedByHead.map((c) => c.id)]);
  const byFeeHead = Array.from(feeHeadIds)
    .map((id) => {
      const billed = Number(billedByHead.find((b) => b.feeCategoryId === id)?._sum.netAmount ?? 0);
      const collected = collectedByHead.find((c) => c.id === id)?.amount ?? 0;
      return { id, name: headName.get(id) ?? 'Unknown', billed: round2(billed), collected };
    })
    .sort((a, b) => b.collected - a.collected || b.billed - a.billed);

  // Aging snapshot as of today.
  const aging = buildAging(
    outstanding.map((o) => ({ dueAmount: Number(o.dueAmount), dueDate: o.dueDate })),
    clock.todayKey,
  );
  const todayStart = fromDateKey(clock.todayKey);
  const defaulterCount = new Set(outstanding.filter((o) => o.dueDate < todayStart).map((o) => o.studentId)).size;

  const billed = Number(dueInRange._sum.totalAmount ?? 0);
  const collectedAgainstDue = Number(dueInRange._sum.paidAmount ?? 0);
  const totalCollected = round2(numericPayments.reduce((s, p) => s + p.amount, 0));

  return {
    range,
    granularity,
    kpis: {
      totalCollected,
      paymentsCount: numericPayments.length,
      billedDueInRange: round2(billed),
      collectedAgainstDue: round2(collectedAgainstDue),
      outstandingDueInRange: round2(Number(dueInRange._sum.dueAmount ?? 0)),
      invoicesDueInRange: dueInRange._count._all,
      collectionRate: collectionRate(collectedAgainstDue, billed),
      totalOutstanding: aging.totalOutstanding,
      totalOverdue: aging.totalOverdue,
      defaulterCount,
    },
    collections,
    byMethod,
    byFeeHead,
    aging,
  };
}

/** Students with overdue balances, largest first (paginated). */
export async function getTopDefaulters(institutionId: string, requester: Requester, q: DefaultersQueryDtoType) {
  const clock = await institutionClock(institutionId);
  const studentWhere = await resolveStudentWhere(institutionId, requester, q);
  const todayStart = fromDateKey(clock.todayKey);

  const groups = await prisma.invoice.groupBy({
    by: ['studentId'],
    where: {
      institutionId,
      student: studentWhere,
      status: { in: OUTSTANDING_STATUSES },
      dueAmount: { gt: 0 },
      dueDate: { lt: todayStart },
    },
    _sum: { dueAmount: true },
    _count: { _all: true },
    _min: { dueDate: true },
  });

  const ranked = groups
    .map((g) => ({
      studentId: g.studentId,
      overdueAmount: round2(Number(g._sum.dueAmount ?? 0)),
      overdueInvoices: g._count._all,
      oldestDueDate: g._min.dueDate ? toDateKey(g._min.dueDate) : null,
    }))
    .sort((a, b) => b.overdueAmount - a.overdueAmount || a.studentId.localeCompare(b.studentId));
  const page = paginate(ranked, q.page, q.pageSize);

  const students = page.items.length
    ? await prisma.student.findMany({
        where: { institutionId, id: { in: page.items.map((i) => i.studentId) } },
        select: {
          id: true,
          studentId: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
          phone: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      })
    : [];
  const byId = new Map(students.map((s) => [s.id, s]));

  return {
    asOf: clock.todayKey,
    items: page.items.map((i) => {
      const s = byId.get(i.studentId);
      return {
        id: i.studentId,
        ...i,
        studentCode: s?.studentId ?? null,
        name: s ? studentName(s) : 'Unknown student',
        rollNumber: s?.rollNumber ?? null,
        phone: s?.phone ?? null,
        className: s?.class?.name ?? null,
        sectionName: s?.section?.name ?? null,
        daysOverdue: i.oldestDueDate
          ? Math.max(0, Math.round((todayStart.getTime() - fromDateKey(i.oldestDueDate).getTime()) / 86400000))
          : 0,
      };
    }),
    meta: page.meta,
  };
}

// ── Attendance ───────────────────────────────────────────────────────────────

async function loadAttendance(institutionId: string, requester: Requester, q: FilterFieldsType) {
  const { range, studentWhere } = await context(institutionId, requester, q);
  const where: Prisma.AttendanceWhereInput = {
    institutionId,
    date: { gte: fromDateKey(range.from), lt: fromDateKey(addDays(range.to, 1)) },
    student: studentWhere,
  };
  const [daily, perStudent] = await Promise.all([
    prisma.attendance.groupBy({ by: ['date', 'status'], where, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ['studentId', 'status'], where, _count: { _all: true } }),
  ]);

  const dailyCounts = new Map<string, StatusCounts>();
  for (const g of daily) {
    const key = toDateKey(g.date);
    addStatus(dailyCounts.get(key) ?? dailyCounts.set(key, emptyCounts()).get(key)!, g.status, g._count._all);
  }
  const studentCounts = new Map<string, StatusCounts>();
  for (const g of perStudent) {
    addStatus(studentCounts.get(g.studentId) ?? studentCounts.set(g.studentId, emptyCounts()).get(g.studentId)!, g.status, g._count._all);
  }
  return { range, dailyCounts, studentCounts };
}

async function studentPlacement(institutionId: string, ids: string[]) {
  const map = new Map<
    string,
    {
      id: string;
      studentId: string;
      firstName: string;
      lastName: string;
      rollNumber: string | null;
      class: { id: string; name: string } | null;
      section: { id: string; name: string } | null;
    }
  >();
  for (const part of chunk(ids)) {
    const rows = await prisma.student.findMany({
      where: { institutionId, id: { in: part } },
      select: {
        id: true,
        studentId: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    });
    for (const r of rows) map.set(r.id, r);
  }
  return map;
}

export async function getAttendanceAnalytics(institutionId: string, requester: Requester, q: AttendanceQueryDtoType) {
  const { range, dailyCounts, studentCounts } = await loadAttendance(institutionId, requester, q);

  const trend = seriesKeys(range, 'day').map((date) => {
    const c = dailyCounts.get(date) ?? emptyCounts();
    return { date, ...c, rate: attendanceRate(c) };
  });

  const placement = await studentPlacement(institutionId, Array.from(studentCounts.keys()));
  const groups = new Map<string, { classId: string | null; className: string; sectionId: string | null; sectionName: string | null; students: number; counts: StatusCounts }>();
  let overall = emptyCounts();
  for (const [studentId, counts] of studentCounts) {
    overall = mergeCounts(overall, counts);
    const s = placement.get(studentId);
    const key = `${s?.class?.id ?? 'none'}:${s?.section?.id ?? 'none'}`;
    const g = groups.get(key) ?? {
      classId: s?.class?.id ?? null,
      className: s?.class?.name ?? 'Unassigned',
      sectionId: s?.section?.id ?? null,
      sectionName: s?.section?.name ?? null,
      students: 0,
      counts: emptyCounts(),
    };
    g.students += 1;
    g.counts = mergeCounts(g.counts, counts);
    groups.set(key, g);
  }
  const byClass = Array.from(groups.entries())
    .map(([id, g]) => ({ id, classId: g.classId, className: g.className, sectionId: g.sectionId, sectionName: g.sectionName, students: g.students, ...g.counts, rate: attendanceRate(g.counts) }))
    .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || (a.sectionName ?? '').localeCompare(b.sectionName ?? ''));

  const chronic = findChronicAbsentees(
    Array.from(studentCounts.entries()).map(([studentId, counts]) => ({ studentId, counts })),
    q.threshold,
    q.minDays,
  );
  const recordedDays = trend.filter((t) => t.total > 0);

  return {
    range,
    kpis: {
      rate: attendanceRate(overall),
      records: overall.total,
      present: overall.present,
      absent: overall.absent,
      late: overall.late,
      halfDay: overall.halfDay,
      studentsCounted: studentCounts.size,
      daysRecorded: recordedDays.length,
      chronicAbsentees: chronic.length,
      threshold: q.threshold,
      minDays: q.minDays,
    },
    trend,
    byClass,
    weekday: weekdayPattern(recordedDays.map((t) => ({ date: t.date, counts: t }))),
  };
}

export async function getChronicAbsentees(institutionId: string, requester: Requester, q: ChronicQueryDtoType) {
  const { range, studentCounts } = await loadAttendance(institutionId, requester, q);
  const chronic = findChronicAbsentees(
    Array.from(studentCounts.entries()).map(([studentId, counts]) => ({ studentId, counts })),
    q.threshold,
    q.minDays,
  );
  const page = paginate(chronic, q.page, q.pageSize);
  const placement = await studentPlacement(institutionId, page.items.map((c) => c.studentId));
  return {
    range,
    threshold: q.threshold,
    minDays: q.minDays,
    items: page.items.map((c) => {
      const s = placement.get(c.studentId);
      return {
        id: c.studentId,
        studentId: c.studentId,
        studentCode: s?.studentId ?? null,
        name: s ? studentName(s) : 'Unknown student',
        rollNumber: s?.rollNumber ?? null,
        className: s?.class?.name ?? null,
        sectionName: s?.section?.name ?? null,
        ...c.counts,
        absenceRate: c.absenceRate,
        attendanceRate: attendanceRate(c.counts),
      };
    }),
    meta: page.meta,
  };
}

// ── Academic ─────────────────────────────────────────────────────────────────

const TREND_EXAMS = 12;

export async function getAcademicAnalytics(institutionId: string, requester: Requester, q: AcademicQueryDtoType) {
  const studentWhere = await resolveStudentWhere(institutionId, requester, q);

  // Exams in the window: explicit from/to (or preset) on the exam start date,
  // else the chosen session's dates, else all exams.
  const examWhere: Prisma.ExamWhereInput = { institutionId };
  if (q.from || q.to || (q.preset && q.preset !== 'custom')) {
    const clock = await institutionClock(institutionId);
    const range = rangeOrThrow(q, clock.todayKey);
    examWhere.startDate = { gte: fromDateKey(range.from), lt: fromDateKey(addDays(range.to, 1)) };
  } else if (q.academicYearId) {
    const year = await prisma.academicYear.findFirst({
      where: { id: q.academicYearId, institutionId },
      select: { startDate: true, endDate: true },
    });
    if (!year) throw new NotFoundError('Academic year not found');
    examWhere.startDate = { gte: year.startDate, lte: year.endDate };
  }

  const exams = await prisma.exam.findMany({
    where: examWhere,
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { startDate: 'desc' },
    take: 100,
  });

  let selected: (typeof exams)[number] | null = exams[0] ?? null;
  if (q.examId) {
    const found =
      exams.find((e) => e.id === q.examId) ??
      (await prisma.exam.findFirst({
        where: { id: q.examId, institutionId },
        select: { id: true, name: true, startDate: true, endDate: true },
      }));
    if (!found) throw new NotFoundError('Exam not found');
    selected = found;
  }

  const trendExams = exams.slice(0, TREND_EXAMS);
  if (selected && !trendExams.some((e) => e.id === selected!.id)) trendExams.push(selected);
  const scale = await getDefaultScale(institutionId);
  const bands = scale?.bands ?? null;
  const scaleInfo = scale
    ? { id: scale.id, name: scale.name, isFallback: false }
    : { id: null, name: 'Bangladesh standard (built-in)', isFallback: true };

  if (!selected || trendExams.length === 0) {
    return { exam: null, exams, scale: scaleInfo, overall: null, byClass: [], subjects: [], gradeDistribution: [], subjectGradeDistribution: [], trend: [] };
  }

  const results = await prisma.examResult.findMany({
    where: { institutionId, examId: { in: trendExams.map((e) => e.id) }, student: studentWhere },
    select: {
      examId: true,
      studentId: true,
      subject: true,
      marksObtained: true,
      maxMarks: true,
      student: { select: { class: { select: { id: true, name: true } }, section: { select: { id: true, name: true } } } },
    },
  });

  const rowsByExam = new Map<string, Array<ResultRow & { classKey: string; className: string; sectionName: string | null }>>();
  for (const r of results) {
    const row = {
      studentId: r.studentId,
      subject: r.subject,
      marksObtained: Number(r.marksObtained),
      maxMarks: Number(r.maxMarks),
      classKey: `${r.student.class?.id ?? 'none'}:${r.student.section?.id ?? 'none'}`,
      className: r.student.class?.name ?? 'Unassigned',
      sectionName: r.student.section?.name ?? null,
    };
    const list = rowsByExam.get(r.examId);
    if (list) list.push(row);
    else rowsByExam.set(r.examId, [row]);
  }

  const selectedRows = rowsByExam.get(selected.id) ?? [];
  const overall = buildClassAnalytics(selectedRows, bands);

  const classGroups = new Map<string, typeof selectedRows>();
  for (const r of selectedRows) {
    const list = classGroups.get(r.classKey);
    if (list) list.push(r);
    else classGroups.set(r.classKey, [r]);
  }
  const byClass = Array.from(classGroups.entries())
    .map(([id, rows]) => {
      const a = buildClassAnalytics(rows, bands);
      return {
        id,
        className: rows[0].className,
        sectionName: rows[0].sectionName,
        students: a.studentsWithResults,
        passCount: a.passCount,
        failCount: a.failCount,
        passRate: a.passRate,
        averagePercent: a.averagePercent,
        averageGpa: a.averageGpa,
        highestPercent: a.highestPercent,
      };
    })
    .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || (a.sectionName ?? '').localeCompare(b.sectionName ?? ''));

  const trend = [...trendExams]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((e) => {
      const a = buildClassAnalytics(rowsByExam.get(e.id) ?? [], bands);
      return {
        examId: e.id,
        name: e.name,
        startDate: toDateKey(e.startDate),
        students: a.studentsWithResults,
        passRate: a.studentsWithResults > 0 ? a.passRate : null,
        averagePercent: a.studentsWithResults > 0 ? a.averagePercent : null,
        averageGpa: a.studentsWithResults > 0 ? a.averageGpa : null,
      };
    });

  return {
    exam: { ...selected, startDate: toDateKey(selected.startDate), endDate: toDateKey(selected.endDate) },
    exams: exams.map((e) => ({ id: e.id, name: e.name, startDate: toDateKey(e.startDate) })),
    scale: scaleInfo,
    overall: {
      studentsWithResults: overall.studentsWithResults,
      passCount: overall.passCount,
      failCount: overall.failCount,
      passRate: overall.passRate,
      averagePercent: overall.averagePercent,
      highestPercent: overall.highestPercent,
      lowestPercent: overall.lowestPercent,
      averageGpa: overall.averageGpa,
    },
    byClass,
    subjects: overall.subjectAverages.map((s) => ({ id: s.subject, ...s })),
    gradeDistribution: overall.gradeDistribution,
    subjectGradeDistribution: overall.subjectGradeDistribution,
    trend,
  };
}
