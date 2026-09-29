# Website v3 + Email — Research Findings and Build Plan

Status: **plan for owner approval** (2026-09-29). Nothing below is built yet except the small partial work noted in §6.

## 1. What the research found

### Bangladeshi school websites
- **The government requires it.** DSHE (মাউশি) has ordered every government and private school and college to keep its own up-to-date website and submit the URL to emis.gov.bd. The order lists **11 required items**:
  1. প্রতিষ্ঠান পরিচিতি (institution introduction)
  2. পাঠদানের অনুমতি ও স্বীকৃতি (teaching permission and recognition)
  3. শ্রেণি ও লিঙ্গভিত্তিক শিক্ষার্থী (students by class and gender)
  4. শ্রেণিভিত্তিক অনুমোদিত শাখা (approved sections per class)
  5. পাঠদান তথ্য: routine with teacher names, syllabus, notices
  6. এমপিও/জাতীয়করণ (MPO and nationalisation, where it applies)
  7. Contact details
  8. তথ্যসেবা কেন্দ্র (information service centre)
  9. অভিযোগ নিষ্পত্তি কর্মকর্তা (complaints officer)
  10. Head, teachers and staff
  11. ম্যানেজিং কমিটি (managing committee)
- **The first reference PDF is a School360 site.** Its menu follows these 11 items, plus admission, results, payment, galleries, head's message, hotlines and a visitor counter. The second PDF is an English-medium site: About, Academics, Admission, Teachers by campus, Payment, Career, Blog, Campuses, Gallery, E-Library.
- **Items that should come from the SMS automatically:** notices, results, routine, teacher and staff list, class and gender counts, sections, admissions, holidays, gallery.
- **Items the school types:** history, recognition and MPO, head's message, hotlines, complaints officer, information centre.

### What our system has today
- **Already live:** notices, events and holidays, teachers (TEACHER role only), toppers, results lookup, class routine, counts, fee link, blog, courses, shop.
- **In the database but not on the site:** head and management staff, class teachers, class and gender counts, sections, subjects, exam routine, result summaries (pass rate, GPA-5), fee chart, holiday calendar, library catalogue, transport routes, branches, `Institution.aboutText`.
- **Missing from the database:**
  - Bangla name, EIIN, established year, MPO and recognition fields
  - managing committee
  - admission circulars
  - photo albums
  - public downloads
  - information officer and complaints officer
- **Bug:** new site settings are saved but never shown publicly. The public API sends only a whitelist of keys (`PUBLIC_SETTING_KEYS`, `sites.logic.ts:521`).
- **Limitation:** tokens are plain text substitution only. Lists must come from data-bound blocks.

### Email today
- **Transport:** Brevo is already live over **SMTP** in production. There is no API mode, no retry for direct mail, no bounce or spam suppression, and no unsubscribe.
- **Design:** only the 4 auth emails use HTML. Everything else is plain text, and none has Bangla.
- **Emails that are never sent:**
  - new-school approval (the generated admin password is never delivered)
  - staff invites
  - enquiry acknowledgements
  - form-submitter confirmations
  - support tickets
  - results
  - payslips
  - data exports
  - course enrolment
  - learner welcome and password reset
  - fee reminders (sent by SMS only)
- **Demo mode is misleading:** demo sends are recorded as "SENT".
- **Brevo best practice:**
  - Send through the REST API (`/v3/smtp/email`) with idempotency keys and tags, and keep SMTP as the fallback.
  - Authenticate the domain: brevo-code TXT, two DKIM CNAMEs, DMARC starting at `p=none`.
  - Use webhooks to suppress hard bounces, spam complaints and blocked addresses.
  - Add one-click `List-Unsubscribe` **only** to broadcast mail such as campaigns, never to receipts or OTPs.
  - The free plan is **300 emails/day in total**, too low for fee invoices to every guardian.
- **Bangla in email:** web fonts are unreliable across email clients. Use a system font stack (Noto Sans Bengali, Hind Siliguri, Nirmala UI, Vrinda, Kohinoor Bangla), set `lang="bn"`, and never put text in images.

