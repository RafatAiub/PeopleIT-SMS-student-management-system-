# P0: stop the bleeding

Track P0 of `docs/plans/SAAS_PRODUCTION_PLAN.md`. Bug fixes only. There is **no schema change and no migration**.

## What changed

### 1. Email is no longer silently dropped
- **Notification emails** (invoice issued, payment received, fee reminder, …) are now deduplicated **per event**. The key is the notification's dedupe key, which holds the invoice/payment id, plus the address. A user now gets every invoice email, not just the first one. A retry of the *same* queue job still lands on the same EmailLog row, so nothing is sent twice.
- **Auth and direct mail** (password reset, 2FA code, verification, account approved, admin test email) always sends. Each call gets its own key. These emails are sent directly and never go through the queue, so they also work when `BACKGROUND_JOBS=false`. The daily budget (with the P0 security reserve) and the suppression list still apply.
- Any `sendEmail()` call without an explicit `idempotencyKey` is now a new send. Before, the default key was a hash of template, recipient and subject, which made repeats silent no-ops.
- **The notification log is honest now.** In demo mode (no provider), for a suppressed address, or when deferred by the daily budget, the delivery is recorded as **SKIPPED** with the reason (`SKIPPED: email demo mode…`, `SUPPRESSED: …`, `DEFERRED: …`). Before, it was recorded as SENT.
- `EMAIL_ENABLED=true` with `BREVO_API_KEY` set no longer requires `SMTP_HOST`, `SMTP_USER` or `SMTP_PASS`.

