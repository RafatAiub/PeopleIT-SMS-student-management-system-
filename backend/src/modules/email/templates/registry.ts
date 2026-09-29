import type { EmailContent } from './auth.templates';
import {
  accountApprovedEmail,
  passwordResetEmail,
  twoFactorCodeEmail,
  verificationEmail,
} from './auth.templates';
import { institutionApprovedEmail, institutionRejectedEmail } from './institution-application.templates';
import { staffInviteEmail } from './invite.templates';
import {
  siteCourseEnrollmentEmail,
  siteCustomerPasswordResetEmail,
  siteCustomerWelcomeEmail,
  siteOrderConfirmedEmail,
} from './site-customer.templates';
import { formSubmittedAckEmail } from './site-form.templates';
import { DEFAULT_TEMPLATES, defaultTemplateKey } from '../../notifications/templates.defaults';
import { interpolate } from '../../notifications/renderer';
import { renderPlainBodyToHtml } from '../components';
import { buildEmailLayout } from '../layout';

// =============================================================================
// Every statically-defined template in the system, rendered with realistic
// sample data — powers both the Super Admin preview gallery (email.admin.*)
// and scripts/email-preview.ts.
//
// The bulk of the ~19 notification-pipeline templates (invoices, receipts,
// leave, subscription events, etc.) are tenant-editable freeform text
// resolved at send time — preview those live per-institution via the
// existing `POST /notifications/test` endpoint. A handful of the newer,
// higher-value ones (support tickets, results, payslips, data export) are
// also mirrored here with their BUNDLED DEFAULT copy, rendered through the
// exact same interpolate() -> renderPlainBodyToHtml() -> buildEmailLayout()
// pipeline notifications/channels/email.channel.ts uses at send time, so
// what you see here is what a tenant with no override actually receives.
// =============================================================================

function renderDefaultNotification(type: string, vars: Record<string, string>): EmailContent {
  const template = DEFAULT_TEMPLATES[defaultTemplateKey(type as never, 'EMAIL')];
  const subject = interpolate(template.subject ?? type, vars);
  const bodyHtml = renderPlainBodyToHtml(interpolate(template.body, vars));
  return {
    subject,
    html: buildEmailLayout({ preheader: subject, heading: subject, bodyHtml, institution: SAMPLE_INSTITUTION }),
    text: interpolate(template.body, vars),
  };
}

const SAMPLE_INSTITUTION = { name: 'Green Valley High School', logoUrl: null, color: '#0f766e' };

export interface RegisteredTemplate {
  key: string;
  description: string;
  render: () => EmailContent;
}

