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
      'Dear Student,',
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
      'Dear Student,',
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
      'Dear Student,',
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
      'Dear Student,',
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

  // ── Platform subscription billing ───────────────────────────────────────
  // Recipients are institute admins and/or super admins. {{institutionName}}
  // is the subject institution (auto-injected). Kept factual and short.

  'SUBSCRIPTION_ACTIVATED:IN_APP': {
    subject: 'Subscription active',
    body: '{{institutionName}} — {{planName}} ({{billingCycle}}) is active until {{periodEnd}}. Payment of {{amount}} received.',
  },
  'SUBSCRIPTION_ACTIVATED:EMAIL': {
    subject: 'Subscription confirmed — {{planName}}',
    body: [
      'Hello,',
      '',
      'The subscription for {{institutionName}} is now active.',
      '',
      '  Plan        : {{planName}}',
      '  Billing     : {{billingCycle}}',
      '  Amount paid : {{amount}}',
      '  Active until: {{periodEnd}}',
      '',
      'You can review payments and receipts from the Subscription & Billing page.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },

  'SUBSCRIPTION_PAYMENT_FAILED:IN_APP': {
    subject: 'Subscription payment failed',
    body: 'The {{planName}} ({{billingCycle}}) payment of {{amount}} for {{institutionName}} did not go through. Please try again.',
  },
  'SUBSCRIPTION_PAYMENT_FAILED:EMAIL': {
    subject: 'Action needed — subscription payment did not complete',
    body: [
      'Hello,',
      '',
      'A subscription payment for {{institutionName}} did not complete.',
      '',
      '  Plan    : {{planName}}',
      '  Billing : {{billingCycle}}',
      '  Amount  : {{amount}}',
      '',
      'No charge was applied. You can retry from the Subscription & Billing page.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },

  'SUBSCRIPTION_PAYMENT_REQUESTED:IN_APP': {
    subject: 'Payment requested',
    body: 'The platform team requested a payment of {{amount}} for {{planName}} ({{billingCycle}}). Open Subscription & Billing to pay.',
  },
  'SUBSCRIPTION_PAYMENT_REQUESTED:EMAIL': {
    subject: 'Payment requested for your subscription',
    body: [
      'Hello,',
      '',
      'The PeopleIT team has requested a subscription payment for {{institutionName}}.',
      '',
      '  Plan    : {{planName}}',
      '  Billing : {{billingCycle}}',
      '  Amount  : {{amount}}',
      '',
      'Open the Subscription & Billing page and choose "Pay Now" to complete it securely.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },

  'SUBSCRIPTION_ADJUSTED:IN_APP': {
    subject: 'Subscription updated',
    body: 'The platform team updated {{institutionName}}\'s subscription ({{action}}). Active until {{periodEnd}}.',
  },
  'SUBSCRIPTION_ADJUSTED:EMAIL': {
    subject: 'Your subscription was updated by the PeopleIT team',
    body: [
      'Hello,',
      '',
      'The subscription for {{institutionName}} was updated by the PeopleIT team.',
      '',
      '  Change      : {{action}}',
      '  Reason      : {{reason}}',
      '  Active until : {{periodEnd}}',
      '',
      'No action is needed from you. Contact support if this looks wrong.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },

  'SUBSCRIPTION_REFUND_INITIATED:IN_APP': {
    subject: 'Refund started',
    body: 'A refund of {{amount}} for {{institutionName}} has been initiated with the payment gateway.',
  },
  'SUBSCRIPTION_REFUND_INITIATED:EMAIL': {
    subject: 'Refund initiated — {{amount}}',
    body: [
      'Hello,',
      '',
      'A refund has been initiated for {{institutionName}}.',
      '',
      '  Amount : {{amount}}',
      '  Reason : {{reason}}',
      '',
      'The gateway typically settles refunds within a few business days. You will',
      'get another message once it is confirmed.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },

  'SUBSCRIPTION_REFUNDED:IN_APP': {
    subject: 'Refund completed',
    body: 'The refund of {{amount}} for {{institutionName}} has been confirmed by the payment gateway.',
  },
  'SUBSCRIPTION_REFUNDED:EMAIL': {
    subject: 'Refund confirmed — {{amount}}',
    body: [
      'Hello,',
      '',
      'The refund for {{institutionName}} has been confirmed by the payment gateway.',
      '',
      '  Amount : {{amount}}',
      '',
      'It may take a few more days to appear on the original payment method.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },

  'SUBSCRIPTION_TRIAL_ENDING:IN_APP': {
    subject: 'Trial ending soon',
    body: 'Your free trial ends in {{daysRemaining}} day(s), on {{periodEnd}}. Choose a plan to keep access.',
  },
  'SUBSCRIPTION_TRIAL_ENDING:EMAIL': {
    subject: 'Your PeopleIT trial ends in {{daysRemaining}} day(s)',
    body: [
      'Hello,',
      '',
      'The free trial for {{institutionName}} ends on {{periodEnd}} ({{daysRemaining}} day(s) from now).',
      '',
      'To avoid any interruption, open the Subscription & Billing page and choose a',
      'plan before then.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },

  'SUBSCRIPTION_GRACE:IN_APP': {
    subject: 'Subscription expired — grace period',
    body: '{{institutionName}}\'s subscription has lapsed. You have {{daysRemaining}} day(s) (until {{graceEndsAt}}) before access is suspended.',
  },
  'SUBSCRIPTION_GRACE:EMAIL': {
    subject: 'Renew now — {{daysRemaining}} day(s) before suspension',
    body: [
      'Hello,',
      '',
      'The subscription for {{institutionName}} has expired and is in its grace period.',
      '',
      '  Access is suspended on : {{graceEndsAt}}',
      '  Days remaining         : {{daysRemaining}}',
      '',
      'Renew from the Subscription & Billing page to keep your account active.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },

  'SUBSCRIPTION_SUSPENDED:IN_APP': {
    subject: 'Account suspended',
    body: '{{institutionName}}\'s account has been suspended because the subscription grace period ended. Renew to restore access.',
  },
  'SUBSCRIPTION_SUSPENDED:EMAIL': {
    subject: 'Account suspended — subscription not renewed',
    body: [
      'Hello,',
      '',
      'Access for {{institutionName}} has been suspended because the subscription',
      'grace period ended without a renewal.',
      '',
      'Staff and students cannot sign in until the subscription is renewed. Open the',
      'Subscription & Billing page (still reachable by the institute admin) to pay,',
      'or contact the PeopleIT team.',
      '',
      'PeopleIT SMS',
    ].join('\n'),
  },
};

export function defaultTemplateKey(type: NotificationType, channel: string): string {
  return `${type}:${channel}`;
}
