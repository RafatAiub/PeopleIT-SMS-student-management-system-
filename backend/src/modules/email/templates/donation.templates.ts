import { buildEmailLayout, type LayoutOptions } from '../layout';
import { bnParagraph, button, infoTable, paragraph } from '../components';
import type { EmailContent } from './auth.templates';

// =============================================================================
// T1 donations — donor-facing emails. Donors are usually not portal users,
// so these go out directly through sendEmail() (with EmailLog, budget and
// suppression), not through the per-user notification pipeline.
// =============================================================================

export interface DonationReceiptEmailInput {
  donorName: string;
  institutionName: string;
  receiptNo: string;
  fundName: string;
  fundNameBn?: string | null;
  amount: string; // already formatted, e.g. "BDT 5,000.00"
  amountInWordsEn: string;
  amountInWordsBn: string;
  paidAt: string; // formatted date
  method: string;
  receiptUrl?: string | null;
  institution?: LayoutOptions['institution'];
}

export function donationReceiptEmail(o: DonationReceiptEmailInput): EmailContent {
  const subject = `Donation receipt ${o.receiptNo} — ${o.institutionName}`;
  const bodyHtml =
    paragraph(`Dear ${o.donorName}, JazakAllahu khairan. ${o.institutionName} has received your donation. Please keep this receipt for your records.`) +
    infoTable([
      { label: 'Receipt no.', value: o.receiptNo },
      { label: 'Fund', value: o.fundNameBn ? `${o.fundName} (${o.fundNameBn})` : o.fundName },
      { label: 'Amount', value: o.amount },
      { label: 'In words', value: o.amountInWordsEn },
      { label: 'Date', value: o.paidAt },
      { label: 'Method', value: o.method },
    ]) +
    bnParagraph(`প্রিয় ${o.donorName}, জাযাকাল্লাহু খাইরান। ${o.institutionName} আপনার দান গ্রহণ করেছে। কথায়: ${o.amountInWordsBn}। রসিদ নম্বর: ${o.receiptNo}।`) +
    (o.receiptUrl ? button(o.receiptUrl, 'View receipt') : '');
  const text = [
    `Dear ${o.donorName}, JazakAllahu khairan. ${o.institutionName} has received your donation.`,
    '',
    `  Receipt no. : ${o.receiptNo}`,
    `  Fund        : ${o.fundName}`,
    `  Amount      : ${o.amount}`,
    `  In words    : ${o.amountInWordsEn}`,
    `  Date        : ${o.paidAt}`,
    `  Method      : ${o.method}`,
    '',
    `কথায়: ${o.amountInWordsBn}`,
    ...(o.receiptUrl ? ['', `View receipt: ${o.receiptUrl}`] : []),
  ].join('\n');
  return {
    subject,
    html: buildEmailLayout({ preheader: `Receipt ${o.receiptNo} for your donation of ${o.amount}.`, heading: 'Thank you for your donation', bodyHtml, institution: o.institution }),
    text,
  };
}

export interface DonationReminderEmailInput {
  donorName: string;
  institutionName: string;
  fundName: string;
  amount: string;
  dueDate: string;
  institution?: LayoutOptions['institution'];
}

export function donationReminderEmail(o: DonationReminderEmailInput): EmailContent {
  const subject = `Monthly donation reminder — ${o.institutionName}`;
  const bodyHtml =
    paragraph(`Dear ${o.donorName}, this is a gentle reminder of your monthly pledge to ${o.institutionName}.`) +
    infoTable([
      { label: 'Fund', value: o.fundName },
      { label: 'Amount', value: o.amount },
      { label: 'Due', value: o.dueDate },
    ]) +
    paragraph('If you have already given this month, please ignore this message. May Allah reward you.') +
    bnParagraph(`প্রিয় ${o.donorName}, ${o.institutionName}-এ আপনার মাসিক দানের (${o.amount}) কথা মনে করিয়ে দিচ্ছি। নির্ধারিত তারিখ: ${o.dueDate}। ইতিমধ্যে দিয়ে থাকলে এই বার্তাটি উপেক্ষা করুন।`);
  return {
    subject,
    html: buildEmailLayout({ preheader: `Your monthly pledge of ${o.amount} is due ${o.dueDate}.`, heading: 'Monthly donation reminder', bodyHtml, institution: o.institution }),
    text: [
      `Dear ${o.donorName}, this is a gentle reminder of your monthly pledge to ${o.institutionName}.`,
      '',
      `  Fund   : ${o.fundName}`,
      `  Amount : ${o.amount}`,
      `  Due    : ${o.dueDate}`,
      '',
      'If you have already given this month, please ignore this message.',
    ].join('\n'),
  };
}
