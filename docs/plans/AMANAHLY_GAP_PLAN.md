# Amanahly Comparison and Plan

Prepared 2026-10-16 for the owner. Sources:
- **Marketing page:** amanahly.com.au, read from the owner's full-page screenshot.
- **Screens inside their app:** the names of all 388 screens in their public JavaScript bundle.

Use this to decide **features** only. We do not copy their design, text or branding.

## 1. What Amanahly is
- **Who it's for:** madrasahs, Islamic schools and academies, mainly Australia (weekend and evening madrasahs, Qur'an academies, tutoring centres).
- **Promise:** "Built on Amanah. Run with clarity." One system for admissions, students, families, finance, learning and portals, instead of five tools and a pile of spreadsheets.
- **Headline points:** four portals; granular permissions; multi-branch; white-labelled (the school's logo and colours); nine role types.
- **Values they sell:** *Amanah* (trust: scoped access, audit trails, never selling data), *Bayan* (clarity: every number on a report traces back to its source), and a third value whose text the screenshot didn't capture.

## 2. Their full feature list

| Area | Their features | Screens seen in their app |
|---|---|---|
| **Admissions and CRM** | One lead **pipeline with stages**; each lead has an **owner, a next step and a due date**; **tasks and follow-ups**; contacts and **volunteer enquiries**; **conversion reporting** | Leads, lead form, cases, CRM summary, merge duplicate people, enquiry notifications, intake forms |
| **Students and families** | **One record per family**: siblings, guardians, classes, attendance and **character notes** on a single profile; attendance registers; **badges and character scoring**; progress reports | Family profile, allergy/medical form, continuing students (re-enrolment), enrolment transfer, withdrawals, "allow to attend", class allocation export |
| **Finance** | **Fee structures** generate invoices per year, term and stream; payments and receipts; **donations and Zakat**; **tutor payouts**; everything reconciles in **one ledger** | Payments, family payments, monthly (recurring) donations, tutor payouts, "My payouts" for tutors, finance ledger |
| **Learning** | **Course builder and player**; lesson resources; **assessments and grading**; **class discussions**; completion tracking | Course player, progress under video, learning materials, resource progress, assessments tab |
| **Portals and access** | Four portals (**Admin, Tutor, Student, Parent**); role-based permissions; **branch scoping**; the school's logo and colours | User permissions, permission gate, branch access, branding settings, organisation hierarchy and roll-ups |
| **Scheduling and resources** | Calendar; sessions; rooms; bookable resources | Admin calendar, session register, rooms, resources, holidays, timetable model |
| **Appointments** | Parents book meetings with staff in open slots | Appointments, availability, services, slot picker, appointment settings |
| **Communication** | Announcement centre; **email marketing campaigns** with templates and **subscriber import**; a **shared mailbox** (two-way email threads); SMS; reminders | Announcement centre, campaigns, template browser/editor, mailbox and conversations, compose email, SMS field, reminder page |
| **Events** | Events in the portal with **RSVP** | Events, portal events, RSVP dialog |
| **Staff and HR** | Staff profiles; **time attendance and timesheets**; leave and allowances; tasks | Staff list and profile, timesheets, leave requests, leave allowance, tasks |
| **Kiosk** | Self check-in kiosk | Kiosk app, student check-in |
| **Reporting** | **Report builder** (custom reports); export to spreadsheet | Report builder, reports, export preview, Excel export |
| **Website** | A public site in the school's branding | Public site, website preview, page templates |
| **Security and admin** | **2FA (MFA)**; security settings; **trash/archive with restore**; audit trail | MFA setup wizard, security settings, trash, activity log |

## 3. How PeopleNIT compares

✅ = we have it · 🟡 = partly · ❌ = missing

| Amanahly feature | PeopleNIT today | Gap |
|---|---|---|
| Enquiry pipeline with owner, next step and date | 🟡 Admission enquiries have a status, an assignee and a follow-up date | No **stages board**, no **tasks per lead**, no **conversion report**, no **cases**, no **duplicate merge** |
| Volunteer and general contacts | ❌ | Contacts that aren't students (volunteers, donors) |
| One record per family | 🟡 Guardians linked to several students | No **family profile page** (siblings, combined fees, shared notes); no family-level billing |
| Medical/allergy, intake form, re-enrolment, transfer, withdrawal | 🟡 Promotion and student documents exist | **Medical/allergy record**, **re-enrolment campaign**, **transfer between branches**, **withdrawal workflow** |
| Character scoring and badges | ❌ | **আখলাক/character scoring** and a **badge and reward** system |
| Progress reports | ✅ Report cards, transcripts, AI report comments | — |
| Fee structures and invoicing | ✅ Fee categories, schedules, bulk invoices, concessions | Per-**stream** fee rules (minor) |
| Payments and receipts | ✅ Including bKash, Nagad and SSLCommerz | — |
| **Donations and Zakat** | ❌ | **Donations**: one-off and monthly, Zakat and Sadaqah funds, donor receipts, campaigns |
| **Tutor payouts** | ❌ We have payroll, but not pay-per-session | **Sessional tutor pay**, with a "My payouts" view for tutors |
| One reconciling ledger | 🟡 Fees have reconciliation; payroll is separate | A **general ledger** joining fees, donations, payouts and expenses (this also meets the "basic accounting" need) |
| Course builder, player, completion | 🟡 Website courses (public LMS); lecture materials; AI lessons in progress | Courses for **enrolled classes** inside the portal, with **completion tracking** |
| Assessments and grading in the class | ✅ Exams, results, grading scales, assignments | Online quizzes (planned with AI lessons) |
| **Class discussions** | 🟡 Comments on lecture materials | A **discussion feed per class** |
| Four tailored portals | ✅ Admin, teacher, student, guardian dashboards and more | A focused **tutor portal** for part-time teachers (minor) |
| Nine role types | ✅ Nine roles today | — |
| **Granular permissions** | 🟡 A fixed role-based system (there is a `Permission` table, mostly unused) | A **permission editor**: custom roles and per-feature rights |
| **Branch scoping** | 🟡 Branches exist; the branch switcher filters only some screens | **Branch-level access**: staff see only their branch |
| White-label (logo and colours) | 🟡 The website builder is branded; the dashboard has a school logo | **Portal theme per school**, and a custom domain for the portal |
| Rooms and bookable resources | ❌ | **Rooms** and resource booking |
| **Appointments** | ❌ | **Parent–teacher meeting booking** |
| Email campaigns and templates | ✅ Campaigns, email templates, Brevo | **Subscriber import** and donor/newsletter lists (minor) |
| **Shared mailbox** (two-way email) | ❌ In-app messages only | **Inbox for the school email address** (Brevo inbound) |
| Reminders | ✅ Fee and absence reminders | — |
| Events with RSVP | 🟡 Events and holidays | **RSVP** from the guardian portal |
| Staff time attendance and timesheets | ✅ Staff attendance, QR, device attendance in progress | Timesheets for hourly tutors (with payouts) |
| Leave, tasks | ✅ | — |
| Kiosk | ✅ QR kiosk; face terminals in progress | — |
| **Report builder** | 🟡 Saved views, scheduled reports, CSV | A **drag-and-drop custom report builder** |
| Website | ✅ Ours is much richer: builder, modules, shop, courses, DSHE checklist | — |
| 2FA | ✅ | — |
| **Trash with restore** | ❌ Deletes are permanent in most modules | **Recycle bin** with a 30-day restore |
| **Organisation hierarchy** | 🟡 Super admin sees all schools | **School groups**, e.g. a madrasah board with many campuses, with roll-up dashboards |

**Where we're already ahead of them:** Bangla and the Bangladesh context (GPA, DSHE, EIIN, bKash/Nagad), the website builder, AI features, the library, transport, inventory, ID cards, payroll, QR and face attendance, online admission, the shop, and the public LMS.

## 4. What to build (Islamic and madrasah edition)

Bangladesh has thousands of Qawmi and Alia madrasahs, Hifz and Noorani centres and Islamic schools. The gaps above, plus a **Qur'an/Hifz tracker** (Amanahly doesn't have one, but competitors such as Alif Cloud and Dugsi do), would make PeopleNIT the strongest product for them.

