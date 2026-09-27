// =============================================================================
// Help-centre articles (markdown subset — see SimpleMarkdown.tsx). Written
// from what the screens actually do (labels quoted from the UI). When a screen
// changes, update the article in the same PR.
// `roles` = who the article is most relevant to; everyone can read every article.
// =============================================================================

export interface HelpArticle {
  slug: string;
  title: string;
  category: 'Students' | 'Attendance' | 'Exams' | 'Finance' | 'Communication' | 'Account & support';
  summary: string;
  roles: string[];
  keywords: string[];
  body: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'student-admission',
    title: 'Admit a new student',
    category: 'Students',
    summary: 'The 5-step admission wizard, bulk import, online registrations and the enquiry pipeline.',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    keywords: ['admission', 'enroll', 'new student', 'gr number', 'guardian', 'bulk', 'import', 'excel', 'online registration', 'enquiry'],
    body: `
Open **Students → Students Admission** ([open](/students/admission)). Only admins can admit students.

## The five steps
1. **Student Details** — name, mobile, gender, date of birth, religion, blood group, addresses. The **Login Credentials** box (email + password, at least 8 characters) creates the student's portal login. Medical notes, allergies and an emergency contact are optional.
2. **Academic Placement** — pick the **Class Section** and category. The **GR Number** is suggested automatically (duplicates are refused). For class 9 and 10 a **Department** (Science/Commerce/Arts) is required. Any custom fields your school has defined appear under **Additional Details**.
3. **Guardian** — search **Guardian Email** to link an existing guardian, or type first name, last name and mobile to create one.
4. **Photo & Documents** — photo (compressed automatically), birth certificate and last result. Each file must be under 4 MB.
5. **Review & Submit** — use **Edit** on any section, then **Submit**.

When it finishes you see **Admission completed** with the GR number and the login email and password — print it or copy it now.

> If a document upload or the guardian link fails, the student is still created and a message tells you what to add later from the student profile.

## Add many students at once
Go to **Students → Add Bulk Data** ([open](/students/bulk-data)):
1. **Download Template** (studentId, firstName and lastName are required).
2. **Browse…** and pick your .xlsx, .xls or .csv (max 5 MB).
3. Check the preview, then **Run Import**. Valid rows are imported even if others fail; the result lists every failed row and why.

## Applications from your website
**Students → Online Registrations** lists pending applications. **Approve** asks for the student's login email and shows a generated password **once**. **Reject** deletes the application permanently.

## Enquiries before admission
**Students → Admission Enquiries** is a board (New → Contacted → Visited → Applied → Enrolled / Lost). Share the public enquiry link, set follow-up dates, and use **Convert to online application** when a family is ready to apply.
`,
  },
  {
    slug: 'daily-attendance',
    title: 'Take daily attendance',
    category: 'Attendance',
    summary: 'Mark a class register, add notes, use the weekly grid and keyboard shortcuts, and read the monthly summary.',
    roles: ['ADMIN', 'TEACHER'],
    keywords: ['attendance', 'register', 'present', 'absent', 'late', 'half day', 'weekly', 'holiday', 'shortcut', 'monthly summary'],
    body: `
Open **Academics → Attendance** ([open](/attendance)).

## Choose the register
- **Admins** pick Class, Section and Date.
- **Teachers** pick from **Assigned section** — only sections you are class teacher of are listed. If you see "No Assigned Sections", ask an admin to use **Assign Class Teacher**.
- You cannot pick a future date. Weekends and national holidays are locked and show **Holiday — Cannot Submit**.

## Mark students
- Statuses: **Present (P)**, **Absent (A)**, **Late (L)**, **Half day (H)**.
- Everyone without a saved record starts as **Present**; **Mark All Present** resets everyone to Present.
- Add a **Remark / Note** on a student card (Cards view).
- Filter by status or search a student.

When ready, press **Save & Submit Attendance** (or **Ctrl+S**). The bar shows live counts; an **Unsaved changes** warning appears until you save.

## Weekly view
Clicking a cell cycles Present → Absent → Late → Half day and **saves that cell immediately**. Use Previous/Next week to move.

## Keyboard shortcuts (Table and Weekly views)
- Arrow keys move between students and days.
- **P / A / L / H** set a status and jump to the next student.
- **Space** toggles Present/Absent. **Ctrl+S** saves.

## Monthly summary
The **Monthly summary** tab shows each student's counts and attendance %. Tick **Chronic absentees only (<75%)** to focus on students at risk.

> Students and guardians see their own attendance calendar, rate and absences on the same page.

## No internet?
If you lose connection while saving, the register is kept on your device and sent automatically when you are back online — see [Offline attendance](/help?article=offline-attendance).
`,
  },
  {
    slug: 'offline-attendance',
    title: 'Offline attendance and syncing',
    category: 'Attendance',
    summary: 'What happens when you save attendance without a connection, and how to handle a register the server rejects.',
    roles: ['ADMIN', 'TEACHER'],
    keywords: ['offline', 'no internet', 'sync', 'queue', 'conflict', 'pwa', 'install'],
    body: `
PeopleNIT keeps working on a weak connection. When you save a register while offline, it is stored **on this device** and a banner says how many registers are waiting.

## Syncing
- As soon as the browser is back online, waiting registers are sent automatically, oldest first.
- You can also press **Sync now** on the banner.
- Saving the same class and date again while offline **updates** the waiting register instead of creating a second copy — the latest mark for each student wins.

## When a register is not accepted
Sometimes the server refuses a register that was saved offline — for example you no longer teach that section, or a student has left it. The banner then lists it in red with the server's reason:
- **Retry** sends it again (after you have fixed the cause).
- **Discard** removes it from this device.

> Offline registers are stored in this browser only. Do not clear site data or sign out on a shared device until the banner shows everything has synced.
`,
  },
  {
    slug: 'marks-entry',
    title: 'Enter exam marks and publish results',
    category: 'Exams',
    summary: 'Grade Book entry modes, CSV upload, AI remarks, report cards, merit list and transcripts.',
    roles: ['ADMIN', 'TEACHER'],
    keywords: ['marks', 'results', 'grade', 'exam', 'report card', 'gpa', 'merit list', 'transcript', 'csv', 'upload'],
    body: `
Open **Academics → Results** ([open](/results)) and stay on **Grade Sheet Upload**.

## Enter marks
1. **Select Exam**, then the class and section (teachers use **Assigned Class-Section**). Classes 9–12 also ask for a **Department**.
2. Check **Max Marks per Subject** — every mark must be between 0 and that subject's maximum.
3. Choose an entry mode: **Student Cards (Mobile Easy)**, **Single Subject Focus** or **Full Table Matrix**.
4. Optionally add **Remarks** per mark. **AI Comment** drafts a remark from the score — always review it before saving.
5. Press **Save Grade Sheet** (or **Ctrl+S**).

> Saved marks are instantly visible to the student and their guardian in their portals.

## Upload from a spreadsheet
**Download Template (CSV)**, fill it (a "Student ID" column plus one column per subject), then **Upload Excel/CSV**. The upload only fills the grid — press **Confirm & Save All** to save.

## Grades
Grades are assigned when marks are saved, using your school's grading scale. Admins manage scales under **Academics → Grading Scales** ([open](/grading)).

## Results and report cards
- **Complete Result Sheet** — totals and percentages, **Download CSV Sheet**.
- **Student Marksheet** or **Students → Generate Result** — **Download Report Card** (PDF).
- **Merit List** ([open](/results/merit-list)) — rank by total or percentage; equal scores share a rank.
- **Transcript & Progress** ([open](/results/transcript)) — all exams across sessions for one student.
`,
  },
  {
    slug: 'fees-invoices',
    title: 'Set up fees and create invoices',
    category: 'Finance',
    summary: 'Fee categories, single and bulk invoices, concessions and overdue marking.',
    roles: ['ADMIN', 'ACCOUNTANT'],
    keywords: ['fees', 'invoice', 'category', 'bulk', 'concession', 'discount', 'scholarship', 'overdue', 'tuition'],
    body: `
Open **Finance → Fees & Billing** ([open](/fees)). Admins and accountants can create invoices; super admins can view only.

## 1. Fee categories
On **Fee categories**, **Create fee category** with a name, amount (৳) and billing frequency (Monthly, Term-based, One time, Annual). A category that is used on invoices cannot be deleted — deactivate it instead.

## 2. One invoice
**Create invoice** → pick the **Student**, add line items (category, amount, discount, description), set the **Due date** and optional notes printed on the invoice. The total must be above zero.

## 3. A whole class
**Bulk generate** runs in three steps:
1. Class (section optional), **Billing period** (e.g. "2026-10" or "Term 1 2026"), due date.
2. Fee items and/or **Use fee schedule**; keep **Apply student concessions** on.
3. **Preview**, then **Generate N invoices**.

Students already billed for that period are skipped, so running it twice is safe. Each student is notified.

## Concessions (admins)
On **Concessions**, create a percentage or fixed concession (whole invoice or one category), then **Assign to student** with optional valid-from/to dates. Active concessions apply automatically to new invoices.

## Overdue
Unpaid and partly paid invoices past their due date are marked **OVERDUE** automatically every day. Admins can run it now with **Mark overdue**.
`,
  },
  {
    slug: 'fee-payments',
    title: 'Record payments and print receipts',
    category: 'Finance',
    summary: 'Offline (cash/bank) payments by staff, online payments by families, receipts and reconciliation.',
    roles: ['ADMIN', 'ACCOUNTANT', 'GUARDIAN', 'STUDENT'],
    keywords: ['payment', 'receipt', 'cash', 'bank', 'bkash', 'nagad', 'sslcommerz', 'online', 'demo', 'reconciliation', 'partial'],
    body: `
## Cash or bank payment (staff)
On an unpaid invoice press **Record payment** (in the row or the invoice drawer):
1. **Payment amount** is pre-filled with the full due amount — lower it for a part payment (it cannot exceed the due amount).
2. **Method**: Cash or Bank transfer. Add a reference number and notes if you like.
3. **Record payment**. The invoice updates to PARTIAL or PAID and a receipt number is issued.

## Paying online (guardians and students)
On **My Fees & Billing**, guardians first choose the child. Press **Pay online** on an invoice and choose **bKash**, **Nagad** or **SSLCommerz**, then **Continue to payment**. You return to PeopleNIT after paying and a banner confirms the result.

> A method marked **(demo)** is not connected to the real gateway yet: the demo checkout only simulates a payment and **no money is charged**. Receipts from demo payments are stamped "DEMO MODE".

## Receipts
- Staff: invoice drawer → **Payment history** → **Receipt**, or **Print invoice**.
- Families: expand **Payment history** on the invoice card → **Receipt**.

## Reconciliation (staff)
The **Reconciliation** tab lists every online transaction with gateway and status filters, so you can match them to your bank or wallet statements.
`,
  },
  {
    slug: 'notices',
    title: 'Post and schedule notices',
    category: 'Communication',
    summary: 'Write a notice, target an audience or class, schedule it for later, and edit or remove it.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'],
    keywords: ['notice', 'announcement', 'schedule', 'audience', 'class', 'section', 'board'],
    body: `
Open **Communication → Notices** ([open](/notices)). Everyone can read the board; admins and teachers can post.

## Post a notice
Press **Post notice** and fill in:
- **Notice Title** (up to 200 characters) and **Notice Content**.
- **Target Audience**: All Users (Public), Teachers Only, Guardians Only or Students Only.
- Optional **Class** and **Section** — students and guardians outside that class will not see it.
- **Active** (on by default).

## Schedule it
Set **Schedule for later** to a future date and time and the button changes to **Schedule Announcement**. Students and guardians see it only from that time; staff see a **Scheduled** badge. Leave it empty to publish now.

## Find, edit, remove
Search by title or content and filter by audience (and, for staff, Published/Scheduled). Use **Edit** or **Delete** on a notice — deleting cannot be undone.

> For SMS or email blasts use **Communication → Campaigns** instead; notices appear inside the app.
`,
  },
  {
    slug: 'support-tickets',
    title: 'Get help from the PeopleNIT team',
    category: 'Account & support',
    summary: 'Open a support ticket, follow the conversation, close or reopen it.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'GUARDIAN', 'STUDENT', 'MANAGEMENT'],
    keywords: ['support', 'help', 'ticket', 'problem', 'bug', 'contact'],
    body: `
Open **Support** ([open](/support)) and press **New ticket**. Give a short subject, describe what happened (the page, what you clicked, any error message) and pick a priority.

- Replies from the PeopleNIT team are marked **PeopleNIT Support**.
- Reply in the same ticket to keep the history together. Replying to a resolved ticket reopens it.
- You can **Close ticket** when you are done, or **Reopen ticket** later.

> School admins see every ticket from their institution and can change status and priority.
`,
  },
  {
    slug: 'data-export',
    title: 'Export all your school data',
    category: 'Account & support',
    summary: 'Download a ZIP of spreadsheets with every student, guardian, staff, attendance, result, invoice and payment record.',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    keywords: ['export', 'backup', 'download', 'zip', 'csv', 'data'],
    body: `
Open **Data export** ([open](/data-export)) and press **Request export**. It is prepared in the background — the page updates when it is **Ready**, then press **Download**.

- The ZIP contains UTF-8 CSV files (students, guardians and links, staff, attendance, exam results, invoices, payments) plus a manifest with row counts.
- Each download is written to the audit log.
- Exports are deleted after 7 days; request a new one any time (up to 5 per day).

> The file contains personal data — store it securely.
`,
  },
];

export const HELP_CATEGORIES = ['Students', 'Attendance', 'Exams', 'Finance', 'Communication', 'Account & support'] as const;

/** Case-insensitive search over title, summary, keywords and body. Title/keyword hits rank first. */
export function searchArticles(query: string, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return articles;
  const scored = articles
    .map((a) => {
      const title = a.title.toLowerCase();
      const kw = a.keywords.join(' ').toLowerCase();
      const rest = `${a.summary} ${a.body}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 5;
        else if (kw.includes(term)) score += 3;
        else if (rest.includes(term)) score += 1;
        else return { a, score: -1 };
      }
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  return scored.map((x) => x.a);
}
