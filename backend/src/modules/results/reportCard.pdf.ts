import PDFDocument from 'pdfkit';
import { drawLetterhead, type PdfInstitution } from '../../utils/pdfHeader';
import { computeGrade } from '../../utils/grading';

interface ReportCardData {
  institution: PdfInstitution;
  student: {
    studentId: string;
    firstName: string;
    lastName: string;
    rollNumber: string | null;
    dateOfBirth: Date | null;
    class: { name: string } | null;
    section: { name: string } | null;
    classTeacherName: string | null;
    academicYearLabel: string | null;
  };
  exam: { name: string; startDate: Date; endDate: Date };
  results: Array<{ subject: string; marksObtained: number; maxMarks: number; grade: string; remarks: string; isCore: boolean }>;
  totalObtained: number;
  totalMax: number;
  overallPercentage: number;
  attendance: { totalDays: number; present: number; absent: number; late: number; halfDay: number; rate: number } | null;
  classRank: { rank: number; totalStudents: number } | null;
}

const NAVY = '#1e3a8a';
const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const GOLD = '#b08d57';
const GREEN = '#059669';
const RED = '#dc2626';

function gradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A' || grade === 'A-') return GREEN;
  if (grade === 'B' || grade === 'C') return '#d97706';
  return RED;
}

function drawLabelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(value || '-', x, y + 11, { width });
}

// Bold section heading with a trailing gold rule, mirroring the template's
// "SECTION LABEL" motif.
function drawSectionLabel(doc: PDFKit.PDFDocument, text: string, startX: number, contentWidth: number) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(text.toUpperCase(), startX, doc.y, { width: contentWidth });
  doc.moveDown(0.25);
  doc.moveTo(startX, doc.y).lineTo(startX + contentWidth, doc.y).lineWidth(0.75).strokeColor(GOLD).stroke();
  doc.moveDown(0.5);
}

const COLS = [
  { key: 'subject', label: 'Subject', width: 0.36, align: 'left' as const },
  { key: 'obtained', label: 'Obtained', width: 0.13, align: 'right' as const },
  { key: 'max', label: 'Max', width: 0.13, align: 'right' as const },
  { key: 'grade', label: 'Grade', width: 0.12, align: 'center' as const },
  { key: 'remarks', label: 'Remarks', width: 0.26, align: 'left' as const },
];

function drawTableHeader(doc: PDFKit.PDFDocument, startX: number, y: number, contentWidth: number) {
  const rowHeight = 22;
  doc.rect(startX, y, contentWidth, rowHeight).fill(NAVY);
  let x = startX;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
  for (const col of COLS) {
    const w = contentWidth * col.width;
    doc.text(col.label, x + 8, y + 6, { width: w - 12, align: col.align });
    x += w;
  }
  return y + rowHeight;
}

// Real bands from computeGrade() — not invented, kept in sync by hand since
// computeGrade() itself has no introspectable "scale" to derive this from.
const GRADING_SCALE = [
  { range: '80 - 100', grade: 'A+', descriptor: 'Excellent' },
  { range: '70 - 79', grade: 'A', descriptor: 'Very Good' },
  { range: '60 - 69', grade: 'A-', descriptor: 'Good' },
  { range: '50 - 59', grade: 'B', descriptor: 'Satisfactory' },
  { range: '40 - 49', grade: 'C', descriptor: 'Fair' },
  { range: '33 - 39', grade: 'D', descriptor: 'Pass' },
  { range: '0 - 32', grade: 'F', descriptor: 'Fail' },
];

// A short, deterministic summary from real marks data (best/weakest core
// subject + overall grade) — not an LLM call and not attributed to any
// specific teacher, so it's labeled "Performance Summary" rather than
// "Class Teacher's Remarks".
function generatePerformanceSummary(firstName: string, results: ReportCardData['results'], overallGrade: string, overallPercentage: number): string {
  const core = results.filter((r) => r.isCore && r.maxMarks > 0);
  const tier =
    overallGrade === 'A+' || overallGrade === 'A' ? 'excellently' :
    overallGrade === 'A-' || overallGrade === 'B' ? 'well' :
    overallGrade === 'C' || overallGrade === 'D' ? 'adequately' : 'poorly';
  let summary = `${firstName} performed ${tier} overall, achieving grade ${overallGrade} with ${overallPercentage}%.`;

  if (core.length >= 2) {
    const best = core.reduce((a, b) => (b.marksObtained / b.maxMarks > a.marksObtained / a.maxMarks ? b : a));
    const weakest = core.reduce((a, b) => (b.marksObtained / b.maxMarks < a.marksObtained / a.maxMarks ? b : a));
    if (best.subject !== weakest.subject) {
      summary += ` Particular strength was shown in ${best.subject}, while continued focus on ${weakest.subject} is recommended.`;
    }
  }
  return summary;
}