### Phase 1: highest value, about 6–7 weeks
| # | Feature | What it includes | Size |
|---|---|---|---|
| A1 | **Donations, Zakat and Sadaqah** | Funds (Zakat, Sadaqah, Waqf, building, general); one-off and **monthly** donations through bKash, Nagad and SSLCommerz; donor profiles; Bangla/English receipts; campaigns with progress bars; a public donate page and block in the website builder | L |
| A2 | **Family profile** | One page per family: siblings, guardians, classes, attendance, fees due across all children, notes; pay all children's fees at once | M |
| A3 | **Character (আখলাক) scoring and badges** | Configurable traits (punctuality, manners, salah, cleanliness); weekly or termly scores; **badges and points**; shown on report cards and in the guardian app | M |
| A4 | **Qur'an / Hifz tracker** (beyond Amanahly) | Daily sabaq, sabqi and manzil per student; para and surah progress; mistakes; teacher notes; guardian view; monthly Hifz report | M |
| A5 | **Admissions CRM upgrade** | Stage board (drag between stages); owner, next step and due date; tasks and follow-up reminders; conversion report by source and class; duplicate merge | M |

### Phase 2: operations, about 6 weeks
| # | Feature | Size |
|---|---|---|
| B1 | **Tutor sessions and payouts**: pay per session or hour; timesheets; monthly payout statements; tutor portal "My payouts" | M |
| B2 | **General ledger**: fees, donations, payouts and expenses in one ledger; cash book; income vs expense report (also covers "basic accounting" from the launch plan) | L |
| B3 | **Granular permissions and custom roles**: a permission editor over the existing `Permission` table; **branch-scoped staff** | L |
| B4 | **Parent–teacher appointments**: staff availability, slot booking from the guardian portal, reminders | M |
| B5 | **Trash and restore**: soft delete with a 30-day recycle bin for students, staff, invoices and notices | M |
| B6 | **Medical/allergy record, re-enrolment, branch transfer, withdrawal workflow** | M |

