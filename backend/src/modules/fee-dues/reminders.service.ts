import { randomUUID } from 'crypto';
import { EmailPriority } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { normalizeBdMobile } from '../../utils/phone';
import { maskPhone, sendSms, type SmsResult } from '../../utils/sms.service';
import { sendEmail } from '../email/sender';
import { countSmsSegments } from '../campaigns/smsSegments';
import { chunk, maskEmail, renderReminder, toPaisa } from './dues.logic';
import { institutionTz } from './dues.sql';
import { defaulterIds, listDefaulters, type DefaulterQuery, type DefaulterRow } from './dues.service';
import { getSettings, writeDuesAudit } from './restriction.service';

// =============================================================================
// P4 defaulter reminders — SMS / email to guardians.
//
// Sent in-process (no queue), so it works with BACKGROUND_JOBS=false and in
// local demo mode: with SMS or email switched off, every row is logged as
// SKIPPED with the reason — never as SENT. Each attempt is one
// FeeDuesReminderLog row (that is what "last reminded" reads).
//
// SMS goes through utils/sms.service (sendSchoolSms below is the single call
// site, so SMS-credit accounting for school-originated SMS hooks in here).
// =============================================================================

export const MAX_RECIPIENTS = 2000;
const CONCURRENCY = 6;

export type Channel = 'SMS' | 'EMAIL';

export interface ReminderRequest {
  /** Explicit students; when absent, every defaulter matching `filter`. */
  studentIds?: string[];
  filter?: DefaulterQuery;
  channels: Channel[];
  smsTemplate?: string;
  emailSubject?: string;
  emailTemplate?: string;
}

interface Recipient {
  row: DefaulterRow;
  phone: string | null;
  email: string | null;
  sms: string;
  emailSubject: string;
  emailBody: string;
}

/** School SMS — one place for credit / provider hooks. */
export async function sendSchoolSms(institutionId: string, phone: string, body: string): Promise<SmsResult> {
  // P5: charged to the school's SMS credits (no credits → SKIPPED INSUFFICIENT_CREDITS).
  return sendSms(phone, body, { institutionId, purpose: 'DEFAULTER' });
}

async function resolveRecipients(institutionId: string, req: ReminderRequest): Promise<{ recipients: Recipient[]; school: string }> {
  if (!req.channels.length) throw new BadRequestError('Pick at least one channel (SMS or email)');
  const settings = await getSettings(institutionId);
  const inst = await institutionTz(institutionId);
  const ids = req.studentIds?.length ? [...new Set(req.studentIds)] : await defaulterIds(institutionId, req.filter ?? {}, MAX_RECIPIENTS);
  if (ids.length > MAX_RECIPIENTS) throw new BadRequestError(`At most ${MAX_RECIPIENTS} students per send`);
  if (!ids.length) return { recipients: [], school: inst.name };

  // Re-read dues for exactly these students (tenant-scoped; non-defaulters drop out).
  const rows: DefaulterRow[] = [];
  for (const part of chunk(ids, 500)) {
    const res = await listDefaulters(institutionId, { studentIds: part, studentStatus: 'ALL', page: 1, pageSize: 500 });
    rows.push(...res.items);
  }

  // Guardian contacts: first valid BD mobile (primary first), then the student's own phone; email from the primary guardian.
  const links = await prisma.guardianStudent.findMany({
    where: { studentId: { in: rows.map((r) => r.id) }, guardian: { institutionId } },
    orderBy: { isPrimary: 'desc' },
    select: { studentId: true, isPrimary: true, guardian: { select: { firstName: true, lastName: true, phone: true, email: true, user: { select: { email: true } } } } },
  });
  const students = await prisma.student.findMany({ where: { id: { in: rows.map((r) => r.id) }, institutionId }, select: { id: true, phone: true, email: true } });
  const studentBy = new Map(students.map((s) => [s.id, s]));
  const byStudent = new Map<string, typeof links>();
  for (const l of links) {
    if (!byStudent.has(l.studentId)) byStudent.set(l.studentId, []);
    byStudent.get(l.studentId)!.push(l);
  }

  const smsTpl = req.smsTemplate?.trim() || settings.smsTemplate;
  const subjTpl = req.emailSubject?.trim() || settings.emailSubject;
  const emailTpl = req.emailTemplate?.trim() || settings.emailTemplate;

  const recipients = rows.map((row) => {
    const gs = byStudent.get(row.id) ?? [];
    let phone: string | null = null;
    for (const g of gs) {
      phone = normalizeBdMobile(g.guardian.phone);
      if (phone) break;
    }
    if (!phone) phone = normalizeBdMobile(studentBy.get(row.id)?.phone ?? null);
    const primary = gs[0]?.guardian;
    const email = primary?.email || primary?.user?.email || null;
    const vars = {
      student: row.name,
      months: row.monthsDue,
      amount: toPaisa(row.amountDue),
      school: inst.name,
      guardian: primary ? `${primary.firstName} ${primary.lastName}` : null,
      monthNames: row.months,
      className: [row.className, row.sectionName].filter(Boolean).join(' '),
    };
    return {
      row,
      phone,
      email,
      sms: renderReminder(smsTpl, vars),
      emailSubject: renderReminder(subjTpl, vars),
      emailBody: renderReminder(emailTpl, vars),
    };
  });
  return { recipients, school: inst.name };
}

