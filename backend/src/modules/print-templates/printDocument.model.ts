import type { PaperSize, PrintDocType, PrintLanguage, TemplateSettings } from './printTemplate.settings';
import { amountInWordsBn, amountInWordsEn, formatAmount, toBanglaDigits } from './numberWords';

// =============================================================================
// P3: one "document model" per printed invoice/receipt — every label already
// translated, every number formatted. Built here (pure, unit-tested), then
//   - drawn to PDF by printDocument.pdf.ts (all real prints/downloads), and
//   - returned as JSON to the designer's live HTML preview.
// =============================================================================

export interface PrintInstitution {
  name: string;
  nameBn?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  eiin?: string | null;
  logoUrl?: string | null;
}

export interface PrintStudent {
  name: string;
  studentId?: string | null;
  roll?: string | null;
  className?: string | null;
  sectionName?: string | null;
  guardianName?: string | null;
  photoUrl?: string | null;
}

export interface PrintInvoiceData {
  id: string;
  invoiceNo: string;
  createdAt: Date;
  dueDate: Date;
  status: string;
  /** Billing month "YYYY-MM" (P2 InvoicePeriod), when known. */
  month?: string | null;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  /** Unpaid balance on the student's OTHER invoices. */
  previousDues?: number | null;
  items: Array<{ description: string; amount: number; discount: number; netAmount: number }>;
  payments: Array<{ paidAt: Date; method: string; receiptNo?: string | null; amount: number }>;
  notes?: string | null;
}

export interface PrintPaymentData {
  receiptNo?: string | null;
  amount: number;
  method: string;
  transactionRef?: string | null;
  paidAt: Date;
  collector?: string | null;
  notes?: string | null;
  demo?: boolean;
}

export interface PrintSource {
  docType: PrintDocType;
  institution: PrintInstitution;
  student: PrintStudent | null;
  invoice: PrintInvoiceData;
  /** RECEIPT only. */
  payment?: PrintPaymentData | null;
}

export interface KV {
  label: string;
  value: string;
  strong?: boolean;
}

export interface DocTable {
  headers: string[];
  rows: string[][];
  /** Relative widths, one per column. */
  widths: number[];
  align: Array<'left' | 'right'>;
}

export interface DocModel {
  docType: PrintDocType;
  paper: PaperSize;
  language: PrintLanguage;
  accentColor: string;
  fontSize: number;
  header: { logoUrl: string | null; name: string | null; nameAlt: string | null; lines: string[] };
  title: string;
  meta: KV[];
  party: KV[];
  photoUrl: string | null;
  banner: string | null;
  table: DocTable | null;
  totals: KV[];
  amountInWords: string | null;
  payments: DocTable | null;
  notes: string | null;
  signatures: Array<{ label: string; image: string | null }>;
  footer: string | null;
  watermark: string | null;
  copyLabels: { office: string; student: string };
}

