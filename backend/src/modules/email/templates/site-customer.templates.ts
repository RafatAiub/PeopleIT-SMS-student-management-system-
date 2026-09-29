import { buildEmailLayout, type LayoutOptions } from '../layout';
import { button, fallbackLink, paragraph, bnParagraph } from '../components';
import type { EmailContent } from './auth.templates';

// =============================================================================
// School-site shop/course customer (learner/buyer) emails — sent "on behalf
// of" the school, so `institution` branding is always passed by the caller.
// =============================================================================

export function siteCustomerWelcomeEmail(opts: {
  name: string;
  institutionName: string;
  siteUrl: string;
  institution?: LayoutOptions['institution'];
}): EmailContent {
  const subject = `Welcome to ${opts.institutionName}`;
  const bodyHtml =
    paragraph(`Hi ${opts.name}, your account on the ${opts.institutionName} website is ready.`) +
    button(opts.siteUrl, 'Visit the site') +
    fallbackLink(opts.siteUrl) +
    bnParagraph(`${opts.institutionName}-এর ওয়েবসাইটে আপনার অ্যাকাউন্ট প্রস্তুত। উপরের বাটনে ক্লিক করে সাইট দেখুন।`);

  return {
    subject,
    html: buildEmailLayout({ preheader: `Your ${opts.institutionName} account is ready.`, heading: 'Welcome', bodyHtml, institution: opts.institution }),
    text: [`Hi ${opts.name},`, '', `Your account on the ${opts.institutionName} website is ready:`, opts.siteUrl].join('\n'),
  };
}

export function siteCustomerPasswordResetEmail(opts: {
  name: string;
  institutionName: string;
  url: string;
  expiresInMinutes: number;
  institution?: LayoutOptions['institution'];
}): EmailContent {
  const subject = 'Reset your password';
  const bodyHtml =
    paragraph(`Hi ${opts.name}, we received a request to reset your ${opts.institutionName} account password.`) +
    button(opts.url, 'Reset password') +
    fallbackLink(opts.url) +
    paragraph(`This link expires in ${opts.expiresInMinutes} minutes and can only be used once. If you did not request this, no action is needed.`) +
    bnParagraph('আপনার পাসওয়ার্ড রিসেট করার একটি অনুরোধ পাওয়া গেছে। উপরের লিংকে ক্লিক করে নতুন পাসওয়ার্ড সেট করুন। আপনি যদি এই অনুরোধ না করে থাকেন, তাহলে কিছু করার প্রয়োজন নেই।');

  return {
    subject,
    html: buildEmailLayout({ preheader: 'Use this link to choose a new password.', heading: subject, bodyHtml, institution: opts.institution }),
    text: [
      `Hi ${opts.name},`,
      '',
      `We received a request to reset your ${opts.institutionName} account password:`,
      opts.url,
      '',
      `This link expires in ${opts.expiresInMinutes} minutes and can only be used once.`,
      'If you did not request this, no action is needed.',
    ].join('\n'),
  };
}

export function siteCourseEnrollmentEmail(opts: {
  name: string;
  institutionName: string;
  courseName: string;
  learnUrl: string;
  institution?: LayoutOptions['institution'];
}): EmailContent {
  const subject = `You're enrolled: ${opts.courseName}`;
  const bodyHtml =
    paragraph(`Hi ${opts.name}, you now have access to "${opts.courseName}" on ${opts.institutionName}.`) +
    button(opts.learnUrl, 'Start learning') +
    fallbackLink(opts.learnUrl) +
    bnParagraph(`আপনি এখন "${opts.courseName}" কোর্সে প্রবেশাধিকার পেয়েছেন। উপরের বাটনে ক্লিক করে শেখা শুরু করুন।`);

  return {
    subject,
    html: buildEmailLayout({ preheader: `Access granted: ${opts.courseName}`, heading: 'Course access granted', bodyHtml, institution: opts.institution }),
    text: [`Hi ${opts.name},`, '', `You now have access to "${opts.courseName}" on ${opts.institutionName}:`, opts.learnUrl].join('\n'),
  };
}

export function siteOrderConfirmedEmail(opts: {
  name: string;
  institutionName: string;
  orderNo: string;
  total: string;
  orderUrl: string;
  institution?: LayoutOptions['institution'];
}): EmailContent {
  const subject = `Order confirmed — ${opts.orderNo}`;
  const bodyHtml =
    paragraph(`Hi ${opts.name}, thanks for your order from ${opts.institutionName}. Order ${opts.orderNo} (${opts.total}) is confirmed.`) +
    button(opts.orderUrl, 'View order') +
    fallbackLink(opts.orderUrl) +
    bnParagraph(`আপনার অর্ডার ${opts.orderNo} (${opts.total}) নিশ্চিত করা হয়েছে। ধন্যবাদ।`);

  return {
    subject,
    html: buildEmailLayout({ preheader: `Order ${opts.orderNo} confirmed`, heading: 'Order confirmed', bodyHtml, institution: opts.institution }),
    text: [`Hi ${opts.name},`, '', `Thanks for your order from ${opts.institutionName}. Order ${opts.orderNo} (${opts.total}) is confirmed:`, opts.orderUrl].join('\n'),
  };
}
