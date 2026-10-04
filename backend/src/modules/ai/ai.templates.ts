// =============================================================================
// Demo-mode templates — deterministic text built ONLY from the numbers the
// service passes in (the institution's real aggregates). Used when
// ANTHROPIC_API_KEY is not configured, or when the AI provider fails.
// Never invents figures: every number in the output comes from the input.
// =============================================================================

import type { RiskFactor, SmsInfo } from './ai.logic';
import type { RankedDoc } from './ai.retrieval';
import { NO_INFO_ANSWER } from './ai.retrieval';

export type Lang = 'en' | 'bn';
export type Tone = 'formal' | 'friendly' | 'urgent';

const fmtNum = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n);
export const fmtBdt = (n: number) => `BDT ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
export const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// ── Report-card comment ─────────────────────────────────────────────────────

/** The original rule-based comment (kept verbatim for backwards compatibility). */
export function templateComment(subject: string, marks: number, grade: string, maxMarks?: number): string {
  const upperGrade = grade.toUpperCase();
  const pct = maxMarks && maxMarks > 0 ? (marks / maxMarks) * 100 : marks;

  if (['A+', 'A', 'A-'].includes(upperGrade) || pct >= 80) {
    return `Excellent work in ${subject}! The student demonstrates an outstanding understanding of concepts and excels in classroom activities.`;
  }
  if (['B+', 'B', 'B-'].includes(upperGrade) || (pct >= 65 && pct < 80)) {
    return `Good effort in ${subject}, keep it up! Showed solid comprehension of the coursework and positive engagement.`;
  }
  if (['C+', 'C', 'C-'].includes(upperGrade) || (pct >= 50 && pct < 65)) {
    return `Fair performance in ${subject}. The student understands the basics but would benefit from reviewing challenging topics regularly and seeking extra help.`;
  }
  if (['D', 'F', 'E'].includes(upperGrade) || pct < 50) {
    return `The student is struggling in ${subject} and requires additional support. Targeted intervention and regular study habits are strongly advised.`;
  }
  return `Good participation in ${subject}. Continue focusing on key concepts.`;
}

// ── Risk explanation ────────────────────────────────────────────────────────

export function templateRiskExplanation(firstName: string, score: number, level: string, factors: RiskFactor[]): string {
  const withData = factors.filter((f) => f.hasData);
  if (withData.length === 0) {
    return `There is not enough recorded data yet to assess ${firstName}'s academic risk.`;
  }
  const main = [...factors].filter((f) => f.contribution > 0).sort((a, b) => b.contribution - a.contribution);
  const lines = [`${firstName}'s risk score is ${score}/100 (${level.toLowerCase()} risk).`];
  if (main.length === 0) {
    lines.push('None of the tracked factors currently raise concern.');
  } else {
    lines.push(
      `The biggest contributors are: ${main
        .slice(0, 3)
        .map((f) => `${f.label.toLowerCase()} — ${f.value} (+${fmtNum(f.contribution)} of ${f.maxContribution})`)
        .join('; ')}.`,
    );
  }
  const suggestions: string[] = [];
  for (const f of main) {
    if (f.key === 'attendance' && f.contribution >= 10) suggestions.push('contact the guardian about attendance');
    if (f.key === 'marks' && f.contribution >= 10) suggestions.push('arrange extra support in weak subjects');
    if (f.key === 'assignments' && f.contribution >= 5) suggestions.push('follow up on missing assignments');
    if (f.key === 'late' && f.contribution >= 5) suggestions.push('discuss punctuality with the family');
  }
  if (suggestions.length) lines.push(`Suggested next steps: ${suggestions.join(', ')}.`);
  return lines.join(' ');
}

// ── Attendance patterns summary ─────────────────────────────────────────────

export function templateAttendanceSummary(input: {
  consecutiveCount: number;
  dropCount: number;
  decliningClasses: string[];
  improvingClasses: string[];
  overallRecent: number | null;
  overallPrevious: number | null;
}): string {
  const parts: string[] = [];
  if (input.overallRecent !== null && input.overallPrevious !== null) {
    parts.push(
      `Overall attendance was ${fmtNum(input.overallRecent)}% in the last 14 days, compared with ${fmtNum(input.overallPrevious)}% in the 30 days before.`,
    );
  } else if (input.overallRecent !== null) {
    parts.push(`Overall attendance was ${fmtNum(input.overallRecent)}% in the last 14 days.`);
  } else {
    parts.push('No attendance was recorded in the last 14 days.');
  }
  parts.push(
    input.consecutiveCount
      ? `${input.consecutiveCount} student(s) have been absent 3 or more school days in a row.`
      : 'No student has 3 or more consecutive absences.',
  );
  parts.push(
    input.dropCount
      ? `${input.dropCount} student(s) show a sudden drop in attendance.`
      : 'No sudden individual attendance drops were detected.',
  );
  if (input.decliningClasses.length) parts.push(`Declining classes: ${input.decliningClasses.join(', ')}.`);
  if (input.improvingClasses.length) parts.push(`Improving classes: ${input.improvingClasses.join(', ')}.`);
  return parts.join(' ');
}

