export interface PdfInstitution {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
}

const LOGO_SIZE = 56;

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

/**
 * Draws a shared letterhead-style header (logo + institution name/address,
 * then a title/subtitle, then a rule) at the current cursor position.
 * pdfkit only decodes PNG/JPEG — any other format (e.g. a legacy WebP logo
 * uploaded before institute-logo uploads were switched to PNG), a failed
 * fetch, or malformed data just silently skips the logo rather than
 * crashing the whole document; a report card without a logo still renders.
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

  let textX = startX;
  if (institution.logoUrl) {
    const logoBuffer = await resolveLogoBuffer(institution.logoUrl);
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, startX, startY, { width: LOGO_SIZE, height: LOGO_SIZE, fit: [LOGO_SIZE, LOGO_SIZE] });
        textX = startX + LOGO_SIZE + 14;
      } catch {
        // Unsupported/corrupt image — fall through to text-only header.
      }
    }
  }

  const textWidth = contentWidth - (textX - startX);
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#1e3a8a')
    .text(institution.name || 'Institution', textX, startY, { width: textWidth });

  if (institution.address) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748b')
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
    .strokeColor('#1e3a8a')
    .stroke();
  doc.moveDown(0.8);
}
