// Executes one scheduled report: re-checks that the creator may still see the
// report, renders the saved view as CSV and emails it to each recipient.
//
// Demo mode: without real SMTP (EMAIL_ENABLED=true + SMTP_HOST) nothing is
// sent — the run is logged, lastRunAt still advances, and callers get
// `demo: true`. ReportSchedule has no isDemo column, so demo runs are only
// visible through the API response and the server log.
import { EmailPriority, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { sendEmail } from '../email/sender';
import { currentTransportMode } from '../email/transport';
import { canAccessReport } from './analytics.access';
import { renderReportCsv } from './analytics.csv';
import { BOM } from './analytics.logic';
import { REPORT_KEYS, ReportFiltersDto, type ReportKey } from './analytics.dto';

const NON_STAFF_ROLES: UserRole[] = [UserRole.STUDENT, UserRole.GUARDIAN];

export function isEmailDemoMode(): boolean {
  return currentTransportMode() === 'demo';
}

/** Of `emails`, those belonging to active staff users of the institution (lower-cased). */
export async function activeStaffEmails(institutionId: string, emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const users = await prisma.user.findMany({
    where: {
      institutionId,
      isActive: true,
      role: { notIn: NON_STAFF_ROLES },
      email: { in: emails, mode: 'insensitive' },
    },
    select: { email: true },
  });
  return new Set(users.map((u) => u.email.toLowerCase()));
}

export const scheduleRunInclude = {
  savedView: { select: { id: true, name: true, reportKey: true, filters: true } },
  createdBy: { select: { id: true, role: true, isActive: true, institutionId: true } },
  institution: { select: { name: true, slug: true, isActive: true } },
} as const;

export interface ScheduleForRun {
  id: string;
  institutionId: string;
  recipients: string[];
  savedView: { id: string; name: string; reportKey: string; filters: unknown };
  createdBy: { id: string; role: UserRole; isActive: boolean; institutionId: string | null };
  institution: { name: string; slug: string; isActive: boolean };
}

export interface RunResult {
  demo: boolean;
  sent: number;
  failed: number;
  skippedRecipients: number;
  rows: number;
  bytes: number;
  rangeLabel: string;
}

/** Throws with a readable reason when the schedule can no longer run. */
export async function executeSchedule(schedule: ScheduleForRun, now = new Date()): Promise<RunResult> {
  const { createdBy, savedView, institution } = schedule;
  if (!institution.isActive) throw new Error('Institution is inactive');
  if (!createdBy.isActive || createdBy.institutionId !== schedule.institutionId) {
    throw new Error('The schedule owner is no longer an active member of this institution');
  }
  if (!(REPORT_KEYS as readonly string[]).includes(savedView.reportKey)) {
    throw new Error(`Unknown report "${savedView.reportKey}"`);
  }
  const reportKey = savedView.reportKey as ReportKey;
  if (!canAccessReport(createdBy.role, reportKey)) {
    throw new Error('The schedule owner no longer has access to this report');
  }

  const parsed = ReportFiltersDto.safeParse(savedView.filters ?? {});
  if (!parsed.success) throw new Error('The saved view has invalid filters');

  const report = await renderReportCsv(schedule.institutionId, { sub: createdBy.id, role: createdBy.role }, reportKey, parsed.data);

  const allowed = await activeStaffEmails(schedule.institutionId, schedule.recipients);
  const recipients = schedule.recipients.map((r) => r.toLowerCase()).filter((r) => allowed.has(r));
  const skippedRecipients = schedule.recipients.length - recipients.length;

  const dateKey = now.toISOString().slice(0, 10);
  const filename = `${institution.slug}-${reportKey}-${dateKey}.csv`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const subject = `${institution.name}: ${savedView.name} (${report.rangeLabel})`;
  const text =
    `Scheduled report "${savedView.name}" from ${institution.name}.\n\n` +
    `Report: ${reportKey}\nPeriod: ${report.rangeLabel}\nRows: ${report.rows}\n\n` +
    'The full report is attached as a CSV file.\n\n' +
    'You receive this because a staff member added you to a scheduled report in PeopleNIT SMS.';
  const bytes = Buffer.byteLength(report.csv, 'utf8');
  const base = { rows: report.rows, bytes, rangeLabel: report.rangeLabel, skippedRecipients };

  if (isEmailDemoMode()) {
    logger.info('[DEMO] Scheduled report rendered but not emailed (SMTP not configured)', {
      scheduleId: schedule.id,
      institutionId: schedule.institutionId,
      reportKey,
      recipients: recipients.length,
      rows: report.rows,
      bytes,
    });
    return { demo: true, sent: 0, failed: 0, ...base };
  }

  let sent = 0;
  let failed = 0;
  const attachments = [{ filename, content: Buffer.from(`${BOM}${report.csv}`, 'utf8'), contentType: 'text/csv; charset=utf-8' }];
  // One message per recipient so addresses are never disclosed to each other.
  for (const to of recipients) {
    const result = await sendEmail({
      to,
      subject,
      html: `<pre style="font-family:monospace;white-space:pre-wrap;">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))}</pre>`,
      text,
      template: 'reports.scheduled-report',
      // Owner decision §4.2: scheduled reports are P2 bulk — deferred to the
      // next UTC day, never dropped, if the daily budget is already spent.
      priority: EmailPriority.P2_BULK,
      institutionId: schedule.institutionId,
      attachments,
      idempotencyKey: `report-schedule:${schedule.id}:${dateKey}:${to}`,
    });
    if (result.status === 'SENT') {
      sent += 1;
    } else {
      failed += 1;
      logger.error('Scheduled report email did not send', {
        scheduleId: schedule.id,
        institutionId: schedule.institutionId,
        status: result.status,
        error: result.error,
      });
    }
  }
  logger.info('Scheduled report emailed', { scheduleId: schedule.id, institutionId: schedule.institutionId, reportKey, sent, failed });
  return { demo: false, sent, failed, ...base };
}
