// =============================================================================
// AI module — knowledge base (KnowledgeDocument CRUD), staff knowledge
// assistant, guardian support chatbot and the public admission assistant.
//
// Answers come ONLY from the institution's own KnowledgeDocuments and records.
// Guardian rule: direct factual lookups (fees, attendance, results, routine,
// holidays, notices) are answered immediately from school records by rules —
// no model involved. Anything open-ended is drafted into an AiDraft and a
// staff member reviews it before the guardian sees a reply.
// =============================================================================

import { AiDraftStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/AppError';
import { isValidBdMobile, normalizeBdMobile } from '../../utils/phone';
import { logger } from '../../utils/logger';
import { visibilityFor } from '../notices/notices.service';
import { getAiConfig, logAiCall, runAi, type AiCallContext } from './ai.client';
import {
  classifyGuardianIntent,
  extractAge,
  matchClassName,
  recommendClassForAge,
  DAY_MS,
  type GuardianIntent,
} from './ai.logic';
import { rankDocumentsSmart } from './ai.embeddings';
import { formatDocsForPrompt, NO_INFO_ANSWER, type RankedDoc } from './ai.retrieval';
import { templateKnowledgeAnswer, fmtBdt, fmtDay } from './ai.templates';
import * as repo from './ai.repository';
import type { KnowledgeQueryDtoType, AdmissionAssistantDtoType } from './ai.dto';

// ── Knowledge documents CRUD ────────────────────────────────────────────────

export async function listKnowledge(institutionId: string, q: KnowledgeQueryDtoType) {
  const where: Prisma.KnowledgeDocumentWhereInput = {
    institutionId,
    ...(q.category ? { category: { equals: q.category, mode: 'insensitive' } } : {}),
    ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
    ...(q.search
      ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { content: { contains: q.search, mode: 'insensitive' } }] }
      : {}),
  };
  const [items, total, categories] = await Promise.all([
    prisma.knowledgeDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.knowledgeDocument.count({ where }),
    prisma.knowledgeDocument.groupBy({ by: ['category'], where: { institutionId }, _count: { _all: true } }),
  ]);
  return {
    items,
    total,
    categories: categories.map((c) => ({ category: c.category, count: c._count._all })),
  };
}

export async function createKnowledge(
  institutionId: string,
  userId: string,
  data: { title: string; content: string; category?: string | null; isActive: boolean },
) {
  return prisma.knowledgeDocument.create({
    data: {
      institutionId,
      createdByUserId: userId,
      title: data.title,
      content: data.content,
      category: data.category?.trim().toLowerCase() || null,
      isActive: data.isActive,
    },
  });
}

async function getKnowledgeOrThrow(institutionId: string, id: string) {
  const doc = await prisma.knowledgeDocument.findFirst({ where: { id, institutionId } });
  if (!doc) throw new NotFoundError('Knowledge document not found');
  return doc;
}

