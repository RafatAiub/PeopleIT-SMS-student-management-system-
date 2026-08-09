import PDFDocument from 'pdfkit';
import { drawInstitutionHeader, type PdfInstitution } from '../../utils/pdfHeader';
import { computeGrade } from '../../utils/grading';

interface ReportCardData {
  institution: PdfInstitution;
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

const NAVY = '#1e3a8a';
const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';

function gradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A' || grade === 'A-') return '#059669';
  if (grade === 'B' || grade === 'C') return '#d97706';
  return '#dc2626';
}

function drawLabelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(value || '-', x, y + 11, { width });
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

  // Page border frame — classic report-card letterhead touch.
  doc.rect(18, 18, doc.page.width - 36, doc.page.height - 36).lineWidth(1).strokeColor(BORDER).stroke();

  const dateRange = `${data.exam.startDate.toDateString()} - ${data.exam.endDate.toDateString()}`;
  await drawInstitutionHeader(doc, data.institution, 'Academic Report Card', `${data.exam.name}  |  ${dateRange}`);

  // Student info box
  const infoBoxY = doc.y;
  const infoBoxHeight = 92;
  doc.rect(startX, infoBoxY, contentWidth, infoBoxHeight).fillAndStroke('#f8fafc', BORDER);
  const leftX = startX + 14;
  const rightX = startX + contentWidth / 2 + 6;
  const colWidth = contentWidth / 2 - 24;
  const rowY = infoBoxY + 12;
  drawLabelValue(doc, 'Student Name', `${data.student.firstName} ${data.student.lastName}`, leftX, rowY, colWidth);
  drawLabelValue(doc, 'Student ID', data.student.studentId, leftX, rowY + 28, colWidth);
  drawLabelValue(doc, 'Roll No', data.student.rollNumber ?? '-', leftX, rowY + 56, colWidth);
  drawLabelValue(doc, 'Class', data.student.class?.name ?? '-', rightX, rowY, colWidth);
  drawLabelValue(doc, 'Section', data.student.section?.name ?? '-', rightX, rowY + 28, colWidth);
  drawLabelValue(doc, 'Exam', data.exam.name, rightX, rowY + 56, colWidth);
  doc.y = infoBoxY + infoBoxHeight + 18;

  // Results table
  let cursorY = drawTableHeader(doc, startX, doc.y, contentWidth);
  const MIN_ROW_HEIGHT = 22;
  const ROW_VPADDING = 12; // matches the 6px top text offset below + a matching 6px bottom gap

  data.results.forEach((r, i) => {
    const cells: Record<string, string> = {
      subject: r.subject,
      obtained: String(r.marksObtained),
      max: String(r.maxMarks),
      grade: r.grade,
      remarks: r.remarks || '-',
    };

    // Multi-line remarks (or a long subject name) need more than the 22px
    // minimum — measure every column at its actual draw width and size the
    // row to the tallest one, so wrapped text can never bleed into the row
    // below.
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

  doc.y = cursorY + 18;

  // Summary strip
  if (doc.y + 60 > pageBottom - 60) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
  const overallGrade = computeGrade(data.overallPercentage, 100);
  const summaryY = doc.y;
  const summaryHeight = 54;
  doc.rect(startX, summaryY, contentWidth, summaryHeight).fillAndStroke('#eff6ff', '#bfdbfe');
  const thirdWidth = contentWidth / 3;
  const summaryCells: Array<[string, string, string?]> = [
    ['Total Marks', `${data.totalObtained} / ${data.totalMax}`],
    ['Percentage', `${data.overallPercentage}%`],
    ['Overall Grade', overallGrade, gradeColor(overallGrade)],
  ];
  summaryCells.forEach(([label, value, color], i) => {
    const x = startX + i * thirdWidth;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, summaryY + 10, { width: thirdWidth, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(18).fillColor(color ?? NAVY).text(value, x, summaryY + 24, { width: thirdWidth, align: 'center' });
  });
  doc.y = summaryY + summaryHeight + 40;

  // Signature footer
  if (doc.y + 40 > pageBottom) {
    doc.addPage();
    doc.y = doc.page.margins.top + 20;
  }
  const sigWidth = contentWidth / 3;
  const sigY = doc.y;
  ['Class Teacher', 'Guardian', 'Principal'].forEach((label, i) => {
    const x = startX + i * sigWidth + 10;
    const w = sigWidth - 20;
    doc.moveTo(x, sigY).lineTo(x + w, sigY).lineWidth(0.75).strokeColor('#94a3b8').stroke();
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, x, sigY + 4, { width: w, align: 'center' });
  });

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#94a3b8')
    .text(`Generated on ${new Date().toDateString()}`, startX, pageBottom - 20, { width: contentWidth, align: 'right' });

  doc.end();
  return finished;
}
