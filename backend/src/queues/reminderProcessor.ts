import { logger } from '../utils/logger';
import { prisma } from '../config/prisma';
import { maskPhone, sendSms } from '../utils/sms.service';
import { normalizeBdMobile } from '../utils/phone';
import { buildDedupeKey, notifySafe } from '../modules/notifications/notifications.service';
import * as notificationRepository from '../modules/notifications/notifications.repository';
import { renderTemplate } from '../modules/notifications/renderer';

// =============================================================================
// Fee-due / absence reminder processing — kept apart from the BullMQ Worker
// (reminderWorker.ts) so tests can drive it without a live Redis, the same
// split notificationWorker.ts / billingWorker.ts use.
// =============================================================================

export interface FeeDueJobData {
  type: 'fee-due';
  institutionId: string;
  /** Set by every job scheduled since P0; older jobs only carry invoiceNo. */
  invoiceId?: string;
  studentId: string;
  invoiceNo: string;
  dueAmount: string | number;
  dueDate: string;
}

export interface AbsenceJobData {
  type: 'absence';
  institutionId: string;
  studentId: string;
  date: string;
}

export type ReminderJobData = FeeDueJobData | AbsenceJobData;

export type ReminderOutcome =
  | { status: 'SKIPPED'; reason: string }
  | { status: 'PROCESSED'; sms: 'SENT' | 'SKIPPED' | 'FAILED' | 'NONE'; emailRecipients: number };

/** Statuses after which a due reminder must never go out. */
const CLOSED_INVOICE_STATUSES = new Set(['PAID', 'CANCELLED']);

export interface ReminderContact {
  /** Normalised 8801XXXXXXXXX, or null when no valid number exists. */
  phone: string | null;
  source: 'guardian' | 'student' | null;
  studentName: string;
  studentUserId: string | null;
  /** Login accounts that should get the EMAIL copy (student + primary guardian). */
  emailUserIds: string[];
}

/**
 * Primary guardian's phone first, then any other guardian, then the student's
 * own phone. Guardians are who pays school fees in Bangladesh — the old code
 * resolved this but then notified only the student's login.
 */
export async function resolveReminderContact(institutionId: string, studentId: string): Promise<ReminderContact | null> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      userId: true,
      guardians: {
        select: { isPrimary: true, guardian: { select: { phone: true, userId: true, institutionId: true } } },
        orderBy: { isPrimary: 'desc' },
      },
    },
  });
  if (!student) return null;

  // Tenant scoping: never use a guardian row from another institution.
  const guardians = student.guardians.filter((g) => g.guardian && g.guardian.institutionId === institutionId);
  const primary = guardians.find((g) => g.isPrimary) ?? guardians[0];

  let phone: string | null = null;
  let source: ReminderContact['source'] = null;
  for (const g of [primary, ...guardians].filter(Boolean)) {
    const n = normalizeBdMobile(g!.guardian.phone);
    if (n) {
      phone = n;
      source = 'guardian';
      break;
    }
  }
  if (!phone) {
    const n = normalizeBdMobile(student.phone);
    if (n) {
      phone = n;
      source = 'student';
    }
  }

  const emailUserIds = [student.userId, primary?.guardian.userId].filter((v): v is string => !!v);
  return {
    phone,
    source,
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    studentUserId: student.userId,
    emailUserIds: [...new Set(emailUserIds)],
  };
}

/**
 * Sends the reminder SMS directly to a phone number (the guardian may have no
 * login, so the user-based notification pipeline can't reach them) and records
 * the honest outcome in NotificationDelivery under a per-invoice dedupe key —
 * so a replayed job never sends twice.
 */
