// =============================================================================
// AI module — computed insights: risk scoring, attendance patterns, fee risk,
// teacher workload, enrolment forecast, data clean-up. All numbers come from
// aggregate queries on the tenant's own data; the optional plain-language
// summaries go through runAi (Claude when configured, templates otherwise).
// =============================================================================

import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { isValidBdMobile } from '../../utils/phone';
import { runAi, GROUNDING_RULES, type AiCallContext } from './ai.client';
import * as repo from './ai.repository';
import {
  computeRiskScore,
  findConsecutiveAbsenceRuns,
  detectAttendanceDrop,
  classTrend,
  scoreFeeRisk,
  linearForecast,
  summarizeWorkload,
  findDuplicateStudents,
  smsInfo,
  DAY_MS,
  type RiskLevel,
  type WorkloadRow,
} from './ai.logic';
import {
  templateRiskExplanation,
  templateAttendanceSummary,
  templateFeeReminder,
  templateWorkloadSummary,
  templateForecastNarrative,
  smsNote,
  fmtBdt,
  fmtDay,
  type Lang,
  type Tone,
} from './ai.templates';
import type {
  RiskQueryDtoType,
  AttendancePatternQueryDtoType,
  FeeRiskQueryDtoType,
  WorkloadQueryDtoType,
} from './ai.dto';

export function paginate<T>(items: T[], page: number, pageSize: number) {
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length };
}

const levelCounts = (rows: { level: RiskLevel }[]) => ({
  HIGH: rows.filter((r) => r.level === 'HIGH').length,
  MEDIUM: rows.filter((r) => r.level === 'MEDIUM').length,
  LOW: rows.filter((r) => r.level === 'LOW').length,
  total: rows.length,
});

const matchesSearch = (s: { firstName: string; lastName: string; studentId: string }, search?: string) => {
  if (!search) return true;
  const q = search.toLowerCase();
  return `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q);
};

// ── 2. Academic risk scoring ────────────────────────────────────────────────

async function computeRiskRows(institutionId: string, opts: { days: number; classId?: string; sectionId?: string; studentIds?: string[] }) {
  const now = new Date();
  const since = new Date(now.getTime() - opts.days * DAY_MS);
  const students = await repo.findActiveStudents(institutionId, opts);
  // Restrict the aggregates to the chosen students only when a filter narrows the set.
  const scoped = opts.classId || opts.sectionId || opts.studentIds ? students.map((s) => s.id) : undefined;

  const [attendance, marks, dueByClass, subsByUser] = await Promise.all([
    repo.attendanceCountsByStudent(institutionId, since, new Date(now.getTime() + DAY_MS), scoped),
    repo.examPercentByStudent(institutionId, scoped),
    repo.dueAssignmentsByClassSection(institutionId, since, now),
    repo.submissionsByUser(institutionId, since, now),
  ]);

  return students.map((s) => {
    const a = attendance.get(s.id) ?? { total: 0, attended: 0, late: 0, absent: 0 };
    const due = dueByClass.get(repo.classSectionKey(s.class?.name, s.section?.name)) ?? 0;
    const submitted = s.userId ? subsByUser.get(s.userId) ?? 0 : 0;
    const risk = computeRiskScore({
      attendanceTotal: a.total,
      attendancePresent: a.attended,
      lateCount: a.late,
      averagePercent: marks.has(s.id) ? marks.get(s.id)! : null,
      assignmentsDue: due,
      assignmentsSubmitted: submitted,
    });
    return {
      // Legacy fields (unchanged names): studentId is the internal id.
      studentId: s.id,
      registrationNumber: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      attendanceRate: risk.attendanceRate,
      averageMarks: risk.averageMarks,
      riskLevel: risk.level,
      reason: risk.reason,
      // New fields
      score: risk.score,
      level: risk.level,
      factors: risk.factors,
      lateCount: a.late,
      missedAssignments: risk.missedAssignments,
      className: s.class?.name ?? null,
      sectionName: s.section?.name ?? null,
    };
  });
}

export async function getRiskScoring(institutionId: string, q: RiskQueryDtoType) {
  const all = (await computeRiskRows(institutionId, { days: q.days, classId: q.classId, sectionId: q.sectionId }))
    .filter((r) => matchesSearch({ firstName: r.firstName, lastName: r.lastName, studentId: r.registrationNumber }, q.search))
    .sort((a, b) => b.score - a.score || a.firstName.localeCompare(b.firstName));
  const summary = levelCounts(all);
  const filtered = q.level ? all.filter((r) => r.level === q.level) : all;
  const { items, total } = paginate(filtered, q.page, q.pageSize);
  return { items, total, summary, windowDays: q.days };
}

export async function explainRisk(ctx: AiCallContext, studentId: string, days = 120) {
  const [row] = await computeRiskRows(ctx.institutionId, { days, studentIds: [studentId] });
  if (!row) throw new NotFoundError('Student not found');

  // Only the factor numbers go to the model — no name or other identifiers.
  const prompt = [
    `Risk score: ${row.score}/100 (${row.level}).`,
    'Factors (contribution / max, value, detail):',
    ...row.factors.map((f) => `- ${f.label}: ${f.contribution}/${f.maxContribution}, ${f.value}. ${f.detail}`),
    'Explain in 3–4 sentences, for a teacher, why this score is what it is and suggest practical next steps. Refer to the child as "the student".',
  ].join('\n');

  const ai = await runAi(ctx, {
    feature: 'risk_explanation',
    system: `You explain a school's academic risk score to teachers in plain language. ${GROUNDING_RULES}`,
    prompt,
    demoText: templateRiskExplanation(row.firstName, row.score, row.level, row.factors),
    maxTokens: 400,
  });
  return { student: row, explanation: ai.text, demo: ai.demo, model: ai.model, aiError: ai.aiError };
}

