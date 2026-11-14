import PDFDocument from 'pdfkit';
import { BN_FONT, BN_FONT_BOLD, registerBanglaFonts } from '../../utils/pdfFonts';
import { resolveLogoBuffer } from '../../utils/pdfHeader';
import type { DocModel, DocTable } from './printDocument.model';

// =============================================================================
// P3: draws DocModels (printDocument.model.ts) with pdfkit + the bundled
// Bangla font. Layouts:
//   A4         one document per A4 page
//   A5         one document per A5 page
//   A4_2COPY   office copy (top) + student copy (bottom) on one A4, cut line
//   THERMAL_80 80 mm roll; page height fits the content
// Bulk "2 per page" puts two different documents on one A4 (A4/A5 templates).
// A document taller than its slot is scaled down to fit (never below 50 %).
// =============================================================================

const MM = 72 / 25.4;
const A4: [number, number] = [595.28, 841.89];
const A5: [number, number] = [419.53, 595.28];
const THERMAL_WIDTH = 80 * MM;
const INK = '#0f172a';
const MUTED = '#475569';
const LINE = '#cbd5e1';

type Images = Map<string, Buffer | null>;
interface Box { x: number; y: number; w: number; h: number }

export interface RenderOptions {
  /** Bulk: 2 = two different documents per A4 page (A4/A5 templates only). */
  perPage?: 1 | 2;
}

async function loadImages(models: DocModel[]): Promise<Images> {
  const urls = new Set<string>();
  for (const m of models) {
    if (m.header.logoUrl) urls.add(m.header.logoUrl);
    if (m.photoUrl) urls.add(m.photoUrl);
    for (const s of m.signatures) if (s.image) urls.add(s.image);
  }
  const images: Images = new Map();
  await Promise.all([...urls].map(async (u) => images.set(u, await resolveLogoBuffer(u))));
  return images;
}

/** Draws an image into a fit box; silently skips unsupported/corrupt images. */
function image(doc: PDFKit.PDFDocument, buf: Buffer | null | undefined, x: number, y: number, w: number, h: number, align: 'center' | 'left' = 'center'): boolean {
  if (!buf) return false;
  try {
    doc.image(buf, x, y, { fit: [w, h], align, valign: 'center' });
    return true;
  } catch {
    return false;
  }
}

interface TextOpts { size: number; bold?: boolean; color?: string; align?: 'left' | 'right' | 'center'; width: number }
function text(doc: PDFKit.PDFDocument, str: string, x: number, y: number, o: TextOpts): number {
  doc.font(o.bold ? BN_FONT_BOLD : BN_FONT).fontSize(o.size).fillColor(o.color ?? INK);
  doc.text(str, x, y, { width: o.width, align: o.align ?? 'left', lineGap: 0.5 });
  return doc.y;
}

function rule(doc: PDFKit.PDFDocument, x: number, y: number, w: number, color: string, width = 0.75) {
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(width).strokeColor(color).stroke();
}

function drawTable(doc: PDFKit.PDFDocument, t: DocTable, x: number, y: number, w: number, fs: number, accent: string, compact: boolean): number {
  // Compact (thermal): description + last column only.
  const cols = compact && t.headers.length > 2 ? [0, t.headers.length - 1] : t.headers.map((_, i) => i);
  const rawWidths = cols.map((i) => t.widths[i]);
  const sum = rawWidths.reduce((a, b) => a + b, 0);
  const widths = rawWidths.map((r) => (r / sum) * w);
  const pad = 4;

  const headerH = doc.font(BN_FONT_BOLD).fontSize(fs * 0.9).currentLineHeight(true) + pad * 2;
  doc.save().rect(x, y, w, headerH).fillOpacity(0.1).fill(accent).restore();
  let cx = x;
  cols.forEach((ci, k) => {
    text(doc, t.headers[ci], cx + pad, y + pad, { size: fs * 0.9, bold: true, color: accent, width: widths[k] - pad * 2, align: t.align[ci] });
    cx += widths[k];
  });
  let cy = y + headerH;
  for (const row of t.rows) {
    let bottom = cy;
    cx = x;
    cols.forEach((ci, k) => {
      const end = text(doc, row[ci] ?? '', cx + pad, cy + pad * 0.75, { size: fs, width: widths[k] - pad * 2, align: t.align[ci] });
      bottom = Math.max(bottom, end);
      cx += widths[k];
    });
    cy = bottom + pad * 0.75;
    rule(doc, x, cy, w, LINE, 0.5);
  }
  return cy;
}

