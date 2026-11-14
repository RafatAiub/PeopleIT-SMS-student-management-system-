import { toBnDigits } from './platformBilling.logic';

// =============================================================================
// P1: reminder / receipt texts sent to schools from PeopleNIT's own SMS and
// email. EDIT THE WORDING HERE. Every template has English and Bangla text.
//
//  - SMS: one language per message (profile.smsLanguage, default Bangla).
//    Bangla SMS are Unicode (70 characters per segment), so keep them short.
//  - Email: always bilingual (Bangla first, then English).
//
// Variables (all already formatted): school, invoiceNo, period / periodBn,
// amount (e.g. "3,000"), dueDate / dueDateBn, daysOverdue, payLink, receiptNo.
// =============================================================================

export type TemplateKind = 'UPCOMING' | 'FINAL' | 'OVERDUE' | 'RECEIPT';

export interface TemplateVars {
  school: string;
  invoiceNo: string;
  period: string;
  periodBn: string;
  amount: string;
  dueDate: string;
  dueDateBn: string;
  daysOverdue: number;
  payLink: string;
  receiptNo?: string;
}

const bn = (s: string | number) => toBnDigits(String(s));

export const SMS_TEMPLATES: Record<TemplateKind, { en: (v: TemplateVars) => string; bn: (v: TemplateVars) => string }> = {
  UPCOMING: {
    en: (v) => `PeopleNIT bill ${v.period}: Tk ${v.amount} due by ${v.dueDate}. Pay: ${v.payLink}`,
    bn: (v) => `PeopleNIT বিল ${v.periodBn}: ৳${bn(v.amount)}, শেষ তারিখ ${v.dueDateBn}। পরিশোধ: ${v.payLink}`,
  },
  FINAL: {
    en: (v) => `PeopleNIT: TODAY is the last day to pay Tk ${v.amount} (${v.period}). Pay: ${v.payLink}`,
    bn: (v) => `PeopleNIT: আজ ৳${bn(v.amount)} (${v.periodBn}) পরিশোধের শেষ দিন। পরিশোধ: ${v.payLink}`,
  },
  OVERDUE: {
    en: (v) => `PeopleNIT: Tk ${v.amount} for ${v.period} is ${v.daysOverdue} day(s) overdue. Please pay now: ${v.payLink}`,
    bn: (v) => `PeopleNIT: ${v.periodBn}-এর ৳${bn(v.amount)} বিল ${bn(v.daysOverdue)} দিন বকেয়া। এখনই পরিশোধ করুন: ${v.payLink}`,
  },
  RECEIPT: {
    en: (v) => `PeopleNIT: Payment of Tk ${v.amount} received. Receipt ${v.receiptNo ?? ''}. Thank you!`,
    bn: (v) => `PeopleNIT: ৳${bn(v.amount)} পেমেন্ট পাওয়া গেছে। রসিদ ${v.receiptNo ?? ''}। ধন্যবাদ!`,
  },
};

export interface EmailCopy {
  subject: (v: TemplateVars) => string;
  heading: (v: TemplateVars) => string;
  bn: (v: TemplateVars) => string[];
  en: (v: TemplateVars) => string[];
  button: { bn: string; en: string } | null;
}

export const EMAIL_TEMPLATES: Record<TemplateKind, EmailCopy> = {
  UPCOMING: {
    subject: (v) => `PeopleNIT bill for ${v.period}: Tk ${v.amount} due ${v.dueDate} | বিল ${v.periodBn}`,
    heading: (v) => `Your PeopleNIT bill for ${v.period}`,
    bn: (v) => [
      `প্রিয় ${v.school},`,
      `${v.periodBn} মাসের PeopleNIT সফটওয়্যার বিল (${v.invoiceNo}) ৳${bn(v.amount)}। অনুগ্রহ করে ${v.dueDateBn}-এর মধ্যে পরিশোধ করুন।`,
    ],
    en: (v) => [
      `Dear ${v.school},`,
      `Your PeopleNIT bill ${v.invoiceNo} for ${v.period} is Tk ${v.amount}. Please pay by ${v.dueDate}.`,
      'You can pay online with bKash or SSLCommerz (cards, mobile banking) from the Billing page.',
    ],
    button: { bn: 'বিল পরিশোধ করুন', en: 'Pay the bill' },
  },
  FINAL: {
    subject: (v) => `Last day today: PeopleNIT bill Tk ${v.amount} (${v.period}) | আজ শেষ দিন`,
    heading: () => 'Today is the last day to pay',
    bn: (v) => [`প্রিয় ${v.school},`, `আজ (${v.dueDateBn}) ${v.periodBn} মাসের ৳${bn(v.amount)} বিল পরিশোধের শেষ দিন।`],
    en: (v) => [
      `Dear ${v.school},`,
      `Today (${v.dueDate}) is the last day to pay your PeopleNIT bill ${v.invoiceNo} of Tk ${v.amount} for ${v.period}.`,
    ],
    button: { bn: 'এখনই পরিশোধ করুন', en: 'Pay now' },
  },
  OVERDUE: {
    subject: (v) => `Overdue: PeopleNIT bill Tk ${v.amount} (${v.period}) | বকেয়া বিল`,
    heading: () => 'Your PeopleNIT bill is overdue',
    bn: (v) => [
      `প্রিয় ${v.school},`,
      `${v.periodBn} মাসের ৳${bn(v.amount)} বিল (${v.invoiceNo}) ${bn(v.daysOverdue)} দিন বকেয়া। সেবা চালু রাখতে অনুগ্রহ করে এখনই পরিশোধ করুন।`,
    ],
    en: (v) => [
      `Dear ${v.school},`,
      `Your PeopleNIT bill ${v.invoiceNo} of Tk ${v.amount} for ${v.period} is ${v.daysOverdue} day(s) overdue (it was due on ${v.dueDate}).`,
      'Please pay now to keep your school account fully active. If you have already paid, please ignore this message or reply with the payment reference.',
    ],
    button: { bn: 'এখনই পরিশোধ করুন', en: 'Pay now' },
  },
  RECEIPT: {
    subject: (v) => `Payment received: Tk ${v.amount} (receipt ${v.receiptNo ?? ''}) | পেমেন্ট পাওয়া গেছে`,
    heading: () => 'Thank you, payment received',
    bn: (v) => [`প্রিয় ${v.school},`, `আপনার ৳${bn(v.amount)} পেমেন্ট পাওয়া গেছে। রসিদ নম্বর ${v.receiptNo ?? ''}। ধন্যবাদ।`],
    en: (v) => [
      `Dear ${v.school},`,
      `We received your payment of Tk ${v.amount}. Receipt number ${v.receiptNo ?? ''}. You can download the receipt from the Billing page.`,
    ],
    button: { bn: 'রসিদ দেখুন', en: 'View receipt' },
  },
};

export function renderSms(kind: TemplateKind, lang: 'bn' | 'en', v: TemplateVars): string {
  return SMS_TEMPLATES[kind][lang === 'en' ? 'en' : 'bn'](v);
}
