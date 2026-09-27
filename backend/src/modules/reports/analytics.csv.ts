// Renders a whole analytics tab as one multi-section CSV. Used by the
// /reports/analytics/:reportKey/export.csv endpoint and by scheduled report
// emails, so a schedule always emails exactly what the export would return.
import { BadRequestError, ForbiddenError } from '../../utils/AppError';
import * as enquiriesService from '../enquiries/enquiries.service';
import { canAccessReport } from './analytics.access';
import { resolveRange, sectionsToCsv, type CsvSection } from './analytics.logic';
import { institutionClock, type Requester } from './analytics.scope';
import * as analytics from './analytics.service';
import type { ReportFiltersDtoType, ReportKey } from './analytics.dto';

const MAX_LIST_ROWS = 100;

export interface RenderedReport {
  csv: string;
  rows: number;
  /** Human-readable window, e.g. "2026-09-01 to 2026-09-27". */
  rangeLabel: string;
}

const countRows = (sections: CsvSection[]) => sections.reduce((n, s) => n + s.rows.length, 0);

async function financeSections(institutionId: string, requester: Requester, f: ReportFiltersDtoType) {
  const data = await analytics.getFinanceAnalytics(institutionId, requester, { ...f });
  const defaulters = await analytics.getTopDefaulters(institutionId, requester, { ...f, page: 1, pageSize: MAX_LIST_ROWS });
  const k = data.kpis;
  const sections: CsvSection[] = [
    {
      title: 'Finance summary',
      headers: ['Metric', 'Value'],
      rows: [
        ['From', data.range.from],
        ['To', data.range.to],
        ['Total collected', k.totalCollected],
        ['Payments', k.paymentsCount],
        ['Billed (due in range)', k.billedDueInRange],
        ['Collected against dues in range', k.collectedAgainstDue],
        ['Collection rate %', k.collectionRate],
        ['Total outstanding (today)', k.totalOutstanding],
        ['Total overdue (today)', k.totalOverdue],
        ['Students with overdue fees', k.defaulterCount],
      ],
    },
    {
      title: `Collections by ${data.granularity}`,
      headers: ['Period', 'Amount', 'Payments'],
      rows: data.collections.map((c) => [c.period, c.amount, c.count]),
    },
    {
      title: 'By fee head',
      headers: ['Fee head', 'Billed (due in range)', 'Collected (allocated)'],
      rows: data.byFeeHead.map((h) => [h.name, h.billed, h.collected]),
    },
    {
      title: 'By payment method',
      headers: ['Method', 'Amount', 'Payments'],
      rows: data.byMethod.map((m) => [m.method, m.amount, m.count]),
    },
    {
      title: `Outstanding aging (as of ${data.aging.asOf})`,
      headers: ['Bucket', 'Amount', 'Invoices'],
      rows: data.aging.buckets.map((b) => [b.label, b.amount, b.count]),
    },
    {
      title: `Top defaulters (first ${MAX_LIST_ROWS} of ${defaulters.meta.total})`,
      headers: ['Student ID', 'Name', 'Class', 'Section', 'Roll', 'Overdue amount', 'Overdue invoices', 'Oldest due date', 'Days overdue'],
      rows: defaulters.items.map((d) => [d.studentCode, d.name, d.className, d.sectionName, d.rollNumber, d.overdueAmount, d.overdueInvoices, d.oldestDueDate, d.daysOverdue]),
    },
  ];
  return { sections, rangeLabel: `${data.range.from} to ${data.range.to}` };
}

async function attendanceSections(institutionId: string, requester: Requester, f: ReportFiltersDtoType) {
  const threshold = f.threshold ?? 20;
  const minDays = f.minDays ?? 5;
  const data = await analytics.getAttendanceAnalytics(institutionId, requester, { ...f, threshold, minDays });
  const chronic = await analytics.getChronicAbsentees(institutionId, requester, { ...f, threshold, minDays, page: 1, pageSize: MAX_LIST_ROWS });
  const k = data.kpis;
  const sections: CsvSection[] = [
    {
      title: 'Attendance summary',
      headers: ['Metric', 'Value'],
      rows: [
        ['From', data.range.from],
        ['To', data.range.to],
        ['Attendance rate %', k.rate],
        ['Records', k.records],
        ['Present', k.present],
        ['Absent', k.absent],
        ['Late', k.late],
        ['Half day', k.halfDay],
        ['Students counted', k.studentsCounted],
        ['Days recorded', k.daysRecorded],
        [`Chronic absentees (>= ${threshold}% absent, min ${minDays} days)`, k.chronicAbsentees],
      ],
    },
    {
      title: 'Daily trend',
      headers: ['Date', 'Rate %', 'Present', 'Absent', 'Late', 'Half day', 'Total'],
      rows: data.trend.filter((t) => t.total > 0).map((t) => [t.date, t.rate, t.present, t.absent, t.late, t.halfDay, t.total]),
    },
    {
      title: 'By class / section',
      headers: ['Class', 'Section', 'Students', 'Rate %', 'Present', 'Absent', 'Late', 'Half day', 'Total'],
      rows: data.byClass.map((c) => [c.className, c.sectionName, c.students, c.rate, c.present, c.absent, c.late, c.halfDay, c.total]),
    },
    {
      title: 'Day of week',
      headers: ['Weekday', 'Days recorded', 'Rate %', 'Total records'],
      rows: data.weekday.filter((w) => w.total > 0).map((w) => [w.label, w.days, w.rate, w.total]),
    },
    {
      title: `Chronic absentees (first ${MAX_LIST_ROWS} of ${chronic.meta.total})`,
      headers: ['Student ID', 'Name', 'Class', 'Section', 'Roll', 'Absent', 'Half day', 'Marked days', 'Absence rate %'],
      rows: chronic.items.map((c) => [c.studentCode, c.name, c.className, c.sectionName, c.rollNumber, c.absent, c.halfDay, c.total, c.absenceRate]),
    },
  ];
  return { sections, rangeLabel: `${data.range.from} to ${data.range.to}` };
}

