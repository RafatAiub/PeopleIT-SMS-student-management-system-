import { PLATFORM_BRAND } from '../brand';
import { buildEmailLayout } from '../layout';
import { button, fallbackLink, paragraph, bnParagraph, infoTable } from '../components';
import type { EmailContent } from './auth.templates';

// =============================================================================
// Institution-application decision emails. Not tenant-overridable (same
// reasoning as auth.templates.ts): this is the one-time delivery of a
// generated admin password, sent before the institution has any admin-editable
// template store of its own.
// =============================================================================

export function institutionApprovedEmail(opts: {
  institutionName: string;
  adminFirstName: string;
  adminEmail: string;
  adminPassword: string;
  loginUrl: string;
}): EmailContent {
  const subject = `${opts.institutionName} is approved — your admin login`;
  const bodyHtml =
    paragraph(`Hi ${opts.adminFirstName}, your institution "${opts.institutionName}" has been approved on ${PLATFORM_BRAND.name}.`) +
    infoTable([
      { label: 'Login email', value: opts.adminEmail },
      { label: 'Temporary password', value: opts.adminPassword },
    ]) +
    paragraph('Sign in and change this password immediately — it is shown to you only this once and is not stored anywhere in plain text.') +
    button(opts.loginUrl, 'Sign in now') +
    fallbackLink(opts.loginUrl) +
    bnParagraph(
      `আপনার প্রতিষ্ঠান "${opts.institutionName}" ${PLATFORM_BRAND.name}-এ অনুমোদিত হয়েছে। উপরের ইমেইল ও অস্থায়ী পাসওয়ার্ড দিয়ে লগইন করুন এবং অবিলম্বে পাসওয়ার্ড পরিবর্তন করুন।`,
    );

  return {
    subject,
    html: buildEmailLayout({
      preheader: `Your ${opts.institutionName} account is ready — sign in and change your password.`,
      heading: 'Application approved',
      bodyHtml,
    }),
    text: [
      `Hi ${opts.adminFirstName},`,
      '',
      `Your institution "${opts.institutionName}" has been approved on ${PLATFORM_BRAND.name}.`,
      '',
      `Login email: ${opts.adminEmail}`,
      `Temporary password: ${opts.adminPassword}`,
      '',
      'Sign in and change this password immediately:',
      opts.loginUrl,
      '',
      `[বাংলা] আপনার প্রতিষ্ঠান "${opts.institutionName}" অনুমোদিত হয়েছে। উপরের তথ্য দিয়ে লগইন করে পাসওয়ার্ড পরিবর্তন করুন।`,
    ].join('\n'),
  };
}

export function institutionRejectedEmail(opts: {
  applicantFirstName: string;
  institutionName: string;
  reason: string;
}): EmailContent {
  const subject = `Update on your ${opts.institutionName} application`;
  const bodyHtml =
    paragraph(`Hi ${opts.applicantFirstName}, we've reviewed your application for "${opts.institutionName}" and are unable to approve it at this time.`) +
    paragraph(`Reason: ${opts.reason}`) +
    paragraph('If you believe this is a mistake or would like to provide more information, please reply to this email.') +
    bnParagraph(`দুঃখিত, "${opts.institutionName}" এর জন্য আপনার আবেদনটি এই মুহূর্তে অনুমোদন করা যায়নি। কারণ: ${opts.reason}`);

  return {
    subject,
    html: buildEmailLayout({ preheader: 'An update on your institution application.', heading: 'Application not approved', bodyHtml }),
    text: [
      `Hi ${opts.applicantFirstName},`,
      '',
      `We've reviewed your application for "${opts.institutionName}" and are unable to approve it at this time.`,
      `Reason: ${opts.reason}`,
      '',
      'If you believe this is a mistake, please reply to this email.',
      '',
      `[বাংলা] দুঃখিত, আপনার আবেদনটি অনুমোদন করা যায়নি। কারণ: ${opts.reason}`,
    ].join('\n'),
  };
}