export const EMAIL_TEMPLATE_REGISTRY: RegisteredTemplate[] = [
  {
    key: 'auth.verify-email',
    description: 'Sent when a new user signs up — confirms their email address. (EN)',
    render: () => verificationEmail({ to: 'sample@example.com', firstName: 'Rahim', url: 'https://app.example.com/verify-email?token=SAMPLE', expiresInMinutes: 30 }),
  },
  {
    key: 'auth.verify-email.bn',
    description: 'Same template, Bangla copy — sent when the institution defaultLanguage is "bn".',
    render: () => verificationEmail({ to: 'sample@example.com', firstName: 'রহিম', url: 'https://app.example.com/verify-email?token=SAMPLE', expiresInMinutes: 30, lang: 'bn' }),
  },
  {
    key: 'auth.password-reset',
    description: 'Sent when a user requests a password reset. (EN)',
    render: () => passwordResetEmail({ to: 'sample@example.com', firstName: 'Karim', url: 'https://app.example.com/reset-password?token=SAMPLE', expiresInMinutes: 30 }),
  },
  {
    key: 'auth.password-reset.bn',
    description: 'Same template, Bangla copy.',
    render: () => passwordResetEmail({ to: 'sample@example.com', firstName: 'করিম', url: 'https://app.example.com/reset-password?token=SAMPLE', expiresInMinutes: 30, lang: 'bn' }),
  },
  {
    key: 'auth.two-factor-code',
    description: 'One-time sign-in code for accounts with email 2FA. (EN)',
    render: () => twoFactorCodeEmail({ to: 'sample@example.com', firstName: 'Fatima', code: '482913', expiresInMinutes: 10 }),
  },
  {
    key: 'auth.two-factor-code.bn',
    description: 'Same template, Bangla copy.',
    render: () => twoFactorCodeEmail({ to: 'sample@example.com', firstName: 'ফাতিমা', code: '482913', expiresInMinutes: 10, lang: 'bn' }),
  },
  {
    key: 'auth.account-approved',
    description: 'Sent to a self-registered user once an admin approves their account. (EN)',
    render: () => accountApprovedEmail({ to: 'sample@example.com', firstName: 'Nusrat', institutionName: SAMPLE_INSTITUTION.name, loginUrl: 'https://app.example.com/login' }),
  },
  {
    key: 'auth.account-approved.bn',
    description: 'Same template, Bangla copy.',
    render: () => accountApprovedEmail({ to: 'sample@example.com', firstName: 'নুসরাত', institutionName: SAMPLE_INSTITUTION.name, loginUrl: 'https://app.example.com/login', lang: 'bn' }),
  },
  {
    key: 'institution-application.approved',
    description: 'Delivers the generated admin password when a new school application is approved.',
    render: () =>
      institutionApprovedEmail({
        institutionName: SAMPLE_INSTITUTION.name,
        adminFirstName: 'Shahidul',
        adminEmail: 'admin@greenvalley.example',
        adminPassword: 'Tr7#kLm2pQ9x',
        loginUrl: 'https://app.example.com/login',
      }),
  },
  {
    key: 'institution-application.rejected',
    description: 'Sent when a school application is declined.',
    render: () => institutionRejectedEmail({ applicantFirstName: 'Shahidul', institutionName: SAMPLE_INSTITUTION.name, reason: 'Duplicate EIIN already registered' }),
  },
  {
    key: 'hr.staff-invite',
    description: 'Delivers login credentials when a staff member or user account is created.',
    render: () =>
      staffInviteEmail({
        firstName: 'Anika',
        institutionName: SAMPLE_INSTITUTION.name,
        role: 'TEACHER',
        loginEmail: 'anika@greenvalley.example',
        temporaryPassword: 'Xk4#nP8wQz1',
        loginUrl: 'https://app.example.com/login',
        institution: SAMPLE_INSTITUTION,
      }),
  },
  {
    key: 'site-customer.welcome',
    description: 'Welcome email for a new school-website shop/course customer account.',
    render: () => siteCustomerWelcomeEmail({ name: 'Tanvir', institutionName: SAMPLE_INSTITUTION.name, siteUrl: 'https://greenvalley.peoplenit.com', institution: SAMPLE_INSTITUTION }),
  },
  {
    key: 'site-customer.password-reset',
    description: 'Password reset for a school-website shop/course customer account.',
    render: () =>
      siteCustomerPasswordResetEmail({ name: 'Tanvir', institutionName: SAMPLE_INSTITUTION.name, url: 'https://greenvalley.peoplenit.com/account/reset-password?token=SAMPLE', expiresInMinutes: 60, institution: SAMPLE_INSTITUTION }),
  },
  {
    key: 'site-customer.course-enrollment',
    description: 'Sent when a learner gains access to a course (purchase, free enrolment, or admin grant).',
    render: () =>
      siteCourseEnrollmentEmail({ name: 'Priya', institutionName: SAMPLE_INSTITUTION.name, courseName: 'Class 9 Physics — Full Course', learnUrl: 'https://greenvalley.peoplenit.com/learn/class-9-physics', institution: SAMPLE_INSTITUTION }),
  },
  {
    key: 'site-customer.order-confirmed',
    description: 'Order receipt for the school-website shop.',
    render: () =>
      siteOrderConfirmedEmail({ name: 'Tanvir', institutionName: SAMPLE_INSTITUTION.name, orderNo: 'SO-260929-7K3F', total: 'BDT 1,250.00', orderUrl: 'https://greenvalley.peoplenit.com/account/orders/SO-260929-7K3F', institution: SAMPLE_INSTITUTION }),
  },
  {
    key: 'sites.form-submitted-ack',
    description: 'Acknowledges a public website form/enquiry submission to the person who submitted it.',
    render: () => formSubmittedAckEmail({ name: 'Jamal', institutionName: SAMPLE_INSTITUTION.name, formName: 'Admission Enquiry', institution: SAMPLE_INSTITUTION }),
  },
  {
    key: 'notification.SUPPORT_TICKET_CREATED',
    description: 'Support ticket receipt — bundled default copy (tenant-overridable via Settings > Email templates).',
    render: () => renderDefaultNotification('SUPPORT_TICKET_CREATED', { ticketSubject: 'Cannot generate report cards', status: 'OPEN', institutionName: SAMPLE_INSTITUTION.name }),
  },
  {
    key: 'notification.SUPPORT_TICKET_REPLIED',
    description: 'New reply on a support ticket — to the requester + assigned staff, minus the replier.',
    render: () => renderDefaultNotification('SUPPORT_TICKET_REPLIED', { ticketSubject: 'Cannot generate report cards', status: 'IN_PROGRESS', institutionName: SAMPLE_INSTITUTION.name }),
  },
  {
    key: 'notification.SUPPORT_TICKET_STATUS_CHANGED',
    description: 'Support ticket status changed.',
    render: () => renderDefaultNotification('SUPPORT_TICKET_STATUS_CHANGED', { ticketSubject: 'Cannot generate report cards', status: 'RESOLVED', institutionName: SAMPLE_INSTITUTION.name }),
  },
  {
    key: 'notification.RESULTS_PUBLISHED',
    description: 'Exam results published — sent to the student + their guardians (P2 bulk).',
    render: () => renderDefaultNotification('RESULTS_PUBLISHED', { examName: 'Half Yearly Examination', studentName: 'Ayesha Rahman', institutionName: SAMPLE_INSTITUTION.name }),
  },
  {
    key: 'notification.PAYSLIP_ISSUED',
    description: 'Payslip issued to a staff member — subject carries no salary figures.',
    render: () => renderDefaultNotification('PAYSLIP_ISSUED', { payPeriod: '2026-09', payslipNo: 'PS-260930-0042', netAmount: '48,500.00', institutionName: SAMPLE_INSTITUTION.name }),
  },
  {
    key: 'notification.DATA_EXPORT_READY',
    description: 'Tenant data export ready — link + expiry, to the admin who requested it.',
    render: () =>
      renderDefaultNotification('DATA_EXPORT_READY', {
        downloadUrl: 'https://app.example.com/data-export',
        expiresAt: 'Thu Oct 08 2026',
        institutionName: SAMPLE_INSTITUTION.name,
      }),
  },
];

export function findTemplate(key: string): RegisteredTemplate | undefined {
  return EMAIL_TEMPLATE_REGISTRY.find((t) => t.key === key);
}
