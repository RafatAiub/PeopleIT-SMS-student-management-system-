// =============================================================================
// "What's new" entries — written from the real git history
// (`git log --oneline`) and docs/redesign/CHANGELOG.md. Newest first.
// Keep entries user-facing: what changed for a school, not how it was built.
// `commits` lists the short hashes each entry summarises (for maintainers).
// =============================================================================

export type ChangeTag = 'new' | 'improved' | 'fixed' | 'security';

export interface ChangelogItem {
  tag: ChangeTag;
  text: string;
}

export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  summary: string;
  items: ChangelogItem[];
  commits: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-09-28-saas-b',
    date: '2026-09-28',
    title: 'Integrations, support and offline attendance',
    summary: 'Connect other systems, talk to the PeopleNIT team from inside the app, export all your data, and keep marking attendance without internet.',
    items: [
      { tag: 'new', text: 'Read-only API keys (students, attendance summary, invoices) for accounting, BI or parent apps.' },
      { tag: 'new', text: 'Signed webhooks for new admissions and fee payments, with a delivery log, retries and a "Send test" button.' },
      { tag: 'new', text: 'Support tickets: anyone can ask for help and follow the conversation; admins see all of the school\'s tickets.' },
      { tag: 'new', text: 'Data export: one ZIP with students, guardians, staff, attendance, results, invoices and payments (kept 7 days).' },
      { tag: 'new', text: 'Usage & costs page showing SMS, email and AI usage per month with estimated costs.' },
      { tag: 'new', text: 'Help centre with guides for admission, attendance, marks, fees, payments and notices.' },
      { tag: 'new', text: 'Offline attendance: registers saved without a connection are kept on the device and synced when you are back online.' },
    ],
    commits: [],
  },
  {
    id: '2026-09-28-bangla',
    date: '2026-09-28',
    title: 'Bangla for all new pages',
    summary: 'Every page added in this release can be used in Bangla.',
    items: [{ tag: 'improved', text: '1,821 new Bangla translations for the new fee, communication, academic, AI, analytics and SaaS pages.' }],
    commits: ['cd2739f'],
  },
  {
    id: '2026-09-27-saas',
    date: '2026-09-27',
    title: 'Plans, branches, devices and setup checklist',
    summary: 'Institution-wide settings and tools for running more than one campus.',
    items: [
      { tag: 'new', text: 'Plan features and limits are shown in the app, with upgrade prompts where a feature is not in your plan.' },
      { tag: 'new', text: 'Institution timezone, date format, numerals, currency and default language.' },
      { tag: 'new', text: 'Branch management and a branch switcher for admins.' },
      { tag: 'new', text: 'See and sign out the devices signed in to your account.' },
      { tag: 'new', text: 'Setup wizard and onboarding checklist for new schools.' },
    ],
    commits: ['91219ae'],
  },
  {
    id: '2026-09-27-analytics',
    date: '2026-09-27',
    title: 'Analytics and scheduled reports',
    summary: 'Finance, attendance and academic analytics, filtered to what your role may see.',
    items: [
      { tag: 'new', text: 'Shared filters, saved views and CSV export on every analytics tab.' },
      { tag: 'new', text: 'Email a saved view on a schedule (daily, weekly or monthly).' },
    ],
    commits: ['0ecb266'],
  },
  {
    id: '2026-09-27-facilities',
    date: '2026-09-27',
    title: 'Inventory, library fines and transport stops',
    summary: 'Track school assets and stock, charge library fines automatically, and bill transport monthly.',
    items: [
      { tag: 'new', text: 'Asset register with allocation and maintenance history; consumable stock and purchase records.' },
      { tag: 'new', text: 'Library fine rules and a daily overdue check.' },
      { tag: 'new', text: 'Transport route stops, vehicle last-known location and monthly transport invoicing.' },
    ],
    commits: ['ad58a69'],
  },
  {
    id: '2026-09-27-attendance-hr',
    date: '2026-09-27',
    title: 'Staff and subject attendance, QR check-in, payroll',
    summary: 'More ways to take attendance, and payroll with allowances and deductions.',
    items: [
      { tag: 'new', text: 'Staff attendance, subject-wise attendance and a signed QR check-in kiosk.' },
      { tag: 'new', text: 'Salary components (allowances, deductions), batch payroll and a payroll report.' },
      { tag: 'improved', text: 'Teachers can only mark attendance for their own sections; monthly attendance summary; absence alerts are no longer sent twice.' },
    ],
    commits: ['98b1694'],
  },
  {
    id: '2026-09-27-ai',
    date: '2026-09-27',
    title: 'AI you can review before it is sent',
    summary: 'All AI text meant for guardians or students waits in a review queue for staff approval.',
    items: [
      { tag: 'new', text: 'AI review queue, school knowledge base, guardian and admission assistants.' },
      { tag: 'new', text: 'Attendance and fee risk, teacher workload and enrolment forecast.' },
      { tag: 'improved', text: 'If the main AI provider is unavailable the app falls back to a second provider, then to clearly labelled demo text.' },
    ],
    commits: ['f89aa7e'],
  },
  {
    id: '2026-09-27-academics',
    date: '2026-09-27',
    title: 'Grading scales, promotion and transcripts',
    summary: 'Set your own grading, promote a whole class at once, and print transcripts.',
    items: [
      { tag: 'new', text: 'Configurable grading scales.' },
      { tag: 'new', text: 'Bulk promotion with undo, merit list and class performance.' },
      { tag: 'new', text: 'Transcript and progress report; exam timetable with clash detection.' },
    ],
    commits: ['1b5c575'],
  },
  {
    id: '2026-09-27-communication',
    date: '2026-09-27',
    title: 'Campaigns, admissions CRM and targeted notices',
    summary: 'Reach the right people and follow up every admission enquiry.',
    items: [
      { tag: 'new', text: 'SMS, email and in-app campaigns; message groups.' },
      { tag: 'new', text: 'Admission enquiry pipeline with a public enquiry form and status page.' },
      { tag: 'new', text: 'Custom fields on the student profile.' },
      { tag: 'improved', text: 'Notices can target a class or section and be scheduled.' },
    ],
    commits: ['c0d4b8d'],
  },
  {
    id: '2026-09-27-fees',
    date: '2026-09-27',
    title: 'Online fee payments and receipts',
    summary: 'Guardians can pay with bKash, Nagad or card; every payment gets a receipt number.',
    items: [
      { tag: 'new', text: 'Online payments through SSLCommerz, bKash and Nagad (clearly labelled demo checkout until keys are set).' },
      { tag: 'new', text: 'Printable receipts, fee concessions and bulk invoicing by class.' },
      { tag: 'new', text: 'Daily overdue marking and payment reconciliation.' },
    ],
    commits: ['dfebf5e'],
  },
  {
    id: '2026-09-27-redesign',
    date: '2026-09-27',
    title: 'Every screen redesigned',
    summary: 'A consistent, mobile-friendly look across the whole app.',
    items: [
      { tag: 'improved', text: 'Academics, admission, attendance, fees, marks entry, timetable, HR, reports, leave, library, transport, ID cards, settings, billing, notices, messages and the super admin console were rebuilt on the new design system.' },
      { tag: 'improved', text: 'Tables turn into cards on phones and can export CSV, Excel or print.' },
    ],
    commits: ['3fbba52', '4cf53ab', 'b490c4e', '6e77f14', 'bf1327a', '9fde4e3', '8babede', 'b89ca61', 'b8aa88e'],
  },
  {
    id: '2026-09-26-wave-a',
    date: '2026-09-26',
    title: 'Security fixes, dashboards and the student profile',
    summary: 'Role dashboards, a full student profile, and several security fixes.',
    items: [
      { tag: 'security', text: 'Tenant admins can no longer create platform super admins; payment gateway checks and audit-log redaction tightened; links validated.' },
      { tag: 'new', text: 'Dashboards for each role and a full student profile page.' },
      { tag: 'fixed', text: 'Removed placeholder trend figures that were not based on real data.' },
    ],
    commits: ['635ffdd'],
  },
  {
    id: '2026-09-26-design-system',
    date: '2026-09-26',
    title: 'New look, dark mode and Bangla',
    summary: 'Brand colours, a component library, light/dark themes and an English/Bangla switch.',
    items: [
      { tag: 'new', text: 'English/Bangla language toggle, with Bangla numerals as an option.' },
      { tag: 'new', text: 'Command palette (Ctrl/⌘ K) and keyboard shortcuts.' },
      { tag: 'improved', text: 'Faster first load: the main bundle shrank from 754 KB to 262 KB.' },
    ],
    commits: ['6bb3189'],
  },
  {
    id: '2026-09-24-leave-auth',
    date: '2026-09-24',
    title: 'Leave management and safer sign-in',
    summary: 'Staff and student leave requests, and sign-in with phone or email plus two-step verification.',
    items: [
      { tag: 'new', text: 'Staff and student leave requests with approval, settings and reports.' },
      { tag: 'security', text: 'Sign in with phone or email, email verification and two-step verification.' },
    ],
    commits: ['5334459', '2df5d34', '5d88155', '79d077e'],
  },
  {
    id: '2026-09-22-admission',
    date: '2026-09-22',
    title: 'New admission form, online registrations and teachers',
    summary: 'A rebuilt student admission form, online registration approvals and teacher management.',
    items: [
      { tag: 'new', text: 'Rebuilt Students Admission form and student categories.' },
      { tag: 'new', text: 'Online Registrations: review and approve applications submitted from your website.' },
      { tag: 'new', text: 'Add and manage teachers.' },
    ],
    commits: ['a00efb6', '6002b82', '8176f6e'],
  },
  {
    id: '2026-09-14-leads',
    date: '2026-09-14',
    title: 'Institution sign-up controls',
    summary: 'Platform-side controls for which schools can apply.',
    items: [
      { tag: 'new', text: 'Authorized-email allowlist for institution applications and a public lead-capture form.' },
      { tag: 'fixed', text: 'Bangladeshi mobile numbers are validated with clear error messages.' },
    ],
    commits: ['c65f2f4', 'f3e58bb', '4724005', '3f0e446'],
  },
  {
    id: '2026-09-09-notifications',
    date: '2026-09-09',
    title: 'Fee reminders and absence alerts',
    summary: 'Automatic notifications when fees are due or a student is absent.',
    items: [
      { tag: 'new', text: 'In-app, email and SMS notifications, including fee reminders and absence alerts.' },
      { tag: 'improved', text: 'Redesigned subscription plans with billing alerts for institutions.' },
    ],
    commits: ['909a8f0', '83b27d4', 'afce1a0', '2eebe29'],
  },
  {
    id: '2026-09-04-bulk-import',
    date: '2026-09-04',
    title: 'Bulk student import',
    summary: 'Add a whole class at once from a CSV or Excel file.',
    items: [{ tag: 'new', text: 'Bulk CSV/Excel student import with validation.' }],
    commits: ['1631257'],
  },
  {
    id: '2026-08-27-billing',
    date: '2026-08-27',
    title: 'Subscription billing',
    summary: 'Pay for your PeopleNIT subscription online.',
    items: [{ tag: 'new', text: 'SSLCommerz subscription billing with receipts.' }],
    commits: ['89b9818', '8d19a25'],
  },
  {
    id: '2026-08-17-idcards',
    date: '2026-08-17',
    title: 'Smart ID cards',
    summary: 'Design and print student and staff ID cards with a verification QR code.',
    items: [
      { tag: 'new', text: 'Drag-and-drop ID card designer and bulk generation.' },
      { tag: 'fixed', text: 'Designer layout, missing date of birth and pagination fixes.' },
    ],
    commits: ['27760dd', '0d3b030', '157ca09'],
  },
  {
    id: '2026-08-11-results-timetable',
    date: '2026-08-11',
    title: 'Report cards and timetable builder',
    summary: 'Letterhead report cards and a drag-and-drop class routine.',
    items: [
      { tag: 'new', text: 'Letterhead-style report card PDF, downloadable by admins and teachers.' },
      { tag: 'new', text: 'Drag-and-drop timetable builder with PDF export.' },
      { tag: 'fixed', text: 'Marks are validated against each subject\'s own maximum.' },
    ],
    commits: ['4ed2143', '69ef975', 'f5846eb', 'cc6f62f', '9422dac'],
  },
];

export const TAG_LABEL: Record<ChangeTag, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed', security: 'Security' };
