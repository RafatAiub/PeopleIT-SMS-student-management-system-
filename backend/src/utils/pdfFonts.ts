import fs from 'fs';
import path from 'path';

// =============================================================================
// P3: Bangla-capable fonts for every pdfkit document.
//
// pdfkit's built-in fonts (Helvetica/Times/Courier) have no Bengali glyphs, so
// Bangla printed as empty boxes. pdfkit embeds TrueType fonts through fontkit,
// whose Indic shaper (script tags `bng2`/`beng`) handles Bengali conjuncts,
// reph and pre-base vowel reordering — verified by rendering "ক্ষ",
// "শিক্ষার্থী", "প্রতিষ্ঠান", "কিছু", "কৌ" to PNG (see docs/features/P3-print-designer.md).
//
// Font: Hind Siliguri (SIL Open Font License 1.1, licence text in
// backend/assets/fonts/OFL-HindSiliguri.txt). It also has Latin glyphs, so a
// mixed "Invoice INV-1 · শ্রেণি ৫" string renders in one run.
//
// Two ways to use it:
//  - enableBanglaText(doc): a per-document shim. Whenever text containing
//    Bengali characters is drawn or measured while a built-in font is active,
//    it is drawn in Hind Siliguri (bold for *-Bold fonts) and the caller's
//    font is restored afterwards. Latin-only text is untouched, so existing
//    English PDFs look exactly as before. drawInstitutionHeader/drawLetterhead
//    turn it on automatically, so every PDF using the shared letterhead
//    (report cards, timetables, platform invoices, dues reports) gains Bangla.
//  - BN_FONT / BN_FONT_BOLD: registered font names for documents that want
//    Hind Siliguri everywhere (the P3 invoice/receipt templates).
// =============================================================================

export const BN_FONT = 'BanglaRegular';
export const BN_FONT_BOLD = 'BanglaBold';

const BENGALI = /[ঀ-৿]/;

/** Directory holding the bundled TTFs — same relative spot from src/ (tsx/jest) and dist/ (node). */
function fontDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../assets/fonts'),
    path.resolve(process.cwd(), 'assets/fonts'),
    path.resolve(process.cwd(), 'backend/assets/fonts'),
  ];
  return candidates.find((d) => fs.existsSync(path.join(d, 'HindSiliguri-Regular.ttf'))) ?? candidates[0];
}

let cachedFonts: { regular: Buffer; bold: Buffer } | null = null;
/** The font files, read once per process. Throws if the assets are missing. */
export function banglaFontBuffers(): { regular: Buffer; bold: Buffer } {
  if (!cachedFonts) {
    const dir = fontDir();
    cachedFonts = {
      regular: fs.readFileSync(path.join(dir, 'HindSiliguri-Regular.ttf')),
      bold: fs.readFileSync(path.join(dir, 'HindSiliguri-Bold.ttf')),
    };
  }
  return cachedFonts;
}

export function hasBengali(text: unknown): boolean {
  return typeof text === 'string' && BENGALI.test(text);
}

const registered = new WeakSet<object>();
/** Registers BN_FONT / BN_FONT_BOLD on the document (idempotent). */
export function registerBanglaFonts(doc: PDFKit.PDFDocument): void {
  if (registered.has(doc)) return;
  const { regular, bold } = banglaFontBuffers();
  doc.registerFont(BN_FONT, regular);
  doc.registerFont(BN_FONT_BOLD, bold);
  registered.add(doc);
}

/** Built-in pdfkit (AFM) font names — the only ones the shim swaps out. */
function isStandardFont(name: string | undefined): boolean {
  return !!name && /^(Helvetica|Times|Courier)/.test(name);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDoc = PDFKit.PDFDocument & { _font?: any; _fontSize?: number };

function withBangla<T>(doc: AnyDoc, text: unknown, draw: () => T): T {
  const current = doc._font;
  if (!hasBengali(text) || !isStandardFont(current?.name)) return draw();
  const size = doc._fontSize;
  doc.font(/Bold/.test(current.name) ? BN_FONT_BOLD : BN_FONT);
  if (size) doc.fontSize(size);
  try {
    return draw();
  } finally {
    doc._font = current;
  }
}

const shimmed = new WeakSet<object>();
/**
 * Makes doc.text / widthOfString / heightOfString draw Bengali strings in the
 * bundled Bangla font while a built-in font is selected. Idempotent.
 */
export function enableBanglaText(doc: PDFKit.PDFDocument): PDFKit.PDFDocument {
  if (shimmed.has(doc)) return doc;
  registerBanglaFonts(doc);
  const d = doc as AnyDoc;
  const text = (d as any).text;
  const widthOfString = (d as any).widthOfString;
  const heightOfString = (d as any).heightOfString;
  (d as any).text = function (this: AnyDoc, str: unknown, ...rest: unknown[]) {
    return withBangla(this, str, () => text.call(this, str, ...rest));
  };
  (d as any).widthOfString = function (this: AnyDoc, str: unknown, ...rest: unknown[]) {
    return withBangla(this, str, () => widthOfString.call(this, str, ...rest));
  };
  (d as any).heightOfString = function (this: AnyDoc, str: unknown, ...rest: unknown[]) {
    return withBangla(this, str, () => heightOfString.call(this, str, ...rest));
  };
  shimmed.add(doc);
  return doc;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
