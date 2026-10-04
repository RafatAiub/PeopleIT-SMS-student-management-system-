import { useCallback } from 'react';
import { useLocaleStore, useT } from '@/i18n';

/**
 * Bangla for the Modules tab. Kept next to the feature (not in i18n/bn.ts) so
 * this track doesn't collide with other edits to the shared dictionary; falls
 * back to the shared dictionary, then English — same rules as `useT`.
 */
const BN: Record<string, string> = {
  'Modules': 'মডিউল',
  'Custom modules': 'কাস্টম মডিউল',
  'Reusable blocks your school builds with code (Liquid HTML, CSS and optional JavaScript). Publish one and editors can drag it from “My modules” in the page editor and just fill in a form.':
    'আপনার স্কুলের নিজের কোডে বানানো পুনর্ব্যবহারযোগ্য ব্লক (Liquid HTML, CSS ও ঐচ্ছিক জাভাস্ক্রিপ্ট)। প্রকাশ করলে পেজ এডিটরের “আমার মডিউল” থেকে টেনে এনে শুধু ফর্ম পূরণ করলেই চলবে।',
  'New module': 'নতুন মডিউল',
  'Import': 'ইমপোর্ট',
  'Import a module (.json)': 'মডিউল ইমপোর্ট (.json)',
  'Starter library': 'স্টার্টার লাইব্রেরি',
  'Install a ready-made module with one click, then edit and publish it.': 'এক ক্লিকে তৈরি মডিউল যোগ করুন, তারপর সম্পাদনা করে প্রকাশ করুন।',
  'Install': 'যোগ করুন',
  'Installed': 'যোগ করা হয়েছে',
  'Install again': 'আবার যোগ করুন',
  'Search modules': 'মডিউল খুঁজুন',
  'All categories': 'সব ক্যাটাগরি',
  'All statuses': 'সব অবস্থা',
  'Draft': 'খসড়া',
  'Published': 'প্রকাশিত',
  'Unpublished changes': 'অপ্রকাশিত পরিবর্তন',
  'No modules yet': 'এখনো কোনো মডিউল নেই',
  'Create one, import a file, or install a starter below.': 'একটি তৈরি করুন, ফাইল ইমপোর্ট করুন, অথবা নিচের স্টার্টার থেকে যোগ করুন।',
  'Used {n} times': '{n} বার ব্যবহৃত',
  'Not used on any page': 'কোনো পেজে ব্যবহৃত নয়',
  'Edit': 'সম্পাদনা',
  'Back to modules': 'মডিউল তালিকায় ফিরুন',
  'Fields': 'ফিল্ড',
  'HTML (Liquid)': 'HTML (Liquid)',
  'Settings': 'সেটিংস',
  'Preview': 'প্রিভিউ',
  'Live preview': 'লাইভ প্রিভিউ',
  'Sample values': 'নমুনা মান',
  'Preview language': 'প্রিভিউর ভাষা',
  'Save draft': 'খসড়া সংরক্ষণ',
  'Publish': 'প্রকাশ করুন',
  'Versions': 'সংস্করণ',
  'Export': 'এক্সপোর্ট',
  'Delete': 'মুছুন',
  'Name': 'নাম',
  'Name (Bangla)': 'নাম (বাংলা)',
  'Key': 'কী',
  'Category': 'ক্যাটাগরি',
  'Description': 'বিবরণ',
  'Icon': 'আইকন',
  'Add field': 'ফিল্ড যোগ করুন',
  'Edit as JSON': 'JSON হিসেবে সম্পাদনা',
  'Visual editor': 'ভিজ্যুয়াল এডিটর',
  'Type': 'ধরন',
  'Label': 'লেবেল',
  'Label (Bangla)': 'লেবেল (বাংলা)',
  'Default': 'ডিফল্ট',
  'Bangla twin': 'বাংলা সংস্করণ',
  'Options (one per line)': 'অপশন (প্রতি লাইনে একটি)',
  'Collection': 'কালেকশন',
  'How many': 'কতগুলো',
  'Sort': 'সাজানো',
  'Item fields': 'আইটেমের ফিল্ড',
  'Remove': 'সরান',
  'Move up': 'উপরে',
  'Move down': 'নিচে',
  'Problems': 'সমস্যা',
  'No problems found.': 'কোনো সমস্যা পাওয়া যায়নি।',
  'Line {line}': 'লাইন {line}',
  'Checking…': 'যাচাই হচ্ছে…',
  'Saved.': 'সংরক্ষিত হয়েছে।',
  'Module published. Pages using it now show this version.': 'মডিউল প্রকাশিত হয়েছে। যেসব পেজে এটি আছে সেগুলোতে এখন এই সংস্করণ দেখাবে।',
  'Fix the problems before publishing.': 'প্রকাশের আগে সমস্যাগুলো ঠিক করুন।',
  'Restore': 'ফিরিয়ে আনুন',
  'Restore this version into the draft? Publish afterwards to make it live.': 'এই সংস্করণটি খসড়ায় ফিরিয়ে আনবেন? লাইভ করতে পরে প্রকাশ করুন।',
  'No versions yet. Publishing creates one.': 'এখনো কোনো সংস্করণ নেই। প্রকাশ করলে একটি তৈরি হবে।',
  'Live': 'লাইভ',
  'Delete this module?': 'এই মডিউলটি মুছবেন?',
  'It is used {n} times on: {pages}. Those blocks will show nothing on the live site.': 'এটি {n} বার ব্যবহৃত হয়েছে: {pages}। লাইভ সাইটে ওই ব্লকগুলো আর কিছু দেখাবে না।',
  'It is not used on any page.': 'এটি কোনো পেজে ব্যবহৃত হয়নি।',
  'Delete anyway': 'তবুও মুছুন',
  'Cancel': 'বাতিল',
  'Module imported as “{key}”.': 'মডিউলটি “{key}” নামে ইমপোর্ট হয়েছে।',
  'That file is not a module export.': 'ফাইলটি মডিউল এক্সপোর্ট নয়।',
  'You have unsaved changes. Leave without saving?': 'অসংরক্ষিত পরিবর্তন আছে। সংরক্ষণ না করে চলে যাবেন?',
  'Only admins (and website developers) can edit module code; editors only fill in the form on pages.':
    'শুধু অ্যাডমিন (ও ওয়েবসাইট ডেভেলপার) মডিউলের কোড সম্পাদনা করতে পারেন; এডিটররা পেজে শুধু ফর্ম পূরণ করেন।',
  'Preview uses real school data from your site.': 'প্রিভিউতে আপনার সাইটের আসল তথ্য ব্যবহার হয়।',
  'This module has JavaScript, so it runs in a safe sandbox frame.': 'এই মডিউলে জাভাস্ক্রিপ্ট আছে, তাই এটি নিরাপদ স্যান্ডবক্স ফ্রেমে চলে।',
  'Template reference': 'টেমপ্লেট রেফারেন্স',
  'Module created.': 'মডিউল তৈরি হয়েছে।',
  'Version restored to the draft.': 'সংস্করণটি খসড়ায় ফিরিয়ে আনা হয়েছে।',
  'Warnings': 'সতর্কতা',
  'This field has no settings.': 'এই ফিল্ডের কোনো সেটিং নেই।',
  'Invalid JSON': 'ভুল JSON',
};

export function useMT() {
  const t = useT();
  const lang = useLocaleStore((s) => s.lang);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const s = lang === 'bn' && BN[key] ? BN[key] : null;
      if (!s) return t(key, vars);
      return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
    },
    [t, lang],
  );
}
