# PeopleIT SMS — Project Status

**Purpose:** this file is the source of truth for "what's left." Read it at the start of every session before deciding scope. Update it (check items off, add newly-discovered items) whenever something is completed or a new gap is found — don't let it drift out of sync with reality.

**Last updated:** 2026-07-17

---

## Phase 0 — Emergency Authorization Lockdown ✅ COMPLETE
Commit: `111fa25`

- [x] Add `requireRole` to `students`, `results`, `hr`, `notices`, `library`, `transport`, `timetables` routes (previously had zero role checks)
- [x] Lock down remaining open `attendance.routes.ts` gaps (`/bulk`, `/sheet`, `/` fallback)
- [x] Fix `requirePermission()` — missing `institutionId` + `granted: true` filter (cross-tenant leak + deny-row-as-allow bug)
- [x] Add `GET /guardians/me/students` self-service route
- [x] Ownership-scope `fee.service.ts` (`getInvoice`/`listInvoices`/`initiateOnlinePayment`) so GUARDIAN/STUDENT can only reach their own/linked invoices
- [x] Stand up Jest + Supertest test infra (`backend/tests/`) — 172-test authorization matrix suite, run against a real DB

## Phase 1 — Correctness Fixes ✅ COMPLETE
Commit: `d1ed98d`

- [x] Fix timetable conflict boundaries (`lte`/`gte` → `lt`/`gt`, was false-flagging back-to-back periods)
- [x] Add section and room double-booking checks (new `TimetableSlot.roomNumber` column + migration)
- [x] Fix `Reports.tsx` field-name mismatches (`averageAttendance`→`attendanceRate`, `activeStaff`→`totalTeachers`)
- [x] Replace hardcoded chart arrays with real last-7-days attendance/fee trend data

## Phase 2 — Pilot-Ready Workflow ✅ COMPLETE
Commit: `9b789af`

- [x] Excel/CSV student bulk import with server-side validation (`POST /students/bulk-import`, multer + xlsx)
- [x] Server-side grade computation (`utils/grading.ts`) — grade is no longer client-supplied input
- [x] Report card PDF generation (`GET /results/:studentId/report-card`, **pdfkit** — not Puppeteer; `reportCard.pdf.ts:110` notes Chromium could not launch on the hosted Node env — ownership-scoped for STUDENT/GUARDIAN)
- [x] Guardian dashboard (`frontend/src/pages/GuardianDashboard.tsx`) — linked children's fees, attendance, report cards
- [x] Real Greenweb SMS integration — fee-due reminders (scheduled via BullMQ delay at invoice creation) + absence reminders (triggered from attendance submission)

## Phase 3 — Usage Metrics ✅ COMPLETE
Commit: `59745f2`

- [x] `BULK_IMPORT_COMPLETED`, `REPORT_CARD_GENERATED`, `GUARDIAN_PORTAL_VIEW` events logged to `AuditLog`

## Phase 3.2 — Commercial Validation ⬜ NOT CODE WORK
Business process, not an engineering task — do not attempt to "complete" this via code:
- [ ] Recruit 3 paid pilot schools (private schools/coaching centres, 300–1,500 students)
- [ ] Test pricing around ৳3,000–৳5,000/month, SMS billed separately
- [ ] Measure onboarding time, teacher attendance usage, completed report-card cycles, guardian usage, admin time saved (the `AuditLog` events above make this queryable — no new code needed to measure it)

---

## Performance Fix ✅ COMPLETE
Commit: `366cdf6`

- [x] Batch the class/section auto-seed inserts (`createMany` instead of ~104 sequential awaited creates on a single GET request)
- [ ] **Open question, not resolved:** remaining ~6.8s latency on that same endpoint in local testing looks environment/network-bound (Neon connection latency from this dev sandbox), not further fixable in code without production timing data. `pgbouncer=true` on `DATABASE_URL` was tried and made it *worse* (11.8s) — do not retry that without re-measuring first. If the user reports specific slow endpoints from real Render/production logs, investigate those directly rather than guessing.

---

## Live Bug Reports — Human Tester on Deployed App (2026-07-21)

Found by manual testing against the live Vercel/Render deployment with real seeded data — distinct from the subagent-tester findings above, which test code paths, not deployed data/config. Priority order: 3 → 4 → 1 → 5 → 2 (broken money flow, broken tenant-scoped write, broken core workflow, then UX polish, then a feature request).

