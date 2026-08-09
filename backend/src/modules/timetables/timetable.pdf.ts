import PDFDocument from 'pdfkit';
import { drawInstitutionHeader, type PdfInstitution } from '../../utils/pdfHeader';

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
  institution: PdfInstitution;
  title: string;
  subtitle: string;
  slots: TimetablePdfSlot[];
}

const NAVY = '#4f46e5';
const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';

/**
 * Renders a class/teacher/student routine to PDF via pdfkit (pure JS, no
 * headless browser — Puppeteer/Chromium could not launch on the hosted
 * Node environment).
 */
export async function renderTimetablePdf(data: TimetablePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const startX = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.rect(14, 14, doc.page.width - 28, doc.page.height - 28).lineWidth(1).strokeColor(BORDER).stroke();

  await drawInstitutionHeader(doc, data.institution, data.title, data.subtitle);

  const timeColWidth = contentWidth * 0.13;
  const dayColWidth = (contentWidth - timeColWidth) / DAYS.length;
  const headerRowHeight = 22;
  const rowHeight = 46;

  // Table header
  let y = doc.y;
  doc.rect(startX, y, contentWidth, headerRowHeight).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
  doc.text('TIME SLOT', startX + 6, y + 6, { width: timeColWidth - 12 });
  DAYS.forEach((day, i) => {
    const x = startX + timeColWidth + i * dayColWidth;
    doc.text(day.toUpperCase(), x, y + 6, { width: dayColWidth, align: 'center' });
  });
  y += headerRowHeight;

  for (const period of PERIODS) {
    // Time column cell
    doc.rect(startX, y, timeColWidth, rowHeight).fillAndStroke('#f8fafc', BORDER);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(period.label, startX + 6, y + 10, { width: timeColWidth - 12 });
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(period.display, startX + 6, y + 24, { width: timeColWidth - 12 });

    if (period.isBreak) {
      const x = startX + timeColWidth;
      doc.rect(x, y, dayColWidth * DAYS.length, rowHeight).fillAndStroke('#f1f5f9', BORDER);
      doc
        .font('Helvetica-BoldOblique')
        .fontSize(9)
        .fillColor('#94a3b8')
        .text('BREAK', x, y + rowHeight / 2 - 5, { width: dayColWidth * DAYS.length, align: 'center' });
    } else {
      DAYS.forEach((day, i) => {
        const x = startX + timeColWidth + i * dayColWidth;
        const slot = data.slots.find((s) => s.dayOfWeek === day.toUpperCase() && s.startTime === period.startTime);
        doc.rect(x, y, dayColWidth, rowHeight).fillAndStroke(slot ? '#eef2ff' : '#ffffff', BORDER);
        if (slot) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#4338ca').text(slot.subject, x + 4, y + 8, { width: dayColWidth - 8, align: 'center' });
          if (slot.teacherName) {
            doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(slot.teacherName, x + 4, y + 24, { width: dayColWidth - 8, align: 'center' });
          }
        } else {
          doc.font('Helvetica-Oblique').fontSize(8).fillColor('#cbd5e1').text('Free', x, y + rowHeight / 2 - 5, { width: dayColWidth, align: 'center' });
        }
      });
    }

    y += rowHeight;
  }

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#94a3b8')
    .text(`Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, startX, y + 10, {
      width: contentWidth,
      align: 'right',
    });

  doc.end();
  return finished;
}