async function academicSections(institutionId: string, requester: Requester, f: ReportFiltersDtoType) {
  const data = await analytics.getAcademicAnalytics(institutionId, requester, { ...f });
  if (!data.exam || !data.overall) {
    return {
      sections: [{ title: 'Academic summary', headers: ['Metric', 'Value'], rows: [['Exam', 'No exams in the selected window']] }],
      rangeLabel: 'no exams',
    };
  }
  const o = data.overall;
  const sections: CsvSection[] = [
    {
      title: 'Academic summary',
      headers: ['Metric', 'Value'],
      rows: [
        ['Exam', data.exam.name],
        ['Grading scale', data.scale.name],
        ['Students with results', o.studentsWithResults],
        ['Passed', o.passCount],
        ['Failed', o.failCount],
        ['Pass rate %', o.passRate],
        ['Average %', o.averagePercent],
        ['Average GPA', o.averageGpa],
      ],
    },
    {
      title: 'By class / section',
      headers: ['Class', 'Section', 'Students', 'Passed', 'Failed', 'Pass rate %', 'Average %', 'Average GPA'],
      rows: data.byClass.map((c) => [c.className, c.sectionName, c.students, c.passCount, c.failCount, c.passRate, c.averagePercent, c.averageGpa]),
    },
    {
      title: 'By subject',
      headers: ['Subject', 'Entries', 'Pass rate %', 'Average %', 'Highest %', 'Lowest %'],
      rows: data.subjects.map((s) => [s.subject, s.entries, s.passRate, s.averagePercent, s.highestPercent, s.lowestPercent]),
    },
    {
      title: 'Grade distribution (students, overall grade)',
      headers: ['Grade', 'Students'],
      rows: data.gradeDistribution.map((g) => [g.grade, g.count]),
    },
    {
      title: 'Exam-over-exam trend',
      headers: ['Exam', 'Start date', 'Students', 'Pass rate %', 'Average %', 'Average GPA'],
      rows: data.trend.map((t) => [t.name, t.startDate, t.students, t.passRate, t.averagePercent, t.averageGpa]),
    },
  ];
  return { sections, rangeLabel: data.exam.name };
}

async function admissionsSections(institutionId: string, f: ReportFiltersDtoType) {
  const clock = await institutionClock(institutionId);
  const hasWindow = Boolean(f.from || f.to || (f.preset && f.preset !== 'custom'));
  let range: ReturnType<typeof resolveRange> | null = null;
  try {
    range = hasWindow ? resolveRange(f, clock.todayKey) : null;
  } catch (err) {
    throw new BadRequestError((err as Error).message);
  }
  const funnel = await enquiriesService.getFunnel(institutionId, {
    from: range ? new Date(`${range.from}T00:00:00.000Z`) : undefined,
    to: range ? new Date(`${range.to}T23:59:59.999Z`) : undefined,
  });
  const sections: CsvSection[] = [
    {
      title: 'Admissions funnel',
      headers: ['Metric', 'Value'],
      rows: [
        ['From', range?.from ?? 'all time'],
        ['To', range?.to ?? 'all time'],
        ['Enquiries', funnel.enquiries],
        ['Open', funnel.open],
        ['Lost', funnel.lost],
        ['Applications (total)', funnel.applications.total],
        ['Applications pending', funnel.applications.pending],
        ['Applications from enquiries', funnel.applications.fromEnquiries],
        ['Enrolled', funnel.enrolled],
        ['Application rate %', funnel.applicationRate],
        ['Conversion rate %', funnel.conversionRate],
      ],
    },
    {
      title: 'Enquiries by status',
      headers: ['Status', 'Count'],
      rows: Object.entries(funnel.byStatus).map(([status, count]) => [status, count]),
    },
  ];
  return { sections, rangeLabel: range ? `${range.from} to ${range.to}` : 'all time' };
}

export async function renderReportCsv(
  institutionId: string,
  requester: Requester,
  reportKey: ReportKey,
  filters: ReportFiltersDtoType,
): Promise<RenderedReport> {
  if (!canAccessReport(requester.role, reportKey)) {
    throw new ForbiddenError('You do not have access to this report');
  }
  const out =
    reportKey === 'finance'
      ? await financeSections(institutionId, requester, filters)
      : reportKey === 'attendance'
        ? await attendanceSections(institutionId, requester, filters)
        : reportKey === 'academic'
          ? await academicSections(institutionId, requester, filters)
          : await admissionsSections(institutionId, filters);
  return { csv: sectionsToCsv(out.sections), rows: countRows(out.sections), rangeLabel: out.rangeLabel };
}