### AI website ZIP import
- **What the tools export:** Claude gives a single HTML file (usually with the Tailwind CDN). Bolt and Lovable give Vite + React **source**. v0 gives Next.js source.
- **What other builders do:** Webflow and Wix don't convert HTML into editable blocks. They offer embeds or hosting only.
- **Realistic scope:**
  - Accept one `.html` file, or a ZIP of **built static files** (HTML, CSS, JS, images, fonts; e.g. a `dist/` folder).
  - Store each page as a sandboxed code page.
  - Reject source projects and server apps with a "run `npm run build` and upload dist/" message.

## 2. Principles for this build
1. **Dynamic by default.** A template never contains hand-typed school facts. Every list (teachers, notices, committee, results, routine, gallery, downloads) is a data-bound block that reads the school's live SMS data.
2. **Compliant out of the box.** Each Bangladeshi template covers the 11 DSHE items. The admin shows a checklist of what's filled and what's missing.
3. **Private data stays private.** Only public-safe fields are shown. Staff appear only if the school opts them in. Per-student data appears only through the existing date-of-birth-gated lookup.
4. **Additive only:** new tables and fields only, one migration per phase, local database first.
5. **One email pipeline:** every email goes through one sender, one layout, one log, one suppression list and one demo mode.

## 3. Build plan (4 tracks, run in parallel where they don't touch the same files)

### Track A — Email (backend `modules/email`, `utils/mailer.ts`, callers)
- **A1 Transport:**
  - Use the Brevo REST API when `BREVO_API_KEY` is set. Otherwise use the current SMTP settings, so today's production setup keeps working.
  - Add an idempotency key, tags (template and school), a timeout, and retry through the queue.
  - Honest demo mode: record SKIPPED, not SENT.
  - Add a local **suppression list** fed by a Brevo webhook (`/api/v1/email/webhooks/brevo`, protected by a secret token).
- **A2 Layout:**
  - One responsive layout (600px, table-based, dark-mode safe) with the school's logo, name and colour, a preheader and a bulletproof button.
  - Bangla font stack, and EN/BN copy for every template.
  - A plain-text version is always generated.
  - Written in plain TypeScript with escaping, continuing the partial `modules/email` code. No new framework is needed at about 40 templates.
- **A3 Convert and add:**
  - Move every existing email to the layout, and send notification-pipeline emails as HTML.
  - Add the missing emails listed in §1.
  - Fee reminders also go by email.
  - Campaigns get `List-Unsubscribe` and an unsubscribe page, and respect notification preferences.
- **A4 Admin:**
  - Email settings screen (Super Admin): transport status, test send, recent delivery log with bounces.
  - Per-school template overrides using the existing `NotificationTemplate` API, which has no UI yet.
  - Preview gallery of all templates.

### Track B — Dynamic data layer (backend `modules/sites`, schema) → then Track C
- **B1 Institution profile fields:**
  - Bangla name, EIIN, established year, MPO, recognition, information officer, complaints officer.
  - Head of institution: which staff member it is, or name + photo.
- **B2 New models:**
  - `SiteCommitteeMember` (name, role, photo, order)
  - `SiteAlbum` + photos
  - `SiteDownload` (title, category, file URL, date)
  - `SiteAdmissionCircular` (session, class, dates, fee, PDF, apply link)
  - staff opt-in `showOnWebsite` flag
- **B3 New public data sources:**
  - staff by category (head, teachers, staff), with class-teacher info
  - class and gender counts, sections, subjects
  - exam routine
  - result summary (pass rate, GPA-5 per class), results archive
  - fee chart (opt-in)
  - holiday calendar
  - library catalogue (opt-in), transport routes (opt-in), branches
  - committee, albums, downloads, admission circulars
- **B4 Detail pages:** `/notice/:id`, `/teacher/:id`, `/album/:id`, `/admission/:id`, each with SEO.
- **B5 Fixes and extras:**
  - Fix the settings whitelist bug.
  - Expose all public tokens (`{{institution.eiin}}`, `{{head.name}}`…) to code and imported pages through the sandbox bridge (`SITE.data('notices')`).

