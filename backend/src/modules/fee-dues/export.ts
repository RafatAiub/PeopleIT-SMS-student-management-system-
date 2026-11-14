import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { drawInstitutionHeader, type PdfInstitution } from '../../utils/pdfHeader';

// =============================================================================
// P4 report export — one report shape, three formats (xlsx / csv / pdf).
//
// PDF uses the shared letterhead (utils/pdfHeader.ts). Fonts: Helvetica until
// track P3's Bangla-capable PDF fonts land — then only PDF_FONT /
// PDF_FONT_BOLD (or applyPdfFonts) below change.
// =============================================================================

export type ColumnType = 'text' | 'money' | 'number' | 'date' | 'percent';

export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
  /** Relative width for PDF (default 1; money/number 0.8). */
  width?: number;
}

export interface ReportTable {
  title?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, unknown> | null;
}

export interface ReportDoc {
  key: string;
  title: string;
  subtitle?: string;
  filters: Array<{ label: string; value: string }>;
  tables: ReportTable[];
  notes?: string[];
  generatedAt: string;
}

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

export const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

export function fileNameFor(doc: ReportDoc, format: ExportFormat): string {
  const stamp = doc.generatedAt.slice(0, 10);
  return `${doc.key}-${stamp}.${format}`;
}

function cellText(v: unknown, type: ColumnType | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (type === 'money' && typeof v === 'number') return v.toFixed(2);
  if (type === 'percent' && typeof v === 'number') return `${v}%`;
  return String(v);
}

// ── CSV ──────────────────────────────────────────────────────────────────

function csvEscape(s: string): string {
  // Formula-injection guard: a cell starting with = + - @ is prefixed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(doc: ReportDoc): Buffer {
  const lines: string[] = [];
  lines.push(csvEscape(doc.title));
  for (const f of doc.filters) lines.push(`${csvEscape(f.label)},${csvEscape(f.value)}`);
  for (const t of doc.tables) {
    lines.push('');
    if (t.title) lines.push(csvEscape(t.title));
    lines.push(t.columns.map((c) => csvEscape(c.label)).join(','));
    for (const r of t.rows) lines.push(t.columns.map((c) => csvEscape(cellText(r[c.key], c.type))).join(','));
    if (t.totals) lines.push(t.columns.map((c) => csvEscape(cellText(t.totals![c.key], c.type))).join(','));
  }
  for (const n of doc.notes ?? []) lines.push('', csvEscape(n));
  // BOM so Excel opens Bangla text as UTF-8.
  return Buffer.from(String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n', 'utf8');
}

// ── XLSX ─────────────────────────────────────────────────────────────────

/** Header row of each sheet is row HEADER_ROW (rows above: title + filters). */
export function sheetHeaderRow(doc: ReportDoc, table: ReportTable): number {
  return 1 + doc.filters.length + (table.title ? 1 : 0) + 2;
}

export async function toXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PeopleNIT SMS';
  wb.created = new Date(doc.generatedAt);
  const used = new Set<string>();
  doc.tables.forEach((t, idx) => {
    let name = (t.title || doc.title).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || `Sheet ${idx + 1}`;
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 26)} ${n++}`;
    used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    ws.addRow([doc.title]).font = { bold: true, size: 14 };
    for (const f of doc.filters) ws.addRow([f.label, f.value]);
    if (t.title) ws.addRow([t.title]).font = { bold: true, size: 12 };
    ws.addRow([]);
    const header = ws.addRow(t.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE7D3' } };
      cell.border = { bottom: { style: 'thin' } };
    });
    const headerRowNo = header.number;
    for (const r of t.rows) {
      ws.addRow(t.columns.map((c) => xlsxValue(r[c.key], c.type)));
    }
    if (t.totals) {
      const tr = ws.addRow(t.columns.map((c) => xlsxValue(t.totals![c.key], c.type)));
      tr.font = { bold: true };
      tr.eachCell((cell) => (cell.border = { top: { style: 'thin' } }));
    }
    t.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(48, Math.max(10, c.label.length + 2, ...t.rows.slice(0, 200).map((r) => cellText(r[c.key], c.type).length + 2)));
      if (c.type === 'money') col.numFmt = '#,##0.00';
      if (c.type === 'date') col.numFmt = 'yyyy-mm-dd';
    });
    ws.views = [{ state: 'frozen', ySplit: headerRowNo }];
  });
  if (!doc.tables.length) wb.addWorksheet('Report').addRow([doc.title]);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

function xlsxValue(v: unknown, type: ColumnType | undefined): unknown {
  if (v === null || v === undefined) return null;
  if (type === 'date') {
    if (v instanceof Date) return v;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(`${v.slice(0, 10)}T00:00:00Z`);
  }
  if ((type === 'money' || type === 'number' || type === 'percent') && typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(v) && Number.isNaN(Number(v))) return `'${v}`;
  return v;
}

// ── PDF ──────────────────────────────────────────────────────────────────

