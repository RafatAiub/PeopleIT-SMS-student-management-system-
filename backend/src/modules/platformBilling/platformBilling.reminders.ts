import { EmailPriority, type PlatformReminderKind, type PlatformReminderChannel, type PlatformReminderResult } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { normalizeBdMobile } from '../../utils/phone';
import { maskPhone, sendSms } from '../../utils/sms.service';
import { sendEmail } from '../email/sender';
import { maskEmail } from '../email/mask';
import { buildEmailLayout } from '../email/layout';
import { bnParagraph, button, fallbackLink, infoTable, paragraph } from '../email/components';
import {
  dateLabel,
  daysPastDue,
  dhakaDayKey,
  duePaisa,
  formatTaka,
  periodLabel,
  reminderKindFor,
  UNPAID_STATUSES,
} from './platformBilling.logic';
import { EMAIL_TEMPLATES, renderSms, type TemplateKind, type TemplateVars } from './platformBilling.templates';
import { isUniqueViolation, payLinkFor } from './platformBilling.shared';

// =============================================================================
// P1 reminders and payment confirmations to schools, from PeopleNIT's OWN SMS
// (Greenweb) and email (Brevo) — never the school's credits.
//
// Daily at 09:00 Asia/Dhaka (platformBilling.scheduler.ts) every unpaid
// invoice of a school whose billing is active gets, per reminderKindFor():
//   UPCOMING every day from the 1st until the day before the due day,
//   FINAL on the due day, OVERDUE the day after, then every 3 days.
// Every attempt is a PlatformReminderLog row (SENT / SKIPPED / FAILED with the
// provider's answer). The row is written BEFORE sending with a unique
// dedupeKey (invoice + day + channel + recipient), so a restart, a second
// instance or a manual re-run can never send the same reminder twice a day.
// =============================================================================

export interface Contacts {
  schoolName: string;
  phones: string[];
  emails: string[];
}

const MAX_RECIPIENTS = 3;

/** Billing contacts: the profile's phone/email, else institution phone + ADMIN users. */
export async function resolveBillingContacts(
  institutionId: string,
  profile: { billingPhone: string | null; billingEmail: string | null } | null,
): Promise<Contacts> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { name: true, phone: true, contactPhone: true, contactEmail: true },
  });
  const admins = await prisma.user.findMany({
    where: { institutionId, role: 'ADMIN', isActive: true },
    select: { email: true, phone: true },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });

  const phoneCandidates = profile?.billingPhone
    ? [profile.billingPhone]
    : [institution?.contactPhone, institution?.phone, ...admins.map((a) => a.phone)];
  const phones = [...new Set(phoneCandidates.map((p) => normalizeBdMobile(p ?? '')).filter((p): p is string => !!p))].slice(0, MAX_RECIPIENTS);

  const emailCandidates = profile?.billingEmail ? [profile.billingEmail] : admins.map((a) => a.email);
  const emails = [...new Set(emailCandidates.map((e) => (e ?? '').trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)))].slice(0, MAX_RECIPIENTS);

  return { schoolName: institution?.name ?? 'School', phones, emails };
}

function vars(
  inv: { id: string; institutionId: string; invoiceNumber: string; period: string; dueDate: Date },
  schoolName: string,
  amountPaisa: number,
  now: Date,
  extra: Partial<TemplateVars> = {},
): TemplateVars {
  const past = daysPastDue(inv.dueDate, now);
  return {
    school: schoolName,
    invoiceNo: inv.invoiceNumber,
    period: periodLabel(inv.period, 'en'),
    periodBn: periodLabel(inv.period, 'bn'),
    amount: formatTaka(amountPaisa),
    dueDate: dateLabel(inv.dueDate, 'en'),
    dueDateBn: dateLabel(inv.dueDate, 'bn'),
    daysOverdue: past > 0 ? past : 0,
    payLink: payLinkFor(inv.institutionId, inv.id, now),
    ...extra,
  };
}

export function renderReminderEmail(kind: TemplateKind, v: TemplateVars, link: string): { subject: string; html: string; text: string } {
  const t = EMAIL_TEMPLATES[kind];
  const bnLines = t.bn(v);
  const enLines = t.en(v);
  const facts =
    kind === 'RECEIPT'
      ? [
          { label: 'Receipt', value: v.receiptNo ?? '' },
          { label: 'Amount', value: `BDT ${v.amount}` },
        ]
      : [
          { label: 'Invoice', value: v.invoiceNo },
          { label: 'Month', value: v.period },
          { label: 'Amount due', value: `BDT ${v.amount}` },
          { label: 'Due date', value: v.dueDate },
        ];
  const bodyHtml = [
    ...bnLines.map(bnParagraph),
    ...enLines.map(paragraph),
    infoTable(facts),
    t.button ? button(link, `${t.button.en} / ${t.button.bn}`) : '',
    t.button ? fallbackLink(link) : '',
  ].join('\n');
  const html = buildEmailLayout({ preheader: enLines[1] ?? enLines[0] ?? '', heading: t.heading(v), bodyHtml });
  const text = [...bnLines, '', ...enLines, '', ...facts.map((f) => `${f.label}: ${f.value}`), '', link].join('\n');
  return { subject: t.subject(v), html, text };
}