### Track C — Portal templates (frontend `site/**`, after B's contract is fixed)
- **C1 Header and footer styles:** portal, corporate, banner, centred, minimal, plus the current modern style. Also boxed or full-width layout, a patterned background, and a top bar (date in Bangla, contact, social, login links). Reuses the partial code in §6.
- **C2 A generic "Data list" block:** pick any source → filter, sort, limit → choose a layout (list, cards, table, grid, ticker, slider). This is the Webflow "collection list" pattern. Portal blocks are presets of it: info-box grid, notice board, news ticker, committee, staff directory, downloads, albums, admission circulars, results summary, hotlines, Facebook page, video gallery, anthem player, sidebar layout.
- **C3 Templates:**
  - `bangla-portal` (style of PDF 1)
  - `english-medium-corporate` (style of PDF 2)
  - six more: `portal-green`, `madrasa-portal`, `college-classic`, `kindergarten-bright`, `modern-bangla`, `newspaper-style`
  - All are data-bound and DSHE-complete, copying the layout only, never another school's branding.
- **C4 Admin (frontend `pages/website`):**
  - Screens for committee, albums, downloads, admission circulars and profile fields.
  - Staff "show on website" toggles.
  - DSHE compliance checklist on the Overview tab.
  - Header, footer and top-bar pickers on the Design tab.

### Track D — ZIP import (frontend `pages/website/import`)
- Accept a single HTML file or a ZIP of built static files, up to 50 MB / 500 files. Block path traversal.
- Reject source projects with guidance.
- Assets go to Cloudinary and the media library, deduplicated. CSS and JS are inlined. Links map to site pages.
- A review screen before saving (pages, slugs, home page, header and footer choice, conflicts). Pages are saved as drafts.

### Order
| Step | Runs | Why |
|---|---|---|
| 1 | A (email) ‖ B (data layer) ‖ D (ZIP import) | They touch separate files |
| 2 | C (templates and admin screens) | Needs B's data sources |
| 3 | Joint QA | Local database end to end: every email previewed, templates checked at 360px, one DSHE checklist fully green, sample Claude HTML and a Vite `dist/` imported |

## 4. Owner decisions (answered 2026-09-29)

| # | Decision | What it means for the build |
|---|---|---|
| 1 | Sending domain **`mail.eoncodigital.com`** | From address `no-reply@mail.eoncodigital.com` (from `EMAIL_FROM`), display name = school name (or "PeopleNIT SMS" for platform mail), reply-to = school email. The owner must authenticate this domain in Brevo; the build ships a DNS checklist. |
| 2 | **Stay on the Brevo free plan** (300/day total) | Track A adds a **daily send budget** (`EMAIL_DAILY_LIMIT`, default 300, counted per UTC day in Redis with a DB fallback). Priority: P0 security (OTP, reset, verify, invites, credentials) always sends and is reserved 50 of the budget. P1 transactional (receipts, orders, enrolment, approvals) comes next. P2 bulk (invoices to all, reminders, campaigns, reports) is deferred to the next day when the budget is spent. The admin shows the remaining budget, and campaigns warn before sending. |
| 3 | **Staff hidden until opted in** | New `showOnWebsite` flag defaults to false for teachers and staff. **Behaviour change:** the existing Teacher directory block is empty until the school opts people in. The block's editor preview shows a hint linking to the staff toggles. |
| 4 | **"Powered by PeopleNIT" footer credit, removable on paid plans** | Shown by default. `settings.hidePoweredBy` is honoured only when the school's plan has the feature `website_remove_branding` (existing PlanFeature/FeatureFlag system). The backend enforces this in resolve, so it can't be removed with a crafted request. |

## 4a. Original decision list
1. **Sending domain.** Which domain should school email come from, e.g. `mail.peoplenit.com`? It must be authenticated in Brevo (brevo-code TXT, two DKIM CNAMEs, DMARC). Schools send as "School Name" with reply-to set to the school's email, using our domain.
2. **Brevo plan.** Free is 300 emails/day in total. Invoices and reminders to all guardians need a paid plan (Starter, no daily cap).
3. **Brevo API key.** Add `BREVO_API_KEY` to production to switch to the API. Without it, email keeps using the current SMTP settings.
4. **Staff on the website.** Should staff be hidden until each is opted in (safer), or teachers shown by default as today?
5. **"Powered by PeopleNIT" footer credit** on school sites: on, off, or on for the free plan only?

## 5. Out of scope for now
- Converting imported HTML into editable blocks (no major builder does this reliably).
- Building source projects on upload.
- A custom sending domain per school.
- Server-side rendering.

