# P1: Platform billing (PeopleNIT bills each school monthly)

Track P1 of `docs/plans/SAAS_PRODUCTION_PLAN.md`, Part A. Bangladesh only, BDT.

**Migration:** `backend/prisma/migrations/20261031090000_p1_platform_billing` (additive only). It adds:
- the P1 tables and enums
- `PaymentGateway.BKASH`
- a unique index on `SubscriptionPayment.gatewayValId`, which stops replays of a legacy billing `val_id`

There is no backfill. A school keeps the old plan/subscription behaviour until the owner gives it a billing profile.

## 1. Set up a school's billing (owner / super-admin)

There are two ways to open a school's billing profile:
- **Super-admin dashboard → Managed Institutions → row menu → Billing**
- **Billing → Collections → open the school → Billing profile**

For a new school, register it first, then open **Billing** from its row.

| Field | Meaning |
|---|---|
| Pricing model | **Per active student** (rate × students who are ACTIVE and not in the trash on the 1st) or **Flat monthly amount** |
| Minimum monthly charge | Per-student only. The bill is never below this amount. |
| Discount | Percentage or fixed amount, with a note. It never takes the bill below 0. |
| Billing starts (month) | The first month that is billed |
| Service start date + First month | **Prorate**: the remaining days of the start month, counted from the service start date. **Free**: the first month costs nothing. **Full**: the first month is charged in full. |
| Free months | The first N billed months are free. The count includes the start month. |
| Due day | Day 1–28 (default 10) |
| Auto-restrict after N days overdue | **Empty = off (the default).** When set, the school becomes read-only once an invoice is N days overdue. |
| SMS / Email reminders, SMS language | Email is always in Bangla and English. The SMS is in Bangla (default) or English. |
| Billing phone / email | Leave empty to use the defaults: the institution's phone plus the phones and emails of the school's ADMIN users. At most 3 of each. |
| Billing active | Untick to pause billing. While paused there are no new invoices, no reminders and no automatic restriction. |

The form shows an estimate of the monthly bill. Every save is audit-logged (`PLATFORM_BILLING_PROFILE_CREATE/UPDATE`) with each field's old and new value, plus an optional reason.

## 2. The monthly cycle

A scheduler runs in-process, checks every hour, and only runs when `BACKGROUND_JOBS` is on (the same pattern as the CRM digest). Once per Asia/Dhaka day:
1. **Generate** this month's invoice for every school with an active profile.
   - There is only ever **one invoice per school per month**: the database has a unique `(institution, period)` index, and the job is safe to run again.
   - On the 1st this is the monthly run. On later days it only picks up schools that were set up since the 1st.
2. **Mark overdue**: every DUE or PARTIAL invoice whose due day has passed becomes OVERDUE.

What an invoice contains:
- an invoice number `PNB-YYYYMM-NNNN`
- the number of active students that day
- the rate and the lines (base, minimum adjustment, discount, proration, free month)
- subtotal, discount, total, paid, waived and due amounts
- the due date: the due day of that month. If that leaves less than 3 days to pay (a late "Generate now", or a school that joins mid-month), the due date becomes 7 days from today.
- the status: DUE, PARTIAL, PAID, OVERDUE, WAIVED or CANCELLED. A free month, or a bill that comes to ৳0, is created as WAIVED with the reason "Free month".

What the owner can do under **Billing**:
- **Monthly billing → Generate this month's invoices** for all schools, or `POST /billing/platform-admin/invoices/generate` with an `institutionId` for one school. Both are safe to repeat.
- **Invoices → open an invoice** to:
  - **Edit lines**. This needs a reason, only works while nothing has been paid, and lets you change the due date.
  - **Waive** the remaining amount (needs a reason).
  - **Cancel** the invoice. This needs a reason and only works when nothing has been paid; otherwise waive instead.
  - Record a payment
  - Send a reminder now
  - Download the PDF
  - Open the HTML print view
- Every edit, waive and cancel is audit-logged with the before and after values.
- The invoice list filters by status, month, school/number and "overdue only", and exports to **Excel or CSV**. The export covers every row that matches the filters (up to 10,000).

