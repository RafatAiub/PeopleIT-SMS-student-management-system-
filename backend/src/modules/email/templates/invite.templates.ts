import { buildEmailLayout, type LayoutOptions } from '../layout';
import { button, fallbackLink, paragraph, bnParagraph, infoTable } from '../components';
import type { EmailContent } from './auth.templates';

// =============================================================================
// Staff/user invite — delivered once, at account creation, with a generated
// temporary password. institution is passed through so the layout shows the
// school's own logo/name/colour (owner decision §4.1) rather than the
// platform brand.
// =============================================================================

export function staffInviteEmail(opts: {
  firstName: string;
  institutionName: string;
  role: string;
  loginEmail: string;
  temporaryPassword: string;
  loginUrl: string;
  institution?: LayoutOptions['institution'];
}): EmailContent {
  const subject = `You've been added to ${opts.institutionName}`;
  const bodyHtml =
    paragraph(`Hi ${opts.firstName}, an account has been created for you at ${opts.institutionName} (role: ${opts.role}).`) +
    infoTable([
      { label: 'Login email', value: opts.loginEmail },
      { label: 'Temporary password', value: opts.temporaryPassword },
    ]) +
    paragraph('Please sign in and change this password on your first login — it will not be sent again.') +
    button(opts.loginUrl, 'Sign in') +
    fallbackLink(opts.loginUrl) +
    bnParagraph(`${opts.institutionName}-এ আপনার জন্য একটি অ্যাকাউন্ট তৈরি করা হয়েছে। উপরের ইমেইল ও অস্থায়ী পাসওয়ার্ড দিয়ে লগইন করুন এবং প্রথমবার লগইনের পর পাসওয়ার্ড পরিবর্তন করুন।`);

  return {
    subject,
    html: buildEmailLayout({
      preheader: `Your ${opts.institutionName} account is ready.`,
      heading: 'Welcome aboard',
      bodyHtml,
      institution: opts.institution,
    }),
    text: [
      `Hi ${opts.firstName},`,
      '',
      `An account has been created for you at ${opts.institutionName} (role: ${opts.role}).`,
      '',
      `Login email: ${opts.loginEmail}`,
      `Temporary password: ${opts.temporaryPassword}`,
      '',
      'Sign in and change this password on first login:',
      opts.loginUrl,
    ].join('\n'),
  };
}
