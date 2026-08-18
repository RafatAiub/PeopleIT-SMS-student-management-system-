import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import type { CanvasElementType } from './idcard.dto';

// =============================================================================
// ID Card PDF Renderer — pdfkit + qrcode
//
// Two rendering modes, selected by template.layoutMode:
//   SIMPLE   — fixed regions (header/photo/body/footer), see renderSimpleCard.
//   ADVANCED — a free-form canvas of admin-placed elements, see
//              renderAdvancedCard. Elements are stored in mm (top-left
//              origin, same space as widthMm/heightMm) so this renderer and
//              the React <IdCardPreview> advanced branch stay in lockstep —
//              neither one "interprets" the layout differently, both just
//              scale the same numbers into their own unit (pt here, % there).
// =============================================================================

const MM_TO_PT = 2.8346;

interface IdCardTemplateData {
  layout: string;
  widthMm: number;
  heightMm: number;
  backgroundImage: string | null;
  logoImage: string | null;
  signatureImage: string | null;
  photoStyle: string;
  photoWidthMm: number;
  photoHeightMm: number;
  primaryColor: string;
  secondaryColor: string;
  showFields: Record<string, boolean>;
  layoutMode: string;
  canvasElements: CanvasElementType[] | null;
}

export interface IdCardPdfData {
  cardNumber: string;
  verifyToken: string;
  issuedAt: Date;
  expiresAt: Date | null;
  userType: 'STUDENT' | 'STAFF';
  template: IdCardTemplateData;
  student: {
    studentId: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    dateOfBirth: Date | null;
    bloodGroup: string | null;
    address: string | null;
    phone: string | null;
    class: { name: string } | null;
    section: { name: string } | null;
    guardians: Array<{
      relationship: string;
      guardian: { firstName: string; lastName: string; relationship: string };
    }>;
  } | null;
  staff: {
    employeeId: string | null;
    department: string | null;
    designation: string | null;
    user: { firstName: string; lastName: string; avatarUrl: string | null; phone: string | null };
  } | null;
}

// Decodes a base64 data URL image (same convention as
// backend/src/utils/pdfHeader.ts's resolveLogoBuffer) — returns null for
// remote-URL/unsupported/malformed input rather than throwing, so a single
// missing/broken image never crashes card generation.
function resolveImageBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null;
  try {
    if (dataUrl.startsWith('data:')) {
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex === -1) return null;
      return Buffer.from(dataUrl.slice(commaIndex + 1), 'base64');
    }
    return null;
  } catch {
    return null;
  }
}

function formatDate(date: Date | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

type GuardianList = NonNullable<IdCardPdfData['student']>['guardians'];

function findGuardianName(guardians: GuardianList, relationship: 'FATHER' | 'MOTHER'): string | null {
  const match = guardians.find(
    (g) => (g.relationship || g.guardian.relationship || '').toUpperCase() === relationship,
  );
  return match ? `${match.guardian.firstName} ${match.guardian.lastName}` : null;
}

function holderNameOf(card: IdCardPdfData): string {
  return card.userType === 'STUDENT' && card.student
    ? `${card.student.firstName} ${card.student.lastName}`
    : card.staff
      ? `${card.staff.user.firstName} ${card.staff.user.lastName}`
      : '';
}

function holderPhotoOf(card: IdCardPdfData): string | null {
  return card.userType === 'STUDENT' && card.student ? card.student.avatarUrl : card.staff?.user.avatarUrl ?? null;
}

/**
 * Resolves a TEXT element's dataKey against the card's actual data — the
 * single source of truth for "what does {dataKey} mean" shared by every
 * TEXT element on the canvas, mirroring the equivalent per-field lookups the
 * simple-mode renderer does inline.
 */
function resolveDataKey(card: IdCardPdfData, dataKey: string): string | null {
  switch (dataKey) {
    case 'name':
      return holderNameOf(card) || null;
    case 'cardNumber':
      return card.cardNumber;
    case 'admissionNo':
      return card.userType === 'STUDENT' ? card.student?.studentId ?? null : card.staff?.employeeId ?? null;
    case 'class':
      return card.userType === 'STUDENT'
        ? [card.student?.class?.name, card.student?.section?.name].filter(Boolean).join(' - ') || null
        : null;
    case 'designation':
      return card.userType === 'STAFF' ? card.staff?.designation ?? null : null;
    case 'department':
      return card.userType === 'STAFF' ? card.staff?.department ?? null : null;
    case 'fatherName':
      return card.userType === 'STUDENT' && card.student ? findGuardianName(card.student.guardians, 'FATHER') : null;
    case 'motherName':
      return card.userType === 'STUDENT' && card.student ? findGuardianName(card.student.guardians, 'MOTHER') : null;
    case 'address':
      return card.userType === 'STUDENT' ? card.student?.address ?? null : null;
    case 'dob':
      return card.userType === 'STUDENT' ? formatDate(card.student?.dateOfBirth ?? null) : null;
    case 'bloodGroup':
      return card.userType === 'STUDENT' ? card.student?.bloodGroup ?? null : null;
    case 'phone':
      return card.userType === 'STUDENT' ? card.student?.phone ?? null : card.staff?.user.phone ?? null;
    default:
      return null;
  }
}

function drawClippedImage(
  doc: PDFKit.PDFDocument,
  buffer: Buffer,
  shape: string,
  x: number,
  y: number,
  width: number,
  height: number,
  borderColor: string,
) {
  if (shape === 'CIRCLE') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.min(width, height) / 2;
    doc.save();
    doc.circle(cx, cy, r).clip();
    doc.image(buffer, x, y, { width, height });
    doc.restore();
    doc.circle(cx, cy, r).lineWidth(1.2).strokeColor(borderColor).stroke();
  } else if (shape === 'ROUNDED') {
    doc.save();
    doc.roundedRect(x, y, width, height, 6).clip();
    doc.image(buffer, x, y, { width, height });
    doc.restore();
    doc.roundedRect(x, y, width, height, 6).lineWidth(1.2).strokeColor(borderColor).stroke();
  } else {
    doc.image(buffer, x, y, { width, height });
    doc.rect(x, y, width, height).lineWidth(1.2).strokeColor(borderColor).stroke();
  }
}

