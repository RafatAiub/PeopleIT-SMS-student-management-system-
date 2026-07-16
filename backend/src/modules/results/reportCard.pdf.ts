interface ReportCardData {
  institutionName: string;
  student: {
    studentId: string;
    firstName: string;
    lastName: string;
    rollNumber: string | null;
    class: { name: string } | null;
    section: { name: string } | null;
  };
  exam: { name: string; startDate: Date; endDate: Date };
  results: Array<{ subject: string; marksObtained: number; maxMarks: number; grade: string; remarks: string }>;
  totalObtained: number;
  totalMax: number;
  overallPercentage: number;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function buildHtml(data: ReportCardData): string {
  const rows = data.results
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.subject)}</td>
        <td class="num">${r.marksObtained}</td>
        <td class="num">${r.maxMarks}</td>
        <td class="grade">${escapeHtml(r.grade)}</td>
        <td>${escapeHtml(r.remarks)}</td>
      </tr>`,
    )
    .join('');

  const dateRange = `${data.exam.startDate.toDateString()} – ${data.exam.endDate.toDateString()}`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; font-family: 'Helvetica Neue', Arial, sans-serif; }
  body { margin: 0; padding: 32px; color: #0f172a; }
  .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0; font-size: 22px; color: #4f46e5; }
  .header p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; }
  .meta div { line-height: 1.6; }
  .meta strong { color: #334155; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #4f46e5; color: white; text-align: left; padding: 8px 10px; font-size: 12px; text-transform: uppercase; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  td.num, th.num { text-align: center; }
  td.grade { font-weight: bold; text-align: center; }
  .summary { display: flex; justify-content: flex-end; gap: 32px; font-size: 14px; margin-bottom: 40px; }
  .summary div { text-align: right; }
  .summary strong { display: block; font-size: 18px; color: #4f46e5; }
  .footer { display: flex; justify-content: space-between; margin-top: 60px; font-size: 12px; color: #64748b; }
  .footer .line { border-top: 1px solid #94a3b8; width: 160px; padding-top: 6px; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(data.institutionName)}</h1>
    <p>Academic Report Card — ${escapeHtml(data.exam.name)}</p>
  </div>

  <div class="meta">
    <div>
      <strong>Student:</strong> ${escapeHtml(data.student.firstName)} ${escapeHtml(data.student.lastName)}<br/>
      <strong>Student ID:</strong> ${escapeHtml(data.student.studentId)}<br/>
      <strong>Roll No:</strong> ${escapeHtml(data.student.rollNumber ?? '-')}
    </div>
    <div>
      <strong>Class:</strong> ${escapeHtml(data.student.class?.name ?? '-')}<br/>
      <strong>Section:</strong> ${escapeHtml(data.student.section?.name ?? '-')}<br/>
      <strong>Exam Period:</strong> ${escapeHtml(dateRange)}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Subject</th>
        <th class="num">Obtained</th>
        <th class="num">Max</th>
        <th class="num">Grade</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="summary">
    <div><strong>${data.totalObtained} / ${data.totalMax}</strong>Total Marks</div>
    <div><strong>${data.overallPercentage}%</strong>Overall Percentage</div>
  </div>

  <div class="footer">
    <div class="line">Class Teacher</div>
    <div class="line">Guardian</div>
    <div class="line">Principal</div>
  </div>
</body>
</html>`;
}

/**
 * Renders a report card to PDF via a headless browser (HTML/CSS -> PDF),
 * reusing the same styling approach as the rest of the app rather than a
 * programmatic PDF-drawing library.
 */
export async function renderReportCardPdf(data: ReportCardData): Promise<Buffer> {
  // Dynamic import — puppeteer ships as an ESM-only package ("type":
  // "module"), which a static `import` compiled to CommonJS `require()`
  // cannot load. Dynamic import() works from CJS to ESM.
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(data), { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