- [x] **Bug 3 — Record Payment fails.** Invoice has `dueAmount: 0` but still showed the Record Payment action; separately, submitting the sensibly pre-filled due amount *unedited* 422'd for ANY invoice (Prisma serializes `Decimal` as a JSON string; `InvoiceList.tsx` never coerced it to `Number` before sending). Backend: `fee.service.ts#recordOfflinePayment` now rejects `dueAmount <= 0`/`status: PAID` with a clear 400 "Invoice is already fully paid", plus an `amount <= 0` guard. Frontend: hides/disables Record Payment for fully-paid invoices, shows a clear "already fully paid" message if reached via stale state, and coerces the amount to `Number` at both the pre-fill and the POST body (the actual root cause a first tester-evaluator pass caught live). Tester-evaluator PASS on final re-verification — reproduced the original defect and the fix live end-to-end through the real running app + DB (invoice moved `dueAmount: 777/UNPAID` → `0/PAID` with a real Payment row), 11/11 backend tests, tenant/role scoping reconfirmed intact. Minor non-blocking note: one regression test's name overclaims what it tests (converts to `Number` before sending, so doesn't exercise the raw-string HTTP payload) — worth a docstring/test fix later, not blocking.
- [x] **Bug 4 — Add Class Schedule fails.** `Branch with ID 'clbranch00000000000000000' not found under this institution` — `TimetableGrid.tsx` was sending a hardcoded placeholder branch ID. Fixed by resolving a real `branchId` from the existing (already tenant-scoped, self-healing) `GET /students/meta/classes` endpoint instead of inventing new plumbing; submit is guarded/disabled until it resolves. Backend's tenant-scoped rejection left untouched, reconfirmed intact. Tester-evaluator PASS — verified end-to-end against the real backend (not just code tracing) with a new `backend/tests/timetable-branch-resolution.test.ts` (6/6: self-healing branch creation, real happy-path schedule creation, regression guard on the old placeholder, tenant isolation, role boundaries).
- [ ] **Bug 1 — Attendance register shows "No students found under Class 8 Section A" despite students existing — INVESTIGATED (2026-07-21), academic-year hypothesis REFUTED, no code fix applied/needed, root cause is data/deployment, not code. Stays unchecked pending live re-verification (or the missing "Add Student" UI follow-up, if that turns out to be the real explanation).** Read `attendance.repository.ts#getAttendanceSheet` (the function backing `GET /attendance/sheet`, which is what `AttendanceEntry.tsx`'s "Attendance Register" screen actually calls) in full: its student query is `where: { institutionId, class: { name: className }, section: { name: sectionName }, status: 'ACTIVE' }` — **there is no `academicYearId` filter, or any date-derived filter, anywhere in this query.** Confirmed independently of the parallel Bug 5 finding that `Institution` has no real academic-year field at all (the "2023-2024" the tester saw is Settings.tsx's hardcoded, never-persisted frontend default — unrelated). Also checked both demo seed scripts (`prisma/seed.ts`, `prisma/seed_demo_data.ts`): both set the seeded `AcademicYear.label` to `"2026"`/`isCurrent: true`, not "2023-2024" — further evidence against the hypothesis as stated. Wrote `backend/tests/attendance-sheet.test.ts` (3 tests, all passing) proving the query returns a properly-enrolled Class 8/Section A student regardless of whether they're linked to a stale non-current academic year, a current one, or none at all — the query is genuinely academic-year-agnostic by design, not by accident. **Conclusion: this is not a code bug.** For "students exist but don't show," the only two plausible explanations both point outside this query: (a) the live institution the tester used genuinely has no students matching that exact class+section+ACTIVE-status combo (the query is behaving correctly on empty/mismatched data), or (b) — the more interesting finding — **there is currently no "Add Student" or "Bulk Import" UI anywhere in the frontend at all** (grepped `frontend/src`, confirmed `POST /students` and `POST /students/bulk-import` are fully built server-side per Phase 2 but have zero frontend callers; `StudentList.tsx` only has Edit/Delete). The only way students exist in any environment today is via the demo seed scripts or a direct API call. If the live deployment's institution never had a seed script run against it, "no students found" is 100% accurate, not a bug — worth adding "Add Student" / wiring up the existing bulk-import UI as a real, separate follow-up item (see Medium-Priority Cleanup below), since without it no real customer can ever onboard students through the product at all. Also reviewed the "Assign Class Teacher" button placement the tester flagged: it lives in `AttendanceEntry.tsx`'s header, next to "Attendance Register" — this is a UX/frontend judgment call (teacher-section assignment is a one-time admin-setup action, arguably belongs under a Classes/Sections or Staff management screen instead of the daily attendance-taking screen), flagging back for a product decision rather than moving it unilaterally.
- [x] **Bug 5 — Settings/notification UX.** (a) Institution Profile fields never prefilled/saved because `PUT /institution/website`'s DTO silently stripped `name`/`phone`/`email`/`address`/`logoUrl` (all real Institution columns) — extended the DTO + repository `select` to include them, fixed a frontend `institutionName`↔`name` field-name mismatch, and removed 4 fields (`academicYear`/`gradingSystem`/`termStructure`/`primaryColor`) that had zero backend representation anywhere rather than leaving a fake "saves nothing" UI. (b) Notification bell had no handler and a badge driven by hardcoded fake demo data — wired to navigate to the existing real `/notices` page, removed the fake badge rather than keep it wired to fake data. **Security finding during verification:** `GET/PUT /institution/website` had no `requireRole` at all — proven live that a STUDENT token could rename the institution via a normal PUT. Fixed: `PUT` now requires SUPER_ADMIN/ADMIN; `GET` deliberately left open (GuardianDashboard legitimately depends on it for non-sensitive contact info, confirmed no secret fields in the response). Tester-evaluator PASS — exploit reproduced-then-confirmed-closed independently, 210/210 tests, legitimate admin path still works. Minor pre-existing non-blocker noted: SUPER_ADMIN 500s on this tenant-scoped route (no institutionId on that role's JWT) — not a regression, not a security hole, worth a follow-up ticket. Follow-up also noted: `uiStore.ts`'s now-fully-dead hardcoded notification state was left in place, out of scope.
- [x] **Bug 2 — Results page needs a real marksheet table** (feature request, not a bug). Added `GET /results/marksheet?examId=&classId=&sectionId=` (STAFF_ROLES-gated, tenant-scoped), computing `highestMarkInSubject` as the true max across the whole queried class/section/exam result set (not per-student). New "Student Marksheet" tab in `MarksEntry.tsx` (staff page, existing tabs untouched; `MyExamResults.tsx` student/guardian self-service page also untouched), reuses existing exam/class/section selectors, renders via `DataTable`/`StatusBadge`/`EmptyState`. Tester-evaluator PASS — independently verified the class-wide (not per-student) aggregate correctness with a live 3-student cross-section test, tenant/role scoping, route ordering, full 269-test regression suite green.