/** What a send would do — counts, segments, samples. Sends nothing. */
export async function previewReminders(institutionId: string, req: ReminderRequest) {
  const { recipients } = await resolveRecipients(institutionId, req);
  const wantSms = req.channels.includes('SMS');
  const wantEmail = req.channels.includes('EMAIL');
  let smsMessages = 0;
  let smsSegments = 0;
  let maxSegments = 0;
  let encoding: 'GSM' | 'UNICODE' = 'GSM';
  for (const r of recipients) {
    if (!wantSms || !r.phone) continue;
    const seg = countSmsSegments(r.sms);
    smsMessages += 1;
    smsSegments += seg.segments;
    maxSegments = Math.max(maxSegments, seg.segments);
    if (seg.encoding === 'UNICODE') encoding = 'UNICODE';
  }
  const emailMessages = wantEmail ? recipients.filter((r) => r.email).length : 0;
  return {
    students: recipients.length,
    sms: wantSms ? { messages: smsMessages, segments: smsSegments, maxSegmentsPerMessage: maxSegments, encoding, noPhone: recipients.length - smsMessages } : null,
    email: wantEmail ? { messages: emailMessages, noEmail: recipients.length - emailMessages } : null,
    totalMessages: smsMessages + emailMessages,
    samples: recipients.slice(0, 5).map((r) => ({
      studentId: r.row.id,
      student: r.row.name,
      phone: r.phone ? maskPhone(r.phone) : null,
      email: r.email ? maskEmail(r.email) : null,
      sms: r.sms,
      segments: countSmsSegments(r.sms),
      emailSubject: r.emailSubject,
      emailBody: r.emailBody,
    })),
  };
}

export interface SendSummary {
  batchId: string;
  students: number;
  sms: { sent: number; skipped: number; failed: number };
  email: { sent: number; skipped: number; failed: number };
}

/**
 * Sends and logs. Returns once every message has been attempted; the
 * controller runs it in the background for large batches and the UI polls
 * getBatch().
 */
