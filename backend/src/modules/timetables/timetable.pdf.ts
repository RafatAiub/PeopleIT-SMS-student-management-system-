// Mirrors the DAYS/TIME_SLOTS grid hardcoded in
// frontend/src/pages/timetables/TimetableGrid.tsx — there is no Period/Break
// model in the schema, so the weekly grid shape lives as a constant on both
// sides. Keep the two in sync if the school's period structure changes.
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

const PERIODS = [
  { label: 'Period 1', display: '09:00 AM - 09:45 AM', startTime: '09:00', isBreak: false },
  { label: 'Period 2', display: '09:45 AM - 10:30 AM', startTime: '09:45', isBreak: false },
  { label: 'Period 3', display: '10:30 AM - 11:15 AM', startTime: '10:30', isBreak: false },
  { label: 'Tiffin Break', display: '11:15 AM - 11:30 AM', startTime: '11:15', isBreak: true },
  { label: 'Period 4', display: '11:30 AM - 12:15 PM', startTime: '11:30', isBreak: false },
  { label: 'Period 5', display: '12:15 PM - 01:00 PM', startTime: '12:15', isBreak: false },
];

interface TimetablePdfSlot {
  dayOfWeek: string;
  startTime: string;
  subject: string;
  teacherName: string | null;
}

interface TimetablePdfData {
  institutionName: string;
  title: string;
  subtitle: string;
  slots: TimetablePdfSlot[];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function buildHtml(data: TimetablePdfData): string {
  const generatedOn = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const rows = PERIODS.map((period) => {
    const timeCell = `<td class="time"><div class="period-label">${escapeHtml(period.label)}</div><div class="period-range">${escapeHtml(period.display)}</div></td>`;

    if (period.isBreak) {
      const breakCells = DAYS.map(() => `<td class="break">Break</td>`).join('');
      return `<tr class="break-row">${timeCell}${breakCells}</tr>`;
    }

    const dayCells = DAYS.map((day) => {
      const slot = data.slots.find(
        (s) => s.dayOfWeek === day.toUpperCase() && s.startTime === period.startTime,
      );
      if (!slot) {
        return `<td class="free">Free</td>`;
      }
      return `<td class="filled"><div class="subject">${escapeHtml(slot.subject)}</div>${
        slot.teacherName ? `<div class="teacher">${escapeHtml(slot.teacherName)}</div>` : ''
      }</td>`;
    }).join('');

    return `<tr>${timeCell}${dayCells}</tr>`;
  }).join('');

  const dayHeaders = DAYS.map((d) => `<th>${escapeHtml(d)}</th>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; font-family: 'Helvetica Neue', Arial, sans-serif; }
  body { margin: 0; padding: 28px; color: #0f172a; }
  .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 14px; margin-bottom: 18px; }
  .header h1 { margin: 0; font-size: 20px; color: #4f46e5; }
  .header p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
  .meta { text-align: right; font-size: 11px; color: #94a3b8; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #4f46e5; color: white; text-align: center; padding: 8px 6px; font-size: 11px; text-transform: uppercase; }
  th.time-col { width: 13%; }
  td { border: 1px solid #e2e8f0; padding: 6px; font-size: 11px; text-align: center; vertical-align: middle; height: 52px; }
  td.time { background: #f8fafc; text-align: left; }
  .period-label { font-weight: bold; color: #0f172a; }
  .period-range { color: #64748b; font-size: 9px; margin-top: 2px; }
  td.break { background: repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 8px, #e2e8f0 8px, #e2e8f0 16px); color: #94a3b8; font-style: italic; text-transform: uppercase; letter-spacing: 1px; font-size: 9px; }
  td.free { color: #cbd5e1; font-style: italic; }
  td.filled { background: #eef2ff; }
  .subject { font-weight: bold; color: #4338ca; }
  .teacher { color: #64748b; font-size: 9px; margin-top: 2px; }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(data.institutionName)}</h1>
    <p>${escapeHtml(data.title)} — ${escapeHtml(data.subtitle)}</p>
  </div>
  <div class="meta">Generated on ${escapeHtml(generatedOn)}</div>
  <table>
    <thead>
      <tr>
        <th class="time-col">Time Slot</th>
        ${dayHeaders}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Renders a class/teacher/student routine to PDF via a headless browser,
 * mirroring the report-card PDF approach in results/reportCard.pdf.ts.
 */
export async function renderTimetablePdf(data: TimetablePdfData): Promise<Buffer> {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(data), { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '16px', right: '16px' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