// ── 3. Attendance patterns ──────────────────────────────────────────────────

export async function getAttendancePatterns(ctx: AiCallContext, q: AttendancePatternQueryDtoType) {
  const { institutionId } = ctx;
  const now = new Date();
  const tomorrow = new Date(now.getTime() + DAY_MS);
  const recentStart = new Date(now.getTime() - 14 * DAY_MS);
  const prevStart = new Date(now.getTime() - 44 * DAY_MS);
  const runWindow = new Date(now.getTime() - 30 * DAY_MS);

  const students = await repo.findActiveStudents(institutionId, { classId: q.classId });
  const scoped = q.classId ? students.map((s) => s.id) : undefined;
  const byId = new Map(students.map((s) => [s.id, s]));

  const [recent, previous, absentCounts] = await Promise.all([
    repo.attendanceCountsByStudent(institutionId, recentStart, tomorrow, scoped),
    repo.attendanceCountsByStudent(institutionId, prevStart, recentStart, scoped),
    repo.absentCountsSince(institutionId, runWindow, scoped),
  ]);

  // Only students with ≥3 absences in 30 days can have a 3-day run — fetch just their rows.
  const candidates = [...absentCounts.entries()].filter(([id, n]) => n >= 3 && byId.has(id)).map(([id]) => id);
  const rows = await repo.attendanceRowsFor(institutionId, candidates, runWindow);
  const rowsByStudent = new Map<string, { date: Date; status: string }[]>();
  for (const r of rows) rowsByStudent.set(r.studentId, [...(rowsByStudent.get(r.studentId) ?? []), r]);

  const studentInfo = (id: string) => {
    const s = byId.get(id)!;
    return {
      studentId: s.id,
      registrationNumber: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      className: s.class?.name ?? null,
      sectionName: s.section?.name ?? null,
    };
  };

  const consecutive = candidates
    .map((id) => {
      const runs = findConsecutiveAbsenceRuns(rowsByStudent.get(id) ?? [], 3);
      if (!runs.length) return null;
      const longest = runs.reduce((a, b) => (b.length > a.length || (b.length === a.length && b.ongoing) ? b : a));
      return { type: 'CONSECUTIVE' as const, ...studentInfo(id), run: longest, runCount: runs.length };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Number(b.run.ongoing) - Number(a.run.ongoing) || b.run.length - a.run.length);

  const drops = students
    .map((s) => {
      const p = previous.get(s.id);
      const r = recent.get(s.id);
      if (!p || !r) return null;
      const d = detectAttendanceDrop({ total: p.total, present: p.attended }, { total: r.total, present: r.attended });
      return d.isDrop ? { type: 'DROP' as const, ...studentInfo(s.id), previousRate: d.previousRate, recentRate: d.recentRate, delta: d.delta } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));

  // Class-level trend from the same per-student aggregates.
  const classAgg = new Map<string, { className: string; prev: { total: number; present: number }; recent: { total: number; present: number }; students: number }>();
  for (const s of students) {
    const name = s.class?.name ?? 'Unassigned';
    const agg = classAgg.get(name) ?? { className: name, prev: { total: 0, present: 0 }, recent: { total: 0, present: 0 }, students: 0 };
    agg.students += 1;
    const p = previous.get(s.id);
    const r = recent.get(s.id);
    if (p) {
      agg.prev.total += p.total;
      agg.prev.present += p.attended;
    }
    if (r) {
      agg.recent.total += r.total;
      agg.recent.present += r.attended;
    }
    classAgg.set(name, agg);
  }
  const classTrends = [...classAgg.values()]
    .map((c) => ({ className: c.className, students: c.students, ...classTrend(c.prev, c.recent) }))
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));

  const sum = (m: Map<string, { total: number; attended: number }>) =>
    [...m.values()].reduce((acc, v) => ({ total: acc.total + v.total, present: acc.present + v.attended }), { total: 0, present: 0 });
  const overall = classTrend(sum(previous), sum(recent));

  const all = q.type === 'CONSECUTIVE' ? consecutive : q.type === 'DROP' ? drops : [...consecutive, ...drops];
  const { items, total } = paginate<(typeof consecutive)[number] | (typeof drops)[number]>(all, q.page, q.pageSize);

  const counts = { consecutive: consecutive.length, drops: drops.length };
  let summary: { text: string; demo: boolean; model: string | null; aiError?: string } | null = null;
  if (q.summary) {
    const facts = {
      consecutiveCount: consecutive.length,
      dropCount: drops.length,
      decliningClasses: classTrends.filter((c) => c.direction === 'DECLINING').map((c) => c.className),
      improvingClasses: classTrends.filter((c) => c.direction === 'IMPROVING').map((c) => c.className),
      overallRecent: overall.recentRate,
      overallPrevious: overall.previousRate,
    };
    const ai = await runAi(ctx, {
      feature: 'attendance_summary',
      system: `You summarise school attendance patterns for administrators in 3–5 sentences with suggested actions. ${GROUNDING_RULES}`,
      prompt: `Attendance facts (last 14 days vs the previous 30 days):\n${JSON.stringify({ ...facts, classTrends: classTrends.map((c) => ({ className: c.className, direction: c.direction, recentRate: c.recentRate, previousRate: c.previousRate })) }, null, 2)}`,
      demoText: templateAttendanceSummary(facts),
      maxTokens: 500,
    });
    summary = { text: ai.text, demo: ai.demo, model: ai.model, aiError: ai.aiError };
  }

  return {
    items,
    total,
    counts,
    classTrends,
    overall,
    windows: { recentFrom: recentStart, previousFrom: prevStart, runWindowFrom: runWindow },
    summary,
  };
}