// ── Fee reminder SMS ────────────────────────────────────────────────────────

export function templateFeeReminder(input: {
  institutionName: string;
  studentFirstName: string;
  amount: number;
  dueDate: Date | null;
  overdue: boolean;
  language: Lang;
  tone: Tone;
}): string {
  const amount = new Intl.NumberFormat('en-IN').format(Math.round(input.amount));
  const date = input.dueDate ? fmtDay(input.dueDate) : null;
  if (input.language === 'bn') {
    const due = input.overdue ? 'বকেয়া' : 'প্রদেয়';
    const when = date ? ` (শেষ তারিখ ${date})` : '';
    const lead = input.tone === 'urgent' ? 'জরুরি: ' : 'সম্মানিত অভিভাবক, ';
    return `${lead}${input.studentFirstName}-এর ${due} ফি ৳${amount}${when}। অনুগ্রহ করে দ্রুত পরিশোধ করুন। - ${input.institutionName}`;
  }
  const lead = input.tone === 'urgent' ? 'URGENT: ' : input.tone === 'friendly' ? 'Hello! ' : 'Dear Guardian, ';
  const status = input.overdue ? 'is overdue' : 'is due';
  const when = date ? (input.overdue ? ` since ${date}` : ` by ${date}`) : '';
  return `${lead}${input.studentFirstName}'s fee of BDT ${amount} ${status}${when}. Please pay at your earliest convenience. - ${input.institutionName}`;
}

// ── Communication drafts ────────────────────────────────────────────────────

