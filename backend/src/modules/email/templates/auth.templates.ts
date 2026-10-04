import { PLATFORM_BRAND, FONT_STACK } from '../brand';
import { escapeHtml } from '../escape';
import { buildEmailLayout } from '../layout';
import { button, fallbackLink, paragraph } from '../components';

// =============================================================================
// Auth email templates
// =============================================================================
// Deliberately NOT in notifications/templates.defaults.ts. Those are
// institution-scoped and admin-editable; these are security mail whose wording
// and links must not be tenant-overridable — an editable password-reset
// template is a phishing vector.
//
// Every message ships both text and HTML: some institution mail servers strip
// HTML, and a verification link that arrives unclickable is a dead signup.
//
// Each template carries full EN and BN copy (not just an inline BN aside like
// the tenant-facing templates) — auth mail is the one place every user, in
// every language, must be able to read unassisted. `lang` selects which one
// renders; the caller (auth.mail.ts) resolves it from the user's institution
// default language, falling back to 'en' when unknown. Never machine
// translated at send time — both copies are written ahead of time.

export type MailLang = 'en' | 'bn';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Big, spaced digits — codes get read off a screen and mistyped otherwise. */
function codeBlockHtml(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td align="center" style="background:#f3f4f6;border-radius:8px;padding:18px;">
      <span style="font-family:${FONT_STACK};font-size:32px;font-weight:700;letter-spacing:.32em;color:#111827;">${escapeHtml(code)}</span>
    </td></tr>
  </table>`;
}

export function verificationEmail(opts: {
  to: string;
  firstName: string;
  url: string;
  expiresInMinutes: number;
  lang?: MailLang;
}): EmailContent {
  const lang = opts.lang ?? 'en';

  if (lang === 'bn') {
    const subject = 'আপনার ইমেইল ঠিকানা নিশ্চিত করুন';
    const bodyHtml =
      paragraph(`${opts.firstName}, আপনার ${PLATFORM_BRAND.name} অ্যাকাউন্ট সম্পূর্ণ করতে ইমেইল ঠিকানাটি নিশ্চিত করুন।`) +
      button(opts.url, 'ইমেইল নিশ্চিত করুন') +
      fallbackLink(opts.url) +
      paragraph(`এই লিংকটি ${opts.expiresInMinutes} মিনিট পর মেয়াদোত্তীর্ণ হবে। আপনি যদি অ্যাকাউন্ট তৈরি না করে থাকেন, তাহলে এই ইমেইলটি উপেক্ষা করতে পারেন।`);
    return {
      subject,
      html: buildEmailLayout({ preheader: `আপনার ${PLATFORM_BRAND.name} অ্যাকাউন্ট চালু করতে ইমেইল নিশ্চিত করুন।`, heading: subject, bodyHtml, lang: 'bn' }),
      text: [
        `${opts.firstName},`,
        '',
        `আপনার ${PLATFORM_BRAND.name} অ্যাকাউন্ট সম্পূর্ণ করতে এই লিংকে গিয়ে ইমেইল নিশ্চিত করুন:`,
        opts.url,
        '',
        `এই লিংকটি ${opts.expiresInMinutes} মিনিট পর মেয়াদোত্তীর্ণ হবে।`,
        'আপনি যদি অ্যাকাউন্ট তৈরি না করে থাকেন, তাহলে এই ইমেইলটি উপেক্ষা করতে পারেন।',
      ].join('\n'),
    };
  }

  const subject = 'Confirm your email address';
  const bodyHtml =
    paragraph(`Hi ${opts.firstName}, confirm your email address to finish setting up your ${PLATFORM_BRAND.name} account.`) +
    button(opts.url, 'Confirm email address') +
    fallbackLink(opts.url) +
    paragraph(`This link expires in ${opts.expiresInMinutes} minutes. If you did not create an account, you can safely ignore this email.`);

  return {
    subject,
    html: buildEmailLayout({ preheader: `Confirm your email to activate your ${PLATFORM_BRAND.name} account.`, heading: subject, bodyHtml }),
    text: [
      `Hi ${opts.firstName},`,
      '',
      `Confirm your email address to finish setting up your ${PLATFORM_BRAND.name} account:`,
      opts.url,
      '',
      `This link expires in ${opts.expiresInMinutes} minutes.`,
      'If you did not create an account, you can ignore this email.',
    ].join('\n'),
  };
}

export function passwordResetEmail(opts: {
  to: string;
  firstName: string;
  url: string;
  expiresInMinutes: number;
  lang?: MailLang;
}): EmailContent {
  const lang = opts.lang ?? 'en';

  if (lang === 'bn') {
    const subject = 'আপনার পাসওয়ার্ড রিসেট করুন';
    const bodyHtml =
      paragraph(`${opts.firstName}, আপনার পাসওয়ার্ড রিসেট করার একটি অনুরোধ পাওয়া গেছে।`) +
      button(opts.url, 'পাসওয়ার্ড রিসেট করুন') +
      fallbackLink(opts.url) +
      paragraph(`এই লিংকটি ${opts.expiresInMinutes} মিনিট পর মেয়াদোত্তীর্ণ হবে এবং শুধুমাত্র একবার ব্যবহার করা যাবে। আপনি যদি এই অনুরোধ না করে থাকেন, তাহলে কিছু করার প্রয়োজন নেই — আপনার পাসওয়ার্ড পরিবর্তন হয়নি।`);
    return {
      subject,
      html: buildEmailLayout({ preheader: 'নতুন পাসওয়ার্ড সেট করতে এই লিংকটি ব্যবহার করুন।', heading: subject, bodyHtml, lang: 'bn' }),
      text: [
        `${opts.firstName},`,
        '',
        `আপনার ${PLATFORM_BRAND.name} পাসওয়ার্ড রিসেট করার একটি অনুরোধ পাওয়া গেছে। নিচের লিংকটি ব্যবহার করুন:`,
        opts.url,
        '',
        `এই লিংকটি ${opts.expiresInMinutes} মিনিট পর মেয়াদোত্তীর্ণ হবে এবং শুধুমাত্র একবার ব্যবহার করা যাবে।`,
        'আপনি যদি এই অনুরোধ না করে থাকেন, তাহলে কিছু করার প্রয়োজন নেই — আপনার পাসওয়ার্ড পরিবর্তন হয়নি।',
      ].join('\n'),
    };
  }

  const subject = 'Reset your password';
  const bodyHtml =
    paragraph(`Hi ${opts.firstName}, we received a request to reset your password.`) +
    button(opts.url, 'Reset password') +
    fallbackLink(opts.url) +
    paragraph(`This link expires in ${opts.expiresInMinutes} minutes and can only be used once. If you did not request this, no action is needed — your password has not changed.`);

  return {
    subject,
    html: buildEmailLayout({ preheader: 'Use this link to choose a new password.', heading: subject, bodyHtml }),
    text: [
      `Hi ${opts.firstName},`,
      '',
      `We received a request to reset your ${PLATFORM_BRAND.name} password. Use the link below:`,
      opts.url,
      '',
      `This link expires in ${opts.expiresInMinutes} minutes and can only be used once.`,
      'If you did not request this, no action is needed — your password has not changed.',
    ].join('\n'),
  };
}

export function twoFactorCodeEmail(opts: {
  to: string;
  firstName: string;
  code: string;
  expiresInMinutes: number;
  lang?: MailLang;
}): EmailContent {
  const lang = opts.lang ?? 'en';

  if (lang === 'bn') {
    const subject = `${opts.code} — আপনার সাইন-ইন কোড`;
    const bodyHtml =
      paragraph(`${opts.firstName}, সাইন-ইন সম্পূর্ণ করতে এই কোডটি লিখুন।`) +
      codeBlockHtml(opts.code) +
      paragraph(`এটি ${opts.expiresInMinutes} মিনিট পর মেয়াদোত্তীর্ণ হবে। আপনি যদি সাইন-ইন করার চেষ্টা না করে থাকেন, তাহলে অবিলম্বে আপনার পাসওয়ার্ড পরিবর্তন করুন — অন্য কেউ এটি জেনে থাকতে পারে।`);
    return {
      subject,
      html: buildEmailLayout({ preheader: 'আপনার এককালীন সাইন-ইন কোড।', heading: 'আপনার সাইন-ইন কোড', bodyHtml, lang: 'bn' }),
      text: [
        `${opts.firstName},`,
        '',
        `আপনার ${PLATFORM_BRAND.name} সাইন-ইন কোড: ${opts.code}`,
        '',
        `এটি ${opts.expiresInMinutes} মিনিট পর মেয়াদোত্তীর্ণ হবে।`,
        'আপনি যদি সাইন-ইন করার চেষ্টা না করে থাকেন, তাহলে অবিলম্বে আপনার পাসওয়ার্ড পরিবর্তন করুন — অন্য কেউ এটি জেনে থাকতে পারে।',
      ].join('\n'),
    };
  }

  const subject = `${opts.code} is your sign-in code`;
  const bodyHtml =
    paragraph(`Hi ${opts.firstName}, enter this code to finish signing in.`) +
    codeBlockHtml(opts.code) +
    paragraph(`It expires in ${opts.expiresInMinutes} minutes. If you did not try to sign in, change your password immediately — someone else may know it.`);

  return {
    subject,
    html: buildEmailLayout({ preheader: 'Your one-time sign-in code.', heading: 'Your sign-in code', bodyHtml }),
    text: [
      `Hi ${opts.firstName},`,
      '',
      `Your ${PLATFORM_BRAND.name} sign-in code is: ${opts.code}`,
      '',
      `It expires in ${opts.expiresInMinutes} minutes.`,
      'If you did not try to sign in, change your password immediately — someone else may know it.',
    ].join('\n'),
  };
}

export function accountApprovedEmail(opts: {
  to: string;
  firstName: string;
  institutionName: string;
  loginUrl: string;
  lang?: MailLang;
}): EmailContent {
  const lang = opts.lang ?? 'en';

  if (lang === 'bn') {
    const subject = 'আপনার অ্যাকাউন্ট অনুমোদিত হয়েছে';
    const bodyHtml =
      paragraph(`${opts.firstName}, ${opts.institutionName}-এ আপনার অ্যাকাউন্ট অনুমোদিত হয়েছে। আপনি এখন সাইন ইন করতে পারবেন।`) +
      button(opts.loginUrl, 'সাইন ইন করুন');
    return {
      subject,
      html: buildEmailLayout({ preheader: `আপনার ${opts.institutionName} অ্যাকাউন্ট প্রস্তুত।`, heading: subject, bodyHtml, lang: 'bn' }),
      text: [
        `${opts.firstName},`,
        '',
        `${opts.institutionName}-এ আপনার অ্যাকাউন্ট অনুমোদিত হয়েছে। এখন সাইন ইন করুন:`,
        opts.loginUrl,
      ].join('\n'),
    };
  }

  const subject = 'Your account has been approved';
  const bodyHtml =
    paragraph(`Hi ${opts.firstName}, your account at ${opts.institutionName} has been approved. You can sign in now.`) +
    button(opts.loginUrl, 'Sign in');

  return {
    subject,
    html: buildEmailLayout({ preheader: `Your ${opts.institutionName} account is ready.`, heading: subject, bodyHtml }),
    text: [
      `Hi ${opts.firstName},`,
      '',
      `Your account at ${opts.institutionName} has been approved. You can now sign in:`,
      opts.loginUrl,
    ].join('\n'),
  };
}