// ── 4. Fee risk ─────────────────────────────────────────────────────────────

async function computeFeeRows(institutionId: string, opts: { classId?: string; studentIds?: string[] }) {
  const now = new Date();
  const since = new Date(now.getTime() - 365 * DAY_MS);
  const students = await repo.findActiveStudents(institutionId, opts);
  const scoped = opts.classId || opts.studentIds ? students.map((s) => s.id) : undefined;
  const invoices = await repo.invoicesForRisk(institutionId, since, scoped);
  const byStudent = new Map<string, typeof invoices>();
  for (const inv of invoices) byStudent.set(inv.studentId, [...(byStudent.get(inv.studentId) ?? []), inv]);

  return students.map((s) => {
    const risk = scoreFeeRisk(
      (byStudent.get(s.id) ?? []).map((i) => ({
        dueDate: i.dueDate,
        status: i.status,
        totalAmount: Number(i.totalAmount),
        paidAmount: Number(i.paidAmount),
        dueAmount: Number(i.dueAmount),
        lastPaidAt: i.payments[0]?.paidAt ?? null,
      })),
      now,
    );
    return {
      studentId: s.id,
      registrationNumber: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      className: s.class?.name ?? null,
      sectionName: s.section?.name ?? null,
      ...risk,
    };
  });
}

