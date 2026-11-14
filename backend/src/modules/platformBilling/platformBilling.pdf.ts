import PDFDocument from 'pdfkit';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/AppError';
import { drawInstitutionHeader, type PdfInstitution } from '../../utils/pdfHeader';
import { dateLabel, duePaisa, paisaToNumber, periodLabel, toPaisa, type InvoiceLine } from './platformBilling.logic';

// =============================================================================
// P1 invoice + receipt PDFs (pdfkit, same approach as the timetable/report
// card PDFs). English only for now — Helvetica has no Bangla glyphs, so money
// is printed as "BDT"; Bangla PDFs come with the P3 font work.
// The issuer block is PeopleNIT; set PLATFORM_BILLING_ADDRESS /
// PLATFORM_BILLING_PHONE / PLATFORM_BILLING_EMAIL to print real details.
// =============================================================================

const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const ACCENT = '#c2550a';

function issuer(): PdfInstitution {
  return {
    name: 'PeopleNIT',
    address: process.env.PLATFORM_BILLING_ADDRESS || 'Dhaka, Bangladesh',
    phone: process.env.PLATFORM_BILLING_PHONE || null,
    email: process.env.PLATFORM_BILLING_EMAIL || null,
  };
}

const money = (n: number) => `BDT ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function start(): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, done };
}

function kv(doc: PDFKit.PDFDocument, x: number, y: number, w: number, label: string, value: string) {
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, x, y, { width: w });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(value, x, doc.y + 1, { width: w });
}

function billTo(doc: PDFKit.PDFDocument, school: { name: string; address?: string | null; phone?: string | null; email?: string | null; slug?: string }, y: number, x: number, w: number) {
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('BILL TO', x, y, { width: w });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(school.name, x, doc.y + 2, { width: w });
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  if (school.slug) doc.text(`School code: ${school.slug}`, x, doc.y + 1, { width: w });
  if (school.address) doc.text(school.address, x, doc.y + 1, { width: w });
  if (school.phone) doc.text(school.phone, x, doc.y + 1, { width: w });
  if (school.email) doc.text(school.email, x, doc.y + 1, { width: w });
}

export async function renderPlatformInvoicePdf(invoiceId: string, tenantId?: string): Promise<{ pdf: Buffer; filename: string }> {
  const inv = await prisma.platformInvoice.findFirst({
    where: { id: invoiceId, ...(tenantId ? { institutionId: tenantId } : {}) },
    include: { institution: { select: { name: true, slug: true, address: true, phone: true, contactPhone: true, email: true, contactEmail: true } } },
  });
  if (!inv) throw new NotFoundError('Invoice not found');

  const { doc, done } = start();
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  await drawInstitutionHeader(doc, issuer(), 'INVOICE', `${inv.invoiceNumber}  ·  ${periodLabel(inv.period)}`);

  const top = doc.y;
  billTo(doc, { ...inv.institution, phone: inv.institution.contactPhone ?? inv.institution.phone, email: inv.institution.contactEmail ?? inv.institution.email }, top, left, width * 0.55);
  const afterBill = doc.y;
  const rx = left + width * 0.6;
  const rw = width * 0.4;
  kv(doc, rx, top, rw, 'Invoice number', inv.invoiceNumber);
  kv(doc, rx, doc.y + 4, rw, 'Billing month', periodLabel(inv.period));
  kv(doc, rx, doc.y + 4, rw, 'Issue date', dateLabel(inv.issueDate));
  kv(doc, rx, doc.y + 4, rw, 'Due date', dateLabel(inv.dueDate));
  kv(doc, rx, doc.y + 4, rw, 'Status', inv.status);
  doc.y = Math.max(afterBill, doc.y) + 18;

  // Lines table
  const cols = [
    { label: 'Description', w: width * 0.52, align: 'left' as const },
    { label: 'Qty', w: width * 0.1, align: 'right' as const },
    { label: 'Unit price', w: width * 0.18, align: 'right' as const },
    { label: 'Amount', w: width * 0.2, align: 'right' as const },
  ];
  let y = doc.y;
  doc.rect(left, y, width, 20).fill('#f1f5f9');
  let x = left;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
  for (const c of cols) {
    doc.text(c.label, x + 6, y + 6, { width: c.w - 12, align: c.align });
    x += c.w;
  }
  y += 20;
  const lines = (inv.lines as unknown as InvoiceLine[]) ?? [];
  doc.font('Helvetica').fontSize(9);
  for (const l of lines) {
    const values = [l.description, String(l.quantity), money(l.unitPrice), money(l.amount)];
    const h = Math.max(20, doc.heightOfString(l.description, { width: cols[0].w - 12 }) + 10);
    x = left;
    values.forEach((v, i) => {
      doc.fillColor(l.amount < 0 && i === 3 ? ACCENT : INK).text(v, x + 6, y + 5, { width: cols[i].w - 12, align: cols[i].align });
      x += cols[i].w;
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(BORDER).stroke();
    y += h;
  }

  // Totals
  y += 10;
  const totals: Array<[string, number, boolean?]> = [
    ['Subtotal', Number(inv.subtotal)],
    ['Discounts', -Number(inv.discount)],
    ['Total', Number(inv.total), true],
    ['Paid', Number(inv.paidAmount)],
  ];
  if (toPaisa(inv.waivedAmount) > 0) totals.push(['Waived', Number(inv.waivedAmount)]);
  totals.push(['Amount due', paisaToNumber(duePaisa(inv)), true]);
  for (const [label, value, bold] of totals) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(INK);
    doc.text(label, left + width * 0.5, y, { width: width * 0.28, align: 'right' });
    doc.text(money(value), left + width * 0.78, y, { width: width * 0.22, align: 'right' });
    y += bold ? 18 : 15;
  }

  y += 14;
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  if (inv.pricingModel === 'PER_STUDENT' && inv.studentCount !== null) {
    doc.text(`How this was calculated: ${inv.studentCount} active students on the 1st of the month x ${money(Number(inv.rate ?? 0))} per student.`, left, y, { width });
    y = doc.y + 4;
  }
  if (inv.statusReason) {
    doc.text(`Note: ${inv.statusReason}`, left, y, { width });
    y = doc.y + 4;
  }
  doc.text('Pay online from the Billing page of your PeopleNIT account (bKash or SSLCommerz). Thank you for your business.', left, y, { width });

  doc.end();
  return { pdf: await done, filename: `${inv.invoiceNumber}.pdf` };
}

export async function renderPlatformReceiptPdf(paymentId: string, tenantId?: string): Promise<{ pdf: Buffer; filename: string }> {
  const p = await prisma.platformPayment.findFirst({
    where: { id: paymentId, status: 'SUCCESS', ...(tenantId ? { institutionId: tenantId } : {}) },
    include: {
      institution: { select: { name: true, slug: true, address: true, phone: true, contactPhone: true, email: true, contactEmail: true } },
      allocations: { include: { invoice: { select: { invoiceNumber: true, period: true } } } },
    },
  });
  if (!p) throw new NotFoundError('Receipt not found');

  const { doc, done } = start();
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  await drawInstitutionHeader(doc, issuer(), 'MONEY RECEIPT', p.receiptNumber ?? '');

  const top = doc.y;
  billTo(doc, { ...p.institution, phone: p.institution.contactPhone ?? p.institution.phone, email: p.institution.contactEmail ?? p.institution.email }, top, left, width * 0.55);
  const afterBill = doc.y;
  const rx = left + width * 0.6;
  const rw = width * 0.4;
  kv(doc, rx, top, rw, 'Receipt number', p.receiptNumber ?? '');
  kv(doc, rx, doc.y + 4, rw, 'Paid on', p.paidAt ? dateLabel(p.paidAt) : '');
  kv(doc, rx, doc.y + 4, rw, 'Method', p.method.replace(/_/g, ' ') + (p.isDemo ? ' (DEMO, no money moved)' : ''));
  if (p.reference) kv(doc, rx, doc.y + 4, rw, 'Reference', p.reference);
  doc.y = Math.max(afterBill, doc.y) + 20;

  let y = doc.y;
  doc.rect(left, y, width, 20).fill('#f1f5f9');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
  doc.text('Invoice', left + 6, y + 6, { width: width * 0.4 });
  doc.text('Month', left + width * 0.4, y + 6, { width: width * 0.3 });
  doc.text('Amount', left + width * 0.7, y + 6, { width: width * 0.3 - 6, align: 'right' });
  y += 24;
  doc.font('Helvetica').fontSize(9);
  for (const a of p.allocations) {
    doc.fillColor(INK).text(a.invoice.invoiceNumber, left + 6, y, { width: width * 0.4 });
    doc.text(periodLabel(a.invoice.period), left + width * 0.4, y, { width: width * 0.3 });
    doc.text(money(Number(a.appliedAmount)), left + width * 0.7, y, { width: width * 0.3 - 6, align: 'right' });
    y += 18;
  }
  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK);
  doc.text('Total received', left + width * 0.4, y, { width: width * 0.3 });
  doc.text(money(Number(p.amount)), left + width * 0.7, y, { width: width * 0.3 - 6, align: 'right' });
  y += 30;
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('This is a computer-generated receipt and needs no signature.', left, y, { width });

  doc.end();
  return { pdf: await done, filename: `${p.receiptNumber ?? 'receipt'}.pdf` };
}