export function templateMessageDraft(input: {
  channel: 'SMS' | 'EMAIL' | 'NOTICE';
  purpose: string;
  audience: string;
  language: Lang;
  tone: Tone;
  institutionName: string;
  details?: string;
}): { subject: string | null; body: string } {
  const purpose = input.purpose.trim().replace(/\.$/, '');
  const details = input.details?.trim();
  if (input.language === 'bn') {
    const greet = input.tone === 'urgent' ? 'জরুরি বিজ্ঞপ্তি' : 'সম্মানিত অভিভাবক/শিক্ষার্থীবৃন্দ';
    if (input.channel === 'SMS') {
      return { subject: null, body: `${greet}: ${purpose}${details ? `। ${details}` : ''}। - ${input.institutionName}` };
    }
    return {
      subject: input.channel === 'EMAIL' ? purpose : purpose,
      body: `${greet},\n\n${purpose}।${details ? `\n\n${details}` : ''}\n\nধন্যবাদান্তে,\n${input.institutionName}`,
    };
  }
  const greeting =
    input.tone === 'friendly' ? `Hello ${input.audience},` : input.tone === 'urgent' ? `Important notice for ${input.audience}:` : `Dear ${input.audience},`;
  if (input.channel === 'SMS') {
    const lead = input.tone === 'urgent' ? 'URGENT: ' : '';
    return { subject: null, body: `${lead}${capitalise(purpose)}.${details ? ` ${details}` : ''} - ${input.institutionName}` };
  }
  const closing = input.tone === 'friendly' ? 'Warm regards,' : 'Sincerely,';
  const body = `${greeting}\n\nThis is to inform you about the following: ${purpose}.${details ? `\n\n${details}` : ''}\n\nPlease contact the school office if you have any questions.\n\n${closing}\n${input.institutionName}`;
  return { subject: capitalise(purpose), body };
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function smsNote(info: SmsInfo): string {
  return `${info.characters} characters, ${info.encoding}: ${info.segments} SMS segment${info.segments === 1 ? '' : 's'} (${info.perSegment} characters per segment).`;
}

// ── Dashboard summary ───────────────────────────────────────────────────────

export interface DashboardFacts {
  studentCount: number;
  staffCount: number;
  totalOutstandingDue: number;
  unpaidInvoiceCount: number;
  overdueInvoiceCount: number;
  noticesCount: number;
  attendanceAvg: number | null;
  attendancePrevAvg: number | null;
  collectedThisMonth: number;
  newAdmissionsThisMonth: number;
  pendingDrafts: number | null;
}

/**
 * Keeps the historic line format the UI parses: an intro line, "- " fact
 * bullets and "N. Title: text" recommendations.
 */
export function templateDashboardSummary(f: DashboardFacts): string {
  const lines = ['Executive Summary for Institution:'];
  lines.push(`- Enrolled Active Students: ${fmtNum(f.studentCount)}`);
  lines.push(`- Active Staff Members: ${fmtNum(f.staffCount)}`);
  lines.push(
    `- Outstanding Collections: ${fmtBdt(f.totalOutstandingDue)} across ${fmtNum(f.unpaidInvoiceCount)} unpaid or partial invoices (${fmtNum(f.overdueInvoiceCount)} past due).`,
  );
  lines.push(`- Collected This Month: ${fmtBdt(f.collectedThisMonth)}`);
  if (f.attendanceAvg !== null) {
    const trend =
      f.attendancePrevAvg !== null
        ? ` (previous 30 days: ${fmtNum(f.attendancePrevAvg)}%)`
        : '';
    lines.push(`- Attendance (last 30 days): ${fmtNum(f.attendanceAvg)}%${trend}`);
  } else {
    lines.push('- Attendance (last 30 days): no records');
  }
  lines.push(`- New Admissions This Month: ${fmtNum(f.newAdmissionsThisMonth)}`);
  lines.push(`- Notice Board Activity: ${fmtNum(f.noticesCount)} active announcements.`);

  lines.push('', 'Recommendations:');
  const recs: string[] = [];
  if (f.overdueInvoiceCount > 0) {
    recs.push(`Collections: ${fmtNum(f.overdueInvoiceCount)} invoices are past due. Review the fee-risk list and send reminders to the highest-risk families first.`);
  } else if (f.unpaidInvoiceCount > 0) {
    recs.push(`Collections: ${fmtNum(f.unpaidInvoiceCount)} invoices are open but none past due. Schedule friendly reminders before their due dates.`);
  }
  if (f.attendanceAvg !== null && f.attendancePrevAvg !== null && f.attendanceAvg < f.attendancePrevAvg - 2) {
    recs.push(`Attendance: attendance fell from ${fmtNum(f.attendancePrevAvg)}% to ${fmtNum(f.attendanceAvg)}%. Check the attendance-pattern report for consecutive absences.`);
  } else if (f.attendanceAvg !== null && f.attendanceAvg < 85) {
    recs.push(`Attendance: the 30-day rate is ${fmtNum(f.attendanceAvg)}%. Follow up on students with repeated absences.`);
  }
  recs.push('Academic: Review students flagged high risk in risk scoring and plan support before the next exams.');
  if (f.pendingDrafts) recs.push(`Review: ${fmtNum(f.pendingDrafts)} AI drafts are waiting for staff review.`);
  recs.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  return lines.join('\n');
}

// ── Teacher workload / forecast narratives ──────────────────────────────────

export function templateWorkloadSummary(input: {
  teacherCount: number;
  avgPeriods: number;
  maxPeriods: number;
  minPeriods: number;
  overloadedNames: string[];
  underloadedNames: string[];
  totalMarksPending: number;
}): string {
  if (input.teacherCount === 0) return 'No teachers found.';
  const parts = [
    `${input.teacherCount} teachers average ${fmtNum(input.avgPeriods)} periods per week (range ${input.minPeriods}–${input.maxPeriods}).`,
  ];
  parts.push(input.overloadedNames.length ? `Heavier than average: ${input.overloadedNames.join(', ')}.` : 'No teacher is significantly above the average load.');
  if (input.underloadedNames.length) parts.push(`Lighter than average: ${input.underloadedNames.join(', ')}.`);
  parts.push(
    input.totalMarksPending
      ? `${fmtNum(input.totalMarksPending)} marks are still to be entered for the selected exam.`
      : 'No marks are pending for the selected exam.',
  );
  return parts.join(' ');
}

export function templateForecastNarrative(input: {
  targetYear: number;
  total: { forecast: number; low: number; high: number; confidence: string; n: number };
  lastYearTotal: number | null;
  growing: string[];
  shrinking: string[];
}): string {
  const parts = [
    `Statistical estimate: about ${input.total.forecast} new admissions in ${input.targetYear} (range ${input.total.low}–${input.total.high}, ${input.total.confidence.toLowerCase()} confidence from ${input.total.n} year(s) of data).`,
  ];
  if (input.lastYearTotal !== null) parts.push(`The most recent year recorded ${input.lastYearTotal} admissions.`);
  if (input.growing.length) parts.push(`Upward trend: ${input.growing.join(', ')}.`);
  if (input.shrinking.length) parts.push(`Downward trend: ${input.shrinking.join(', ')}.`);
  parts.push('This is a straight-line projection of past admissions, not a guarantee.');
  return parts.join(' ');
}

// ── Knowledge answers (demo) ────────────────────────────────────────────────

export function templateKnowledgeAnswer(ranked: RankedDoc[]): string {
  if (ranked.length === 0) return NO_INFO_ANSWER;
  return [
    'Here is what the school’s documents say:',
    ...ranked.map((r) => `• From "${r.doc.title}": ${r.excerpt}`),
  ].join('\n');
}