**Process note:** this human-tester loop (tester finds → item added here → fixed → re-verified on the live URL) catches what the subagent tester can't — bugs that live in deployed data/config, not the code paths automated tests exercise. **Correction (2026-07-21):** Bug 1 was originally written up here as "the clearest example" of an academic-year code mismatch — investigation traced the actual query code and found this was wrong. There is no academic-year filter in the attendance-register query at all, and the `Institution` model has no academic-year field for anything to read in the first place (see Bug 1 entry above and the parallel Bug 5 Settings finding). Leaving this note as a reminder: a tester's stated hypothesis for *why* something is broken is not itself verified fact — always trace the actual code/data before accepting it, even when the *symptom* (no students found) is real.

---

## Phase 4 — Notification System ✅ PR1-PR3 COMPLETE

Unified outbound messaging: one entry point, pluggable channels, templates,
queue-backed delivery with retry + idempotency, per-user preferences.
Rule-book: `.antigravity/skills/notification-delivery.md`.

- [x] **PR1 — in-app core.** `Notification` model (migration `add_notifications`);
      `modules/notifications/` (routes/controller/service/repository/dto);
      `GET /notifications`, `POST /:id/read`, `POST /read-all` — ownership-scoped
      via `req.user.sub`, not role-gated. `fee.service.createInvoice` emits
      `INVOICE_ISSUED`. Frontend `api/notifications.api.ts` +
      `hooks/useNotifications.ts`; the header bell now reads real data.
      **Removed the 3 hard-coded fake notifications from `store/uiStore.ts`**
      (they reappeared on every reload and `addNotification` had zero callers).
- [x] **PR2 — delivery backbone.** `NotificationDelivery` + `NotificationPreference`
      + `NotificationChannel`/`NotificationDeliveryStatus` enums (migration
      `add_notification_delivery_and_preferences`). `queues/notificationQueue.ts`
      is the first queue in this codebase with `defaultJobOptions`
      (attempts 5, exponential backoff, removeOnComplete/Fail);
      `queues/notificationWorker.ts` exports a pure `deliverNotification()` for
      tests, like `billingWorker`. Idempotency is two-layer: BullMQ
      `jobId = dedupeKey`, plus the durable unique `NotificationDelivery.dedupeKey`
      with a status-guarded claim. `GET/PUT /notifications/preferences`
      (absent row = enabled; opt-outs are recorded as SKIPPED, never dropped).
      Worker registered + closed in `server.ts`.
- [x] **PR3 — email + SMS channels + templates.** `nodemailer` added;
      `config/env.ts` gained the email block with a `superRefine` that fails boot
      if `EMAIL_ENABLED=true` without SMTP creds (same contract as SSLCommerz).
      `NotificationTemplate` model (migration `add_notification_templates`) —
      tenant override falls back to bundled `templates.defaults.ts` (4 types x
      3 channels). Channel adapters in `modules/notifications/channels/`
      (`inApp`, `email`, `sms`). `fee.service.recordOfflinePayment` emits
      `PAYMENT_RECEIVED`. Admin-only `GET /notifications/templates`,
      `PUT /notifications/templates/:key/:channel`, `POST /notifications/test`.
      **Email works with no provider account**: `EMAIL_ENABLED=false` renders
      through nodemailer `jsonTransport`, and
      `npx ts-node backend/scripts/preview-email.ts` sends via a throwaway
      Ethereal inbox and prints a live preview URL (no signup, no domain).