export async function updateKnowledge(
  institutionId: string,
  id: string,
  data: { title?: string; content?: string; category?: string | null; isActive?: boolean },
) {
  await getKnowledgeOrThrow(institutionId, id);
  return prisma.knowledgeDocument.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.category !== undefined ? { category: data.category?.trim().toLowerCase() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export async function deleteKnowledge(institutionId: string, id: string) {
  await getKnowledgeOrThrow(institutionId, id);
  await prisma.knowledgeDocument.delete({ where: { id } });
}

async function activeDocs(institutionId: string, category?: string) {
  return prisma.knowledgeDocument.findMany({
    where: { institutionId, isActive: true, ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}) },
    select: { id: true, title: true, content: true, category: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
}

const citationsOf = (ranked: RankedDoc[]) =>
  ranked.map((r) => ({ id: r.doc.id, title: r.doc.title, category: r.doc.category ?? null, score: r.score, excerpt: r.excerpt }));

function knowledgeSystem(audience: string) {
  return (
    `You are a help assistant for a school, answering ${audience}. Answer ONLY using the documents provided in the user message. ` +
    `Cite the document titles you used in square brackets, e.g. [Admission Policy]. ` +
    `If the documents do not contain the answer, reply exactly: "${NO_INFO_ANSWER}" ` +
    'Never guess, never use outside knowledge, never invent fees, dates or rules. Keep answers under 120 words, plain text.'
  );
}

// ── 9. Staff knowledge assistant ────────────────────────────────────────────

export async function askKnowledge(ctx: AiCallContext, question: string) {
  const docs = await activeDocs(ctx.institutionId);
  const { ranked, method: retrieval } = await rankDocumentsSmart(question, docs, 3);
  if (ranked.length === 0) {
    await logAiCall(ctx, { feature: 'knowledge_ask', prompt: question, response: NO_INFO_ANSWER, isDemo: !getAiConfig().configured, status: 'SUCCESS' });
    return { answer: NO_INFO_ANSWER, found: false, citations: [], demo: !getAiConfig().configured, model: null, documentCount: docs.length, retrieval };
  }
  const ai = await runAi(ctx, {
    feature: 'knowledge_ask',
    system: knowledgeSystem('school staff'),
    prompt: `<documents>\n${formatDocsForPrompt(ranked)}\n</documents>\n\nQuestion: ${question}`,
    demoText: templateKnowledgeAnswer(ranked),
    maxTokens: 500,
  });
  return {
    answer: ai.text,
    found: !ai.text.startsWith(NO_INFO_ANSWER),
    citations: citationsOf(ranked),
    demo: ai.demo,
    model: ai.model,
    documentCount: docs.length,
    retrieval,
    ...(ai.aiError ? { aiError: ai.aiError } : {}),
  };
}

// ── 10. Guardian support chatbot ────────────────────────────────────────────

export const GUARDIAN_LABEL = 'AI assistant — answers based on school records';
export const QUEUED_ANSWER = 'A staff member will review and reply.';

type Child = { id: string; firstName: string; className: string | null; sectionName: string | null };

async function linkedChildren(institutionId: string, userId: string): Promise<Child[]> {
  const guardian = await prisma.guardian.findFirst({
    where: { institutionId, userId },
    select: {
      students: {
        select: {
          student: {
            select: { id: true, firstName: true, status: true, class: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  });
  return (guardian?.students ?? [])
    .map((s) => s.student)
    .map((s) => ({ id: s.id, firstName: s.firstName, className: s.class?.name ?? null, sectionName: s.section?.name ?? null }));
}

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Builds a factual answer from records. Returns plain lines; no model involved. */
async function factualAnswer(institutionId: string, userId: string, intent: GuardianIntent, children: Child[], message: string): Promise<string> {
  const ids = children.map((c) => c.id);
  const now = new Date();

  switch (intent) {
    case 'FEES': {
      const invoices = await prisma.invoice.findMany({
        where: { institutionId, studentId: { in: ids }, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, dueAmount: { gt: 0 } },
        select: { studentId: true, dueAmount: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
      });
      return children
        .map((c) => {
          const mine = invoices.filter((i) => i.studentId === c.id);
          if (!mine.length) return `${c.firstName}: no outstanding fees.`;
          const total = mine.reduce((s, i) => s + Number(i.dueAmount), 0);
          const overdue = mine.filter((i) => i.dueDate < now).length;
          const next = mine.find((i) => i.dueDate >= now);
          return `${c.firstName}: ${fmtBdt(total)} due across ${mine.length} invoice(s)${overdue ? `, ${overdue} past the due date` : ''}${next ? `; next due ${fmtDay(next.dueDate)}` : ''}.`;
        })
        .join('\n');
    }
    case 'ATTENDANCE': {
      const since = new Date(now.getTime() - 30 * DAY_MS);
      const counts = await repo.attendanceCountsByStudent(institutionId, since, new Date(now.getTime() + DAY_MS), ids);
      return children
        .map((c) => {
          const a = counts.get(c.id);
          if (!a || a.total === 0) return `${c.firstName}: no attendance recorded in the last 30 days.`;
          const pct = Math.round((a.attended / a.total) * 1000) / 10;
          return `${c.firstName}: attended ${a.attended} of ${a.total} recorded days in the last 30 days (${pct}%), absent ${a.absent}, late ${a.late}.`;
        })
        .join('\n');
    }
    case 'RESULTS': {
      const lines: string[] = [];
      for (const c of children) {
        const latest = await prisma.examResult.findFirst({
          where: { institutionId, studentId: c.id },
          orderBy: { exam: { startDate: 'desc' } },
          select: { examId: true, exam: { select: { name: true } } },
        });
        if (!latest) {
          lines.push(`${c.firstName}: no exam results have been published yet.`);
          continue;
        }
        const results = await prisma.examResult.findMany({
          where: { institutionId, studentId: c.id, examId: latest.examId },
          select: { subject: true, marksObtained: true, maxMarks: true, grade: true },
          orderBy: { subject: 'asc' },
        });
        const obtained = results.reduce((s, r) => s + Number(r.marksObtained), 0);
        const max = results.reduce((s, r) => s + Number(r.maxMarks), 0);
        const subjects = results.map((r) => `${r.subject} ${Number(r.marksObtained)}/${Number(r.maxMarks)}${r.grade ? ` (${r.grade})` : ''}`).join(', ');
        lines.push(`${c.firstName} — ${latest.exam.name}: ${subjects}. Overall ${max > 0 ? Math.round((obtained / max) * 1000) / 10 : 0}%.`);
      }
      return lines.join('\n');
    }
    case 'ROUTINE': {
      const tomorrow = /tomorrow|আগামীকাল/i.test(message);
      const day = DAYS[(now.getDay() + (tomorrow ? 1 : 0)) % 7];
      const lines: string[] = [];
      for (const c of children) {
        if (!c.className) {
          lines.push(`${c.firstName}: not assigned to a class yet.`);
          continue;
        }
        const slots = await prisma.timetableSlot.findMany({
          where: {
            institutionId,
            dayOfWeek: day,
            className: { equals: c.className, mode: 'insensitive' },
            ...(c.sectionName ? { sectionName: { equals: c.sectionName, mode: 'insensitive' } } : {}),
          },
          select: { startTime: true, endTime: true, subject: true },
          orderBy: { startTime: 'asc' },
        });
        const label = tomorrow ? 'tomorrow' : 'today';
        lines.push(
          slots.length
            ? `${c.firstName} (${c.className}${c.sectionName ? ` ${c.sectionName}` : ''}) ${label}: ${slots.map((s) => `${s.startTime}–${s.endTime} ${s.subject}`).join('; ')}.`
            : `${c.firstName}: no classes on the routine for ${label} (${day.charAt(0) + day.slice(1).toLowerCase()}).`,
        );
      }
      return lines.join('\n');
    }
    case 'HOLIDAYS': {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const holidays = await prisma.holiday.findMany({
        where: { institutionId, deletedAt: null, date: { gte: today }, type: { not: 'WEEKLY' } },
        select: { date: true, title: true, isTentative: true },
        orderBy: { date: 'asc' },
        take: 5,
      });
      if (!holidays.length) return 'No upcoming holidays are listed on the school calendar.';
      return ['Upcoming holidays:', ...holidays.map((h) => `• ${fmtDay(h.date)} — ${h.title}${h.isTentative ? ' (date may change)' : ''}`)].join('\n');
    }
    case 'NOTICES': {
      const visibility = await visibilityFor(institutionId, { userId, role: 'GUARDIAN' });
      const notices = await prisma.notice.findMany({
        where: { institutionId, isActive: true, audience: { in: ['ALL', 'GUARDIANS'] }, ...(visibility ? { AND: [visibility] } : {}) },
        select: { title: true, publishedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: 5,
      });
      if (!notices.length) return 'There are no current notices for guardians.';
      return ['Latest notices:', ...notices.map((n) => `• ${fmtDay(n.publishedAt)} — ${n.title}`)].join('\n');
    }
    default:
      return '';
  }
}

export async function guardianChat(ctx: AiCallContext, message: string, studentId?: string) {
  const userId = ctx.userId!;
  const children = await linkedChildren(ctx.institutionId, userId);
  if (studentId && !children.some((c) => c.id === studentId)) throw new ForbiddenError('This student is not linked to your account');
  const targets = studentId ? children.filter((c) => c.id === studentId) : children;

  if (targets.length === 0) {
    return { type: 'ANSWER' as const, intent: 'OTHER' as GuardianIntent, answer: 'No students are linked to your account yet. Please contact the school office.', label: GUARDIAN_LABEL, demo: false };
  }

  const intent = classifyGuardianIntent(message);
  if (intent !== 'OTHER') {
    const answer = await factualAnswer(ctx.institutionId, userId, intent, targets, message);
    await logAiCall(ctx, { feature: 'guardian_chat', prompt: message, response: answer, model: 'rules', isDemo: false, status: 'SUCCESS' });
    return { type: 'ANSWER' as const, intent, answer, label: GUARDIAN_LABEL, demo: false };
  }

  // Open-ended: draft a reply for staff review. Only first name/class go to the model.
  const docs = await activeDocs(ctx.institutionId);
  const { ranked } = await rankDocumentsSmart(message, docs, 3);
  const childLine = targets.map((c) => `${c.firstName}${c.className ? ` (${c.className})` : ''}`).join(', ');
  const ai = await runAi(ctx, {
    feature: 'guardian_chat',
    system: knowledgeSystem('a guardian of a student (a staff member will review your draft before it is sent)'),
    prompt: `${ranked.length ? `<documents>\n${formatDocsForPrompt(ranked)}\n</documents>\n\n` : '<documents></documents>\n\n'}Guardian's child(ren): ${childLine}\nGuardian's question: ${message}`,
    demoText: ranked.length ? templateKnowledgeAnswer(ranked) : `${NO_INFO_ANSWER} (No school document matched this question — please write a reply.)`,
    maxTokens: 500,
    // Open-ended guardian replies are the most nuanced drafts — use the advanced model.
    advanced: true,
    skipLog: true,
  });
  const interactionId = await logAiCall(ctx, {
    feature: 'guardian_chat',
    prompt: message,
    response: ai.text,
    model: ai.model,
    inputTokens: ai.inputTokens,
    outputTokens: ai.outputTokens,
    isDemo: ai.demo,
    status: ai.aiError ? 'FALLBACK' : 'SUCCESS',
  });
  if (!interactionId) throw new Error('Could not record the question for staff review');
  await prisma.aiDraft.create({
    data: {
      institutionId: ctx.institutionId,
      feature: 'guardian_chat',
      entityType: 'AiInteraction',
      entityId: interactionId,
      content: ai.text,
      createdByUserId: userId,
    },
  });
  return { type: 'QUEUED' as const, intent, answer: QUEUED_ANSWER, label: GUARDIAN_LABEL, demo: false, questionId: interactionId };
}

/** The guardian's own queued questions and any staff-approved replies. Draft text is never exposed. */
export async function guardianReplies(institutionId: string, userId: string) {
  const interactions = await prisma.aiInteraction.findMany({
    where: { institutionId, userId, feature: 'guardian_chat' },
    select: { id: true, prompt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const drafts = await prisma.aiDraft.findMany({
    where: { institutionId, feature: 'guardian_chat', entityType: 'AiInteraction', entityId: { in: interactions.map((i) => i.id) } },
    select: { entityId: true, status: true, content: true, reviewedAt: true },
  });
  const byInteraction = new Map(drafts.map((d) => [d.entityId, d]));
  return interactions
    .filter((i) => byInteraction.has(i.id))
    .slice(0, 50)
    .map((i) => {
      const d = byInteraction.get(i.id)!;
      const status = d.status === AiDraftStatus.PUBLISHED ? 'ANSWERED' : d.status === AiDraftStatus.REJECTED ? 'CLOSED' : 'PENDING';
      return {
        id: i.id,
        question: i.prompt,
        askedAt: i.createdAt,
        status,
        reply: status === 'ANSWERED' ? d.content : null,
        repliedAt: status === 'ANSWERED' ? d.reviewedAt : null,
      };
    });
}

// ── 11. Public admission assistant ──────────────────────────────────────────

export async function admissionAssistant(data: AdmissionAssistantDtoType) {
  if (data.website) return { answer: NO_INFO_ANSWER, citations: [], recommendation: null, leadCaptured: false, askForContact: false, demo: false };

  const institution = await prisma.institution.findFirst({ where: { slug: data.slug, isActive: true }, select: { id: true, name: true } });
  if (!institution) throw new NotFoundError('Institution not found');
  const ctx: AiCallContext = { institutionId: institution.id, userId: null };

  // Rule-based class recommendation by age.
  const age = data.childAge ?? extractAge(data.message);
  let recommendation: { age: number; label: string; matchedClass: string | null; note: string } | null = null;
  if (age !== null) {
    const rec = recommendClassForAge(age);
    if (rec) {
      const classes = await repo.institutionClasses(institution.id);
      recommendation = {
        age,
        label: rec.label,
        matchedClass: matchClassName(rec, classes.map((c) => c.name)),
        note: 'Based on the usual Bangladesh age guideline at the start of the academic year. The school confirms placement after assessment.',
      };
    }
  }

  // Lead capture when name + phone are given.
  let leadCaptured = false;
  let leadError: string | null = null;
  if (data.name && data.phone) {
    const phone = normalizeBdMobile(data.phone);
    if (!phone || !isValidBdMobile(data.phone)) {
      leadError = 'Please enter a valid Bangladeshi mobile number (01XXXXXXXXX).';
    } else {
      try {
        const recent = await prisma.admissionEnquiry.findFirst({
          where: { institutionId: institution.id, phone, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
          select: { id: true },
        });
        if (!recent) {
          await prisma.admissionEnquiry.create({
            data: {
              institutionId: institution.id,
              studentName: data.childName?.trim() || `Child of ${data.name}`,
              guardianName: data.name,
              phone,
              classInterested: recommendation?.matchedClass ?? recommendation?.label ?? null,
              source: 'AI_ASSISTANT',
              notes: `Captured by the AI admission assistant. Question: ${data.message.slice(0, 400)}`,
            },
          });
        }
        leadCaptured = true;
      } catch (error) {
        logger.error('AI admission assistant: lead capture failed', { error: (error as Error).message, institutionId: institution.id });
        leadError = 'We could not save your details right now. Please call the school office.';
      }
    }
  }

  const docs = await activeDocs(institution.id, 'admission');
  const { ranked } = await rankDocumentsSmart(data.message, docs, 3);
  let answer: string;
  let demo = !getAiConfig().configured;
  let model: string | null = null;
  let aiError: string | undefined;

  if (ranked.length === 0) {
    answer = recommendation
      ? `For a child aged ${recommendation.age}, the usual class is ${recommendation.matchedClass ?? recommendation.label}.`
      : NO_INFO_ANSWER;
    await logAiCall(ctx, { feature: 'admission_assistant', prompt: data.message, response: answer, isDemo: demo, status: 'SUCCESS' });
  } else {
    const ai = await runAi(ctx, {
      feature: 'admission_assistant',
      system: knowledgeSystem(`prospective parents enquiring about admission to ${institution.name}`),
      prompt: `<documents>\n${formatDocsForPrompt(ranked)}\n</documents>\n\nQuestion: ${data.message}`,
      demoText: templateKnowledgeAnswer(ranked),
      maxTokens: 500,
    });
    answer = ai.text;
    demo = ai.demo;
    model = ai.model;
    aiError = ai.aiError;
  }

  return {
    institution: { name: institution.name },
    answer,
    citations: ranked.map((r) => ({ title: r.doc.title })),
    recommendation,
    leadCaptured,
    leadError,
    askForContact: !leadCaptured,
    demo,
    model,
    ...(aiError ? { aiError } : {}),
  };
}