interface LogBase {
  institutionId: string;
  invoiceId: string | null;
  kind: PlatformReminderKind;
  channel: PlatformReminderChannel;
  recipient: string;
  dayKey: string;
  dedupeKey: string;
}

/**
 * Claims the dedupe key (row written first as SKIPPED "sending…"), sends,
 * then records the real result. Returns null when already sent today.
 */
async function sendOnce(base: LogBase, send: () => Promise<{ result: PlatformReminderResult; response: string }>): Promise<PlatformReminderResult | null> {
  let logId: string;
  try {
    const row = await prisma.platformReminderLog.create({ data: { ...base, result: 'SKIPPED', providerResponse: 'sending…' } });
    logId = row.id;
  } catch (error) {
    if (isUniqueViolation(error, 'dedupeKey')) return null;
    throw error;
  }
  let outcome: { result: PlatformReminderResult; response: string };
  try {
    outcome = await send();
  } catch (error) {
    outcome = { result: 'FAILED', response: (error as Error).message };
  }
  await prisma.platformReminderLog.update({
    where: { id: logId },
    data: { result: outcome.result, providerResponse: outcome.response.slice(0, 1000) },
  });
  return outcome.result;
}

async function deliverSms(phone: string, text: string): Promise<{ result: PlatformReminderResult; response: string }> {
  const r = await sendSms(phone, text);
  return { result: r.status, response: r.message };
}

async function deliverEmail(
  to: string,
  mail: { subject: string; html: string; text: string },
  institutionId: string,
  template: string,
  key: string,
): Promise<{ result: PlatformReminderResult; response: string }> {
  const r = await sendEmail({
    to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    template,
    priority: EmailPriority.P1_TRANSACTIONAL,
    institutionId,
    fromName: 'PeopleNIT Billing',
    idempotencyKey: key,
  });
  if (r.status === 'SENT') return { result: 'SENT', response: `email log ${r.logId}` };
  if (r.status === 'FAILED') return { result: 'FAILED', response: r.error ?? 'email failed' };
  return { result: 'SKIPPED', response: `${r.status}${r.error ? `: ${r.error}` : ''}` };
}

export interface ReminderRunSummary {
  day: string;
  invoices: number;
  sent: number;
  skipped: number;
  failed: number;
  duplicates: number;
}

/**
 * Sends today's reminders. `onlyInvoiceId` + `manual` = the collections
 * board's "Send reminder now" (its own dedupe key, so it is not blocked by the
 * scheduled one; still once per day per recipient).
 */