## 6. Partial work already on disk (uncommitted, will be reused)
- **Email:** Brevo variable names in `env.ts` and the start of `modules/email` (layout, escaping, auth templates). The auth mail already uses them.
- **Site:** header, footer and layout style types and normalisers in `site/types.ts` and `site/theme.ts`, plus CSS in `site.css`, where one invalid rule needs fixing.
- **Frontend:** `fflate` added to `frontend/package.json` for the ZIP import.

## 7. Track B contract (built 2026-09-29)

Everything below is live on the local database (migration
`20260929200000_sites_portal_data`, applied). Backend files:
`backend/src/modules/sites/sites.portal.logic.ts` (pure logic),
`sites.portal.dto.ts` (zod), `sites.portal.service.ts` (admin),
`sites.portal.public.service.ts` (public), `sites.portal.controller.ts`,
and edits to `sites.routes.ts`, `sites.public.service.ts`, `sites.logic.ts`,
`sites.data.service.ts`, `prisma/schema.prisma`,
`backend/src/modules/saas/entitlements.logic.ts`.

### 7.1 Schema decisions

- **B1 profile fields live on `Institution`** (additive nullable columns), not
  a new `SiteProfile` model: `nameBn`, `eiin`, `establishedYear`, `mpoInfo`,
  `recognitionInfo` (flat columns), plus three `Json?` columns —
  `headOfInstitution` (`{ userId?, name?, photoUrl?, designation? }` — a
  union: pick a staff member OR type a name), `informationOfficer` and
  `complaintsOfficer` (both `{ name?, designation?, phone?, email? }`). These
  are singular per-institution facts, exactly like the existing `aboutText` /
  `contactEmail` columns — a 1:1 model would only earn its keep for
  one-to-many data. Note `Site.settings.establishedYear` (v1) still exists
  for backward compatibility; the profile's `establishedYear` on `Institution`
  is now canonical and is what new code should read (public `profile`/`stats`
  fall back to the old setting only if the new column is null).
- **B2 `showOnWebsite` lives on `User`** (`Boolean @default(false)`), not on
  `Teacher`/`StaffProfile`. Not every `TEACHER` has a `Teacher` row and not
  every staff member has a `StaffProfile` row; `User` is the one place
  guaranteed to exist for every account regardless of role.
- **B2 new models**: `SiteCommitteeMember`, `SiteAlbum` + `SiteAlbumPhoto`,
  `SiteDownload`, `SiteAdmissionCircular` — all with `siteId` + `institutionId`
  (tenant filter on every query). Album/download/admission `status` reuses
  the existing `SiteStatus` enum (`DRAFT`/`PUBLISHED`) rather than a new one;
  an admission circular's "closed" state is derived from `endDate` at read
  time (`closed: endDate < now`), not stored.
- **B5 branding feature**: `FeatureFlag` key `website_remove_branding` (added
  to `FEATURE_CATALOG` in `entitlements.logic.ts`, seeded by the migration
  with `defaultEnabled = false`). Resolved through the existing
  override → plan-feature → flag-default → enabled chain
  (`entitlements.service.isFeatureEnabled`).

### 7.2 Admin endpoints — `/api/v1/sites` (SUPER_ADMIN/ADMIN, tenant-isolated,
audit-logged via the router-level `auditLog` middleware, zod-validated)