async function buildQrBuffer(verifyToken: string, color: string): Promise<Buffer | null> {
  const verifyUrl = `${env.FRONTEND_URL || 'http://localhost:5173'}/verify/${verifyToken}`;
  try {
    return await QRCode.toBuffer(verifyUrl, {
      type: 'png',
      margin: 0,
      color: { dark: `${color}ff`, light: '#ffffffff' },
    });
  } catch {
    return null;
  }
}

/** Fixed-region layout — header/photo/body/footer, unchanged from before ADVANCED mode existed. */
async function renderSimpleCard(doc: PDFKit.PDFDocument, card: IdCardPdfData, widthPt: number, heightPt: number) {
  const { template } = card;
  const primaryColor = template.primaryColor || '#7c3aed';
  const secondaryColor = template.secondaryColor || '#0f172a';
  const showFields = template.showFields || {};
  const holderName = holderNameOf(card);
  const holderPhoto = holderPhotoOf(card);

  // Header band — solid primaryColor bar carrying the logo, mirrors the
  // frontend live preview's header bar so the printed card matches it.
  const headerHeight = 30;
  doc.rect(0, 0, widthPt, headerHeight).fill(primaryColor);

  let cursorY = 8;

  // Logo (inside the header band, small).
  const logoBuffer = resolveImageBuffer(template.logoImage);
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 8, cursorY, { fit: [22, 22] });
    } catch {
      // ignore malformed logo
    }
  }
  cursorY = headerHeight + 8;

  // Photo — circle-clipped, square, or rounded.
  const photoWidthPt = template.photoWidthMm * MM_TO_PT;
  const photoHeightPt = template.photoHeightMm * MM_TO_PT;
  const photoX = (widthPt - photoWidthPt) / 2;
  const photoBuffer = resolveImageBuffer(holderPhoto);
  if (photoBuffer) {
    try {
      drawClippedImage(doc, photoBuffer, template.photoStyle, photoX, cursorY, photoWidthPt, photoHeightPt, primaryColor);
    } catch {
      // Corrupt/unsupported photo — skip, keep the rest of the card intact.
    }
  } else {
    doc.rect(photoX, cursorY, photoWidthPt, photoHeightPt).lineWidth(0.5).strokeColor('#94a3b8').stroke();
  }
  cursorY += photoHeightPt + 6;

  const contentWidth = widthPt - 12;

  if (showFields.name !== false) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(holderName || '-', 6, cursorY, {
      width: contentWidth,
      align: 'center',
    });
    cursorY = doc.y + 3;
  }

  doc.font('Helvetica').fontSize(7.5).fillColor('#334155');

  function drawLine(label: string, value: string | null | undefined) {
    if (!value) return;
    doc.text(`${label}: ${value}`, 6, cursorY, { width: contentWidth, align: 'center' });
    cursorY = doc.y + 1;
  }

  let address: string | null | undefined = null;

  if (card.userType === 'STUDENT' && card.student) {
    if (showFields.admissionNo !== false) drawLine('ID', card.student.studentId);
    if (showFields.class !== false) {
      const cls = [card.student.class?.name, card.student.section?.name].filter(Boolean).join(' - ');
      drawLine('Class', cls);
    }
    if (showFields.fatherName !== false) {
      drawLine('Father', findGuardianName(card.student.guardians, 'FATHER'));
    }
    if (showFields.motherName !== false) {
      drawLine('Mother', findGuardianName(card.student.guardians, 'MOTHER'));
    }
    if (showFields.dob !== false) drawLine('DOB', formatDate(card.student.dateOfBirth));
    if (showFields.bloodGroup !== false) drawLine('Blood Group', card.student.bloodGroup);
    if (showFields.address !== false) address = card.student.address;
  } else if (card.userType === 'STAFF' && card.staff) {
    if (showFields.admissionNo !== false) drawLine('ID', card.staff.employeeId);
    if (showFields.class !== false) drawLine('Designation', card.staff.designation);
    drawLine('Department', card.staff.department);
  }

  drawLine('Card No', card.cardNumber);
  drawLine('Issued', formatDate(card.issuedAt));
  if (card.expiresAt) drawLine('Expires', formatDate(card.expiresAt));

  // Footer band — solid secondaryColor bar carrying the address, mirrors the
  // frontend live preview's dark footer bar. Reserved space is skipped by the
  // QR/signature row above so nothing overlaps it.
  const footerHeight = address ? 16 : 0;
  if (address) {
    doc.rect(0, heightPt - footerHeight, widthPt, footerHeight).fill(secondaryColor);
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor('#ffffff')
      .text(address, 6, heightPt - footerHeight + 4, { width: widthPt - 12, align: 'center' });
  }

  // QR code — bottom corner (above the footer band if present), links to the
  // public verification page.
  const qrBuffer = await buildQrBuffer(card.verifyToken, primaryColor);
  if (qrBuffer) {
    doc.image(qrBuffer, widthPt - 46, heightPt - footerHeight - 46, { width: 40 });
  }

  // Signature — bottom-left, above the footer band.
  const signatureBuffer = resolveImageBuffer(template.signatureImage);
  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, 8, heightPt - footerHeight - 40, { fit: [50, 24] });
    } catch {
      // ignore malformed signature image
    }
  }
}