export async function runDailyReminders(now: Date = new Date(), opts: { onlyInvoiceId?: string; manual?: boolean } = {}): Promise<ReminderRunSummary> {
  const day = dhakaDayKey(now);
  const summary: ReminderRunSummary = { day, invoices: 0, sent: 0, skipped: 0, failed: 0, duplicates: 0 };

  const invoices = await prisma.platformInvoice.findMany({
    where: {
      status: { in: UNPAID_STATUSES },
      ...(opts.onlyInvoiceId ? { id: opts.onlyInvoiceId } : {}),
      institution: { platformBillingProfile: { isActive: true } },
    },
    include: { institution: { select: { platformBillingProfile: true } } },
    orderBy: { dueDate: 'asc' },
  });

  for (const inv of invoices) {
    const profile = inv.institution.platformBillingProfile;
    if (!profile) continue;
    const amount = duePaisa(inv);
    if (amount <= 0) continue;
    const scheduledKind = reminderKindFor(inv.dueDate, now);
    const kind = scheduledKind ?? (opts.manual ? (daysPastDue(inv.dueDate, now) > 0 ? 'OVERDUE' : 'UPCOMING') : null);
    if (!kind) continue;
    summary.invoices += 1;

    const contacts = await resolveBillingContacts(inv.institutionId, profile);
    const v = vars(inv, contacts.schoolName, amount, now);
    const tag = opts.manual ? 'manual' : 'auto';
    const count = (r: PlatformReminderResult | null) => {
      if (r === null) summary.duplicates += 1;
      else if (r === 'SENT') summary.sent += 1;
      else if (r === 'FAILED') summary.failed += 1;
      else summary.skipped += 1;
    };

    if (profile.remindSms) {
      const text = renderSms(kind, profile.smsLanguage === 'en' ? 'en' : 'bn', v);
      if (contacts.phones.length === 0) {
        count(
          await sendOnce(
            { institutionId: inv.institutionId, invoiceId: inv.id, kind, channel: 'SMS', recipient: '-', dayKey: day, dedupeKey: `${inv.id}:${day}:${tag}:SMS:none` },
            async () => ({ result: 'SKIPPED', response: 'No valid billing phone number on file' }),
          ),
        );
      }
      for (const phone of contacts.phones) {
        count(
          await sendOnce(
            { institutionId: inv.institutionId, invoiceId: inv.id, kind, channel: 'SMS', recipient: maskPhone(phone), dayKey: day, dedupeKey: `${inv.id}:${day}:${tag}:SMS:${phone}` },
            () => deliverSms(phone, text),
          ),
        );
      }
    }

    if (profile.remindEmail) {
      const mail = renderReminderEmail(kind, v, v.payLink);
      if (contacts.emails.length === 0) {
        count(
          await sendOnce(
            { institutionId: inv.institutionId, invoiceId: inv.id, kind, channel: 'EMAIL', recipient: '-', dayKey: day, dedupeKey: `${inv.id}:${day}:${tag}:EMAIL:none` },
            async () => ({ result: 'SKIPPED', response: 'No billing email address on file' }),
          ),
        );
      }
      for (const email of contacts.emails) {
        const key = `${inv.id}:${day}:${tag}:EMAIL:${email}`;
        count(
          await sendOnce(
            { institutionId: inv.institutionId, invoiceId: inv.id, kind, channel: 'EMAIL', recipient: maskEmail(email), dayKey: day, dedupeKey: key },
            () => deliverEmail(email, mail, inv.institutionId, `platform-billing-${kind.toLowerCase()}`, `p1:${key}`),
          ),
        );
      }
    }
  }

  if (!opts.onlyInvoiceId) logger.info('Platform billing reminders run', { ...summary });
  return summary;
}

/** Payment confirmation SMS + email (once per payment per recipient). */
export async function sendPaymentReceipt(paymentId: string, now: Date = new Date()): Promise<void> {
  const payment = await prisma.platformPayment.findUnique({
    where: { id: paymentId },
    include: { allocations: { include: { invoice: true }, take: 1 } },
  });
  if (!payment || payment.status !== 'SUCCESS') return;
  const profile = await prisma.institutionBillingProfile.findUnique({ where: { institutionId: payment.institutionId } });
  const contacts = await resolveBillingContacts(payment.institutionId, profile);
  const inv = payment.allocations[0]?.invoice;
  const day = dhakaDayKey(now);
  const amountPaisa = Math.round(Number(payment.amount) * 100);
  const v: TemplateVars = inv
    ? vars(inv, contacts.schoolName, amountPaisa, now, { receiptNo: payment.receiptNumber ?? '' })
    : {
        school: contacts.schoolName,
        invoiceNo: '',
        period: '',
        periodBn: '',
        amount: formatTaka(amountPaisa),
        dueDate: '',
        dueDateBn: '',
        daysOverdue: 0,
        payLink: '',
        receiptNo: payment.receiptNumber ?? '',
      };
  const link = `${env.FRONTEND_URL.replace(/\/+$/, '')}/billing`;

  if (profile?.remindSms !== false) {
    const text = renderSms('RECEIPT', profile?.smsLanguage === 'en' ? 'en' : 'bn', v);
    for (const phone of contacts.phones) {
      await sendOnce(
        { institutionId: payment.institutionId, invoiceId: inv?.id ?? null, kind: 'RECEIPT', channel: 'SMS', recipient: maskPhone(phone), dayKey: day, dedupeKey: `${payment.id}:RECEIPT:SMS:${phone}` },
        () => deliverSms(phone, text),
      );
    }
  }
  if (profile?.remindEmail !== false) {
    const mail = renderReminderEmail('RECEIPT', v, link);
    for (const email of contacts.emails) {
      const key = `${payment.id}:RECEIPT:EMAIL:${email}`;
      await sendOnce(
        { institutionId: payment.institutionId, invoiceId: inv?.id ?? null, kind: 'RECEIPT', channel: 'EMAIL', recipient: maskEmail(email), dayKey: day, dedupeKey: key },
        () => deliverEmail(email, mail, payment.institutionId, 'platform-billing-receipt', `p1:${key}`),
      );
    }
  }
}