export async function getFeeRisk(institutionId: string, q: FeeRiskQueryDtoType) {
  const all = (await computeFeeRows(institutionId, { classId: q.classId }))
    .filter((r) => r.outstandingAmount > 0)
    .filter((r) => matchesSearch({ firstName: r.firstName, lastName: r.lastName, studentId: r.registrationNumber }, q.search))
    .sort((a, b) => b.score - a.score || b.overdueAmount - a.overdueAmount);
  const summary = {
    ...levelCounts(all),
    totalOutstanding: Math.round(all.reduce((s, r) => s + r.outstandingAmount, 0)),
    totalOverdue: Math.round(all.reduce((s, r) => s + r.overdueAmount, 0)),
    remindToday: all.filter((r) => r.suggestedReminderDate && r.suggestedReminderDate.getTime() <= Date.now()).length,
  };
  const filtered = q.level ? all.filter((r) => r.level === q.level) : all;
  const { items, total } = paginate(filtered, q.page, q.pageSize);
  return { items, total, summary };
}

export async function draftFeeReminder(ctx: AiCallContext, studentId: string, language: Lang, tone: Tone) {
  const [row] = await computeFeeRows(ctx.institutionId, { studentIds: [studentId] });
  if (!row) throw new NotFoundError('Student not found');
  if (row.outstandingAmount <= 0) throw new ValidationError('This student has no outstanding dues to remind about');

  const institutionName = await repo.institutionName(ctx.institutionId);
  const overdue = row.overdueCount > 0;
  const dueDate = overdue ? null : row.nextDueDate;
  const amount = overdue ? row.overdueAmount : row.outstandingAmount;
  const demoText = templateFeeReminder({ institutionName, studentFirstName: row.firstName, amount, dueDate, overdue, language, tone });

  const limit = language === 'bn' ? 70 : 160;
  const ai = await runAi(ctx, {
    feature: 'fee_reminder',
    system:
      `You write short, polite SMS fee reminders from a school in Bangladesh to a guardian. ` +
      `Write in ${language === 'bn' ? 'Bangla' : 'English'}, ${tone} tone, at most ${limit} characters so it fits one SMS segment. ` +
      `Output only the SMS text. ${GROUNDING_RULES}`,
    prompt: [
      `School: ${institutionName}`,
      `Student first name: ${row.firstName}`,
      `Amount: ${fmtBdt(amount)}`,
      overdue ? `Status: overdue (oldest by ${row.oldestOverdueDays} days)` : `Status: due${dueDate ? ` by ${fmtDay(dueDate)}` : ''}`,
    ].join('\n'),
    demoText,
    maxTokens: 200,
    postProcess: (t) => t.replace(/^["']|["']$/g, '').trim(),
  });

  const draft = await prisma.aiDraft.create({
    data: {
      institutionId: ctx.institutionId,
      feature: 'fee_reminder',
      entityType: 'Student',
      entityId: row.studentId,
      content: ai.text,
      createdByUserId: ctx.userId!,
    },
  });
  const info = smsInfo(ai.text);
  return { draft, text: ai.text, sms: { ...info, note: smsNote(info) }, demo: ai.demo, model: ai.model, aiError: ai.aiError };
}

// ── 7. Teacher workload ─────────────────────────────────────────────────────

export async function getTeacherWorkload(ctx: AiCallContext, q: WorkloadQueryDtoType) {
  const { institutionId } = ctx;
  const now = new Date();
  const since = new Date(now.getTime() - 90 * DAY_MS);

  const [teachers, slots, assignments] = await Promise.all([
    prisma.teacher.findMany({
      where: { user: { institutionId, status: 'ACTIVE' } },
      select: { id: true, userId: true, employeeId: true, user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.timetableSlot.groupBy({
      by: ['teacherId', 'className', 'sectionName', 'subject'],
      where: { institutionId, teacherId: { not: null } },
      _count: { _all: true },
    }),
    prisma.assignment.groupBy({
      by: ['createdByUserId'],
      where: { institutionId, parentAssignmentId: null, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  // Exam for "marks pending": the requested one, else the latest that has started.
  const exam = q.examId
    ? await prisma.exam.findFirst({ where: { id: q.examId, institutionId }, select: { id: true, name: true } })
    : await prisma.exam.findFirst({ where: { institutionId, startDate: { lte: now } }, orderBy: { startDate: 'desc' }, select: { id: true, name: true } });
  if (q.examId && !exam) throw new NotFoundError('Exam not found');

  const studentsPerKey = new Map<string, number>();
  const enteredPerKeySubject = new Map<string, number>();
  if (exam) {
    const [students, results] = await Promise.all([
      repo.findActiveStudents(institutionId),
      prisma.examResult.findMany({ where: { institutionId, examId: exam.id }, select: { studentId: true, subject: true } }),
    ]);
    const keyOf = new Map<string, string>();
    for (const s of students) {
      const k = repo.classSectionKey(s.class?.name, s.section?.name);
      keyOf.set(s.id, k);
      studentsPerKey.set(k, (studentsPerKey.get(k) ?? 0) + 1);
    }
    for (const r of results) {
      const k = keyOf.get(r.studentId);
      if (!k) continue;
      const ks = `${k}#${r.subject.trim().toLowerCase()}`;
      enteredPerKeySubject.set(ks, (enteredPerKeySubject.get(ks) ?? 0) + 1);
    }
  }

  const assignmentsByUser = new Map(assignments.map((a) => [a.createdByUserId, a._count._all]));
  const perTeacher = new Map<string, { periods: number; sections: Set<string>; subjects: Set<string>; pending: number; units: { className: string; sectionName: string; subject: string; periods: number }[] }>();
  for (const s of slots) {
    if (!s.teacherId) continue;
    const t = perTeacher.get(s.teacherId) ?? { periods: 0, sections: new Set(), subjects: new Set(), pending: 0, units: [] };
    t.periods += s._count._all;
    const key = repo.classSectionKey(s.className, s.sectionName);
    t.sections.add(key);
    t.subjects.add(s.subject.trim().toLowerCase());
    t.units.push({ className: s.className, sectionName: s.sectionName, subject: s.subject, periods: s._count._all });
    if (exam) {
      const expected = studentsPerKey.get(key) ?? 0;
      const entered = enteredPerKeySubject.get(`${key}#${s.subject.trim().toLowerCase()}`) ?? 0;
      t.pending += Math.max(0, expected - entered);
    }
    perTeacher.set(s.teacherId, t);
  }

  const rows = teachers
    .map((t) => {
      const w = perTeacher.get(t.id);
      return {
        teacherId: t.id,
        userId: t.userId,
        employeeId: t.employeeId,
        name: `${t.user.firstName} ${t.user.lastName}`.trim(),
        periodsPerWeek: w?.periods ?? 0,
        sectionsTaught: w?.sections.size ?? 0,
        subjectsTaught: w?.subjects.size ?? 0,
        assignmentsCreated: assignmentsByUser.get(t.userId) ?? 0,
        marksPending: w?.pending ?? 0,
        teaching: w?.units ?? [],
      };
    })
    .sort((a, b) => b.periodsPerWeek - a.periodsPerWeek || a.name.localeCompare(b.name));

  const stats = summarizeWorkload(rows as WorkloadRow[]);
  const nameOf = new Map(rows.map((r) => [r.teacherId, r.name]));
  const flagged = rows.map((r) => ({
    ...r,
    loadFlag: stats.overloaded.includes(r.teacherId) ? 'HIGH' : stats.underloaded.includes(r.teacherId) ? 'LOW' : 'NORMAL',
  }));
  const { items, total } = paginate(flagged, q.page, q.pageSize);

  let summary: { text: string; demo: boolean; model: string | null; aiError?: string } | null = null;
  if (q.summary) {
    const facts = {
      teacherCount: stats.teacherCount,
      avgPeriods: stats.avgPeriods,
      maxPeriods: stats.maxPeriods,
      minPeriods: stats.minPeriods,
      overloadedNames: stats.overloaded.map((id) => nameOf.get(id)!.split(' ')[0]),
      underloadedNames: stats.underloaded.map((id) => nameOf.get(id)!.split(' ')[0]),
      totalMarksPending: stats.totalMarksPending,
    };
    const ai = await runAi(ctx, {
      feature: 'teacher_workload',
      system: `You summarise teacher workload for a school administrator in 3–4 sentences and suggest rebalancing where useful. ${GROUNDING_RULES}`,
      prompt: `Workload facts (periods per week from the timetable; marks pending for exam "${exam?.name ?? 'none'}"):\n${JSON.stringify(facts, null, 2)}`,
      demoText: templateWorkloadSummary(facts),
      maxTokens: 400,
    });
    summary = { text: ai.text, demo: ai.demo, model: ai.model, aiError: ai.aiError };
  }

  return { items, total, stats: { ...stats, overloaded: stats.overloaded.length, underloaded: stats.underloaded.length }, exam, summary };
}

// ── 8. Enrolment forecast ───────────────────────────────────────────────────

export async function getEnrolmentForecast(ctx: AiCallContext, narrative?: boolean) {
  const { institutionId } = ctx;
  const currentYear = new Date().getFullYear();
  const targetYear = currentYear + 1;
  const [rows, classes] = await Promise.all([repo.admissionsByYearAndClass(institutionId), repo.institutionClasses(institutionId)]);
  const valid = rows.filter((r) => r.year <= currentYear);
  const firstYear = valid.length ? Math.min(...valid.map((r) => r.year)) : currentYear;
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i);

  const series = (filter: (r: (typeof valid)[number]) => boolean) =>
    years.map((y) => ({ year: y, count: valid.filter((r) => r.year === y && filter(r)).reduce((s, r) => s + r.count, 0) }));

  const totalHistory = valid.length ? series(() => true) : [];
  const total = { history: totalHistory, ...linearForecast(totalHistory.map((p) => ({ x: p.year, y: p.count })), targetYear) };

  const classNames = new Map(classes.map((c) => [c.id, c.name]));
  const classIds = [...new Set(valid.map((r) => r.classId))];
  const perClass = classIds
    .map((cid) => {
      const history = series((r) => r.classId === cid);
      const f = linearForecast(history.map((p) => ({ x: p.year, y: p.count })), targetYear);
      return {
        classId: cid,
        className: cid ? classNames.get(cid) ?? 'Unknown class' : 'No class assigned',
        history,
        ...f,
        trend: f.slope > 0.5 ? 'UP' : f.slope < -0.5 ? 'DOWN' : 'FLAT',
      };
    })
    .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));

  const disclaimer =
    'Statistical estimate from a straight-line trend of past admissions (by admission year). Classes reflect each student’s current class record, so older years may be attributed to the class the student is in now. ' +
    `${currentYear} is counted to date.`;

  let narrativeOut: { text: string; demo: boolean; model: string | null; aiError?: string } | null = null;
  if (narrative) {
    const lastFull = totalHistory.length ? totalHistory[totalHistory.length - 1].count : null;
    const facts = {
      targetYear,
      total: { forecast: total.forecast, low: total.low, high: total.high, confidence: total.confidence, n: total.n },
      lastYearTotal: lastFull,
      growing: perClass.filter((c) => c.trend === 'UP').map((c) => c.className),
      shrinking: perClass.filter((c) => c.trend === 'DOWN').map((c) => c.className),
    };
    const ai = await runAi(ctx, {
      feature: 'enrolment_forecast',
      system: `You explain a school's statistical enrolment forecast to its administrators in 3–4 sentences. Always say it is an estimate. ${GROUNDING_RULES}`,
      prompt: `Forecast facts:\n${JSON.stringify({ ...facts, history: totalHistory }, null, 2)}`,
      demoText: templateForecastNarrative(facts),
      maxTokens: 400,
    });
    narrativeOut = { text: ai.text, demo: ai.demo, model: ai.model, aiError: ai.aiError };
  }

  return { targetYear, method: 'linear-trend', disclaimer, total, classes: perClass, narrative: narrativeOut };
}

// ── 12. Data clean-up suggestions ───────────────────────────────────────────

export async function getDataCleanup(institutionId: string, page: number, pageSize: number) {
  const [students, guardians] = await Promise.all([
    prisma.student.findMany({
      where: { institutionId, status: 'ACTIVE' },
      select: {
        id: true,
        studentId: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        guardians: { select: { guardian: { select: { phone: true } } } },
      },
    }),
    prisma.guardian.findMany({
      where: { institutionId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        students: { select: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } } },
      },
    }),
  ]);

  const info = new Map(
    students.map((s) => [
      s.id,
      {
        id: s.id,
        registrationNumber: s.studentId,
        name: `${s.firstName} ${s.lastName}`.trim(),
        dateOfBirth: s.dateOfBirth,
        className: s.class?.name ?? null,
        sectionName: s.section?.name ?? null,
        guardianCount: s.guardians.length,
      },
    ]),
  );

  const groups = findDuplicateStudents(
    students.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      dateOfBirth: s.dateOfBirth,
      guardianPhones: s.guardians.map((g) => g.guardian.phone).filter(Boolean),
    })),
  ).map((g, i) => ({ id: `dup-${i + 1}`, ...g, students: g.studentIds.map((id) => info.get(id)!) }));

  const missingGuardian = students
    .filter((s) => s.guardians.length === 0)
    .map((s) => info.get(s.id)!)
    .sort((a, b) => a.name.localeCompare(b.name));

  const badPhone = guardians
    .filter((g) => !isValidBdMobile(g.phone))
    .map((g) => ({
      id: g.id,
      name: `${g.firstName} ${g.lastName}`.trim(),
      phone: g.phone || null,
      issue: g.phone?.trim() ? 'INVALID' : 'MISSING',
      students: g.students.map((x) => ({ id: x.student.id, registrationNumber: x.student.studentId, name: `${x.student.firstName} ${x.student.lastName}`.trim() })),
    }));

  return {
    duplicates: paginate(groups, page, pageSize),
    studentsMissingGuardian: paginate(missingGuardian, page, pageSize),
    guardiansMissingPhone: paginate(badPhone, page, pageSize),
    page,
    pageSize,
  };
}