| Method & path | Body / query | Notes |
|---|---|---|
| `GET /profile` | — | Institution profile fields; `headOfInstitution` resolved against the live `User` row when it names one (name/photo stay in sync automatically). |
| `PUT /profile` | `UpdateProfileDto` | Partial; `headOfInstitution.userId` must be an active user of this institution. |
| `GET /me/compliance` | — | `{ items: ComplianceItem[], filled, total }` — see §7.5. |
| `GET /staff-visibility` | `?role=TEACHER\|STAFF&q=&page=&pageSize=` | Paginated list of staff/teacher `User`s with current `showOnWebsite`. |
| `PUT /staff-visibility` | `{ userIds: string[], showOnWebsite: boolean }` | Bulk toggle. |
| `GET/POST /committee` | `CreateCommitteeMemberDto` | `{ name, nameBn?, role, roleBn?, photoUrl?, phone?, showPhone, sortOrder? }`. |
| `PUT/DELETE /committee/:id` | `UpdateCommitteeMemberDto` (partial) | |
| `GET/POST /albums` | `CreateAlbumDto` | `{ title, titleBn?, coverUrl?, description?, eventDate?, status, sortOrder? }`; list items include `photoCount`. |
| `GET/PUT/DELETE /albums/:id` | `UpdateAlbumDto` (partial) | Detail includes `photos: SiteAlbumPhoto[]`. |
| `POST /albums/:id/photos` | `{ url, caption? }` | Appends, auto `sortOrder`. |
| `PUT /albums/:id/photos/order` | `{ ids: string[] }` | Reorders all photos in the album. |
| `PUT/DELETE /albums/:id/photos/:photoId` | `{ caption?, sortOrder? }` | |
| `GET/POST /downloads` | `CreateDownloadDto` | `{ title, titleBn?, category, fileUrl, publishedAt?, status, sortOrder? }`. |
| `PUT/DELETE /downloads/:id` | `UpdateDownloadDto` (partial) | |
| `GET/POST /admissions` | `CreateAdmissionDto` | `{ session, classNames: string[], title, titleBn?, body (HTML), startDate?, endDate?, fee?, pdfUrl?, applyUrl?, formId?, status, sortOrder? }`; `formId` (if given) must be a `SiteForm` on this site. |
| `GET/PUT/DELETE /admissions/:id` | `UpdateAdmissionDto` (partial) | |

### 7.3 Public data endpoints — `/api/v1/public/sites/:siteId/data/*`

Same conventions as the v1 endpoints: PUBLISHED-only unless a valid preview
token is presented (`?preview=` or `X-Site-Preview`), responses cached
`public, max-age=<n>` when not previewing and `private, no-store` when
previewing. All existing v1 endpoints (`notices`, `events`, `teachers`,
`exams`, `toppers`, `results-lookup`, `routine`, `stats`, `fees-link`,
`courses`) are unchanged and still work — **except** `teachers`, which now
also requires `showOnWebsite = true` (owner decision 3; previously every
active `TEACHER` was listed unconditionally).

| Path | Query | Gate | Response shape |
|---|---|---|---|
| `data/profile` | — | — | `{ name, nameBn, slug, eiin, establishedYear, mpoInfo, recognitionInfo, aboutText, logoUrl, contact: { address, phone, email }, informationOfficer, complaintsOfficer, headOfInstitution: PublicStaffMember\|null }`. Officer contacts are deliberately public (DSHE items 8/9 are meant to be published). |
| `data/staff` | `category=head\|teachers\|staff` (default `teachers`) | `teachers`/`staff`: `showOnWebsite=true`. `head`: none (explicit admin config). | `{ items: PublicStaffMember[] }` — `{ name, designation, department, subject, qualification, photoUrl, classTeacherOf: string[] }`. No phone/email/DOB/salary/userId ever. `staff` = non-`TEACHER` roles in `entitlements.STAFF_ROLES` (ADMIN, ACCOUNTANT, LIBRARIAN, TRANSPORT_OFFICER, MANAGEMENT). |
| `data/class-stats` | — | — | `{ items: [{ className, sections: string[], genderCounts: { male, female, other, total } }] }` — counts only, no student names/ids. |
| `data/subjects` | `class?` | — | `{ items: [{ className, group, subject, paper, isGraded }] }` from `SubjectOffering`. |
| `data/exam-routine` | `examId?, class?` | — | No `examId`: `{ exams: [{id,name,startDate,endDate}], slots: [] }`. With `examId`: `{ exams: [], slots: [{className,sectionName,subjectName,date,startTime,endTime,room}] }` from `ExamTimetableSlot`. |
| `data/result-summary` | `examId?` | `settings.publicResults \|\| settings.publicResultSummary` | `{ exam: {id,name}\|null, items: [{ className, appeared, passed, passRate, gpa5Count }] }` — no student names/ids/marks. |
| `data/results-archive` | — | `settings.publicResults` | `{ items: [{id,name,startDate,endDate}] }` — published exams only. |
| `data/fee-chart` | — | `settings.publicFeeChart` | `{ items: [{ className, items: [{ category, amount, frequency }] }] }`. |
| `data/holidays` | `year?` (default current) | — | `{ year, items: [{date,title,type,isTentative}] }`. |
| `data/library` | `q?, page, pageSize` | `settings.publicLibrary` | `{ items: [{title,author,category,publisher,availableCopies,available}], total }` (paginated envelope). |
| `data/transport` | — | `settings.publicTransport` | `{ items: [{ id, name, fare, stops: [{name,sequence,pickupTime,dropTime}] }] }` — **no vehicle or driver info at all.** |
| `data/branches` | — | — | `{ items: [{id,name,address,phone,email}] }`. |
| `data/committee` | — | — | `{ items: PublicCommitteeMember[] }` — `phone` is `null` unless the admin set `showPhone`. |
| `data/albums` | `page, pageSize` | PUBLISHED only (unless preview) | Paginated: `{ id, title, titleBn, coverUrl, eventDate, photoCount }`. |
| `data/albums/:id` | — | PUBLISHED only (unless preview) | `{ album: { id,title,titleBn,coverUrl,description,eventDate, photos: [{url,caption}] }, seo: { title, description, image } }`. |
| `data/downloads` | `category?` | PUBLISHED only (unless preview) | `{ items: [{id,title,titleBn,category,fileUrl,publishedAt}] }`. |
| `data/admissions` | `page, pageSize` | PUBLISHED only (unless preview) | Paginated: `{ id, session, classNames, title, titleBn, startDate, endDate, fee, pdfUrl, applyUrl, formId, closed }`. |
| `data/admissions/:id` | — | PUBLISHED only (unless preview) | `{ admission: {...same fields, body}, seo: { title, description, image } }`. |
| `data/notices/:id` | — | Same audience rule as `data/notices` (ALL/PUBLIC, no class/section) | `{ notice: {id,title,content,publishedAt}, seo: {title,description,image:null} }`. |

