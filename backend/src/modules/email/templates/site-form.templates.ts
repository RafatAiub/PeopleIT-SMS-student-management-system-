import { buildEmailLayout, type LayoutOptions } from '../layout';
import { paragraph, bnParagraph } from '../components';
import type { EmailContent } from './auth.templates';

/** Generic "we got your submission" acknowledgement for public website forms (enquiries and custom forms alike). */
export function formSubmittedAckEmail(opts: {
  name?: string;
  institutionName: string;
  formName: string;
  institution?: LayoutOptions['institution'];
}): EmailContent {
  const subject = `We received your submission — ${opts.institutionName}`;
  const greeting = opts.name ? `Hi ${opts.name}, thank` : 'Thank';
  const bodyHtml =
    paragraph(`${greeting} you for contacting ${opts.institutionName} through "${opts.formName}". We've received your submission and someone will get back to you soon.`) +
    bnParagraph(`${opts.institutionName}-কে যোগাযোগ করার জন্য ধন্যবাদ। আপনার তথ্য পাওয়া গেছে এবং শীঘ্রই আমরা যোগাযোগ করব।`);

  return {
    subject,
    html: buildEmailLayout({ preheader: `Your submission to ${opts.institutionName} was received.`, heading: 'Thanks — we got it', bodyHtml, institution: opts.institution }),
    text: [`${greeting} you for contacting ${opts.institutionName} through "${opts.formName}".`, "We've received your submission and someone will get back to you soon."].join('\n'),
  };
}