async function sendReminderSms(params: {
  institutionId: string;
  invoiceId: string;
  phone: string | null;
  studentId: string;
  vars: Record<string, string>;
}): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
  const recipientKey = params.phone ? `phone-${params.phone}` : `student-${params.studentId}`;
  const dedupeKey = buildDedupeKey(params.institutionId, 'FEE_REMINDER', recipientKey, 'SMS', params.invoiceId);
  const skeleton = {
    institutionId: params.institutionId,
    channel: 'SMS' as const,
    recipient: params.phone ?? params.studentId,
    templateKey: 'FEE_REMINDER',
  };

  if (!params.phone) {
    await notificationRepository.recordSkippedDelivery(dedupeKey, skeleton, 'no valid BD mobile number for guardian or student');
    return 'SKIPPED';
  }

  const delivery = await notificationRepository.upsertQueuedDelivery(dedupeKey, skeleton);
  if (delivery.status === 'SENT') return 'SENT';
  if (delivery.status === 'SKIPPED') return 'SKIPPED';
  if (!(await notificationRepository.claimForSend(delivery.id))) return 'SKIPPED';

  const institutionName = await notificationRepository.findInstitutionName(params.institutionId);
  const message = await renderTemplate(params.institutionId, 'FEE_REMINDER', 'SMS', { institutionName, ...params.vars });
  const result = await sendSms(params.phone, message.body);

  if (result.status === 'SENT') {
    await notificationRepository.markDeliverySent(delivery.id, result.message.slice(0, 190));
  } else if (result.status === 'SKIPPED') {
    await notificationRepository.markDeliverySkipped(delivery.id, `SKIPPED: ${result.message}`);
  } else {
    await notificationRepository.markDeliveryFailed(delivery.id, result.message);
  }
  logger.info('Fee reminder SMS', { institutionId: params.institutionId, invoiceId: params.invoiceId, to: maskPhone(params.phone), status: result.status });
  return result.status;
}

export async function processFeeDueReminder(data: FeeDueJobData): Promise<ReminderOutcome> {
  const { institutionId } = data;

  // Re-read the invoice NOW — the job was scheduled days or weeks ago.
  // The soft-delete layer hides trashed invoices, so "deleted" reads as null.
  const invoice = await prisma.invoice.findFirst({
    where: data.invoiceId ? { id: data.invoiceId, institutionId } : { invoiceNo: data.invoiceNo, institutionId },
    select: { id: true, invoiceNo: true, status: true, dueAmount: true, dueDate: true, studentId: true },
  });

  if (!invoice) {
    logger.info('Fee reminder skipped: invoice no longer exists (deleted or trashed)', { institutionId, invoiceNo: data.invoiceNo });
    return { status: 'SKIPPED', reason: 'invoice not found or deleted' };
  }
  if (CLOSED_INVOICE_STATUSES.has(invoice.status) || Number(invoice.dueAmount) <= 0) {
    logger.info('Fee reminder skipped: invoice already settled', { institutionId, invoiceNo: invoice.invoiceNo, status: invoice.status });
    return { status: 'SKIPPED', reason: `invoice is ${invoice.status}` };
  }

  const contact = await resolveReminderContact(institutionId, invoice.studentId);
  if (!contact) {
    return { status: 'SKIPPED', reason: 'student not found' };
  }

  const vars = {
    invoiceNo: invoice.invoiceNo,
    studentName: contact.studentName,
    // The CURRENT outstanding amount — a part-payment since scheduling counts.
    amount: Number(invoice.dueAmount).toFixed(2),
    dueDate: invoice.dueDate.toDateString(),
  };

  const sms = await sendReminderSms({ institutionId, invoiceId: invoice.id, phone: contact.phone, studentId: invoice.studentId, vars });

  if (contact.emailUserIds.length > 0) {
    notifySafe({
      institutionId,
      type: 'FEE_REMINDER',
      recipientUserIds: contact.emailUserIds,
      contextId: invoice.id,
      channels: ['EMAIL'],
      data: { link: '/fees', invoiceId: invoice.id },
      vars,
    });
  }

  return { status: 'PROCESSED', sms, emailRecipients: contact.emailUserIds.length };
}

export async function processAbsenceReminder(data: AbsenceJobData): Promise<ReminderOutcome> {
  const contact = await resolveReminderContact(data.institutionId, data.studentId);
  if (!contact?.studentUserId) {
    logger.warn('Absence alert skipped: student has no user account', { studentId: data.studentId });
    return { status: 'SKIPPED', reason: 'student has no user account' };
  }
  notifySafe({
    institutionId: data.institutionId,
    type: 'ABSENCE_ALERT',
    recipientUserIds: [contact.studentUserId],
    contextId: `${data.studentId}:${data.date}`,
    channels: ['SMS'],
    data: { link: '/attendance' },
    vars: {
      studentName: contact.studentName,
      date: new Date(data.date).toDateString(),
    },
  });
  return { status: 'PROCESSED', sms: 'NONE', emailRecipients: 0 };
}

export function processReminderJob(data: ReminderJobData): Promise<ReminderOutcome> {
  return data.type === 'fee-due' ? processFeeDueReminder(data) : processAbsenceReminder(data);
}