/**
 * Renders a report-card PDF via pdfkit (pure JS, no headless browser —
 * Puppeteer/Chromium could not launch on the hosted Node environment).
 */
export async function renderReportCardPdf(data: ReportCardData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const startX = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  // Double border frame — letterhead feel.
  doc.rect(16, 16, doc.page.width - 32, doc.page.height - 32).lineWidth(1.25).strokeColor(NAVY).stroke();
  doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).lineWidth(0.5).strokeColor(GOLD).stroke();

  const dateRange = `${data.exam.startDate.toDateString()} - ${data.exam.endDate.toDateString()}`;
  const termSubtitle = data.student.academicYearLabel ? `${data.exam.name}  |  ${dateRange}` : dateRange;
  await drawLetterhead(doc, data.institution, 'Academic Report Card', termSubtitle);

  // ── Student Information ────────────────────────────────────────────────
  drawSectionLabel(doc, 'Student Information', startX, contentWidth);
  const infoRows: Array<Array<[string, string]>> = [
    [
      ['Student Name', `${data.student.firstName} ${data.student.lastName}`],
      ['Student ID', data.student.studentId],
      ['Date of Birth', data.student.dateOfBirth ? data.student.dateOfBirth.toDateString() : '-'],
    ],
    [
      ['Class / Section', `${data.student.class?.name ?? '-'} - ${data.student.section?.name ?? '-'}`],
      ['Roll Number', data.student.rollNumber ?? '-'],
      ['Class Teacher', data.student.classTeacherName ?? '-'],
    ],
    [
      ['Academic Year', data.student.academicYearLabel ?? '-'],
      ['Exam / Term', data.exam.name],
      ['Date of Issue', new Date().toDateString()],
    ],
  ];
  const gridY = doc.y;
  const gridRowHeight = 30;
  const gridColWidth = contentWidth / 3;
  doc.rect(startX, gridY, contentWidth, gridRowHeight * infoRows.length).lineWidth(1).strokeColor(BORDER).stroke();
  infoRows.forEach((row, ri) => {
    row.forEach(([label, value], ci) => {
      const cx = startX + ci * gridColWidth;
      const cy = gridY + ri * gridRowHeight;
      if (ci > 0) doc.moveTo(cx, cy).lineTo(cx, cy + gridRowHeight).lineWidth(0.5).strokeColor(BORDER).stroke();
      if (ri > 0) doc.moveTo(startX, cy).lineTo(startX + contentWidth, cy).lineWidth(0.5).strokeColor(BORDER).stroke();
      drawLabelValue(doc, label, value, cx + 10, cy + 8, gridColWidth - 20);
    });
  });
  doc.y = gridY + gridRowHeight * infoRows.length + 12;

  // ── Academic Performance ───────────────────────────────────────────────
  drawSectionLabel(doc, 'Academic Performance', startX, contentWidth);
  let cursorY = drawTableHeader(doc, startX, doc.y, contentWidth);
  const MIN_ROW_HEIGHT = 22;
  const ROW_VPADDING = 12;
  let hasNonCore = false;

  data.results.forEach((r, i) => {
    if (!r.isCore) hasNonCore = true;
    const cells: Record<string, string> = {
      subject: r.subject + (r.isCore ? '' : ' *'),
      obtained: String(r.marksObtained),
      max: String(r.maxMarks),
      grade: r.grade,
      remarks: r.remarks || '-',
    };

    doc.font('Helvetica').fontSize(9);
    const rowHeight = Math.max(
      MIN_ROW_HEIGHT,
      ...COLS.map((col) => doc.heightOfString(cells[col.key], { width: contentWidth * col.width - 12 }) + ROW_VPADDING),
    );

    if (cursorY + rowHeight > pageBottom - 110) {
      doc.addPage();
      cursorY = doc.page.margins.top;
      cursorY = drawTableHeader(doc, startX, cursorY, contentWidth);
    }
    if (i % 2 === 1) {
      doc.rect(startX, cursorY, contentWidth, rowHeight).fill('#f8fafc');
    }
    let x = startX;
    for (const col of COLS) {
      const w = contentWidth * col.width;
      doc
        .font(col.key === 'grade' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor(col.key === 'grade' ? gradeColor(r.grade) : INK)
        .text(cells[col.key], x + 8, cursorY + 6, { width: w - 12, align: col.align });
      x += w;
    }
    doc
      .moveTo(startX, cursorY + rowHeight)
      .lineTo(startX + contentWidth, cursorY + rowHeight)
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();
    cursorY += rowHeight;
  });

  // Totals row (core subjects only)
  doc.rect(startX, cursorY, contentWidth, 24).fillAndStroke('#f1f5f9', BORDER);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Total (Core Subjects)', startX + 8, cursorY + 7, { width: contentWidth * COLS[0].width - 12 });
  let tx = startX + contentWidth * COLS[0].width;
  doc.text(String(data.totalObtained), tx + 8, cursorY + 7, { width: contentWidth * COLS[1].width - 12, align: 'right' });
  tx += contentWidth * COLS[1].width;
  doc.text(String(data.totalMax), tx + 8, cursorY + 7, { width: contentWidth * COLS[2].width - 12, align: 'right' });
  cursorY += 24;
  doc.y = cursorY + 4;

  if (hasNonCore) {
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MUTED).text('* Co-curricular subject — not included in the overall total', startX, doc.y, { width: contentWidth, align: 'right' });
    doc.moveDown(0.6);
  } else {
    doc.moveDown(0.3);
  }

  // ── Grading Scale + Attendance (two columns) ───────────────────────────
  if (doc.y + 140 > pageBottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
  const colGap = 16;
  const twoColWidth = (contentWidth - colGap) / 2;
  const twoColY = doc.y;

  // Left: Grading Scale
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('GRADING SCALE', startX, twoColY);
  const scaleTop = twoColY + 16;
  const scaleRowH = 14;
  const scaleColW = [twoColWidth * 0.3, twoColWidth * 0.2, twoColWidth * 0.5];
  doc.rect(startX, scaleTop, twoColWidth, scaleRowH * (GRADING_SCALE.length + 1)).lineWidth(1).strokeColor(BORDER).stroke();
  doc.rect(startX, scaleTop, twoColWidth, scaleRowH).fill('#f1f5f9');
  doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED);
  doc.text('RANGE', startX + 6, scaleTop + 4, { width: scaleColW[0] - 6 });
  doc.text('GRADE', startX + scaleColW[0], scaleTop + 4, { width: scaleColW[1] });
  doc.text('DESCRIPTOR', startX + scaleColW[0] + scaleColW[1], scaleTop + 4, { width: scaleColW[2] - 6 });
  GRADING_SCALE.forEach((row, i) => {
    const ry = scaleTop + scaleRowH * (i + 1);
    doc.font('Helvetica').fontSize(8).fillColor(INK).text(row.range, startX + 6, ry + 3, { width: scaleColW[0] - 6 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text(row.grade, startX + scaleColW[0], ry + 3, { width: scaleColW[1] });
    doc.font('Helvetica').fontSize(8).fillColor(INK).text(row.descriptor, startX + scaleColW[0] + scaleColW[1], ry + 3, { width: scaleColW[2] - 6 });
  });
  const scaleBottom = scaleTop + scaleRowH * (GRADING_SCALE.length + 1);

  // Right: Attendance Record
  const attX = startX + twoColWidth + colGap;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('ATTENDANCE RECORD', attX, twoColY);
  const attTop = twoColY + 16;
  const attHeight = scaleBottom - scaleTop;
  doc.rect(attX, attTop, twoColWidth, attHeight).lineWidth(1).strokeColor(BORDER).stroke();
  if (data.attendance) {
    const rows: Array<[string, string]> = [
      ['Total School Days', String(data.attendance.totalDays)],
      ['Days Present', String(data.attendance.present)],
      ['Days Absent', String(data.attendance.absent)],
      ['Attendance Rate', `${data.attendance.rate}%`],
    ];
    const attRowH = attHeight / rows.length;
    rows.forEach(([label, value], i) => {
      const ry = attTop + i * attRowH;
      if (i > 0) doc.moveTo(attX, ry).lineTo(attX + twoColWidth, ry).lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.font(i === rows.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(i === rows.length - 1 ? NAVY : INK)
        .text(label, attX + 8, ry + attRowH / 2 - 5, { width: twoColWidth * 0.6 });
      doc.font(i === rows.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(i === rows.length - 1 ? NAVY : INK)
        .text(value, attX + twoColWidth * 0.6, ry + attRowH / 2 - 5, { width: twoColWidth * 0.4 - 10, align: 'right' });
    });
  } else {
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED)
      .text('Attendance data not available for this period.', attX + 10, attTop + attHeight / 2 - 6, { width: twoColWidth - 20, align: 'center' });
  }

  doc.y = scaleBottom + 12;

  // ── Performance Summary + Result Banner + Signatures ───────────────────
  // Sized and page-broken as one unit: splitting the summary onto the tail
  // of one page and the banner onto the top of the next (each individually
  // "fits") looks worse than moving the whole block together, since it
  // strands a mostly-empty page. Measure the whole block up front and make
  // one page-break decision.
  const overallGrade = computeGrade(data.overallPercentage, 100);
  const summaryText = `"${generatePerformanceSummary(data.student.firstName, data.results, overallGrade, data.overallPercentage)}"`;
  const summaryPadding = 10;
  doc.font('Times-Italic').fontSize(10);
  const summaryHeight = doc.heightOfString(summaryText, { width: contentWidth - summaryPadding * 2 }) + summaryPadding * 2;
  const bannerHeight = 54;
  const remainingBlockHeight = 20 /* section label */ + summaryHeight + 14 + bannerHeight + 36 + 20 /* signature line clearance */;

  if (doc.y + remainingBlockHeight > pageBottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }

  drawSectionLabel(doc, 'Performance Summary', startX, contentWidth);
  doc.font('Times-Italic').fontSize(10);
  doc.rect(startX, doc.y, contentWidth, summaryHeight).fillAndStroke('#f8fafc', BORDER);
  doc.fillColor(INK).text(summaryText, startX + summaryPadding, doc.y + summaryPadding, { width: contentWidth - summaryPadding * 2 });
  doc.y += summaryHeight + 14;

  // ── Result Banner ───────────────────────────────────────────────────────
  const resultLabel = overallGrade === 'F' ? 'NEEDS IMPROVEMENT' : 'PASS';
  const pillBg = overallGrade === 'F' ? RED : GREEN;

  const bannerY = doc.y;
  const pillWidth = 130;
  const statsWidth = contentWidth - pillWidth - 12;
  doc.rect(startX, bannerY, contentWidth, bannerHeight).fill(NAVY);

  const statCells: Array<[string, string, string?]> = [
    ['Total Marks', `${data.totalObtained} / ${data.totalMax}`],
    ['Percentage', `${data.overallPercentage}%`],
    ['Overall Grade', overallGrade, gradeColor(overallGrade) === RED ? '#f0908a' : gradeColor(overallGrade) === GREEN ? '#7fe0b0' : '#f0c169'],
  ];
  if (data.classRank) {
    statCells.push(['Class Rank', `${data.classRank.rank} of ${data.classRank.totalStudents}`]);
  }
  const statWidth = statsWidth / statCells.length;
  statCells.forEach(([label, value, color], i) => {
    const x = startX + i * statWidth;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#c9cfdc').text(label.toUpperCase(), x, bannerY + 10, { width: statWidth, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(color ?? '#d8be8e').text(value, x, bannerY + 24, { width: statWidth, align: 'center' });
  });

  const pillX = startX + statsWidth + 12;
  const pillY = bannerY + bannerHeight / 2 - 12;
  doc.rect(pillX, pillY, pillWidth, 24).fill(pillBg);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text(resultLabel, pillX, pillY + 7, { width: pillWidth, align: 'center' });

  doc.y = bannerY + bannerHeight + 36;

  // ── Signatures ──────────────────────────────────────────────────────────
  if (doc.y + 50 > pageBottom) {
    doc.addPage();
    doc.y = doc.page.margins.top + 20;
  }
  const sigWidth = contentWidth / 3;
  const sigY = doc.y;

  // Class Teacher
  const teacherX = startX + 10;
  const teacherW = sigWidth - 20;
  if (data.student.classTeacherName) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK).text(data.student.classTeacherName, teacherX, sigY - 14, { width: teacherW, align: 'center' });
  }
  doc.moveTo(teacherX, sigY).lineTo(teacherX + teacherW, sigY).lineWidth(0.75).strokeColor('#94a3b8').stroke();
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Class Teacher', teacherX, sigY + 4, { width: teacherW, align: 'center' });

  // Principal + seal
  const sealCenterX = startX + sigWidth + sigWidth / 2;
  const sealRadius = 26;
  doc.circle(sealCenterX, sigY - 30, sealRadius).lineWidth(1.5).strokeColor(GOLD).stroke();
  doc.circle(sealCenterX, sigY - 30, sealRadius - 5).dash(1.5, { space: 1.5 }).lineWidth(0.75).strokeColor(GOLD).stroke();
  doc.undash();
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(GOLD).text('OFFICIAL', sealCenterX - sealRadius, sigY - 34, { width: sealRadius * 2, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(GOLD).text('SEAL', sealCenterX - sealRadius, sigY - 26, { width: sealRadius * 2, align: 'center' });
  const principalX = startX + sigWidth + 10;
  const principalW = sigWidth - 20;
  doc.moveTo(principalX, sigY).lineTo(principalX + principalW, sigY).lineWidth(0.75).strokeColor('#94a3b8').stroke();
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Principal', principalX, sigY + 4, { width: principalW, align: 'center' });

  // Guardian
  const guardianX = startX + 2 * sigWidth + 10;
  const guardianW = sigWidth - 20;
  doc.moveTo(guardianX, sigY).lineTo(guardianX + guardianW, sigY).lineWidth(0.75).strokeColor('#94a3b8').stroke();
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Guardian', guardianX, sigY + 4, { width: guardianW, align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#94a3b8')
    .text(`Generated on ${new Date().toDateString()}`, startX, pageBottom - 16, { width: contentWidth, align: 'right' });

  doc.end();
  return finished;
}
