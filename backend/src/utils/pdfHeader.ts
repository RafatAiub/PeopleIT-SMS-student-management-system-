export interface PdfInstitution {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

const LOGO_SIZE = 56;
const NAVY = '#1e3a8a';
const MUTED = '#64748b';

async function resolveLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    if (logoUrl.startsWith('data:')) {
      const commaIndex = logoUrl.indexOf(',');
      if (commaIndex === -1) return null;
      return Buffer.from(logoUrl.slice(commaIndex + 1), 'base64');
    }
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(logoUrl, { signal: controller.signal });
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Draws the logo (if resolvable) at (x, y) and returns the x-offset text
// should start at. pdfkit only decodes PNG/JPEG — any other format (e.g. a
// legacy WebP logo uploaded before institute-logo uploads were switched to
// PNG), a failed fetch, or malformed data just silently skips the logo
// rather than crashing the whole document.
async function drawLogo(doc: PDFKit.PDFDocument, institution: PdfInstitution, x: number, y: number): Promise<number> {
  if (!institution.logoUrl) return x;
  const logoBuffer = await resolveLogoBuffer(institution.logoUrl);
  if (!logoBuffer) return x;
  try {
    doc.image(logoBuffer, x, y, { fit: [LOGO_SIZE, LOGO_SIZE] });
    return x + LOGO_SIZE + 14;
  } catch {
    return x;
  }
}

/**
 * Draws a shared letterhead-style header (logo + institution name/address,
 * then a title/subtitle, then a rule) at the current cursor position. Used
 * by the timetable PDF's simpler header.
 */
export async function drawInstitutionHeader(
  doc: PDFKit.PDFDocument,
  institution: PdfInstitution,
  title: string,
  subtitle: string,
): Promise<void> {
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const textX = await drawLogo(doc, institution, startX, startY);
  const textWidth = contentWidth - (textX - startX);
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(NAVY)
    .text(institution.name || 'Institution', textX, startY, { width: textWidth });

  if (institution.address) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(institution.address, textX, doc.y, { width: textWidth });
  }

  const afterNameY = Math.max(doc.y, startY + LOGO_SIZE);
  doc.y = afterNameY + 8;

  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#0f172a')
    .text(title, startX, doc.y, { width: contentWidth, align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#475569')
    .text(subtitle, startX, doc.y + 2, { width: contentWidth, align: 'center' });

  doc.moveDown(0.6);
  doc
    .moveTo(startX, doc.y)
    .lineTo(startX + contentWidth, doc.y)
    .lineWidth(1.5)
    .strokeColor(NAVY)
    .stroke();
  doc.moveDown(0.8);
}

/**
 * Richer letterhead for the report card: logo + name/address/contact on the
 * left, a bordered document-title badge + subtitle on the right (same row),
 * then a rule below — mirroring a formal letterhead layout. Kept separate
 * from drawInstitutionHeader so the timetable PDF's simpler header is
 * untouched.
 */
export async function drawLetterhead(
  doc: PDFKit.PDFDocument,
  institution: PdfInstitution,
  badgeText: string,
  subtitle: string,
): Promise<void> {
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Right-side badge + subtitle first (doesn't depend on doc.y, fixed to startY).
  const badgeWidth = 190;
  const badgeX = startX + contentWidth - badgeWidth;
  doc.rect(badgeX, startY, badgeWidth, 22).lineWidth(1).strokeColor(NAVY).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(NAVY)
    .text(badgeText.toUpperCase(), badgeX, startY + 7, { width: badgeWidth, align: 'center', characterSpacing: 0.6 });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(subtitle, badgeX, startY + 28, { width: badgeWidth, align: 'center' });
  const rightColBottom = doc.y;

  // Left side: logo + name/address/contact.
  const textX = await drawLogo(doc, institution, startX, startY);
  const textWidth = badgeX - 12 - textX;
  doc
    .font('Helvetica-Bold')
    .fontSize(19)
    .fillColor(NAVY)
    .text(institution.name || 'Institution', textX, startY, { width: textWidth });

  const contactLine = [institution.address, institution.phone, institution.email].filter(Boolean).join('   |   ');
  if (contactLine) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(contactLine, textX, doc.y + 1, { width: textWidth });
  }
  const leftColBottom = Math.max(doc.y, startY + LOGO_SIZE);

  doc.y = Math.max(leftColBottom, rightColBottom) + 10;
  doc
    .moveTo(startX, doc.y)
    .lineTo(startX + contentWidth, doc.y)
    .lineWidth(1.5)
    .strokeColor(NAVY)
    .stroke();
  doc.moveDown(0.9);
}
