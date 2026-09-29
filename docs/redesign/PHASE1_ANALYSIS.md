# PeopleNIT SMS — Phase 1 System Analysis

_Date: 2026-09-26 · Branch: `Habib` · Read-only analysis (no code changed during Phase 1)_

This report covers the technical stack, database and tenancy, API surface, feature gaps, UX, security and quality, and recommendations. Items that need an owner decision are marked **DECISION**.

---

## 0. Urgent findings (read first)

| # | Severity | Finding | Where |
|---|---|---|---|
| U1 | **Critical** | A tenant **ADMIN can create or promote a `SUPER_ADMIN` user**. `role: z.nativeEnum(UserRole)` accepts `SUPER_ADMIN` and `POST/PUT /users` only require ADMIN. A SUPER_ADMIN bypasses RBAC and reaches every platform route, which amounts to a **full cross-tenant takeover**. | `backend/src/modules/users/user.dto.ts:7,41`, `user.routes.ts:61,80`, `user.service.ts` |
| U2 | High | **SSLCommerz payment replay.** The validated `val_id` is never matched to the payment's own `tran_id`, and `gatewayValId` is not unique. An old valid `val_id` can renew a subscription without paying. | `billing.service.ts:204-253`, `schema.prisma:250` |
| U3 | High | **Plaintext passwords in AuditLog.** The audit middleware stores the full `req.body`, so student create and password-reset requests write passwords into `AuditLog.metadata`. | `middleware/audit.middleware.ts:108`, `student.routes.ts:43` |
| U4 | High | **Stored XSS through links.** `z.string().url()` accepts `javascript:` URLs, which are rendered as `href` in lecture, assignment and student pages. | `lecture.dto.ts:18`, `assignment.dto.ts:28`, `student.dto.ts:65` |
| U5 | High | **`/reports/*` and `/ai/*` have no role guard.** Any logged-in student or guardian can read institution revenue, attendance totals and every student's risk score. `/reports` also skips `setTenant`, so the suspension check is skipped too. | `reports.routes.ts:7`, `ai.routes.ts:11-15` |
| U6 | High | **Invoice numbers are unique across all tenants.** The format `INV-YYYY-000001` has no tenant prefix, so a second tenant's first invoice can fail with P2002. | `schema.prisma:786`, `utils/invoiceNumber.ts` |
| U7 | Ops | **Jest may have written test fixtures to the remote Neon database.** The analysis ran the test suite for about a minute before we noticed `backend/.env` points at Neon, then stopped it. Please check that database for fixture rows. | `backend/.env` (not tracked) |

**DECISION:** U1–U6 need backend changes. The hard rules say don't change payloads or validation without approval, so none of these have been fixed. U1 is a one-line DTO and service guard; I recommend approving it immediately.

---

## A. Technical analysis

### A1. Stack

| Layer | Details |
|---|---|
| Frontend | React 18.3, TypeScript 5.4, Vite 5.3, Tailwind 4.3 (`@theme`), React Query 5, Zustand 4.5, react-router 6.24, framer-motion 12, recharts 2.12, react-hot-toast, lucide-react, xlsx 0.18.5, @dnd-kit |
| Backend | Node (CI 20.x; local v26), Express 4.19, Prisma 5.14, PostgreSQL (Neon), BullMQ 5 + ioredis, zod 3, jsonwebtoken, bcryptjs, otplib (TOTP), nodemailer, pdfkit, qrcode, multer 2, helmet, express-rate-limit, winston |
| Infrastructure | `docker-compose.yml` (Postgres 16, Redis 7, pgAdmin). CI: lint and typecheck, backend jest (Postgres service, no Redis), frontend build. Separate production-migrate workflow |
| Size | 62 Prisma models, 21 enums, 40 migrations. Backend has 31 modules and ~203 TS files. Frontend has ~80 page files and ~33k lines of page code |