export async function sendReminders(institutionId: string, userId: string, req: ReminderRequest, batchId = randomUUID()): Promise<SendSummary> {
  const { recipients, school } = await resolveRecipients(institutionId, req);
  const summary: SendSummary = {
    batchId,
    students: recipients.length,
    sms: { sent: 0, skipped: 0, failed: 0 },
    email: { sent: 0, skipped: 0, failed: 0 },
  };
  const count = (ch: 'sms' | 'email', status: string) => {
    if (status === 'SENT') summary[ch].sent += 1;
    else if (status === 'FAILED') summary[ch].failed += 1;
    else summary[ch].skipped += 1;
  };
  const base = (r: Recipient) => ({
    institutionId, studentId: r.row.id, batchId, sentByUserId: userId,
    monthsDue: r.row.monthsDue, amountDue: r.row.amountDue,
  });

  const one = async (r: Recipient) => {
    if (req.channels.includes('SMS')) {
      let status = 'SKIPPED';
      let detail: string | null = 'SKIPPED: no valid BD mobile number for guardian or student';
      const segments = countSmsSegments(r.sms).segments;
      if (r.phone) {
        const res = await sendSchoolSms(institutionId, r.phone, r.sms);
        status = res.status;
        detail = res.status === 'SENT' ? null : `${res.status}: ${res.message}`.slice(0, 1000);
      }
      count('sms', status);
      await prisma.feeDuesReminderLog.create({
        data: { ...base(r), channel: 'SMS', recipient: r.phone ? maskPhone(r.phone) : '—', status, detail, segments, message: r.sms },
      });
    }
    if (req.channels.includes('EMAIL')) {
      let status = 'SKIPPED';
      let detail: string | null = 'SKIPPED: guardian has no email address';
      if (r.email) {
        const html = `<div style="font-family:Arial,sans-serif;white-space:pre-line">${escapeHtml(r.emailBody)}</div>`;
        const res = await sendEmail({
          to: r.email,
          subject: r.emailSubject,
          text: r.emailBody,
          html,
          template: 'fee-dues-reminder',
          priority: EmailPriority.P1_TRANSACTIONAL,
          institutionId,
          fromName: school,
          idempotencyKey: `fee-dues:${batchId}:${r.row.id}`,
        });
        // SKIPPED (demo mode), SUPPRESSED and DEFERRED are not delivered.
        status = res.status === 'SENT' ? 'SENT' : res.status === 'FAILED' ? 'FAILED' : 'SKIPPED';
        detail = res.status === 'SENT' ? null : `${res.status}${res.error ? `: ${res.error}` : ''}`.slice(0, 1000);
      }
      count('email', status);
      await prisma.feeDuesReminderLog.create({
        data: { ...base(r), channel: 'EMAIL', recipient: r.email ? maskEmail(r.email) : '—', status, detail, message: `${r.emailSubject}\n\n${r.emailBody}` },
      });
    }
  };

  for (const part of chunk(recipients, CONCURRENCY)) {
    await Promise.all(
      part.map((r) =>
        one(r).catch((error) => {
          logger.error('Dues reminder failed', { studentId: r.row.id, error: error instanceof Error ? error.message : String(error) });
        }),
      ),
    );
  }

  if (recipients.length) {
    await prisma.studentFeeStatus.updateMany({
      where: { institutionId, studentId: { in: recipients.map((r) => r.row.id) } },
      data: { lastRemindedAt: new Date() },
    });
  }
  await writeDuesAudit(institutionId, userId, 'FEE_DUES_REMINDER', 'FeeDuesReminderBatch', batchId, {
    channels: req.channels, students: summary.students, sms: summary.sms, email: summary.email,
  });
  logger.info('Dues reminders sent', { institutionId, batchId, students: summary.students, sms: summary.sms, email: summary.email });
  return summary;
}

/** Progress / result of a batch (from the log). */
export async function getBatch(institutionId: string, batchId: string) {
  const rows = await prisma.feeDuesReminderLog.groupBy({
    by: ['channel', 'status'],
    where: { institutionId, batchId },
    _count: { _all: true },
  });
  const out = { batchId, sms: { sent: 0, skipped: 0, failed: 0 }, email: { sent: 0, skipped: 0, failed: 0 }, attempted: 0 };
  for (const r of rows) {
    const ch = r.channel === 'SMS' ? out.sms : out.email;
    const k = r.status === 'SENT' ? 'sent' : r.status === 'FAILED' ? 'failed' : 'skipped';
    ch[k] += r._count._all;
    out.attempted += r._count._all;
  }
  return out;
}

export async function listReminderLog(institutionId: string, q: { studentId?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
  const where = { institutionId, ...(q.studentId ? { studentId: q.studentId } : {}) };
  const [items, total] = await Promise.all([
    prisma.feeDuesReminderLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, batchId: true, channel: true, recipient: true, status: true, detail: true, segments: true, monthsDue: true, amountDue: true, createdAt: true,
        student: { select: { id: true, firstName: true, lastName: true, studentId: true } },
      },
    }),
    prisma.feeDuesReminderLog.count({ where }),
  ]);
  return { items: items.map((i) => ({ ...i, amountDue: Number(i.amountDue) })), total, page, pageSize };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