// ── Labels ──────────────────────────────────────────────────────────────────
const LABELS = {
  invoiceTitle: ['Invoice', 'ফি ইনভয়েস'],
  receiptTitle: ['Money Receipt', 'টাকা প্রাপ্তির রসিদ'],
  invoiceNo: ['Invoice No.', 'ইনভয়েস নং'],
  receiptNo: ['Receipt No.', 'রসিদ নং'],
  date: ['Date', 'তারিখ'],
  dueDate: ['Due date', 'শেষ তারিখ'],
  month: ['Month', 'মাস'],
  student: ['Student', 'শিক্ষার্থী'],
  receivedFrom: ['Received from', 'প্রদানকারী'],
  studentId: ['Student ID', 'আইডি'],
  roll: ['Roll', 'রোল'],
  classSection: ['Class / Section', 'শ্রেণি / শাখা'],
  guardian: ['Guardian', 'অভিভাবক'],
  description: ['Description', 'বিবরণ'],
  amount: ['Amount', 'টাকা'],
  discount: ['Discount', 'ছাড়'],
  net: ['Net', 'নিট'],
  total: ['Total', 'মোট'],
  totalDiscount: ['Total discount', 'মোট ছাড়'],
  paid: ['Paid', 'পরিশোধিত'],
  due: ['Due', 'বকেয়া'],
  previousDues: ['Previous dues', 'পূর্বের বকেয়া'],
  totalPayable: ['Total payable', 'সর্বমোট প্রদেয়'],
  amountReceived: ['Amount received', 'প্রাপ্ত টাকা'],
  remainingDue: ['Remaining due on invoice', 'ইনভয়েসে অবশিষ্ট বকেয়া'],
  method: ['Payment method', 'পরিশোধের মাধ্যম'],
  reference: ['Reference', 'রেফারেন্স'],
  collector: ['Collected by', 'আদায়কারী'],
  inWords: ['In words', 'কথায়'],
  paymentHistory: ['Payment history', 'পরিশোধের ইতিহাস'],
  notes: ['Notes', 'মন্তব্য'],
  eiin: ['EIIN', 'ইআইআইএন'],
  phone: ['Phone', 'ফোন'],
  paidMark: ['PAID', 'পরিশোধিত'],
  dueMark: ['DUE', 'বকেয়া'],
  demo: ['DEMO MODE — simulated online payment, no money was charged.', 'ডেমো মোড — পরীক্ষামূলক অনলাইন পেমেন্ট, কোনো টাকা কাটা হয়নি।'],
} as const;
export type LabelKey = keyof typeof LABELS;

/** Known English defaults (signature / copy labels) and their Bangla. */
const KNOWN_TEXT: Record<string, string> = {
  'Received by': 'গ্রহণকারী',
  "Payer's signature": 'প্রদানকারীর স্বাক্ষর',
  'Prepared by': 'প্রস্তুতকারী',
  'Authorized signature': 'অনুমোদিত স্বাক্ষর',
  'Accountant': 'হিসাবরক্ষক',
  'Principal': 'অধ্যক্ষ',
  'Head teacher': 'প্রধান শিক্ষক',
  'Office copy': 'অফিস কপি',
  'Student copy': 'শিক্ষার্থী কপি',
};

const METHODS: Record<string, [string, string]> = {
  CASH: ['Cash', 'নগদ টাকা'],
  BANK_TRANSFER: ['Bank transfer', 'ব্যাংক ট্রান্সফার'],
  BKASH: ['bKash', 'বিকাশ'],
  NAGAD: ['Nagad', 'নগদ (মোবাইল)'],
  ROCKET: ['Rocket', 'রকেট'],
  SSLCOMMERZ: ['Online (SSLCommerz)', 'অনলাইন (SSLCommerz)'],
  CHEQUE: ['Cheque', 'চেক'],
};

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

export class Translator {
  constructor(readonly language: PrintLanguage, readonly banglaDigits: boolean) {}

  private pick(en: string, bn: string): string {
    if (this.language === 'en') return en;
    if (this.language === 'bn') return bn;
    return en === bn ? en : `${en} / ${bn}`;
  }

  label(key: LabelKey): string {
    const [en, bn] = LABELS[key];
    return this.pick(en, bn);
  }

  /** A school-entered label: translated if it is one of our known defaults. */
  custom(text: string): string {
    const bn = KNOWN_TEXT[text];
    return bn ? this.pick(text, bn) : text;
  }

  method(code: string): string {
    const m = METHODS[code];
    return m ? this.pick(m[0], m[1]) : code;
  }

  /** Bangla digits only when language = bn and the option is on. */
  digits(s: string): string {
    return this.language === 'bn' && this.banglaDigits ? toBanglaDigits(s) : s;
  }

  money(n: number): string {
    return this.digits(formatAmount(n));
  }

  date(d: Date, timeZone = 'Asia/Dhaka'): string {
    const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(d)
      .split('-')
      .map(Number);
    if (this.language === 'bn') return this.digits(`${day} ${MONTHS_BN[m - 1]} ${y}`);
    return `${day} ${MONTHS_EN[m - 1].slice(0, 3)} ${y}`;
  }