PDFs:
- Invoice and receipt PDFs use pdfkit, in English. Money is shown as "BDT", because Helvetica has no Bangla glyphs; Bangla fonts come in P3.
- The **HTML print view** (`/billing/invoices/:id/print`) renders Bangla correctly.

## 3. Reminders

Every day at **09:00 Dhaka**, each unpaid invoice of a school with active billing gets:
- **Upcoming**: every day from the 1st until the day before the due day
- **Final**: on the due day
- **Overdue**: the day after the due day, then every 3 days (days 1, 4, 7, …)

How they are sent:
- By SMS and/or email, from **PeopleNIT's own** Greenweb account and Brevo account.
- They never use the school's SMS credits. They call `sendSms()` directly, without any school-credit flag; P5 treats such calls as platform messages.
- The texts are in `backend/src/modules/platformBilling/platformBilling.templates.ts`. **Edit the wording there.** Every template has Bangla and English text.

How they are recorded:
- Every attempt is a `PlatformReminderLog` row: channel, masked recipient, result **SENT / SKIPPED / FAILED**, and the provider's honest answer.
- With SMS turned off the result is SKIPPED, and email in demo mode is SKIPPED. Neither is ever recorded as "sent".
- The row is written *before* sending, with a unique key (invoice + day + channel + recipient). A restart, a second server or a re-run can never send the same reminder twice in one day.
- **Send reminder now** on an invoice has its own daily key.

Payment confirmations (a receipt by SMS and email) are logged the same way, as kind `RECEIPT`.

**Pay link: the safer option (chosen).** The link is `https://<app>/billing/pay/<token>`. It opens the Billing page **after the school ADMIN signs in**. It is not a public pay page.
- The token is short (about 45 characters, so it fits in an SMS).
- It expires after 45 days.
- It is HMAC-signed over the school id + invoice id + expiry. The school id comes from the signed-in session, so a forwarded or tampered link can't open another school's bill.
- Why not a public page: it would show the school's finances to anyone the SMS is forwarded to, and teach users to pay on pages that don't need a login, which is what phishers copy. Signing in costs one step, and a DISABLED school can still sign in.

## 4. Collections board (Billing → Collections)

The board lists every school with unpaid invoices. For each one it shows:
- the amount due
- days overdue
- the last contact (a call, note or promise, or a reminder sent)
- the next follow-up
- the promised payment date
- the owner (a PeopleNIT team member, i.e. a SUPER_ADMIN user)
- the access level

You can filter by search, owner (me / unassigned), access and "overdue only", sort by most overdue, largest amount, next follow-up, longest without contact or name, and export to CSV or Excel.

Open a school to see:
- its invoices
- **Log contact**:
  - a **Call** with its outcome: reached / no answer / promised / refused / wrong number
  - a **Promise to pay** with a date
  - a **Note**
  
  Each can set the next follow-up and the owner. A promise without a follow-up date is followed up on the promised day.
- **Restrict / disable**
- **Billing profile**
- a **timeline** that merges calls, notes, promises, payments, access changes and every reminder sent, with its result.

## 5. Restrict and disable (access levels)

`backend/src/modules/billing/accessLevel.ts` is still the one place that decides. The precedence is:
1. `Institution.isActive = false` (platform suspension, or the legacy hard-suspend after grace) → **DISABLED**.
2. The school **has a billing profile** → its invoices and the owner's override decide. The legacy Plan/Subscription status is **ignored** for access.
3. Otherwise, the legacy subscription decides, exactly as in P0.

Plan/PlanFeature entitlements (feature limits) are unchanged. **SUPER_ADMIN, and support sessions opened by one, are never blocked.**