### Phase 3: engagement and polish, about 5 weeks
| # | Feature | Size |
|---|---|---|
| C1 | **Class discussions**: a feed per class (posts, comments, attachments, moderation) | M |
| C2 | **Events with RSVP**, plus volunteer sign-ups | S |
| C3 | **Shared school mailbox**: incoming email (Brevo inbound) shown as threads and assigned to staff | M |
| C4 | **Custom report builder**: pick fields and filters, then save, schedule and export | L |
| C5 | **White-label portal**: per-school portal theme and custom portal domain | M |
| C6 | **School groups**: one board over many schools, with roll-up dashboards | M |
| C7 | **Rooms and resource booking** | S |

**Sizes:** S ≈ 2–4 days, M ≈ 1–2 weeks, L ≈ 2–3 weeks, for one engineer. Built one track at a time (performance rule), each with migrations and tests, and committed when green.

## 5. Decisions needed from the owner
1. **Product direction:** a separate **"Islamic / Madrasah edition"** (its own landing page, plans and Bangla terms), or the same features turned on for every school?
2. **Donations:** may schools take donations through **their own** bKash/SSLCommerz accounts (money goes straight to the school), or through the platform's account?
3. **Order:** Phase 1 (A1–A5) first? A1 (donations/Zakat) and A4 (Hifz tracker) are the strongest selling points for madrasahs.
4. **Unfinished tracks:** the AI lesson builder and face attendance are paused half-built. Finish them first, or start Phase 1 now?
5. **Launch security fixes (Launch Plan Phase 1):** these are still pending and are recommended before selling to more schools.