### Notification system — operational finding (2026-09-03)
- [ ] **The Upstash instance in `.env` is unreachable** (`great-griffon-42513.upstash.io`
      refuses connections). Everything queue-backed — notification delivery, the
      `feeReminders` SMS jobs, the daily `subscriptionBilling` scan — is therefore
      inert in this environment: jobs are accepted by the API and never delivered.
      Discovered while regression-testing the notification build. Two consequences
      already handled in code: `enqueueNotification()` now bounds `.add()` with a
      5s timeout (BullMQ's `maxRetriesPerRequest: null` otherwise leaves a pending
      promise forever per notification), and `notify()` catches per job so one dead
      channel cannot stop the rest. **Local dev now points `REDIS_URL` at the docker-compose redis**
      (`redis://:sms_redis_pass@localhost:6379`; old Upstash value kept as a
      comment in `backend/.env`, and `backend/.env.bak.20260903`). Production
      still needs a real reachable instance.

### Notification system — in-app bell decoupled from Redis (2026-09-07)
- [x] **IN_APP notifications are now written synchronously in `notify()`**, not via
      the queue. TS-2/TS-3 QA on production: the bell showed no count and a real
      fee invoice produced no notification, even though the invoice itself landed.
      Root cause: every channel — including IN_APP — was routed through BullMQ, so
      whenever the production worker/queue wasn't draining (misconfigured
      `REDIS_URL`, Upstash free-tier command budget, a transient outage) the one
      channel users actually watch went silently empty. Fix: `notifications.service.ts`
      now has `deliverInAppNow()` — same `dedupeKey` → same status-guarded
      `NotificationDelivery` claim the worker uses → `notification.create` →
      `markDeliverySent`, all in-band. EMAIL/SMS still enqueue (they need
      retry/backoff and must not block the request). The worker's IN_APP adapter
      is unchanged and harmless: a stray queued IN_APP job from an older build
      no-ops on the `status === 'SENT'` guard. `notifications.test.ts` updated
      (IN_APP asserted as an inline DB write, not an enqueue).
- [ ] **Still queue-dependent, so production `REDIS_URL` must point at a live
      instance:** EMAIL delivery logging, SMS, `feeReminders`, and the daily
      `subscriptionBilling` lifecycle scan (trial-ending / grace / suspend
      transitions). Verify the Render env var matches the working Upstash
      `rediss://…@great-griffon-42513.upstash.io:6379` URL (the repo `.env`
      deliberately points at localhost for dev).

### Notification + billing — full QA test/fix pass (2026-09-07, HEAD c626ed6)
A circular find→fix→retest sweep over the notification + subscription-billing
work. Backend suites `notifications` (24) + `billing-notifications` (7) green;
frontend typecheck + lint + build clean; 14/14 production API smoke checks pass
(delivery, read, RBAC boundaries, unread-count).

- [x] **`notify()` fan-out was serial.** The inline IN_APP write is several DB
      round-trips; done in a sequential per-recipient/per-channel loop it made a
      multi-recipient notification as slow as the sum of its parts and pushed
      EMAIL/SMS enqueues out behind it (visible as flaky billing-notification
      tests). Now `Promise.all` across recipients × channels; each unit keeps its
      own dedupeKey/delivery row so idempotency is unchanged.
- [x] **`notifySubscriptionEvent` was fire-and-forget internally.** Now truly
      awaits `notify()`. `runSubscriptionLifecycleScan()` collects the
      notifications its transitions produce and dispatches them together at the
      end via awaited `notifySubscriptionEvent`, each isolated. Production request
      callers still use the `emitSubscriptionNotification` fire-and-forget wrapper,
      so request latency is unchanged.
- [x] **Super-admin 500 on notification prefs/templates/test.** Those controllers
      used `req.tenantId!`; a SUPER_ADMIN has no tenant, so a
      `where: { institutionId: undefined }` reached Prisma. Added a
      `requireTenant()` guard returning a clean 400. (No frontend consumer yet —
      the pref/template editor is still PR5.)
- [x] **`SUBSCRIPTION_TRIAL_EXPIRED` — new type.** A lapsed trial → EXPIRED with
      no grace and no `isActive` flip, but the scan emitted `SUBSCRIPTION_GRACE`
      ("N days before suspension") for it. Dedicated type + IN_APP/EMAIL templates.
- [x] **Lingering "Payment requested by PeopleIT" banner.** Paying a
      platform-requested payment via a fresh checkout left the super-admin
      INITIATED row behind. `creditPayment` now marks other INITIATED/PENDING
      payments for the institution CANCELLED in the same tx.
- [x] **Super-admin notification deep-link.** `Header.tsx` — a SUPER_ADMIN
      clicking a `SUBSCRIPTION_*` notification hit `/billing` (ADMIN-only route);
      `resolveNotificationLink()` rewrites the prefix to `/super-admin/billing`
      for that role.
