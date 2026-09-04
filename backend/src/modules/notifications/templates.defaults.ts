import { NotificationType } from './notifications.dto';

// Bundled system templates, keyed `${type}:${channel}`. A tenant may override
// any of these with a NotificationTemplate row (see renderer.ts); these are the
// fallback so a freshly-onboarded institution has working notifications on day
// one without any seeding step.
//
// Placeholders are `{{var}}` only — no logic, no loops. Every value is
// substituted through interpolate(), which strips control characters.
//
// One template per (type, channel): an SMS is not a truncated email. SMS
// bodies are kept inside a single ~160-character segment so a long student
// name cannot silently double the send cost.
export interface DefaultTemplate {
  subject?: string;
  body: string;
}

export const DEFAULT_TEMPLATES: Record<string, DefaultTemplate> = {
  // ── INVOICE_ISSUED ──────────────────────────────────────────────────────
  'INVOICE_ISSUED:IN_APP': {
    subject: 'New invoice {{invoiceNo}}',
    body: 'Invoice {{invoiceNo}} for {{studentName}} is Tk {{amount}}, due {{dueDate}}.',
  },
  'INVOICE_ISSUED:EMAIL': {
    subject: 'Invoice {{invoiceNo}} from {{institutionName}}',
    body: [
      'Dear Guardian,',
      '',
      'A new invoice has been issued for {{studentName}}.',
      '',
      '  Invoice number : {{invoiceNo}}',
      '  Amount due     : Tk {{amount}}',
      '  Due date       : {{dueDate}}',
      '',
      'You can view the invoice and pay online from the Fees section of your portal.',
      '',
      '{{institutionName}}',
    ].join('\n'),
  },
  'INVOICE_ISSUED:SMS': {
    body: 'Invoice {{invoiceNo}} for {{studentName}}: Tk {{amount}}, due {{dueDate}}. - {{institutionName}}',
  },

  // ── PAYMENT_RECEIVED ────────────────────────────────────────────────────
  'PAYMENT_RECEIVED:IN_APP': {
    subject: 'Payment received',
    body: 'Tk {{amount}} received against invoice {{invoiceNo}} for {{studentName}}. Thank you.',
  },
  'PAYMENT_RECEIVED:EMAIL': {
    subject: 'Payment received for invoice {{invoiceNo}}',
    body: [
      'Dear Guardian,',
      '',
      'We have received your payment. Thank you.',
      '',
      '  Invoice number : {{invoiceNo}}',
      '  Student        : {{studentName}}',
      '  Amount paid    : Tk {{amount}}',
      '  Balance due    : Tk {{dueAmount}}',
      '',
      'This message is your receipt confirmation.',
      '',
      '{{institutionName}}',
    ].join('\n'),
  },
  'PAYMENT_RECEIVED:SMS': {
    body: 'Payment of Tk {{amount}} received for invoice {{invoiceNo}}. Balance Tk {{dueAmount}}. - {{institutionName}}',
  },

  // ── FEE_REMINDER ────────────────────────────────────────────────────────
  'FEE_REMINDER:IN_APP': {
    subject: 'Fee due: {{invoiceNo}}',
    body: 'Invoice {{invoiceNo}} (Tk {{amount}}) for {{studentName}} is due on {{dueDate}}.',
  },
  'FEE_REMINDER:EMAIL': {
    subject: 'Reminder: invoice {{invoiceNo}} is due {{dueDate}}',
    body: [
      'Dear Guardian,',
      '',
      'This is a reminder that the following invoice is due.',
      '',
      '  Invoice number : {{invoiceNo}}',
      '  Student        : {{studentName}}',
      '  Amount due     : Tk {{amount}}',
      '  Due date       : {{dueDate}}',
      '',
      'Please disregard this message if you have already paid.',
      '',
      '{{institutionName}}',
    ].join('\n'),
  },
  'FEE_REMINDER:SMS': {
    body: 'Reminder: invoice {{invoiceNo}} (Tk {{amount}}) for {{studentName}} is due {{dueDate}}. - {{institutionName}}',
  },

  // ── ABSENCE_ALERT ───────────────────────────────────────────────────────
  'ABSENCE_ALERT:IN_APP': {
    subject: 'Absence recorded',
    body: '{{studentName}} was marked absent on {{date}}. Contact the school if this is unexpected.',
  },
  'ABSENCE_ALERT:EMAIL': {
    subject: '{{studentName}} was marked absent on {{date}}',
    body: [
      'Dear Guardian,',
      '',
      '{{studentName}} was recorded absent on {{date}}.',
      '',
      'If this is unexpected, please contact the school office.',
      '',
      '{{institutionName}}',
    ].join('\n'),
  },
  'ABSENCE_ALERT:SMS': {
    body: '{{studentName}} was marked ABSENT on {{date}}. Please contact the school if unexpected. - {{institutionName}}',
  },
};

export function defaultTemplateKey(type: NotificationType, channel: string): string {
  return `${type}:${channel}`;
}