/**
 * Advanced (drag-and-drop canvas) layout — draws each admin-placed element
 * at its stored mm position/size, converted to pt. This must stay a "dumb
 * interpreter" of canvasElements: no fixed regions, no implicit fallbacks —
 * whatever the admin placed in the designer is exactly what prints.
 */
async function renderAdvancedCard(doc: PDFKit.PDFDocument, card: IdCardPdfData) {
  const { template } = card;
  const elements = [...(template.canvasElements || [])].sort((a, b) => a.zIndex - b.zIndex);
  const holderPhoto = holderPhotoOf(card);

  for (const el of elements) {
    const x = el.xMm * MM_TO_PT;
    const y = el.yMm * MM_TO_PT;
    const width = el.widthMm * MM_TO_PT;
    const height = el.heightMm * MM_TO_PT;

    try {
      if (el.type === 'TEXT') {
        const value = resolveDataKey(card, el.dataKey);
        if (!value) continue;
        const text = el.label ? `${el.label} : ${value}` : value;
        doc
          .font(el.fontWeight === 'bold' ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(el.fontSizePt)
          .fillColor(el.color)
          .text(text, x, y, { width, height, align: el.align });
      } else if (el.type === 'PHOTO') {
        const buffer = resolveImageBuffer(holderPhoto);
        if (buffer) {
          drawClippedImage(doc, buffer, el.shape, x, y, width, height, template.primaryColor || '#7c3aed');
        } else {
          doc.rect(x, y, width, height).lineWidth(0.5).strokeColor('#94a3b8').stroke();
        }
      } else if (el.type === 'LOGO') {
        const buffer = resolveImageBuffer(template.logoImage);
        if (buffer) doc.image(buffer, x, y, { width, height });
      } else if (el.type === 'SIGNATURE') {
        const buffer = resolveImageBuffer(template.signatureImage);
        if (buffer) doc.image(buffer, x, y, { width, height });
      } else if (el.type === 'QR') {
        const qrBuffer = await buildQrBuffer(card.verifyToken, template.primaryColor || '#7c3aed');
        if (qrBuffer) doc.image(qrBuffer, x, y, { width, height });
      }
    } catch {
      // A single malformed/corrupt element (bad image, oversized text) never
      // aborts the whole card — skip it and keep drawing the rest.
    }
  }
}

/**
 * Renders a single ID card as a small-format PDF sized to the template's
 * physical dimensions (mm converted to points). Returns a Buffer — the
 * caller (controller) is responsible for setting response headers and
 * streaming it, matching the existing timetable/report-card PDF pattern.
 */
export async function renderIdCardPdf(card: IdCardPdfData): Promise<Buffer> {
  const { template } = card;
  const widthPt = template.widthMm * MM_TO_PT;
  const heightPt = template.heightMm * MM_TO_PT;

  const doc = new PDFDocument({ size: [widthPt, heightPt], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Background — covers the full card if present, for both modes (it's a
  // single global layer, not something the canvas repositions per element).
  const bgBuffer = resolveImageBuffer(template.backgroundImage);
  if (bgBuffer) {
    try {
      doc.image(bgBuffer, 0, 0, { width: widthPt, height: heightPt });
    } catch {
      // Corrupt/unsupported image format — skip, never abort the card.
    }
  }

  if (template.layoutMode === 'ADVANCED' && template.canvasElements && template.canvasElements.length > 0) {
    await renderAdvancedCard(doc, card);
  } else {
    await renderSimpleCard(doc, card, widthPt, heightPt);
  }

  doc.end();
  return finished;
}