function drawKVs(doc: PDFKit.PDFDocument, rows: Array<{ label: string; value: string; strong?: boolean }>, x: number, y: number, w: number, fs: number, labelRatio: number, valueAlign: 'left' | 'right' = 'left'): number {
  let cy = y;
  const lw = w * labelRatio;
  for (const r of rows) {
    const a = text(doc, `${r.label}:`, x, cy, { size: fs * 0.9, color: MUTED, width: lw - 4 });
    const b = text(doc, r.value, x + lw, cy, { size: r.strong ? fs * 1.05 : fs, bold: r.strong, width: w - lw, align: valueAlign });
    cy = Math.max(a, b) + 1.5;
  }
  return cy;
}

/**
 * Draws one document at (0,0) with the given width. The caller translates /
 * scales the coordinate system. Returns the height used.
 */
function drawDocument(doc: PDFKit.PDFDocument, m: DocModel, images: Images, w: number, copyLabel: string | null): number {
  const compact = m.paper === 'THERMAL_80';
  const fs = compact ? Math.min(m.fontSize, 9) : m.fontSize;
  const accent = m.accentColor;
  let y = 0;

  // Copy label pill (2-copy layout)
  if (copyLabel) {
    const lw = doc.font(BN_FONT_BOLD).fontSize(fs * 0.8).widthOfString(copyLabel) + 12;
    doc.roundedRect(w - lw, 0, lw, fs * 1.5, 3).lineWidth(0.75).strokeColor(accent).stroke();
    text(doc, copyLabel, w - lw, fs * 0.25, { size: fs * 0.8, bold: true, color: accent, width: lw, align: 'center' });
  }

  // ── Header ────────────────────────────────────────────────────────────
  const logo = m.header.logoUrl ? images.get(m.header.logoUrl) : null;
  const photo = m.photoUrl ? images.get(m.photoUrl) : null;
  if (compact) {
    if (logo && image(doc, logo, (w - 36) / 2, y, 36, 36)) y += 40;
    if (m.header.name) y = text(doc, m.header.name, 0, y, { size: fs * 1.35, bold: true, color: accent, width: w, align: 'center' });
    if (m.header.nameAlt) y = text(doc, m.header.nameAlt, 0, y, { size: fs * 1.05, bold: true, width: w, align: 'center' });
    for (const l of m.header.lines) y = text(doc, l, 0, y, { size: fs * 0.8, color: MUTED, width: w, align: 'center' });
  } else {
    const box = Math.round(fs * 5.4);
    const side = logo || photo ? box + 10 : copyLabel ? 70 : 0;
    const top = copyLabel ? fs * 1.8 : 0;
    const logoDrawn = image(doc, logo, 0, top, box, box, 'left');
    const photoDrawn = image(doc, photo, w - box, top, box, box);
    let ty = top;
    const tw = w - side * 2;
    if (m.header.name) ty = text(doc, m.header.name, side, ty, { size: fs * 1.7, bold: true, color: accent, width: tw, align: 'center' });
    if (m.header.nameAlt) ty = text(doc, m.header.nameAlt, side, ty, { size: fs * 1.25, bold: true, width: tw, align: 'center' });
    for (const l of m.header.lines) ty = text(doc, l, side, ty, { size: fs * 0.85, color: MUTED, width: tw, align: 'center' });
    y = Math.max(ty, logoDrawn || photoDrawn ? top + box : 0);
  }
  y += 4;
  rule(doc, 0, y, w, accent, 1.5);
  y += 6;

  // ── Title ─────────────────────────────────────────────────────────────
  const titleSize = fs * 1.25;
  const titleW = Math.min(w, doc.font(BN_FONT_BOLD).fontSize(titleSize).widthOfString(m.title) + 28);
  const titleH = doc.currentLineHeight(true) + 6;
  doc.roundedRect((w - titleW) / 2, y, titleW, titleH, 3).lineWidth(1).strokeColor(accent).stroke();
  text(doc, m.title, (w - titleW) / 2, y + 3, { size: titleSize, bold: true, color: accent, width: titleW, align: 'center' });
  y += titleH + 8;

  if (m.banner) {
    const bh = doc.font(BN_FONT_BOLD).fontSize(fs * 0.85).heightOfString(m.banner, { width: w - 12 }) + 8;
    doc.rect(0, y, w, bh).fillAndStroke('#fffbeb', '#f59e0b');
    text(doc, m.banner, 6, y + 4, { size: fs * 0.85, bold: true, color: '#92400e', width: w - 12 });
    y += bh + 6;
  }

  // ── Party + meta ──────────────────────────────────────────────────────
  if (compact) {
    y = drawKVs(doc, [...m.meta, ...m.party], 0, y, w, fs, 0.42);
  } else {
    const gap = 16;
    const leftW = (w - gap) * 0.56;
    const rightW = w - gap - leftW;
    const a = drawKVs(doc, m.party, 0, y, leftW, fs, 0.36);
    const b = drawKVs(doc, m.meta, leftW + gap, y, rightW, fs, 0.42, 'right');
    y = Math.max(a, b);
  }
  y += 6;

  // ── Items ─────────────────────────────────────────────────────────────
  if (m.table) y = drawTable(doc, m.table, 0, y, w, fs, accent, compact) + 6;

  // ── Totals ────────────────────────────────────────────────────────────
  if (m.totals.length) {
    const tw = compact ? w : Math.max(w * 0.48, 200);
    y = drawKVs(doc, m.totals, w - tw, y, tw, fs, 0.55, 'right') + 4;
  }
  if (m.amountInWords) y = text(doc, m.amountInWords, 0, y, { size: fs * 0.95, bold: true, width: w }) + 6;

  if (m.payments) y = drawTable(doc, m.payments, 0, y, w, fs * 0.9, accent, compact) + 6;
  if (m.notes) y = text(doc, m.notes, 0, y, { size: fs * 0.85, color: MUTED, width: w }) + 6;

  // ── Signatures ────────────────────────────────────────────────────────
  if (m.signatures.length) {
    y += compact ? 18 : 30;
    const n = m.signatures.length;
    const slotW = w / n;
    let bottom = y;
    m.signatures.forEach((s, i) => {
      const sx = i * slotW + slotW * 0.1;
      const sw = slotW * 0.8;
      const img = s.image ? images.get(s.image) : null;
      if (img) image(doc, img, sx, y - 30, sw, 28);
      doc.moveTo(sx, y).lineTo(sx + sw, y).lineWidth(0.75).strokeColor('#94a3b8').stroke();
      bottom = Math.max(bottom, text(doc, s.label, sx, y + 3, { size: fs * 0.85, color: MUTED, width: sw, align: 'center' }));
    });
    y = bottom + 6;
  }

  if (m.footer) y = text(doc, m.footer, 0, y, { size: fs * 0.8, color: MUTED, width: w, align: 'center' }) + 2;

  return y;
}