| Level | Server | Screen |
|---|---|---|
| ACTIVE | — | A soft amber banner for ADMIN from the 1st while unpaid. It can be hidden for the day. It turns red once the bill is overdue. |
| RESTRICTED | GET works. Writes get 402 `SUBSCRIPTION_INACTIVE` (with `reason: PLATFORM_BILLING`), except `/api/v1/billing/**` and `/api/v1/auth/**`. | A red "Payment overdue — pay now" banner for every role. ADMIN gets a Pay button. |
| DISABLED | Everything gets 402 `ACCOUNT_DISABLED`, except `/api/v1/billing/**` (billing page, checkout, payment callbacks) and `/api/v1/auth/**`. | Every role is sent to **/account-disabled**. ADMIN sees the amount and **Pay now** (Billing still works). Everyone else is told to contact the school admin. |

**Owner override** (Collections → school → Restrict / disable):
- Options: ACTIVE, RESTRICTED or DISABLED. Setting one needs a **reason**, and there is a **"Keep until I change it"** tick box. ACTIVE can also be used to hold an overdue school open.
- Every change is audit-logged (`PLATFORM_ACCESS_OVERRIDE`) and appears in the timeline.

**Automatic rule:**
- If `autoRestrictAfterDays` is set and the oldest unpaid invoice is that many days past due, the school becomes RESTRICTED.
- This is computed live, so it **lifts as soon as the overdue bills are settled**.
- When every overdue invoice is paid, waived or cancelled, a manual RESTRICTED or DISABLED override is **cleared automatically, unless "keep" is ticked** (audit `PLATFORM_ACCESS_OVERRIDE_LIFTED`).
- Use "keep" for anything that isn't about payment, such as abuse.

**Caching:** the platform part of the decision is cached in memory for 30 seconds per school. A payment, an override or profile change, a waiver or cancel, or invoice generation clears the cache for that school at once. With several server instances, a change can take up to 30 seconds to show on the other instances.

**The P0 risk is fixed: a hard-suspended school can now pay.**
- Login with the institution code no longer rejects a switched-off school.
- The middleware then allows only billing and auth for it (DISABLED).
- A legacy subscription payment now switches the school back on when the last suspension was the automatic post-grace one (`AUTO_SUSPEND`). A school the team suspended by hand stays off.
- For schools with a profile, the legacy hard-suspend no longer runs at all.

## 6. Payments

**Online (school ADMIN, Billing page):**
- **Pay with bKash** or **Pay with card / mobile banking (SSLCommerz)**.
- Partial online payments are not allowed. The ADMIN pays either the full due of one invoice, or **Pay all** (every unpaid invoice in one checkout).

How the money is credited:
- **It is atomic.** A status claim and the invoices locked `FOR UPDATE` happen in one transaction, and the amount applied is capped at what is due. Any excess is flagged `[OVERPAYMENT x]` on the payment, as P0 does for fees.
- **Callbacks are idempotent.** The IPN, the browser redirect and any duplicates credit exactly once.
- **The amount and currency are re-checked** with the gateway every time.
- **Replays are blocked.** `gatewayValId` is unique, so one `val_id`/`trxID` can never credit twice.
- **The receipt** gets a number `PNR-YYYYMM-NNNN`, a receipt PDF, and a confirmation SMS and email.
- Access unlocks straight away, and the cache is cleared.

Gateway details:
- SSLCommerz callbacks check **`verify_sign`**. A signature mismatch is ignored. The same check is now also on the **legacy subscription** IPN and success redirect.
- bKash uses tokenized checkout through the shared adapter (`fees/gateways/bkash.adapter.ts`, refactored into `createBkashClient(getConfig)`). The behaviour for school fees is unchanged.

**Demo checkout:**
- When a gateway has no keys and demo payments are allowed (`FEE_DEMO_PAYMENTS_ENABLED`; off in production unless set to `true`), checkout opens `/billing/demo-checkout`. It marks the bill paid without any money moving, and the receipt says DEMO.
- The server refuses the demo confirm once real keys are configured.

**Manual payments (super-admin, invoice drawer → Record payment):**
- Methods: CASH, BANK_TRANSFER, BKASH_PERSONAL, NAGAD_PERSONAL or OTHER, with a reference, a note and a paid-on date.
- Partial payments are allowed. A payment can never be more than the due: the invoice row is locked, so two people recording at once cannot overpay.
- Each one is audit-logged (`PLATFORM_PAYMENT_MANUAL`). Sending the receipt by SMS and email is optional.