  month(period: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!match) return period;
    const idx = Number(match[2]) - 1;
    if (idx < 0 || idx > 11) return period;
    if (this.language === 'en') return `${MONTHS_EN[idx]} ${match[1]}`;
    if (this.language === 'bn') return this.digits(`${MONTHS_BN[idx]} ${match[1]}`);
    return `${MONTHS_EN[idx]} ${match[1]} / ${MONTHS_BN[idx]}`;
  }

  inWords(n: number): string {
    if (this.language === 'en') return amountInWordsEn(n);
    if (this.language === 'bn') return amountInWordsBn(n);
    return `${amountInWordsEn(n)} (${amountInWordsBn(n)})`;
  }
}

const present = (s: string | null | undefined): s is string => !!s && s.trim().length > 0;

/** Builds the printable model of one invoice or receipt under the given template settings. */
export function buildDocModel(src: PrintSource, s: TemplateSettings): DocModel {
  const t = new Translator(s.language, s.banglaDigits);
  const f = s.fields;
  const inv = src.invoice;
  const receipt = src.docType === 'RECEIPT' && !!src.payment;
  const pay = src.payment ?? null;
  const inst = src.institution;
  const st = src.student;

  // Header
  const showBn = s.header.showNameBn && present(inst.nameBn);
  const name = s.header.showName ? (s.language === 'bn' && showBn ? inst.nameBn! : inst.name) : null;
  const nameAlt = s.header.showName && showBn && s.language !== 'bn' ? inst.nameBn! : null;
  const lines: string[] = [];
  if (s.header.showAddress && present(inst.address)) lines.push(inst.address);
  const contact = [s.header.showPhone && present(inst.phone) ? `${t.label('phone')}: ${inst.phone}` : null, s.header.showEmail && present(inst.email) ? inst.email : null]
    .filter(Boolean)
    .join('  |  ');
  if (contact) lines.push(contact);
  if (s.header.showEiin && present(inst.eiin)) lines.push(`${t.label('eiin')}: ${inst.eiin}`);
  for (const l of s.header.customLines) if (present(l)) lines.push(l);

  // Meta (top-right block)
  const meta: KV[] = [];
  if (receipt && pay?.receiptNo) meta.push({ label: t.label('receiptNo'), value: pay.receiptNo });
  meta.push({ label: t.label('invoiceNo'), value: inv.invoiceNo });
  meta.push({ label: t.label('date'), value: t.date(receipt && pay ? pay.paidAt : inv.createdAt) });
  if (f.month && present(inv.month)) meta.push({ label: t.label('month'), value: t.month(inv.month) });
  if (!receipt && f.dueDate) meta.push({ label: t.label('dueDate'), value: t.date(inv.dueDate) });

  // Party (student block)
  const party: KV[] = [];
  if (st) {
    party.push({ label: t.label(receipt ? 'receivedFrom' : 'student'), value: st.name, strong: true });
    if (f.studentId && present(st.studentId)) party.push({ label: t.label('studentId'), value: st.studentId });
    if (f.roll && present(st.roll)) party.push({ label: t.label('roll'), value: t.digits(st.roll) });
    if (f.classSection && (present(st.className) || present(st.sectionName))) {
      party.push({ label: t.label('classSection'), value: [st.className, st.sectionName].filter(present).join(' / ') });
    }
    if (f.guardianName && present(st.guardianName)) party.push({ label: t.label('guardian'), value: st.guardianName });
  }

  // Line items
  const showDiscount = f.discounts && inv.items.some((i) => i.discount > 0);
  let table: DocTable | null = null;
  if (f.items && inv.items.length > 0) {
    const headers = [t.label('description'), t.label('amount')];
    const widths = [showDiscount ? 0.46 : 0.7, showDiscount ? 0.18 : 0.3];
    const align: Array<'left' | 'right'> = ['left', 'right'];
    if (showDiscount) {
      headers.push(t.label('discount'), t.label('net'));
      widths.push(0.16, 0.2);
      align.push('right', 'right');
    }
    table = {
      headers,
      widths,
      align,
      rows: inv.items.map((i) =>
        showDiscount ? [i.description, t.money(i.amount), t.money(i.discount), t.money(i.netAmount)] : [i.description, t.money(i.netAmount)],
      ),
    };
  }

  // Totals
  const totals: KV[] = [];
  const prev = f.previousDues && inv.previousDues && inv.previousDues > 0 ? inv.previousDues : 0;
  if (receipt && pay) {
    totals.push({ label: t.label('total'), value: t.money(inv.totalAmount) });
    totals.push({ label: t.label('amountReceived'), value: t.money(pay.amount), strong: true });
    totals.push({ label: t.label('remainingDue'), value: t.money(inv.dueAmount) });
    if (prev) totals.push({ label: t.label('previousDues'), value: t.money(prev) });
  } else {
    const discount = inv.items.reduce((sum, i) => sum + i.discount, 0);
    totals.push({ label: t.label('total'), value: t.money(inv.totalAmount) });
    if (f.discounts && discount > 0 && !showDiscount) totals.push({ label: t.label('totalDiscount'), value: t.money(discount) });
    totals.push({ label: t.label('paid'), value: t.money(inv.paidAmount) });
    totals.push({ label: t.label('due'), value: t.money(inv.dueAmount), strong: !prev });
    if (prev) {
      totals.push({ label: t.label('previousDues'), value: t.money(prev) });
      totals.push({ label: t.label('totalPayable'), value: t.money(inv.dueAmount + prev), strong: true });
    }
  }
  if (receipt && pay && f.paymentMethod) {
    totals.push({ label: t.label('method'), value: t.method(pay.method) });
    if (present(pay.transactionRef)) totals.push({ label: t.label('reference'), value: pay.transactionRef });
  }
  if (receipt && pay && f.collector && present(pay.collector)) totals.push({ label: t.label('collector'), value: pay.collector });

  const wordsAmount = receipt && pay ? pay.amount : inv.dueAmount + prev;
  const amountInWords = f.amountInWords ? `${t.label('inWords')}: ${t.inWords(wordsAmount)}` : null;

  // Payment history (invoices only)
  let payments: DocTable | null = null;
  if (!receipt && f.paymentHistory && inv.payments.length > 0) {
    payments = {
      headers: [t.label('date'), t.label('method'), t.label('amount')],
      widths: [0.3, 0.45, 0.25],
      align: ['left', 'left', 'right'],
      rows: inv.payments.map((p) => [
        t.date(p.paidAt),
        f.paymentMethod ? `${t.method(p.method)}${p.receiptNo ? ` · ${p.receiptNo}` : ''}` : p.receiptNo ?? '',
        t.money(p.amount),
      ]),
    };
  }

  const notesText = receipt ? pay?.notes : inv.notes;
  const notes = f.notes && present(notesText) && !(pay?.demo && notesText.startsWith('DEMO MODE')) ? `${t.label('notes')}: ${notesText}` : null;

  const fullyPaid = receipt ? false : inv.dueAmount <= 0 && inv.totalAmount > 0;
  let watermark: string | null = null;
  if (s.watermark === 'AUTO') {
    if (receipt || fullyPaid) watermark = t.label('paidMark');
    else if (inv.status !== 'CANCELLED') watermark = t.label('dueMark');
  }

  return {
    docType: src.docType,
    paper: s.paper,
    language: s.language,
    accentColor: s.accentColor,
    fontSize: s.fontSize,
    header: { logoUrl: s.header.showLogo ? inst.logoUrl ?? null : null, name, nameAlt, lines },
    title: present(s.title) ? s.title : t.label(receipt ? 'receiptTitle' : 'invoiceTitle'),
    meta,
    party,
    photoUrl: f.studentPhoto ? st?.photoUrl ?? null : null,
    banner: pay?.demo ? t.label('demo') : null,
    table,
    totals,
    amountInWords,
    payments,
    notes,
    signatures: s.signatures.filter((sig) => present(sig.label) || !!sig.image).map((sig) => ({ label: t.custom(sig.label), image: sig.image ?? null })),
    footer: present(s.footerNote) ? s.footerNote : null,
    watermark,
    copyLabels: { office: t.custom(s.copyLabels.office), student: t.custom(s.copyLabels.student) },
  };
}