**Verdict: restyle in place. No migration needed.** The stack is already modern React and TypeScript, with lazy routes, role guards, a token layer and dark mode. The problems are consistency: raw colour classes, unused primitives, hand-built forms and modals, and mixed ways of fetching data. They are not framework problems.

### A2. Database and multi-tenancy

- **Model:** one shared PostgreSQL schema. Each tenant row carries an `institutionId`. Class, Section, Teacher, GuardianStudent, InvoiceItem and Payment are scoped through a join instead.
- **Enforcement:**
  - **Database level: none.** There is no Row-Level Security and no Prisma extension that adds the tenant filter automatically.
  - **API level: by convention.** `authenticate` → `setTenant` (the JWT's tenant; only a SUPER_ADMIN may choose one through a header) → each repository passes `institutionId` itself. Most writes are scoped correctly (checked across 19 modules).
- **Cross-tenant gaps** (IDs sent by the client that are never checked against the tenant):

| # | Sev | Gap | Where |
|---|---|---|---|
| F3 | High | Library issue: `studentId` not checked; the list then returns the full student record | `library.repository.ts:59` |
| F4 | High | Transport assignment: `studentId`, `routeId` and `vehicleId` not checked | `transport.repository.ts:87` |
| F5 | Medium | Messages: `receiverId` not checked; the response exposes the receiver's name, role and avatar | `messages.repository.ts:84` |
| F6/F7 | Medium | Student and user create/update: `branchId`, `sectionId` and `academicYearId` not checked | `student.service.ts:83`, `user.service.ts:150` |
| F8 | Low | Invoice line `feeCategoryId` not checked | `fee.repository.ts:118` |

- **Concurrency bugs:**

| # | Bug | Where |
|---|---|---|
| F9 | Two payments at the same moment can overwrite `paidAmount` | `fee.repository.ts:279` |
| F10 | Library issue writes an absolute `availableCopies` value, so concurrent issues can oversell | `library.repository.ts:61` |
| F12 | Student ID and payroll uniqueness are enforced only in code, so concurrent requests can create duplicates | — |

- **Missing indexes:**
  - Invoice `(institutionId, status)` and `(institutionId, dueDate)`
  - Message `(institutionId, receiverId, read)`
  - Guardian `(institutionId)`
  - Student `(institutionId, classId, sectionId)`, plus `@@unique(institutionId, studentId)`
  - AuditLog `(institutionId, createdAt)`
  - Unindexed foreign keys: TimetableSlot.teacherId, IdCard.templateId, SubjectOffering.subjectId
- **Schema smells:**
  - Status fields are free text (Invoice, Payment, Student, LibraryIssue, Payroll).
  - `AcademicYear` and `Permission` have no foreign key to Institution.
  - Deleting a user or institution also deletes its audit history.

### A3. API surface (41 router mounts under `/api/v1`)

| Group | Mount | Guard summary |
|---|---|---|
| Public | `/auth/*` (register, verify, login, 2FA, refresh, reset), `/student-applications/{classes,apply}`, `/leads` POST, `/institution-applications/apply`, `/institution/public/list`, `/id-cards/verify/:token`, `/billing/gateway/*` | Rate-limited |
| Academics setup | `/academics/{mediums,streams,shifts,semesters,student-categories,classes,sections}`, `/curriculum/subjects`, `/session-years` | Read: SA, A, T, ACC, LIB. Write: SA, A |
| Students | `/students` (list, create, bulk-import, roll-numbers, bulk-assign-class, :id CRUD, reset-password, approve, documents) | Read: SA, A, T, ACC, LIB. Write: SA, A, T. Bulk import: SA, A |
| Guardians | `/guardians` | CRUD: SA, A. Read also T, ACC. `/me/students`: G |
| Attendance | `/attendance/{bulk, sheet, sheet/weekly, my-sections, my-attendance, child/:id, assign-teacher, assignments, /}` | Per-route roles |
| Results | `/results` (exams CRUD, submit, results-list, marksheet, me, :studentId/report-card) | Staff: SA, A, T. Own-data routes: S, G |
| Fees | `/fees/{categories, invoices, invoices/:id/payments/offline, …/online}` | SA, A, ACC. Own invoices: S, G |
| HR | `/hr/{staff, payroll, payroll/:id/pay}` | Write: SA, A. Read: ACC |
| Leave | `/leave/{types, report, requests…}` | Admin review. Self-service for staff and students |
| Library / Transport | `/library/{books, issues, me/issues}`, `/transport/{vehicles, routes, assignments, me/assignment}` | Staff: SA, A, LIB / TO |
| Content | `/lectures`, `/assignments`, `/notices`, `/timetables` (+pdf), `/events`, `/holidays` | Per-route roles |
| Communication | `/messages` (any logged-in user), `/notifications` (own, preferences, admin templates) | — |
| ID cards | `/id-cards/{templates, generate, /, me, me/pdf, :id, :id/pdf, :id/revoke}` | SA, A (T read) |
| Platform | `/institution/*` super-admin (metrics, paginated, support-session, admin-actions, audit-logs, system-health, CRUD, status), `/institution-applications`, `/authorized-emails`, `/leads`, `/billing/super-admin/*` | SA |
| Tenant billing | `/billing/{plans, subscription, checkout, my-payments, payments/:id}` | A |
| **Unguarded** | `/reports/{dashboard, admin-overview}`, `/ai/{comment, risk-scoring, dashboard-insights}` | **Login only (U5)** |
| Users | `/users` (search, change-password, pending-registrations, CRUD) | SA, A (search and change-password: any logged-in user) |

**Frontend calls to endpoints that don't exist (confirmed):**

| Call | Result |
|---|---|
| `LibraryManagement.tsx:94,127` PUT/DELETE `/library/books/:id` | 404: **editing or deleting a book is broken** |
| `TransportManagement.tsx:100` PUT `/transport/routes/:id` | 404: **editing a route is broken** |
| `fees.api.ts` POST `/fees/payments`, GET `/fees/invoices/:id/payments`; `students.api.ts` PATCH `/students/:id` | Dead code: no page imports those hooks |

**Endpoints with no frontend screen:**
- `/messages` inbox
- `/notifications/preferences` and `/notifications/templates`
- `/guardians/:id` edit
- `/results/:id` exam detail
- Most `/billing/super-admin/*` payment-link and refund routes (some are used)
- `/id-cards/me` JSON (only the PDF is used)
- Leave report filters

---

## B. Feature inventory and gap analysis

**Totals:** 233 items. 80 Complete · 82 Partial · 68 Missing · 3 Broken.

**Broken:**
1. "Pay Online" for fees always sends `BKASH` to a stub gateway, so no online fee payment can complete. There is no IPN route.
2. Report endpoints have no permission checks.
3. AI endpoints have no role checks.

| Area | Complete | Partial / missing (summary) |
|---|---|---|
| 1 Institution setup | Tenancy, academic year, classes, sections, subjects | **Branch**: model only, no API or UI. **Departments**: free text. **Grading**: a fixed scale in code. **Branding**: logo and name only. **Settings**: no timezone, currency or date format |
| 2 Users & roles | 9 roles exist; activation; password reset | Granular `Permission` table exists but is unused. **No invitations.** Accountant, Librarian, Transport Officer and Management land on the admin dashboard. **Student has no dashboard** |
| 3 Admission | Online form, profile, documents, approval | **Enquiry capture missing.** Roll numbers are manual. No status tracking for applicants |
| 4 Student records | Personal, guardian, documents, bulk assign, bulk import | Emergency contacts and medical: partial. **Previous school, timeline and custom fields missing.** No cross-year academic record |
| 5 Attendance | Daily, late, register (CSV), child and self views | **Subject-wise, QR and staff attendance missing.** Guardian alerts are SMS-only, with no de-duplication. No monthly summary endpoint |
| 6 Results | Exams, marks entry, processing, rank, report card PDF | Grading is fixed. **Transcripts, promotion and merit lists missing** |
| 7 Teacher workspace | Class list, attendance, lesson and class notes, assignments, result upload | Tasks and performance review missing. No class-wide guardian messaging |
| 8/9 Guardian and student portals | Results, fees, notices, messaging, homework | Routine: no child-filtered view. No payment-history list. Notifications are polled every 60 s. Student has no home dashboard |
| 10 Fees | Categories, single invoice, partial payments, offline payment, history | **No bulk invoicing.** Discounts are per item only. Due reminders need Redis and nothing marks invoices OVERDUE. **No fee receipt PDF.** bKash broken; Nagad and SSLCommerz (fees) are stubs. No reconciliation |
| 11 Communication | Notices, in-app notifications, Greenweb SMS (automatic only) | **No admin bulk SMS/email screen.** Email disabled in production. Class-specific notices, groups and scheduling missing |
| 12 Timetable | Drag-and-drop builder, conflict detection, PDF, holiday calendar with government sync | Rooms are free text. **Exam timetable missing.** Days and periods are hard-coded in the UI |
| 13 HR & payroll | Staff profiles, leave module | Salary structure is base salary only. **Payroll periods hard-coded to June–August 2026 in the UI.** Payslips, contracts, staff attendance and payroll reports missing |
| 14 Library | Issue, return, history | Book edit/delete broken (no API). Overdue status is never set. Fines are manual. No reports |
| 15 Transport | Assignments | Routes and vehicles are create-only. Stops are a text field. Transport fees are never billed. No reports. No tracking |
| 16 Inventory & assets | — | **Whole module missing** |
| 17 Reports & analytics | Admin and guardian dashboards on real data | Management, accountant and student dashboards missing. **No filters or exports on reports.** Analytics, funnel, saved views and scheduled emails missing |
| 18 Integrations | Greenweb SMS; SSLCommerz for SaaS billing | Fee gateways are stubs. Email has no provider. WhatsApp, Google Sheets and a public API are missing |
| 19 Security | bcrypt, lockout, 2FA, refresh-token rotation, helmet, rate limits | Audit logging is partial (no fees, users, library or transport) and leaks passwords. Password policy is inconsistent (6 or 8 characters). No backups or restore |
| 20 Support & onboarding | Super-admin creation wizard | No first-run school wizard, guides, tickets or checklist |
| 21 AI | Template "comment generator", threshold-based "risk scoring" and "insights" (**rule-based, no LLM**) | 9 of 12 AI features missing. Risk scoring loads every attendance row and is exposed to all roles |
| 22 Enterprise | — | Branch model only. Multi-campus reporting and custom workflows missing |
| 23 Mobile | Bearer tokens, `/api/v1`, responsive shell | Tables only scroll sideways (**fixed in Phase 2** for the shared table) |
| 24 SaaS layer | Tenants create/suspend/delete, health, plans, trials, grace period, auto-suspend, impersonation with banner, 2FA | Feature flags and plan limits missing (`studentCap` stored but not enforced). Notification-preference UI, realtime, PWA, tenant export, metering, API keys and webhooks, error tracking missing |

**Misleading or hard-coded data found on real screens** (breaks rule 5; to be fixed during Phase 3):
- **Payroll:** pay periods are fixed to June–August 2026, so September cannot be processed.
- **Attendance, marks entry and lectures:** the class list is fixed to KG–Class 10 and sections to A–G, instead of the school's own classes.
- **Teacher dashboard:**
  - "My Students" counts every student.
  - "Pending Assignments" is always 0.
- **Admin dashboard KPIs:** every card showed a green "up" arrow whatever the data. **Removed in Phase 2** (the KpiCard no longer draws a trend).
- **Admin dashboard "Approved Leaves" card:** says "Leave management is coming soon", although the module exists.
- **Marks entry:** when the AI remark call fails, it inserts a canned remark labelled "fallback simulated".
- **Timetable:** days and periods are hard-coded.

---

## C. UX analysis

**Highest-traffic screens per role:**

| Role | Screens, most used first |
|---|---|
| Admin | Dashboard, Students list, Admission, Fees (InvoiceList), Attendance, Results (MarksEntry), Users, Leave, Notices |
| Teacher | Teacher dashboard, Attendance + register sheet, MarksEntry, Lecture materials, Timetable, Roll numbers, Leave, Messages |
| Accountant | (admin dashboard), Fees, Reports, HR & payroll |
| Librarian / Transport officer | (admin dashboard), Library / Transport |
| Guardian | Guardian dashboard, My invoices, Attendance, My results, Notices, Messages |
| Student | "My Profile" (no dashboard), Attendance, My results, My lectures, My invoices, Timetable |
| Super admin | Control centre, Institutions, Applications, Billing portal, Support access |

**Ranked pain points:**
1. Fake or hard-coded data (listed above).
2. Wrong dashboard for Accountant, Librarian, Transport Officer and Management.
3. Oversized screens:
   - MarksEntry: 1,967 lines
   - Billing portal: 1,593
   - AdminDashboard: 1,176
   - Admission: 1,108 lines with 34 fields on one page
   - Users: a 42-field modal
4. Almost no error states. Failed requests look like "no data", and errors often show twice.
5. Tables not usable on phones, which hurts guardian and student screens most. **Fixed in the shared table.**
6. Inline validation exists in only 4 forms.
7. Inconsistent design: about 5,700 raw colour classes, unused primitives, hand-built modals. **Tokens fixed in Phase 2.**
8. Accessibility:
   - Labels are not linked to their fields.
   - Icon buttons are labelled only by a tooltip.
   - No dialog semantics.
   - 895 uses of a failing grey. **The token and component parts are fixed in Phase 2.**
9. A 754 KB main bundle, Inter loaded twice, no Bangla. **Fixed in Phase 2.**
10. Unguarded routes: `/fees`, `/library` and `/transport` open the staff screens to any role that types the URL. The data is still guarded by the backend.

---

## D. Security and quality

- **Authentication:**
  - Tokens (including the 7-day refresh token) are kept in `localStorage`/`sessionStorage`, so XSS can steal them.
  - Refresh-token lifetime is hard-coded to 7 days, and there is no reuse detection.
  - Changing a password does not revoke other sessions.
  - Access tokens (15 min) can't be revoked early.
  - No "log out all devices".
  - Password rules are inconsistent.
  - No `trust proxy`, so rate limits may share one bucket behind a proxy.
- **Role checks:** U5 above. Ending a support session doesn't revoke its JWT, and writes made during a session are logged under the target user.
- **Audit log:** missing on fees, library, transport, users, guardians, academics, curriculum, messages, auth and billing. It stores passwords (U3), and its history is deleted along with the user.
- **Validation:** zod coverage is good. The gaps are `javascript:` URLs (U4), the online-payment `callbackUrl`, and message length.
- **Secrets:** none tracked in git. Seed, demo and test credentials are hard-coded (`admin123`), the login page shows demo accounts, and uploads use an unsigned Cloudinary preset.
- **Uploads:** multer has a 5 MB limit but no MIME check, and parses with xlsx 0.18.5, which has known CVEs. Documents are stored as Base64 in the database.
- **Payments:** U2 replay; anyone can mark a pending payment FAILED; fee gateways are stubs.
- **Performance:**
  - AI risk scoring loads every attendance and exam row.
  - Conversation lists and several lookups are unpaginated.
  - ID-card generation has an N+1 query.
  - Many pages fetch 100–1,000 rows at a time.
- **Tests and build:**
  - Backend and frontend `tsc`: 0 errors.
  - 24 backend jest suites; not run to completion (see U7).
  - **No frontend tests.**
- **Accessibility:**
  - 303 inputs, but only 62 `htmlFor` and 75 `aria-label`.
  - No focus-visible styles.
  - Failing contrast: slate-400 text, and white text on emerald, amber and red. **Phase 2 tokens fix all of these.**

---

## E. Recommendations

### E1. Redesign order (Phase 3)

1. **App shell and design system.** Done in Phase 2.
2. **Dashboards per role.** Admin and management, teacher, accountant, guardian, and student. Remove the fake figures. Accountant, librarian, transport and student dashboards need data that only `/reports/admin-overview` returns today. **DECISION:** reuse that endpoint as-is, or approve role-scoped report endpoints.
3. **Students.** List, a tabbed profile page (overview, academics, attendance, fees, documents, guardian, transport, library, timeline), and admission as a multi-step form. Plus online registrations, roll numbers and bulk import.
4. **Attendance.** A keyboard-driven grid, using the school's real classes instead of the hard-coded list.
5. **Results.** A marks-entry grid with keyboard navigation, marksheet and report card print, and AI remarks labelled "review before sending".
6. **Fees.** Invoices with due/paid/partial status, payment history, one-click receipt printing (`PrintLayout`), and guardian mobile-first "My invoices".
7. **Guardian and student portals.** Mobile-first.
8. HR and payroll (remove the hard-coded periods), leave, holidays and events.
9. Library, transport, ID cards, notices and messages, timetable.
10. Settings and security, users.
11. Super-admin console as a separate area.
12. Public and auth pages.

### E2. Missing features to build later (for approval)

| # | Feature | Effort | New tables | New endpoints |
|---|---|---|---|---|
| 1 | **Security fixes U1–U6** (role escalation, payment replay, audit redaction, URL scheme validation, guards on reports and AI, invoice uniqueness) | S | Index change only (U6) | No |
| 2 | Fix the broken library book edit/delete and transport route edit (add the missing PUT/DELETE endpoints) | S | No | Yes |
| 3 | Real online fee payments (reuse the billing SSLCommerz code; then bKash and Nagad) + IPN | M–L | Yes | Yes |
| 4 | Bulk invoicing (class × month) + OVERDUE job | M | Optional | Yes |
| 5 | Fee receipt PDF + list of individual payments | S | No | Yes |
| 6 | Move reminders to `notify()` with de-duplication; production email provider; notification-preference UI | S | No | No |
| 7 | Role-scoped dashboards and report endpoints with filters + CSV/Excel/PDF export | M | No | Yes |
| 8 | Promotion / year rollover, merit lists, transcripts | M | Optional | Yes |
| 9 | Grading scales per school | M | Yes | Yes |
| 10 | Subject-wise attendance + staff attendance | M | Yes | Yes |
| 11 | Payroll: salary components, monthly batch run, payslips, reports | M | Yes | Yes |
| 12 | Branch/campus management + branch switcher | M | No | Yes |
| 13 | Institution settings: timezone, date format, numerals, currency (a Phase 2 per-browser fallback exists) | S | Columns | Yes |
| 14 | Plan limits + feature flags (enables `UpgradePrompt`) | M | Yes | Yes |
| 15 | Admin bulk SMS/email, class-specific notices, scheduled messages | M | Columns | Yes |
| 16 | Admission enquiries + applicant status tracking | S–M | Yes | Yes |
| 17 | Student profile extras: previous school, medical, emergency contacts, timeline, custom fields | M | Yes | Yes |
| 18 | Backups + tested restore; error tracking; uptime monitoring | S–M | No | No |
| 19 | Real LLM-backed AI (server-side, staff-review workflow) | L | Yes | Yes |
| 20 | Inventory and assets module | L | Yes | Yes |