`seo` on every detail response is **derived, not stored**:
`{ title: <record title>, description: plainTextExcerpt(body/description, 160), image: <cover/pdf/null> }`.

### 7.4 Sitemap (B4)

`GET /:siteId/sitemap.xml` now also lists, for PUBLISHED items only:
- Albums at `/gallery/:id`
- Admission circulars at `/admissions/:id`
- Notices (ALL/PUBLIC audience, no class/section) at `/notices/:id`, capped at
  the 200 most recently published

Track C must use these exact paths for the corresponding public routes.

### 7.5 DSHE compliance checklist

`GET /api/v1/sites/me/compliance` → `{ items: ComplianceItem[], filled, total }`,
one item per DSHE requirement (`backend/src/modules/sites/sites.portal.logic.ts`
`complianceChecklist`), each `{ key, label, labelBn, status: 'filled'|'partial'|'missing', fixAt }`.
Two-part items (profile, teaching info, people) are `partial` when only one
half is present. Keys: `profile`, `recognition`, `class_gender_counts`,
`sections`, `teaching_info`, `mpo`, `contact`, `information_officer`,
`complaints_officer`, `people`, `committee`.

### 7.6 Settings whitelist fix (B5)

`sites.logic.ts` `PUBLIC_SETTING_KEYS` now also allows: `topBar`, `hotlines`,
`importantLinks`, `eServices`, `hidePoweredBy`, `publicResultSummary`,
`publicFeeChart`, `publicLibrary`, `publicTransport`. `headerStyle` /
`footerStyle` need no whitelist entry — they live on `theme`, which
`resolve` already returns unrestricted.

`GET /api/v1/public/sites/resolve` → `site.poweredBy: boolean` is a new,
**server-computed** field (never trust `settings.hidePoweredBy` directly):
`poweredBy = !(settings.hidePoweredBy === true && plan has 'website_remove_branding')`.
Shown by default; hidden only when both conditions hold, so a crafted
request touching settings alone can never remove the footer credit.

### 7.7 Not built in this track

- Teacher detail page (`/teacher/:id`) — not requested in the final task list
  (only albums/admissions/notices detail were).
- Admin UI (Track C's job): staff visibility toggles, committee/album/
  download/admission circular forms, profile screen, compliance checklist
  widget, and the portal template blocks that read all of the above.