- [x] **Nested-modal Escape.** `Modal.tsx` — module-level open-modal stack; Esc
      closes only the top-most modal (was closing a confirm dialog and its parent
      together).
- [x] **Billing portal bundle.** `AnalyticsTab` (sole `recharts` importer) split
      to `pages/superadmin/billing/AnalyticsTab.tsx` and `React.lazy`-loaded —
      portal chunk 405 kB → 30 kB.
- [x] **`SubscriptionBanner`** used `truncate` on the critical grace/trial line;
      now `line-clamp-2` on mobile, full text from `sm:`.
- [x] **Boot warning** when `APP_URL`/`FRONTEND_URL` still hold localhost defaults
      under `NODE_ENV=production` (they drive the SSLCommerz callback +
      post-payment redirect).
- [ ] **TS-4/5 — SSLCommerz sandbox renewal.** Not reproduced from code review;
      renewal shares the `initiateCheckout` path that self-checkout uses. Leading
      suspect is a Render env value (`FRONTEND_URL`/`APP_URL`). Needs the exact
      failure symptom + a Render env check. `handleRedirect` now logs
      `SSLCommerz gateway redirect { kind, tranId, redirectTo }` at INFO so the
      next test payment shows the exact URL the browser is handed.
- [ ] Minor / deferred: `manualOverride` MARK_PAID doesn't supersede pending
      payments (rare, super-admin sees the row); `useMyPayments` has no error UI
      (fails silently to an empty table).

### Redis / queue hardening for launch scale (2026-09-08, HEAD tbd)
Prod Render logs showed the Redis client flapping every 1–2s — connect →
`ECONNRESET` → reconnect, plus `"Reached the max retries per request limit"`.
Cause: a TLS-only Upstash endpoint reached over a plain `redis://` URL, made
worse by ~10 separate connections (one per Queue + one per Worker + the app
singleton).

- [x] **`config/redis.ts` rewritten** as the one place connections are made:
  - `normalizeRedisUrl()` upgrades `redis://` → `rediss://` for
    `*.upstash.io` / `*.redis-cloud.com` / `*.redislabs.com` hosts (with a
    warning) — a dashboard-copied URL now "just works".
  - **One shared connection for all 3 BullMQ Queues** (`getBullQueueConnection`)
    + **one dedicated connection per Worker** (`createBullWorkerConnection`) —
    the documented BullMQ pattern. ~10 sockets → 5 (1 app + 1 queues + 3
    workers).
  - Capped reconnect backoff (`min(times*200, 2000)`), `reconnectOnError` on
    `ECONNRESET/ETIMEDOUT/EPIPE/READONLY`, `keepAlive`, `connectTimeout`.
  - State-change-only logging — no more identical "connected/closed" lines
    every second during a blip.
  - All clients tracked so `closeRedis()` drains every one on shutdown.
- [x] `server.ts` boot probe: `pingRedis()` → logs
  `Redis reachable (host: …, TLS: yes|NO)` or a loud error naming the fix.
- [ ] **Still required on Render:** `REDIS_URL` = the Upstash **`rediss://`**
  URL (TCP tab of the Upstash console, not the REST URL, not the API key).
  The scheme auto-upgrade covers a `redis://` slip, but set it correctly.
- [ ] **Launch-scale follow-ups (not done — need their own pass + infra):**
  - Split workers into a **separate Render service** behind a `RUN_WORKERS`
    flag so a batch of 50k notification jobs can't starve HTTP request
    handling.
  - Paid tiers: Render Standard (web + worker), Render Postgres / Neon Scale,
    Upstash pay-as-you-go (the free command cap will be hit at 300+
    institutions).
  - Make batch operations (monthly invoice generation, bulk import) async
    background jobs, not synchronous HTTP requests.
  - Transactional outbox for notifications (write intent in the same tx as the
    business event; a worker fans out) — removes the synchronous in-app write
    compromise and makes "no invoice without its notification" atomic.
  - Postgres connection pooling (PgBouncer / Neon pooled string) once web +
    worker both hold pools.

### Notification system — bug found + fixed during live verification (2026-09-03)
- [x] **BullMQ rejected the job id.** `dedupeKey` (`inst:type:user:channel:ctx`) was
      passed straight as the BullMQ `jobId`; BullMQ forbids `:` in a custom id
      ("Custom Id cannot contain :"), so every enqueue failed and `notifySafe`
      swallowed it — the API returned 201 and nothing was ever delivered. The
      unit tests missed it because they mock `enqueueNotification`. Fixed:
      `src/queues/jobId.ts#toJobId()` sanitises `:` -> `_` for the job id only;
      the raw `dedupeKey` still travels in the payload and is still the durable
      unique column. Added a guard test. **Verified live end-to-end**: real
      invoice -> queue -> worker -> `IN_APP` SENT + `EMAIL` SENT (jsonTransport)
      -> guardian's `GET /notifications` shows `unreadCount: 1`.