function drawWatermark(doc: PDFKit.PDFDocument, label: string, box: Box, accent: string) {
  const size = Math.min(box.w, box.h) / 4.5;
  doc.save();
  doc.fillOpacity(0.07).fillColor(accent).font(BN_FONT_BOLD).fontSize(size);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  doc.rotate(-30, { origin: [cx, cy] });
  doc.text(label, box.x - box.w / 2, cy - size / 2, { width: box.w * 2, align: 'center', lineBreak: false });
  doc.restore();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Runs draw() with pdfkit's automatic page breaks off (we place everything ourselves). */
function noAutoPageBreak<T>(doc: PDFKit.PDFDocument, draw: () => T): T {
  const page = doc.page as any;
  const maxY = page.maxY;
  page.maxY = () => 1e9;
  try {
    return draw();
  } finally {
    page.maxY = maxY;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Height a document needs at a given width (drawn on a throwaway document). */
function measure(m: DocModel, images: Images, w: number, copyLabel: string | null): number {
  const scratch = new PDFDocument({ size: [w + 20, 5000], margin: 0 });
  registerBanglaFonts(scratch);
  const h = noAutoPageBreak(scratch, () => drawDocument(scratch, m, images, w, copyLabel));
  scratch.end();
  return h;
}

/** Draws a document into a box, scaled down if it would not fit. */
function drawInBox(doc: PDFKit.PDFDocument, m: DocModel, images: Images, box: Box, copyLabel: string | null) {
  let scale = 1;
  const natural = measure(m, images, box.w, copyLabel);
  if (natural > box.h) {
    scale = Math.max(0.5, box.h / natural);
    // Text re-wraps at the wider virtual width, so measure again once.
    const second = measure(m, images, box.w / scale, copyLabel);
    if (second * scale > box.h) scale = Math.max(0.5, box.h / second);
  }
  if (m.watermark) drawWatermark(doc, m.watermark, box, m.accentColor);
  doc.save();
  doc.translate(box.x, box.y);
  if (scale !== 1) doc.scale(scale);
  noAutoPageBreak(doc, () => drawDocument(doc, m, images, box.w / scale, copyLabel));
  doc.restore();
}

function cutLine(doc: PDFKit.PDFDocument, y: number) {
  doc.save().moveTo(18, y).lineTo(A4[0] - 18, y).dash(4, { space: 3 }).lineWidth(0.5).strokeColor('#94a3b8').stroke().undash().restore();
}

/** Renders one or more documents (same template) into a single PDF. */
export async function renderDocumentsPdf(models: DocModel[], options: RenderOptions = {}): Promise<Buffer> {
  if (models.length === 0) throw new Error('Nothing to print');
  const images = await loadImages(models);
  const paper = models[0].paper;
  const twoUp = options.perPage === 2 && (paper === 'A4' || paper === 'A5');

  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: models.length === 1 ? models[0].title : 'Documents', Producer: 'PeopleNIT SMS' } });
  registerBanglaFonts(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  if (paper === 'THERMAL_80') {
    const margin = 8;
    const w = THERMAL_WIDTH - margin * 2;
    for (const m of models) {
      const h = measure(m, images, w, null);
      doc.addPage({ size: [THERMAL_WIDTH, h + margin * 2], margin: 0 });
      drawInBox(doc, m, images, { x: margin, y: margin, w, h: h + 1 }, null);
    }
  } else if (paper === 'A4_2COPY' || twoUp) {
    const margin = 24;
    const half = A4[1] / 2;
    const slot = (top: number): Box => ({ x: margin, y: top + margin, w: A4[0] - margin * 2, h: half - margin * 2 });
    if (paper === 'A4_2COPY') {
      for (const m of models) {
        doc.addPage({ size: A4, margin: 0 });
        drawInBox(doc, m, images, slot(0), m.copyLabels.office || null);
        cutLine(doc, half);
        drawInBox(doc, m, images, slot(half), m.copyLabels.student || null);
      }
    } else {
      for (let i = 0; i < models.length; i += 2) {
        doc.addPage({ size: A4, margin: 0 });
        drawInBox(doc, models[i], images, slot(0), null);
        if (models[i + 1]) {
          cutLine(doc, half);
          drawInBox(doc, models[i + 1], images, slot(half), null);
        }
      }
    }
  } else {
    const size = paper === 'A5' ? A5 : A4;
    const margin = paper === 'A5' ? 24 : 36;
    for (const m of models) {
      doc.addPage({ size, margin: 0 });
      drawInBox(doc, m, images, { x: margin, y: margin, w: size[0] - margin * 2, h: size[1] - margin * 2 }, null);
    }
  }

  doc.end();
  return finished;
}

export const PDF_PAGE_SIZES = { A4, A5, THERMAL_WIDTH };
