// =============================================================================
// AI module — generation features: report comments (single + bulk into the
// review queue), the AiDraft review queue itself, communication drafting,
// dashboard insight summaries and AI status/usage.
// =============================================================================

import { AiDraftStatus, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { computeGrade } from '../../utils/grading';
import { logger } from '../../utils/logger';
import { getAiConfig, activeProvider, runAi, GROUNDING_RULES, type AiCallContext } from './ai.client';
import { embeddingsConfigured } from './ai.embeddings';
import { smsInfo } from './ai.logic';
import * as repo from './ai.repository';
import {
  templateComment,
  templateDashboardSummary,
  templateMessageDraft,
  smsNote,
  type DashboardFacts,
} from './ai.templates';
import type { GenerateCommentDtoType, BulkCommentsDtoType, DraftQueryDtoType, DraftMessageDtoType } from './ai.dto';

export interface Requester {
  sub: string;
  role: string;
}

// ── 1. Report-card comments ─────────────────────────────────────────────────

const COMMENT_SYSTEM =
  'You write short report-card comments for a school in Bangladesh. Write 1–2 encouraging, specific, professional sentences ' +
  'about the student\'s performance in the subject, with one practical suggestion when the result is weak. ' +
  'Refer to the child as "the student". Output only the comment. ' +
  GROUNDING_RULES;

function commentPrompt(subject: string, marks: number, grade: string, maxMarks: number | undefined, language: 'en' | 'bn') {
  return [
    `Subject: ${subject}`,
    `Marks: ${marks}${maxMarks ? ` out of ${maxMarks}` : ''}`,
    `Grade: ${grade}`,
    `Language: ${language === 'bn' ? 'Bangla' : 'English'}`,
  ].join('\n');
}

const tidyComment = (t: string) => t.replace(/^["'“]|["'”]$/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);

/** POST /ai/comment — same response fields as before, plus demo/model. */
export async function generateComment(ctx: AiCallContext, data: GenerateCommentDtoType) {
  const { subject, marks, grade, maxMarks } = data;
  const language = data.language ?? 'en';
  const ai = await runAi(ctx, {
    feature: 'report_comment',
    system: COMMENT_SYSTEM,
    prompt: commentPrompt(subject, marks, grade, maxMarks, language),
    demoText: templateComment(subject, marks, grade, maxMarks),
    maxTokens: 200,
    postProcess: tidyComment,
  });
  return {
    subject,
    marks,
    grade,
    comment: ai.text,
    generatedAt: new Date(),
    demo: ai.demo,
    model: ai.model,
    ...(ai.aiError ? { aiError: ai.aiError } : {}),
  };
}

const BULK_LIMIT = 150;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** POST /ai/comments/bulk — drafts a comment per exam result into the review queue. */
export async function bulkGenerateComments(ctx: AiCallContext, data: BulkCommentsDtoType) {
  const { institutionId } = ctx;
  const exam = await prisma.exam.findFirst({ where: { id: data.examId, institutionId }, select: { id: true, name: true } });
  if (!exam) throw new NotFoundError('Exam not found');
  const cls = await prisma.class.findFirst({ where: { id: data.classId, branch: { institutionId } }, select: { id: true } });
  if (!cls) throw new NotFoundError('Class not found');
  if (data.sectionId) {
    const sec = await prisma.section.findFirst({ where: { id: data.sectionId, classId: data.classId }, select: { id: true } });
    if (!sec) throw new NotFoundError('Section not found in this class');
  }

  const results = await prisma.examResult.findMany({
    where: {
      institutionId,
      examId: exam.id,
      student: { classId: data.classId, ...(data.sectionId ? { sectionId: data.sectionId } : {}) },
      ...(data.subject ? { subject: data.subject } : {}),
    },
    select: { id: true, subject: true, marksObtained: true, maxMarks: true, grade: true, remarks: true },
    orderBy: [{ subject: 'asc' }],
  });

  const existing = await prisma.aiDraft.findMany({
    where: { institutionId, feature: 'report_comment', entityType: 'ExamResult', status: AiDraftStatus.DRAFT, entityId: { in: results.map((r) => r.id) } },
    select: { entityId: true },
  });
  const hasDraft = new Set(existing.map((d) => d.entityId));

  const skipped = { existingDraft: 0, hasRemarks: 0, overLimit: 0 };
  const eligible = results.filter((r) => {
    if (hasDraft.has(r.id)) {
      skipped.existingDraft++;
      return false;
    }
    if (!data.overwrite && r.remarks?.trim()) {
      skipped.hasRemarks++;
      return false;
    }
    return true;
  });
  const batch = eligible.slice(0, BULK_LIMIT);
  skipped.overLimit = eligible.length - batch.length;

  let demo = !getAiConfig().configured;
  let aiError: string | undefined;
  const generated = await mapWithConcurrency(batch, 4, async (r) => {
    const marks = Number(r.marksObtained);
    const max = Number(r.maxMarks);
    const grade = r.grade || computeGrade(marks, max);
    const ai = await runAi(ctx, {
      feature: 'report_comment',
      system: COMMENT_SYSTEM,
      prompt: commentPrompt(r.subject, marks, grade, max, data.language),
      demoText: templateComment(r.subject, marks, grade, max),
      maxTokens: 200,
      postProcess: tidyComment,
    });
    if (ai.demo) demo = true;
    if (ai.aiError) aiError = ai.aiError;
    return { entityId: r.id, content: ai.text };
  });

  if (generated.length) {
    await prisma.aiDraft.createMany({
      data: generated.map((g) => ({
        institutionId,
        feature: 'report_comment',
        entityType: 'ExamResult',
        entityId: g.entityId,
        content: g.content,
        createdByUserId: ctx.userId!,
      })),
    });
  }

  return { exam, created: generated.length, skipped, totalResults: results.length, demo, ...(aiError ? { aiError } : {}) };
}

// ── AiDraft review queue ────────────────────────────────────────────────────

const ADMIN_ROLES = new Set<string>([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
/** Features whose drafts come from guardians/the public — admins review these. */
const ADMIN_ONLY_FEATURES = new Set(['guardian_chat']);

function draftScope(institutionId: string, requester: Requester): Prisma.AiDraftWhereInput {
  if (ADMIN_ROLES.has(requester.role)) return { institutionId };
  return { institutionId, createdByUserId: requester.sub, feature: { notIn: [...ADMIN_ONLY_FEATURES] } };
}

export async function listDrafts(institutionId: string, requester: Requester, q: DraftQueryDtoType) {
  const where: Prisma.AiDraftWhereInput = {
    ...draftScope(institutionId, requester),
    ...(q.status ? { status: q.status } : {}),
    ...(q.feature ? { feature: q.feature } : {}),
  };
  const [drafts, total, counts] = await Promise.all([
    prisma.aiDraft.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.aiDraft.count({ where }),
    prisma.aiDraft.groupBy({ by: ['status'], where: draftScope(institutionId, requester), _count: { _all: true } }),
  ]);

  return { items: await enrichDrafts(institutionId, drafts), total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
}

type DraftRow = Awaited<ReturnType<typeof prisma.aiDraft.findMany>>[number];

/** Adds the context a reviewer needs (student, subject/marks, guardian question). */
async function enrichDrafts<T extends DraftRow>(institutionId: string, drafts: T[]) {
  const ids = (type: string) => drafts.filter((d) => d.entityType === type && d.entityId).map((d) => d.entityId!);
  const [results, students, interactions] = await Promise.all([
    ids('ExamResult').length
      ? prisma.examResult.findMany({
          where: { institutionId, id: { in: ids('ExamResult') } },
          select: {
            id: true,
            subject: true,
            marksObtained: true,
            maxMarks: true,
            grade: true,
            remarks: true,
            exam: { select: { name: true } },
            student: { select: { id: true, firstName: true, lastName: true, studentId: true } },
          },
        })
      : [],
    ids('Student').length
      ? prisma.student.findMany({ where: { institutionId, id: { in: ids('Student') } }, select: { id: true, firstName: true, lastName: true, studentId: true } })
      : [],
    ids('AiInteraction').length
      ? prisma.aiInteraction.findMany({
          where: { institutionId, id: { in: ids('AiInteraction') } },
          select: { id: true, prompt: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
        })
      : [],
  ]);
  const r = new Map(results.map((x) => [x.id, x]));
  const s = new Map(students.map((x) => [x.id, x]));
  const i = new Map(interactions.map((x) => [x.id, x]));

  return drafts.map((d) => {
    let context: Record<string, unknown> | null = null;
    if (d.entityType === 'ExamResult' && d.entityId && r.has(d.entityId)) {
      const x = r.get(d.entityId)!;
      context = {
        kind: 'examResult',
        exam: x.exam.name,
        subject: x.subject,
        marks: Number(x.marksObtained),
        maxMarks: Number(x.maxMarks),
        grade: x.grade,
        currentRemarks: x.remarks,
        student: { id: x.student.id, name: `${x.student.firstName} ${x.student.lastName}`.trim(), registrationNumber: x.student.studentId },
      };
    } else if (d.entityType === 'Student' && d.entityId && s.has(d.entityId)) {
      const x = s.get(d.entityId)!;
      context = { kind: 'student', student: { id: x.id, name: `${x.firstName} ${x.lastName}`.trim(), registrationNumber: x.studentId } };
    } else if (d.entityType === 'AiInteraction' && d.entityId && i.has(d.entityId)) {
      const x = i.get(d.entityId)!;
      context = { kind: 'guardianQuestion', question: x.prompt, askedAt: x.createdAt, askedBy: `${x.user.firstName} ${x.user.lastName}`.trim() };
    } else if (d.entityType && ['SMS', 'EMAIL', 'NOTICE'].includes(d.entityType)) {
      context = { kind: 'message', channel: d.entityType, ...(d.entityType === 'SMS' ? { sms: smsInfo(d.content) } : {}) };
    }
    return { ...d, context };
  });
}

async function getDraftForAction(institutionId: string, requester: Requester, id: string) {
  const draft = await prisma.aiDraft.findFirst({ where: { id, institutionId } });
  if (!draft) throw new NotFoundError('Draft not found');
  if (!ADMIN_ROLES.has(requester.role) && (draft.createdByUserId !== requester.sub || ADMIN_ONLY_FEATURES.has(draft.feature))) {
    throw new ForbiddenError('You can only review drafts you created');
  }
  return draft;
}

export async function editDraft(institutionId: string, requester: Requester, id: string, content: string) {
  const draft = await getDraftForAction(institutionId, requester, id);
  if (draft.status !== AiDraftStatus.DRAFT) throw new ValidationError('Only drafts awaiting review can be edited');
  return prisma.aiDraft.update({ where: { id: draft.id }, data: { content } });
}

/**
 * Approve. Side effects by feature:
 *   - report_comment → writes the text into ExamResult.remarks → PUBLISHED
 *   - guardian_chat  → the reply becomes visible to the guardian → PUBLISHED
 *   - everything else (SMS/email/notice/fee reminder text) → APPROVED; staff
 *     send it through the normal communication tools.
 */
export async function approveDraft(institutionId: string, requester: Requester, id: string, content?: string) {
  const draft = await getDraftForAction(institutionId, requester, id);
  if (draft.status !== AiDraftStatus.DRAFT) throw new ValidationError('This draft has already been reviewed');
  const finalContent = content ?? draft.content;
  let status: AiDraftStatus = AiDraftStatus.APPROVED;

  if (draft.feature === 'report_comment' && draft.entityType === 'ExamResult' && draft.entityId) {
    const res = await prisma.examResult.updateMany({ where: { id: draft.entityId, institutionId }, data: { remarks: finalContent } });
    if (res.count === 0) throw new NotFoundError('The exam result for this comment no longer exists');
    status = AiDraftStatus.PUBLISHED;
  } else if (draft.feature === 'guardian_chat') {
    status = AiDraftStatus.PUBLISHED;
  }

  return prisma.aiDraft.update({
    where: { id: draft.id },
    data: { content: finalContent, status, reviewedByUserId: requester.sub, reviewedAt: new Date() },
  });
}

export async function rejectDraft(institutionId: string, requester: Requester, id: string) {
  const draft = await getDraftForAction(institutionId, requester, id);
  if (draft.status !== AiDraftStatus.DRAFT) throw new ValidationError('This draft has already been reviewed');
  return prisma.aiDraft.update({
    where: { id: draft.id },
    data: { status: AiDraftStatus.REJECTED, reviewedByUserId: requester.sub, reviewedAt: new Date() },
  });
}

// ── 5. Communication drafting ───────────────────────────────────────────────

export async function draftMessage(ctx: AiCallContext, data: DraftMessageDtoType) {
  const institutionName = await repo.institutionName(ctx.institutionId);
  const demo = templateMessageDraft({ ...data, institutionName });
  const langName = data.language === 'bn' ? 'Bangla' : 'English';
  const channelRules =
    data.channel === 'SMS'
      ? `Write a single SMS in ${langName}, at most ${data.language === 'bn' ? 70 : 160} characters if possible (one segment). Output only the SMS text.`
      : data.channel === 'EMAIL'
        ? `Write an email in ${langName}. First line: "Subject: <subject>", then a blank line, then the body (under 180 words), signed with the school name.`
        : `Write a notice-board announcement in ${langName}. First line: "Subject: <title>", then a blank line, then the notice body (under 150 words).`;

  const ai = await runAi(ctx, {
    feature: 'message_draft',
    system: `You draft school communications for a school in Bangladesh. Use a ${data.tone} tone. ${channelRules} ${GROUNDING_RULES}`,
    prompt: [`School: ${institutionName}`, `Audience: ${data.audience}`, `Purpose: ${data.purpose}`, data.details ? `Details: ${data.details}` : null]
      .filter(Boolean)
      .join('\n'),
    demoText: demo.subject ? `Subject: ${demo.subject}\n\n${demo.body}` : demo.body,
    maxTokens: 600,
  });

  let subject: string | null = null;
  let body = ai.text.trim();
  const m = body.match(/^subject:\s*(.+)\n+/i);
  if (m) {
    subject = m[1].trim();
    body = body.slice(m[0].length).trim();
  }

  const draft = await prisma.aiDraft.create({
    data: {
      institutionId: ctx.institutionId,
      feature: 'message_draft',
      entityType: data.channel,
      content: subject ? `Subject: ${subject}\n\n${body}` : body,
      createdByUserId: ctx.userId!,
    },
  });

  const info = data.channel === 'SMS' ? smsInfo(body) : null;
  return {
    draft,
    channel: data.channel,
    subject,
    body,
    sms: info ? { ...info, note: smsNote(info) } : null,
    demo: ai.demo,
    model: ai.model,
    ...(ai.aiError ? { aiError: ai.aiError } : {}),
  };
}

// ── 6. Dashboard insights ───────────────────────────────────────────────────

const insightCache = new Map<string, { at: number; value: unknown }>();
const INSIGHT_TTL_MS = 10 * 60 * 1000;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.debug('AI: optional aggregate unavailable', { error: (error as Error).message });
    return fallback;
  }
}

export async function getDashboardInsights(ctx: AiCallContext, refresh = false) {
  const { institutionId } = ctx;
  const cached = insightCache.get(institutionId);
  // Real-model summaries are cached per institution so every dashboard load doesn't cost an API call.
  if (!refresh && cached && Date.now() - cached.at < INSIGHT_TTL_MS && getAiConfig().configured) return cached.value;

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [studentCount, staffCount, openAgg, overdueCount, noticesCount, att30, present30, att60, present60, collected, newAdmissions, pendingDrafts] =
    await Promise.all([
      prisma.student.count({ where: { institutionId, status: 'ACTIVE' } }),
      prisma.staffProfile.count({ where: { institutionId, status: 'ACTIVE' } }),
      prisma.invoice.aggregate({ where: { institutionId, status: { in: ['UNPAID', 'PARTIAL'] } }, _sum: { dueAmount: true }, _count: { _all: true } }),
      prisma.invoice.count({ where: { institutionId, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, dueDate: { lt: now } } }),
      prisma.notice.count({ where: { institutionId, isActive: true } }),
      prisma.attendance.count({ where: { institutionId, date: { gte: d30 } } }),
      prisma.attendance.count({ where: { institutionId, date: { gte: d30 }, status: { in: ['PRESENT', 'LATE'] } } }),
      prisma.attendance.count({ where: { institutionId, date: { gte: d60, lt: d30 } } }),
      prisma.attendance.count({ where: { institutionId, date: { gte: d60, lt: d30 }, status: { in: ['PRESENT', 'LATE'] } } }),
      prisma.payment.aggregate({ where: { invoice: { institutionId }, status: 'COMPLETED', paidAt: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.student.count({ where: { institutionId, admissionDate: { gte: monthStart } } }),
      safe(() => prisma.aiDraft.count({ where: { institutionId, status: AiDraftStatus.DRAFT } }), null as number | null),
    ]);

  const rate = (p: number, t: number) => (t > 0 ? Math.round((p / t) * 1000) / 10 : null);
  const facts: DashboardFacts = {
    studentCount,
    staffCount,
    totalOutstandingDue: Number(openAgg._sum.dueAmount ?? 0),
    unpaidInvoiceCount: openAgg._count._all,
    overdueInvoiceCount: overdueCount,
    noticesCount,
    attendanceAvg: rate(present30, att30),
    attendancePrevAvg: rate(present60, att60),
    collectedThisMonth: Number(collected._sum.amount ?? 0),
    newAdmissionsThisMonth: newAdmissions,
    pendingDrafts,
  };

  const ai = await runAi(ctx, {
    feature: 'dashboard_insights',
    system:
      'You write a short executive summary of a school\'s current state for its administrators. Use exactly this format: ' +
      'one line "Executive Summary for Institution:", then 4–7 lines starting with "- " stating key facts, then a blank line, ' +
      'a line "Recommendations:", then 2–4 numbered lines like "1. Title: advice". Money is in BDT. ' +
      GROUNDING_RULES,
    prompt: `School facts (attendance rates are PRESENT+LATE over recorded days; null = no records):\n${JSON.stringify(facts, null, 2)}`,
    demoText: templateDashboardSummary(facts),
    maxTokens: 700,
  });

  const value = {
    // Legacy fields — unchanged names and meaning.
    studentCount,
    staffCount,
    totalOutstandingDue: facts.totalOutstandingDue,
    summary: ai.text,
    generatedAt: new Date(),
    statistics: {
      attendanceAvg: facts.attendanceAvg ?? 0,
      attendancePrevAvg: facts.attendancePrevAvg,
      unpaidInvoiceCount: facts.unpaidInvoiceCount,
      overdueInvoiceCount: facts.overdueInvoiceCount,
      collectedThisMonth: facts.collectedThisMonth,
      newAdmissionsThisMonth: facts.newAdmissionsThisMonth,
      noticesCount,
      pendingDrafts,
      hasAttendanceData: facts.attendanceAvg !== null,
    },
    demo: ai.demo,
    model: ai.model,
    ...(ai.aiError ? { aiError: ai.aiError } : {}),
  };
  if (!ai.demo) insightCache.set(institutionId, { at: Date.now(), value });
  return value;
}

// ── Status & usage ──────────────────────────────────────────────────────────

export async function getStatus(institutionId: string) {
  const cfg = getAiConfig();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const usage = await safe(async () => {
    const [calls, demoCalls, tokens] = await Promise.all([
      prisma.usageRecord.aggregate({ where: { institutionId, metric: 'AI_CALL', createdAt: { gte: monthStart } }, _sum: { quantity: true } }),
      prisma.aiInteraction.count({ where: { institutionId, isDemo: true, createdAt: { gte: monthStart } } }),
      prisma.aiInteraction.aggregate({ where: { institutionId, createdAt: { gte: monthStart } }, _sum: { inputTokens: true, outputTokens: true } }),
    ]);
    return {
      since: monthStart,
      calls: calls._sum.quantity ?? 0,
      demoCalls,
      inputTokens: tokens._sum.inputTokens ?? 0,
      outputTokens: tokens._sum.outputTokens ?? 0,
    };
  }, null);
  const pendingDrafts = await safe(() => prisma.aiDraft.count({ where: { institutionId, status: AiDraftStatus.DRAFT } }), null as number | null);
  const active = activeProvider(cfg);
  return {
    configured: cfg.configured,
    demo: !cfg.configured,
    /** Provider the next request will try first (Anthropic → Gemini), or null in demo mode. */
    provider: active?.provider ?? null,
    model: active ? `${active.provider}:${active.model}` : null,
    providers: {
      anthropic: { configured: cfg.anthropicConfigured, coolingDown: cfg.anthropicCoolingDown, model: cfg.anthropicConfigured ? cfg.model : null },
      gemini: { configured: cfg.geminiConfigured, model: cfg.geminiConfigured ? cfg.geminiModel : null },
    },
    semanticSearch: embeddingsConfigured(),
    usage,
    pendingDrafts,
  };
}