- [ ] **The API cannot create a guardian with a login in one call.**
      `CreateGuardianDto` has no `userId` and `validate()` strips unknown fields,
      so a guardian added through `POST /guardians` has no inbox until a `userId`
      is attached out of band. Needs a DTO/flow that provisions the `GUARDIAN`
      User + `Guardian` + link together (like students already do).

## Phase 5 — Platform billing notifications + billing UI/UX ✅ COMPLETE

- [x] **Platform notifications** for SSLCommerz subscription billing, to BOTH the
      institute admin(s) and super admins (in-app bell + email). Nine new
      `NotificationType`s (`SUBSCRIPTION_ACTIVATED`, `_PAYMENT_FAILED`,
      `_PAYMENT_REQUESTED`, `_ADJUSTED`, `_REFUND_INITIATED`, `_REFUNDED`,
      `_TRIAL_ENDING`, `_GRACE`, `_SUSPENDED`) with IN_APP + EMAIL templates in
      `templates.defaults.ts`.
- [x] **The notification system now supports platform / super-admin recipients.**
      A super admin's `User.institutionId` is null; the emitted `Notification`
      row carries the *subject* institution's id, and the read path
      (`findAllForRecipient` / `markRead` / `markAllRead`) omits the tenant
      filter when the caller has no `req.tenantId` (super admin). Controller
      passes `req.tenantId` (not `req.tenantId!`). `findRecipientContact` now
      matches a user of the job's institution OR a super admin (`institutionId
      null`) — a genuine cross-tenant recipient still resolves to null → SKIPPED.
- [x] `billing.notifications.ts` — `emitSubscriptionNotification()` (fire-and-forget)
      + `notifySubscriptionEvent()` (awaitable, for tests). Resolves the audience
      via `billing.repository.findAdminUserIdsForInstitution` /
      `findSuperAdminUserIds`.
- [x] Wired into `billing.service.ts`: `creditPayment` success (→ both) + fail
      branch, `handleRedirect` fail/cancel, `manualOverride` (FORCE_SUSPEND → both,
      else adjusted), `generatePaymentLinkForInstitution`, `initiateRefund` (both),
      `queryRefundStatus` on confirmed refund (both). And into
      `billingWorker.runSubscriptionLifecycleScan`: TRIALING→EXPIRED and
      ACTIVE→GRACE → `SUBSCRIPTION_GRACE`; GRACE→EXPIRED+suspend →
      `SUBSCRIPTION_SUSPENDED` (both); a proactive one-shot `SUBSCRIPTION_TRIAL_ENDING`
      for trials ending within 3 days. All de-duped by a stable `contextId`.
- [x] Frontend bell: `severityForType` + `NOTIFICATION_TYPES` extended for the
      new types.
- [x] `tests/billing-notifications.test.ts` — audience resolution, lifecycle-scan
      emits, and the super-admin read/mark-read path.
- [x] **Billing UI/UX — full redesign** on the project design system
      (`.antigravity/skills/senior-frontend-ux-designer.md`):
      - Institute-admin: `SubscriptionOverview.tsx` (status hero that changes tone
        by state — calm/active, informational trial, urgent grace/expired — with
        readable stat facts, cleaner plan cards + per-month/savings hint,
        `DataTable` payment history, skeleton + error states); `CheckoutResult.tsx`
        (focused single-purpose result card per state); `PaymentReceipt.tsx`
        (proper receipt document, readable type, skeleton); `SubscriptionBanner.tsx`
        (calmer, `role="alert"`/`"status"`).
      - Super-admin: `SubscriptionBillingPortal.tsx` rewritten in place — standard
        page-header anatomy, `font-bold`/`rounded-2xl` (was `font-black`/`3xl`),
        readable `text-sm` base, `DataTable` + server pagination for the
        subscriptions list, skeleton loaders, and the detail modal restructured
        into labelled `SectionCard`s (payment history / generate-link / manual
        override) at `max-w-3xl` instead of one cramped `max-w-2xl` wall.

## Phase 5 — remaining / notes

- [ ] Email still does not actually deliver in production (`EMAIL_ENABLED=false`,
      no SMTP provider — Mailtrap needs a domain). In-app bell works fully; email
      renders through nodemailer `jsonTransport`. Set SMTP creds to turn it on.
- [ ] Verify against a healthy DB — the local run during this build hit a badly
      degraded Neon (a 2-institution `beforeAll` exceeded 60s; the full
      `notifications.test.ts` took 51 min). CI (throwaway Postgres) is the real
      gate.

### Notification system — remaining
- [ ] **PR4 — retire `reminderQueue`/`reminderWorker`.** `fee-due` and `absence`
      still run on the old queue (single attempt, no backoff, no dedupe — a
      re-submitted attendance sheet re-sends every absence SMS). Migrate them to
      `notify({ type: 'FEE_REMINDER' | 'ABSENCE_ALERT' })` and delete the old
      queue/worker + their imports in `server.ts`, `fee.service.ts`,
      `attendance.service.ts`.
- [ ] **PR5 — preference + template editor UI.** Backend endpoints exist and are
      tested; no frontend yet (`pages/settings/NotificationPreferences.tsx` and an
      admin template editor with live `{{var}}` preview).
- [ ] Wire `PAYMENT_RECEIVED` into the online-payment credit path too, once the
      student-fee gateway callback exists (see the payment gateway item below).

---

## Medium-Priority Cleanup / Deferred Items (not yet scheduled into a phase)

These were identified during the engagement but explicitly deferred — not forgotten, not silently dropped. Pull from this list when starting new work rather than rediscovering them.

### Security-adjacent, lower urgency than Phase 0
- [ ] `GET /reports/dashboard` has no `requireRole` at all — only sits behind `authenticate`, so any authenticated user of any role (STUDENT, GUARDIAN, etc.) can currently hit the institution-wide dashboard stats endpoint. Discovered 2026-07-20 while scoping the attendance-rate perf fix below; not yet triaged or fixed.
- [x] STUDENT "own library issues" self-service view — added `GET /library/me/issues` (`requireRole(STUDENT, GUARDIAN)`) with server-side ownership scoping (STUDENT forced to own id, GUARDIAN validated against linked-children set, both institutionId-scoped); new `frontend/src/pages/library/MyLibraryIssues.tsx` renders for STUDENT/GUARDIAN at the existing `/library` route while staff keep `LibraryManagement`. Tester-evaluator PASS — verified no cross-tenant/cross-student leak paths, added regression test for the no-Student-record edge case (`backend/tests/library-myissues-edge.test.ts`).
- [x] STUDENT/GUARDIAN "own transport assignment" self-service view — added `GET /transport/me/assignment` (`requireRole(STUDENT, GUARDIAN)`) with server-side ownership scoping (STUDENT forced to own id, GUARDIAN validated against linked-children set, both institutionId-scoped); new `frontend/src/pages/transport/MyTransportAssignment.tsx` card view renders for STUDENT/GUARDIAN at the existing `/transport` route while staff keep `TransportManagement`. Tester-evaluator PASS — verified no cross-tenant/cross-student leak paths, confirmed staff behavior unchanged, 200/200 backend tests passing.
- [x] STUDENT/GUARDIAN scoped "my results" **list** route — consolidated the pre-existing (but divergent/leaky) `GET /results/me` + `GET /results/child/:studentId` into one unified `GET /results/me` (`requireRole(STUDENT, GUARDIAN)`) matching the library/transport pattern: sentinel-based ownership scoping instead of the old `NotFoundError`-throwing existence-leak, `studentId`/`examId` filters. New `frontend/src/pages/results/MyExamResults.tsx` groups results by exam with report-card download, rendering at `/results` for STUDENT/GUARDIAN while staff keep `MarksEntry` (its now-dead student/guardian branches were removed). Tester-evaluator PASS — confirmed old insecure route/leak genuinely removed, no cross-tenant/cross-sibling leak paths, staff behavior unchanged.
- [x] ~~Revive the fine-grained `Permission` table / `requirePermission` middleware~~ — **Decision (2026-07-19): intentionally dormant, do not wire in without a real business requirement.** Investigated reviving this; found grants are scoped per-institution (`@@unique([institutionId, role, resource, action])`) and the middleware is fail-closed with no fallback — wiring it into any route without first backfilling `Permission` rows for every existing institution, plus adding a provisioning hook so every newly-onboarded institution gets rows too, would silently 403 real users (the exact bug class Phase 0 was created to fix). There's also no admin UI to manage grants and no customer has asked for per-institution permission customization, so reviving it delivers no product value today. `requireRole` remains the sole enforced authorization mechanism. Revisit only if a real multi-tenant customization requirement appears.

### Known stubs / unfinished integrations
- [ ] Live bKash/Nagad/SSLCommerz payment gateway integration — `fee.service.ts` still calls stub classes (`gateways/*.stub.ts`), no real payment provider wired up despite the schema/UI supporting it
- [x] ~~Confirm Puppeteer's Chromium binary runs on Render~~ — **moot: there is no Puppeteer.** `backend/package.json` has no puppeteer dependency; all three PDF renderers (report card, timetable, ID card) use `pdfkit`. Verified 2026-09-03.
- [ ] AI module (`ai.service.ts`) is rule-based (fixed thresholds, string templates), not a real LLM — decide: honestly rebrand ("Smart Rules"/"Automated Insights") or actually build LLM-backed features per `.antigravity/skills/ai-predictive-analytics.md`. Currently mislabeled as "AI" in the UI, which is a trust risk if a technical buyer looks under the hood
- [ ] **No "Add Student" UI anywhere in the frontend** — discovered while investigating Bug 1 (2026-07-21). Both `POST /students` (single create, `student.routes.ts`) and `POST /students/bulk-import` (Excel/CSV, built in Phase 2) are fully implemented server-side, but grepping `frontend/src` for any caller of either route turns up nothing — `StudentList.tsx` only has Edit (`PUT`) and Delete. Today the *only* way a student record ever gets created in any environment is a demo seed script (`prisma/seed.ts`/`seed_demo_data.ts`) or a raw API call. This means a real onboarded customer currently has no way to add a single student through the product — likely the actual explanation behind Bug 1's "no students found" reports on freshly-registered (non-seeded) live institutions. Needs a real "Add Student" form and/or a bulk-import page wired to the existing backend routes before this product can be used by an actual customer.

### Technical debt / hygiene
- [x] No ESLint config exists despite `lint` scripts in `package.json` — installed ESLint 9 (flat config) from scratch in both workspaces: `backend/eslint.config.js` (typescript-eslint recommended, `no-explicit-any`/`no-require-imports`/`no-unused-vars` tuned to warn against genuinely pre-existing patterns) and `frontend/eslint.config.mjs` (typescript-eslint recommended + react-hooks + react-refresh, same warn-tuning approach). `npm run lint` now exits 0 in both workspaces and chained from the repo root (74 + 146 pre-existing warnings surfaced for future cleanup, 0 errors). A handful of trivial dead-code/stale-comment fixes applied along the way; one genuine `prefer-const` bug fixed in `TimetableGrid.tsx` (behavior-neutral, verified). Tester-evaluator PASS — independently reproduced all exit codes/counts, confirmed no rules silently disabled to hide real bugs, full backend test suite (216/216) still green.
- [x] No CI pipeline (GitHub Actions or similar) — added `.github/workflows/ci.yml`, three parallel hard-gate jobs on push/PR to `main`: `lint-typecheck`, `backend-test` (Jest against a throwaway `postgres:16` service container, deliberately never touching the real/leaked-history Neon dev DB — zero GitHub secrets required), `frontend-build`. Tester-evaluator PASS on local verification, but the first real GitHub Actions run failed: `prisma migrate deploy` applies migrations but never generates the Prisma Client's TS types, and `@prisma/client`'s `postinstall` hook (which local testing had relied on implicitly) didn't fire reliably on a fresh GitHub-hosted runner — cascading `no exported member 'UserRole'` / implicit-`any` errors in both `lint-typecheck` and `backend-test`. Fixed by adding an explicit `npx prisma generate` step to both jobs (commit `6a24b77`); reproduced the exact failure locally by deleting the generated client and confirmed the fix resolves it. **Confirmed green on a real GitHub Actions run as of 2026-07-20.**
- [ ] Frontend has two parallel, unreconciled data-fetching patterns — React Query hooks (`useStudents`, `useFees`) exist but real pages use ad hoc `apiClient` + `useState`/`useEffect`. Follow whichever pattern the file you're editing already uses; don't mix both in one file
- [x] `reports.repository.ts`'s attendance-rate calculation fetches the entire institution's attendance history into memory — replaced the unbounded `findMany` + in-memory reduce with two DB-side `prisma.attendance.count()` calls (institutionId-scoped, same `'PRESENT'`-match numerator / all-status denominator as before). Pure perf fix, all-time semantics deliberately preserved (user-confirmed decision, not a silent change). Added composite `@@index([institutionId, date])` on `Attendance`. Tester-evaluator PASS — independently diffed against the pre-change git version to confirm exact behavior-equivalence, full 219-test regression suite green.
- [ ] Object storage migration off Base64-in-DB for uploaded images — works today, will matter more as Website Builder / student photo usage grows
- [ ] Git history still contains the originally-leaked Neon/Upstash credentials in old commits (rotated, so low risk, but never scrubbed from history) — user explicitly deferred this decision, don't act on it without asking again

### Explicitly out of scope until pilot customers justify it
- [ ] Super Admin feature-toggle / tiered-plans system (`Feature`/`Plan`/`PlanFeature`/`InstitutionFeature` models) — fully designed in an earlier planning session, deliberately not built; revisit only once 5–10 paying customers exist and packaging differentiation is a real question
- [ ] Website Builder expansion (custom domain, more sections, image upload)
- [ ] Multi-branch/chain cross-institution reporting for the `MANAGEMENT` role — this role currently has **zero** frontend experience at all (not in `Sidebar.tsx`, not in `DashboardRouter`)

---

## How to use this file

- **Starting a session:** read this file first. If the user names a specific feature not listed here, add it before starting work.
- **Finishing a task:** check the box, add the commit hash next to the phase/section header if it's a phase-completing commit.
- **Finding a new gap while working on something else:** add it to the relevant Medium-Priority section immediately, don't just mention it in chat and let it evaporate.
- **Don't** re-litigate items in "Explicitly out of scope" without the user raising it first — they were deliberately deferred, not overlooked.