export const PDF_FONT = 'Helvetica';
export const PDF_FONT_BOLD = 'Helvetica-Bold';

export async function toPdf(doc: ReportDoc, institution: PdfInstitution): Promise<Buffer> {
  const maxCols = Math.max(0, ...doc.tables.map((t) => t.columns.length));
  const pdf = new PDFDocument({ size: 'A4', layout: maxCols > 6 ? 'landscape' : 'portrait', margin: 36, bufferPages: true });
  const chunks: Buffer[] = [];
  pdf.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  await drawInstitutionHeader(pdf, institution, doc.title, doc.subtitle ?? doc.filters.map((f) => `${f.label}: ${f.value}`).join('  ·  '));
  if (doc.subtitle && doc.filters.length) {
    pdf.font(PDF_FONT).fontSize(8.5).fillColor('#475569').text(doc.filters.map((f) => `${f.label}: ${f.value}`).join('  ·  '), { align: 'center' });
    pdf.moveDown(0.6);
  }

  for (const t of doc.tables) drawTable(pdf, t);
  for (const n of doc.notes ?? []) {
    pdf.moveDown(0.5).font(PDF_FONT).fontSize(8).fillColor('#64748b').text(n);
  }

  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    pdf.switchToPage(i);
    const y = pdf.page.height - pdf.page.margins.bottom + 12;
    pdf.font(PDF_FONT).fontSize(7.5).fillColor('#94a3b8')
      .text(`Generated ${doc.generatedAt.slice(0, 16).replace('T', ' ')} UTC · Page ${i + 1} of ${range.count}`, pdf.page.margins.left, y, {
        width: pdf.page.width - pdf.page.margins.left - pdf.page.margins.right, align: 'right', lineBreak: false,
      });
  }
  pdf.end();
  return done;
}

function drawTable(pdf: PDFKit.PDFDocument, t: ReportTable) {
  const left = pdf.page.margins.left;
  const width = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
  const weights = t.columns.map((c) => c.width ?? (c.type === 'money' || c.type === 'number' || c.type === 'percent' ? 0.8 : 1));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map((w) => (w / sum) * width);
  const fontSize = t.columns.length > 9 ? 6.5 : t.columns.length > 6 ? 7.5 : 8.5;
  const pad = 3;
  const bottom = () => pdf.page.height - pdf.page.margins.bottom - 14;

  const rowHeight = (vals: string[], bold: boolean) => {
    pdf.font(bold ? PDF_FONT_BOLD : PDF_FONT).fontSize(fontSize);
    return Math.max(...vals.map((v, i) => pdf.heightOfString(v || ' ', { width: widths[i] - pad * 2 }))) + pad * 2;
  };
  const drawRow = (vals: string[], opts: { bold?: boolean; fill?: string; aligns: Array<'left' | 'right'> }) => {
    const h = rowHeight(vals, !!opts.bold);
    if (pdf.y + h > bottom()) {
      pdf.addPage();
      drawHeader();
    }
    const y = pdf.y;
    if (opts.fill) pdf.rect(left, y, width, h).fill(opts.fill);
    let x = left;
    pdf.font(opts.bold ? PDF_FONT_BOLD : PDF_FONT).fontSize(fontSize).fillColor('#0f172a');
    vals.forEach((v, i) => {
      pdf.text(v, x + pad, y + pad, { width: widths[i] - pad * 2, align: opts.aligns[i] });
      x += widths[i];
    });
    pdf.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.4).strokeColor('#cbd5e1').stroke();
    pdf.y = y + h;
  };
  const aligns = t.columns.map((c) => (c.type === 'money' || c.type === 'number' || c.type === 'percent' ? 'right' : 'left') as 'left' | 'right');
  const drawHeader = () => drawRow(t.columns.map((c) => c.label), { bold: true, fill: '#fde7d3', aligns });

  if (t.title) {
    if (pdf.y + 40 > bottom()) pdf.addPage();
    pdf.font(PDF_FONT_BOLD).fontSize(10.5).fillColor('#0f172a').text(t.title, left, pdf.y + 4, { width });
    pdf.moveDown(0.3);
  }
  drawHeader();
  if (!t.rows.length) {
    drawRow(t.columns.map((_, i) => (i === 0 ? 'No records' : '')), { aligns });
  }
  t.rows.forEach((r, idx) => drawRow(t.columns.map((c) => cellText(r[c.key], c.type)), { aligns, fill: idx % 2 ? '#f8fafc' : undefined }));
  if (t.totals) drawRow(t.columns.map((c) => cellText(t.totals![c.key], c.type)), { bold: true, aligns, fill: '#f1f5f9' });
  pdf.moveDown(1);
}

export async function render(doc: ReportDoc, format: ExportFormat, institution: PdfInstitution): Promise<Buffer> {
  if (format === 'csv') return toCsv(doc);
  if (format === 'xlsx') return toXlsx(doc);
  return toPdf(doc, institution);
}