## 7. Super-admin dashboard (Billing → Monthly billing)

It shows:
- this month: billed, collected, outstanding, the overdue count and amount, and the collection rate (the share of this month's bills that is paid or waived)
- a chart of the last 12 months, billed vs collected. It has a table view, and its colours were checked for colour blindness and contrast in light and dark mode.
- the top 10 overdue schools. Click one to open it in Collections.

## 8. School admin Billing page (`/billing`)

A school **with a profile** sees:
- the current bill: a big amount due, the due date, and the bKash and SSLCommerz buttons (plus "Pay all" when more than one bill is unpaid)
- **how the amount was calculated** (students × rate, discount, proration lines)
- the bill history, with PDF downloads and the print view
- receipts as PDFs
- the payment result after returning from the gateway

A school without a profile still sees the legacy plan/subscription page. The app-wide banner and the disabled screen are described in §5. The legacy subscription banners hide themselves for schools on platform billing.

## Env var names (set on Render; names only)

| Purpose | Variables |
|---|---|
| Live SSLCommerz (PeopleNIT's store) | `SSLCOMMERZ_ENABLED=true`, `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_BASE_URL=https://securepay.sslcommerz.com` |
| Live bKash (PeopleNIT's merchant) | `PLATFORM_BKASH_APP_KEY`, `PLATFORM_BKASH_APP_SECRET`, `PLATFORM_BKASH_USERNAME`, `PLATFORM_BKASH_PASSWORD`, `PLATFORM_BKASH_BASE_URL` (live tokenized URL). Leave the four `PLATFORM_*` keys empty to reuse `BKASH_*`. |
| Callback URLs | `APP_URL` (the backend's public URL; callbacks go to `/api/v1/billing/platform-gateway/{sslcommerz,bkash}/…`), `FRONTEND_URL` (pay links and redirects) |
| Pay links | `PAY_LINK_SECRET` (optional, 16+ characters; otherwise derived from `JWT_ACCESS_SECRET`) |
| Invoice PDF issuer | `PLATFORM_BILLING_ADDRESS`, `PLATFORM_BILLING_PHONE`, `PLATFORM_BILLING_EMAIL` |
| Reminders | `SMS_ENABLED` + `GREENWEB_API_TOKEN`, `EMAIL_ENABLED` + `BREVO_API_KEY`, `BACKGROUND_JOBS` on (always-on instance) |
| Demo | `FEE_DEMO_PAYMENTS_ENABLED=false` in production |

On the SSLCommerz and bKash merchant panels, allow the IPN/callback URL `https://<APP_URL>/api/v1/billing/platform-gateway/sslcommerz/ipn`. bKash receives its callback URL automatically, per payment.

## API (for reference)
- **School:** `/api/v1/billing/platform/` with these routes:
  - `status` (every role)
  - `invoices`, `invoices/:id`, `invoices/:id/pdf`
  - `payments`, `payments/:id`, `payments/:id/receipt.pdf`
  - `gateways`, `checkout`
  - `payments/:id/demo-confirm`
  - `pay-link/:token`
- **Super-admin:** `/api/v1/billing/platform-admin/` with these routes:
  - `dashboard`
  - `profiles/:institutionId` (+ `/override`)
  - `invoices` (+ `/generate`, `/export`, `/:id`, `/:id/pdf`, `/:id/lines`, `/:id/waive`, `/:id/cancel`, `/:id/payments`, `/:id/remind`)
  - `payments/:id/receipt.pdf`
  - `collections`, `collections/:institutionId` (+ `/activities`)
  - `staff`
- **Public gateway callbacks:** `/api/v1/billing/platform-gateway/:gateway/:kind`

## Tests
- `backend/tests/p1-platform-billing-logic.test.ts` (24 tests). Pure logic:
  - Dhaka calendar and due dates
  - pricing: per student, minimum, discounts, proration, free months
  - paisa maths
  - access precedence, auto-restrict and the lift rule
  - reminder cadence
  - pay-link tokens
  - SMS templates
- `backend/tests/p1-platform-billing.test.ts` (25 tests). Real test database, every provider mocked or off:
  - profile authorisation, validation and audit
  - idempotent (and concurrent) invoice generation, the student-count snapshot, overdue marking
  - school endpoints, tenant scoping, PDF, pay-link scoping
  - auto-restrict and lift-on-payment
  - the concurrent manual-payment race
  - override with keep/no-keep, DISABLED behaviour, SUPER_ADMIN bypass
  - legacy precedence, and a hard-suspended school reaching billing
  - demo checkout and idempotent crediting, "pay all", gateway-reference replay
  - SSLCommerz `verify_sign` (platform and legacy), amount-mismatch → FAILED
  - edit, waive and cancel; list, CSV export, dashboard
  - reminder cadence and deduplication, honest SKIPPED results
  - the collections board and timeline
- `frontend/src/pages/billing/platform/__tests__/platform-billing-logic.test.ts` (self-running, 5 tests): banner choice, per-day dismissal, the disabled-screen gate, paisa helpers, labels.

## Risks and notes
- **Prisma loads `backend/.env`** (production) for any variable the process does not set. A jest run must therefore set every provider/secret variable explicitly (empty or off), not just leave it unset; see the P1 runner. In this track, global `fetch` was blocked in the tests, so nothing reached a real provider.
- **The legacy subscription unique index.** The migration adds `UNIQUE(SubscriptionPayment.gatewayValId)`. If production ever stored the same `val_id` on two rows (the code always refused that), the migration fails. Check before deploying: `SELECT "gatewayValId", count(*) FROM "SubscriptionPayment" WHERE "gatewayValId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;`
- **Login of switched-off schools.** Users of a suspended school can now sign in, but only reach Billing (ADMIN) or the disabled screen. This applies to manual platform suspensions too. To fully shut a school out, deactivate its users.
- **Lifting overrides automatically.** A manual RESTRICTED/DISABLED override is cleared when the overdue bills are settled. Tick **keep** for anything that isn't about money.
- **Multi-instance cache.** Access changes can take up to 30 seconds to show on other instances.
- **Scheduler.** It runs in-process, so it needs `BACKGROUND_JOBS` on and an always-on instance. If a day is missed, the next day's run catches up on generation. Reminders for a missed day are not resent.
- **Student count.** The count is taken when the invoice is generated (normally the 1st). A "Generate now" later in the month uses that day's count. Edit the lines if needed.
- **SMS cost.** A Bangla SMS is Unicode (70 characters per segment), and reminders go out every day until the due day: up to about 9 days × 3 numbers × 2 segments per school. Set a single billing phone, or use English SMS, to cut the cost.
- **PDFs are English only** until P3 adds Bangla fonts. The HTML print view handles Bangla.
- **Overpayment** is flagged on the payment only. Refunds are handled by hand.

## Files touched outside P1's own folders (for the lead)
- `backend/src/modules/fees/gateways/bkash.adapter.ts` (P2 area). The adapter was refactored into `createBkashClient()`, the token cache is now one entry per merchant, and `BkashFeeAdapter` behaves the same. `fee-gateways.test.ts` passes.
- `backend/src/modules/fees/gateways/config.ts` (P2 area): added `getPlatformBkashConfig()`.
- `backend/src/modules/auth/auth.service.ts`: login no longer rejects a switched-off institution's code (P4 adds login restrictions nearby).
- `backend/src/middleware/error.middleware.ts`: added `reason` to the 402 body.
- `frontend/src/api/client.ts`: handles 402 `ACCOUNT_DISABLED`.
- `frontend/src/pages/dashboards/SuperAdminDashboard.tsx`: added the "Billing" row action.
- Shared files, small edits only: `schema.prisma`, `app.ts`, `server.ts`, `App.tsx`, `bn.ts`, `.env.example`.
