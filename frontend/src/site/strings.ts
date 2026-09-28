/**
 * UI strings used by the public site chrome and the blocks. The site's
 * language follows the site's own toggle (not the dashboard's), so these
 * live here rather than in the dashboard dictionary.
 */
import type { SiteLang } from './types';

const BN: Record<string, string> = {
  'Home': 'হোম',
  'Menu': 'মেনু',
  'Close menu': 'মেনু বন্ধ করুন',
  'Open menu': 'মেনু খুলুন',
  'Language': 'ভাষা',
  'Skip to content': 'মূল বিষয়বস্তুতে যান',
  'Preview — not published': 'প্রিভিউ — এখনো প্রকাশিত হয়নি',
  'You are viewing a draft. Visitors can’t see these changes yet.': 'আপনি খসড়া দেখছেন। দর্শকরা এখনো এই পরিবর্তন দেখতে পাবেন না।',
  'Page not found': 'পৃষ্ঠাটি পাওয়া যায়নি',
  'The page you’re looking for doesn’t exist or hasn’t been published yet.': 'আপনি যে পৃষ্ঠাটি খুঁজছেন তা নেই অথবা এখনো প্রকাশিত হয়নি।',
  'Go to the home page': 'হোম পেজে যান',
  'This website isn’t available': 'এই ওয়েবসাইটটি পাওয়া যাচ্ছে না',
  'It may not be published yet, or the address is wrong.': 'এটি হয়তো এখনো প্রকাশিত হয়নি, অথবা ঠিকানাটি ভুল।',
  'Something went wrong': 'কিছু একটা সমস্যা হয়েছে',
  'Try again': 'আবার চেষ্টা করুন',
  'Loading…': 'লোড হচ্ছে…',
  'News & updates': 'খবর ও আপডেট',
  'Read more': 'আরও পড়ুন',
  'Back to news': 'খবরে ফিরে যান',
  'No posts yet': 'এখনো কোনো পোস্ট নেই',
  'News and updates will appear here once they’re published.': 'প্রকাশিত হলে খবর ও আপডেট এখানে দেখা যাবে।',
  'Previous': 'আগের',
  'Next': 'পরের',
  'Page {page} of {pages}': 'পৃষ্ঠা {page} / {pages}',
  'All rights reserved.': 'সর্বস্বত্ব সংরক্ষিত।',
  'Quick links': 'দ্রুত লিংক',
  'Contact': 'যোগাযোগ',
  'Follow us': 'আমাদের অনুসরণ করুন',
  'Phone': 'ফোন',
  'Email': 'ইমেইল',
  'Address': 'ঠিকানা',
  'Notices': 'নোটিশ',
  'No notices right now': 'এই মুহূর্তে কোনো নোটিশ নেই',
  'Published notices for everyone will appear here.': 'সবার জন্য প্রকাশিত নোটিশ এখানে দেখা যাবে।',
  'Download attachment': 'সংযুক্তি ডাউনলোড করুন',
  'Events & holidays': 'অনুষ্ঠান ও ছুটি',
  'No events this month': 'এই মাসে কোনো অনুষ্ঠান নেই',
  'Holiday': 'ছুটি',
  'Event': 'অনুষ্ঠান',
  'Previous month': 'আগের মাস',
  'Next month': 'পরের মাস',
  'Our teachers': 'আমাদের শিক্ষকবৃন্দ',
  'No teacher profiles yet': 'এখনো কোনো শিক্ষকের প্রোফাইল নেই',
  'Teacher profiles will appear here once they are added.': 'শিক্ষকের প্রোফাইল যোগ করা হলে এখানে দেখা যাবে।',
  'Merit list': 'মেধা তালিকা',
  'The merit list isn’t published yet': 'মেধা তালিকা এখনো প্রকাশিত হয়নি',
  'Top results appear here after the school publishes them.': 'প্রতিষ্ঠান প্রকাশ করার পর শীর্ষ ফলাফল এখানে দেখা যাবে।',
  'GPA': 'জিপিএ',
  'Class': 'শ্রেণি',
  'Section': 'শাখা',
  'Result lookup': 'ফলাফল অনুসন্ধান',
  'Roll or student ID': 'রোল বা শিক্ষার্থী আইডি',
  'Date of birth': 'জন্ম তারিখ',
  'Exam': 'পরীক্ষা',
  'Exam ID': 'পরীক্ষার আইডি',
  'Latest published exam': 'সর্বশেষ প্রকাশিত পরীক্ষা',
  'Find result': 'ফলাফল খুঁজুন',
  'Searching…': 'খোঁজা হচ্ছে…',
  'No result found for these details.': 'এই তথ্যে কোনো ফলাফল পাওয়া যায়নি।',
  'Online results aren’t available': 'অনলাইন ফলাফল পাওয়া যাচ্ছে না',
  'The school hasn’t turned on public result lookup.': 'প্রতিষ্ঠানটি এখনো অনলাইন ফলাফল চালু করেনি।',
  'Subject': 'বিষয়',
  'Marks': 'নম্বর',
  'Grade': 'গ্রেড',
  'Grade point': 'গ্রেড পয়েন্ট',
  'Total': 'মোট',
  'Print': 'প্রিন্ট',
  'Too many attempts. Please wait a minute and try again.': 'অনেকবার চেষ্টা করা হয়েছে। এক মিনিট পর আবার চেষ্টা করুন।',
  'Class routine': 'ক্লাস রুটিন',
  'No routine published': 'কোনো রুটিন প্রকাশিত হয়নি',
  'The class routine will appear here once it is set up.': 'রুটিন তৈরি হলে এখানে দেখা যাবে।',
  'Day': 'দিন',
  'Student ID': 'শিক্ষার্থী আইডি',
  'Roll number': 'রোল নম্বর',
  'More than one student matches. Enter the student ID instead.': 'একাধিক শিক্ষার্থী মিলে গেছে। রোলের বদলে শিক্ষার্থী আইডি দিন।',
  'Choose a form for this block (Website › Forms).': 'এই ব্লকের জন্য একটি ফর্ম বেছে নিন (ওয়েবসাইট › ফর্ম)।',
  'Please contact the school office.': 'প্রতিষ্ঠানের অফিসে যোগাযোগ করুন।',
  'Enter a number': 'একটি সংখ্যা দিন',
  'Choose one of the options': 'একটি অপশন বেছে নিন',
  'Online payment is in test mode.': 'অনলাইন পেমেন্ট পরীক্ষামূলক মোডে আছে।',
  'Time': 'সময়',
  'Teacher': 'শিক্ষক',
  'Students': 'শিক্ষার্থী',
  'Teachers': 'শিক্ষক',
  'Classes': 'শ্রেণি',
  'Years of excellence': 'বছরের পথচলা',
  'Figures will appear once the school’s records are set up.': 'প্রতিষ্ঠানের তথ্য যুক্ত হলে সংখ্যাগুলো দেখা যাবে।',
  'Admission enquiry': 'ভর্তি সংক্রান্ত জিজ্ঞাসা',
  'Student’s name': 'শিক্ষার্থীর নাম',
  'Guardian’s name': 'অভিভাবকের নাম',
  'Mobile number': 'মোবাইল নম্বর',
  'Class interested in': 'কোন শ্রেণিতে ভর্তি',
  'Message': 'বার্তা',
  'Send enquiry': 'জিজ্ঞাসা পাঠান',
  'Sending…': 'পাঠানো হচ্ছে…',
  'Thank you! We’ve received your enquiry and will contact you soon.': 'ধন্যবাদ! আপনার জিজ্ঞাসা পেয়েছি, শীঘ্রই যোগাযোগ করা হবে।',
  'Couldn’t send. Please check the form and try again.': 'পাঠানো যায়নি। ফর্মটি দেখে আবার চেষ্টা করুন।',
  'This field is required': 'এই ঘরটি পূরণ করা আবশ্যক',
  'Enter a valid email': 'সঠিক ইমেইল দিন',
  'Enter a valid mobile number': 'সঠিক মোবাইল নম্বর দিন',
  'We only use these details to reply to your enquiry.': 'আপনার জিজ্ঞাসার উত্তর দিতেই শুধু এই তথ্য ব্যবহার করা হবে।',
  'Pay fees online': 'অনলাইনে ফি পরিশোধ',
  'Online payment isn’t available yet': 'অনলাইন পেমেন্ট এখনো চালু হয়নি',
  'Please contact the school office to pay fees.': 'ফি পরিশোধে প্রতিষ্ঠানের অফিসে যোগাযোগ করুন।',
  'Go to the guardian portal': 'অভিভাবক পোর্টালে যান',
  'Courses': 'কোর্স',
  'Coming soon': 'শীঘ্রই আসছে',
  'Online courses will be available here soon.': 'অনলাইন কোর্স শীঘ্রই এখানে পাওয়া যাবে।',
  'Ask us anything': 'যেকোনো প্রশ্ন করুন',
  'Type your question…': 'আপনার প্রশ্ন লিখুন…',
  'Send': 'পাঠান',
  'Answers are AI-generated from the school’s information and may be incomplete. Please confirm with the office.': 'উত্তরগুলো প্রতিষ্ঠানের তথ্য থেকে এআই তৈরি করে, অসম্পূর্ণ হতে পারে। অফিসে নিশ্চিত হয়ে নিন।',
  'Demo mode': 'ডেমো মোড',
  'The assistant is in demo mode until an AI key is configured.': 'এআই কী সেট না করা পর্যন্ত সহকারী ডেমো মোডে আছে।',
  'Chat is live on the published site.': 'চ্যাট প্রকাশিত সাইটে চালু থাকবে।',
  'Open chat': 'চ্যাট খুলুন',
  'Close chat': 'চ্যাট বন্ধ করুন',
  'Live data appears once the site is connected.': 'সাইট সংযুক্ত হলে লাইভ তথ্য দেখা যাবে।',
  'Couldn’t load this section.': 'এই অংশটি লোড করা যায়নি।',
  'Add content in the editor': 'এডিটরে কনটেন্ট যোগ করুন',
  'Map location not set': 'ম্যাপের অবস্থান দেওয়া হয়নি',
  'Add a video link in the editor': 'এডিটরে ভিডিও লিংক দিন',
  'This embed was blocked because it isn’t from an allowed site.': 'অনুমোদিত সাইট থেকে না হওয়ায় এই এমবেডটি আটকানো হয়েছে।',
  'Question': 'প্রশ্ন',
  'View all': 'সব দেখুন',
  'Today': 'আজ',
  'Sun': 'রবি', 'Mon': 'সোম', 'Tue': 'মঙ্গল', 'Wed': 'বুধ', 'Thu': 'বৃহঃ', 'Fri': 'শুক্র', 'Sat': 'শনি',
};

export function siteString(lang: SiteLang, key: string, vars?: Record<string, string | number>): string {
  let s = lang === 'bn' ? BN[key] ?? key : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const SITE_LOCALE: Record<SiteLang, string> = { en: 'en-GB', bn: 'bn-BD' };

export function formatSiteDate(value: string | Date | undefined, lang: SiteLang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(SITE_LOCALE[lang], { timeZone: 'Asia/Dhaka', ...opts }).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatSiteNumber(n: number, lang: SiteLang): string {
  try {
    return new Intl.NumberFormat(SITE_LOCALE[lang]).format(n);
  } catch {
    return String(n);
  }
}