### 2. Dev can't eat production's queues
- New env var **`QUEUE_PREFIX`** (default `bull`, BullMQ's own default, so existing production jobs keep running). Every BullMQ Queue and Worker uses it.
- `render.yaml` (the dev blueprint) now sets `BACKGROUND_JOBS=false` and `QUEUE_PREFIX=dev`. It also has comments saying that dev needs its **own** database and Redis, and that production needs a paid always-on instance.
- At startup the server logs:
  - which payment gateways are LIVE, DEMO or OFF
  - whether demo payments are enabled
  - the email transport and SMS state
  - the queue prefix

  With `BACKGROUND_JOBS=false` it also warns that queued notification and reminder jobs will wait until a worker runs with the same prefix and Redis.

### 3. SMS reports the truth
- The Greenweb reply body is parsed: `Ok: …` means sent, while `Error: …`, an unknown reply or an HTTP error means **FAILED**.
- With SMS disabled (no `SMS_ENABLED`/`GREENWEB_API_TOKEN`) the result is **SKIPPED**, not success.
- Numbers are normalised to `8801XXXXXXXXX` with `utils/phone.ts`. Invalid numbers are rejected without calling the provider.
- Phone numbers are masked in logs.
- Callers record the real outcome:
  - Notification deliveries: invalid number or disabled gateway is SKIPPED; a provider error is retried and then marked FAILED.
  - Campaign deliveries: disabled is SKIPPED, a failure is FAILED.
  - Donation reminders: only accepted SMS are counted as usage.

### 4. Fee reminders
- When the reminder job runs, it re-reads the invoice. It **skips** the reminder if the invoice is PAID, CANCELLED, deleted (in the trash) or has nothing due. The message quotes the *current* outstanding amount.
- SMS goes to the **primary guardian's phone**. If that number is missing or invalid, it uses another guardian's phone, then the student's phone. The email copy goes to the student's login and the primary guardian's login. The SMS is logged in the notification delivery log, deduplicated per invoice.
- **Bulk-generated invoices now get the same due-date reminder** as single invoices. Both use `scheduleFeeDueReminders()`, with one job per invoice id.

### 5. Payment race and overpayment
- **Cash/bank payments:** the "amount must not exceed due" check now runs inside the database transaction against the invoice row locked with `SELECT … FOR UPDATE`. Two cashiers posting at the same moment can no longer overpay an invoice; the second one gets "Payment amount exceeds invoice due amount". Payments against a cancelled invoice are rejected.
- **Online overpayment:**
  - The payment is still recorded for the full amount, because the money was taken.
  - The invoice is credited only up to what was due, so it is capped at PAID.
  - The excess is tagged on the payment (`[OVERPAYMENT x]`) and shown in **Fees → Reconciliation** as **"Overpaid — refund due"**, with the amount, a warning box and an export column.
  - The excess must be refunded or adjusted by hand. A credit-balance feature isn't built yet.

### 6. Expired subscriptions are enforced on the server
- There is one decision function, `getAccessLevel(institution, subscription)` in `backend/src/modules/billing/accessLevel.ts`. It returns `ACTIVE`, `RESTRICTED` or `DISABLED`. Track P1 extends it.
  - **ACTIVE:** a running trial, a paid period, or the 7-day **GRACE** window (full access).
  - **RESTRICTED:** a lapsed trial, an expired subscription (EXPIRED) or a cancelled one, while the school itself is still switched on. All reads (GET) work. Every write returns **HTTP 402** with `code: "SUBSCRIPTION_INACTIVE"`, **except** `/api/v1/billing/**` (billing page, checkout and gateway callbacks) and `/api/v1/auth/**` (login, logout, refresh, me, 2FA, password reset).
  - **DISABLED:** the institution is switched off (platform suspension, or the existing hard-suspend after a paid subscription's grace ends). This is the existing 403.
- **SUPER_ADMIN is never blocked**, including support sessions opened by a super admin.
- `GET /api/v1/billing/subscription` now also returns `accessLevel`.
- Frontend:
  - On any 402 `SUBSCRIPTION_INACTIVE`, every role sees a toast and a red banner:
    - **Admins** see "Subscription expired — pay to continue" with a **Pay now** link to Billing.
    - **Other staff** are asked to contact their school admin.
    - **Students and guardians** see the softer "School account inactive — please contact the school."
  - Admins whose subscription is in GRACE are no longer forced onto the billing page. Only RESTRICTED admins are redirected.
  - All new text is also in Bangla.

### 7. Demo payments and gateway mode
- `FEE_DEMO_PAYMENTS_ENABLED` already defaults to **false** under `NODE_ENV=production` (only `true` enables it). The startup log now states clearly, for example:
  `Fee payment gateways — SSLCommerz: LIVE (securepay.sslcommerz.com), bKash: OFF, Nagad: OFF; demo payments: DISABLED`.
- `.env.example` now shows `FEE_DEMO_PAYMENTS_ENABLED=false` and `QUEUE_PREFIX=bull`.

## What the owner must set on Render (names only)

**Production (`main` service):**
- Use a **paid, always-on instance**. On the free plan, workers and schedulers stop while the service sleeps.
- `BACKGROUND_JOBS`: leave unset or set it to `true`.
- `QUEUE_PREFIX`: leave unset (`bull`).
- `FEE_DEMO_PAYMENTS_ENABLED`: set to `false`, or leave it unset.
- `EMAIL_ENABLED` and `BREVO_API_KEY`. `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are no longer needed with Brevo.
- `SMS_ENABLED` and `GREENWEB_API_TOKEN`, for real SMS.

**Dev (`peoplenit-sms-api-dev`):**
- `BACKGROUND_JOBS=false` and `QUEUE_PREFIX=dev` are already in `render.yaml`. If the service was created before this change, set them by hand in the dashboard.
- Give it its **own** `DATABASE_URL` and `REDIS_URL`, not copies of production's.

## How to verify

1. **Startup log:** after deploy, the log shows a `Fee payment gateways — …` line and a `queue prefix: "bull"` line. On dev it shows `"dev"`, plus the BACKGROUND_JOBS warning.
2. **Repeat password reset:** request a reset twice for the same account. Two emails arrive, and Super-admin → Email shows two SENT rows.
3. **Second invoice email:** create two invoices for the same student. Both "New invoice" emails arrive.
4. **SMS honesty:** with SMS off, look at a notification delivery for SMS. It is SKIPPED, not SENT.
5. **Cash race:** open the same invoice in two browser tabs and record payments that together exceed the due. One is rejected.
6. **Expired trial:** set a test school's subscription to `TRIALING` with a past `trialEndsAt`, or to `EXPIRED`.
   - Pages still load.
   - Saving anything shows the red banner and toast, and the API answers 402 `SUBSCRIPTION_INACTIVE`.
   - The admin can still open Billing and start checkout.
   - A super admin can still change things.
   - A school in GRACE keeps working normally.
7. **Reminders:** create an invoice due today, pay it in full, then let the reminder run. No SMS is sent, and the log says "invoice already settled".

Automated tests (real test database, every provider mocked):

```
backend/tests/p0-email-dedupe.test.ts
backend/tests/p0-sms.test.ts
backend/tests/p0-cash-race.test.ts
backend/tests/p0-subscription-access.test.ts
backend/tests/p0-fee-reminder.test.ts
```

## Known limits (handed to P1)
- A *paid* school whose grace has ended is still **hard-suspended** (`Institution.isActive=false`, 403 everywhere, including Billing). That is the existing behaviour. P1's Restricted/Disabled levels, with "payment always possible" and automatic unlock after payment, replace it.
- Overpayment excess is only flagged. Refunds and credit balances come in P2.
