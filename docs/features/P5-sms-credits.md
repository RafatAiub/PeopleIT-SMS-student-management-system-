# P5: SMS credits, provider failover, delivery status

Track P5 of `docs/plans/SAAS_PRODUCTION_PLAN.md` (Part C) and decision D2 in `docs/LAUNCH_PLAN.md`: each school prepays SMS credits, Greenweb stays the main gateway, and a backup provider takes over when it fails.

Migration: `backend/prisma/migrations/20261031130000_p5_sms_credits` (additive only: 6 enums, 6 tables, and a `CHECK (balance >= 0)` on the wallet).

## How it works

### 1. One credit = one SMS part
- An English message uses 1 credit per 160 characters (153 per part when it is longer).
- A Bangla or emoji message uses 1 credit per **70** characters (67 per part when it is longer). So Bangla costs about twice as much.
- The count uses `campaigns/smsSegments.ts`, the same one the campaign composer shows.

### 2. Who pays
| Message | Paid by |
|---|---|
| Fee reminders, absence alerts, campaigns, P4 dues/defaulter SMS, donation reminders, other school notifications | **The school's credits** |
| PeopleNIT → school billing reminders (P1), subscription/lead notifications, login codes | **PeopleNIT** (never deducted) |

**Rule in code:** `sendSms(phone, text)` without an `institutionId` is a **platform** message. P1's `platformBilling.reminders.ts` calls it this way, so it is never charged to a school.

School code passes `{ institutionId, purpose }`. Platform purposes are `PLATFORM_BILLING`, `AUTH_OTP`, `PLATFORM` and `LEAD_SUBMITTED`; `billing: 'PLATFORM'` also forces platform billing.

### 3. Sending, step by step (`utils/sms.service.ts`)
1. The number is normalised to `8801XXXXXXXXX`. An invalid number is **FAILED**, the provider is never called, and nothing is charged.
2. If SMS is off (`SMS_ENABLED=false` or no provider keys), the message is **SKIPPED** and nothing is charged.
3. For a school message, the credits are deducted **before** sending:
   - The deduction runs in one transaction that locks the wallet row (`SELECT … FOR UPDATE`), so parallel sends can never take the balance below zero. A database CHECK is the backstop.
   - The free monthly allowance is used first.
   - If there are not enough credits, the message is **SKIPPED** with reason `INSUFFICIENT_CREDITS`, and the school's ADMINs get an in-app alert (at most once per Dhaka day).
4. The message goes to the primary provider. If the primary returns a provider, HTTP or network error, the **fallback is tried once**. A recipient error (for example "invalid number") does not fail over.
5. If every provider fails, the message is **FAILED** and the credits are **refunded automatically**. The refund is idempotent.
6. Every outcome is written to the SMS log (`SmsMessage`): number, text, parts, provider, provider message id, sender ID, status, credits, free units, refund, the failover trail and the error.

Callers keep their old behaviour: `SmsResult.status` is still `SENT | SKIPPED | FAILED`. New fields are `reason`, `smsMessageId`, `provider`, `providerMessageId` and `segments`. Delivery logs and P4's log now show "INSUFFICIENT_CREDITS: …" honestly.

### 4. Free monthly allowance
- If the school's plan sets a number for the feature `sms_per_month`, that many credits are free each month (Asia/Dhaka). They are used before paid credits.
- No plan, or an unlimited plan, means **no** free allowance. Otherwise an unlimited plan would give free SMS to everyone.
- The old donation check (blocked once usage passed `sms_per_month`) is removed. The wallet decides now.

### 5. Alerts
- **Low balance:** when the balance falls below the school's threshold (default 100, set in Settings → SMS; 0 turns it off), the school's ADMINs get an email and an in-app notification, at most once a day. Buying credits re-arms the alert.
- **No credits:** in-app alert to the ADMINs, at most once a day.

### 6. Buying credits
- The super-admin creates packs (credits, price in BDT, on sale or hidden).
- The school ADMIN opens **SMS Credits → Buy** and pays with bKash or SSLCommerz. This is PeopleNIT's own merchant: it reuses P1's SSLCommerz client and the `PLATFORM_BKASH_*` bKash client, imported read-only.
- Without gateway keys, a **demo checkout** opens instead. This never happens in production unless `FEE_DEMO_PAYMENTS_ENABLED=true`, the same rule as fees.
- Credits are added only after the gateway confirms the payment (IPN/validation or bKash execute/status). Crediting is idempotent:
  - an atomic status claim (only one caller can credit)
  - a unique gateway reference, so a val_id or trxID can't be replayed onto another purchase
  - the receipt number `SCR-YYYYMM-NNNN` and the wallet credit are written in the same transaction
- Receipts: `/sms/receipt/:id` for the school and `/super-admin/sms/receipt/:id` for the super-admin. They are printable.
- The super-admin can also:
  - add **paid credits** for cash or bank payments (with a receipt and a reason)
  - make an **adjustment** of + or −, which can never take the balance below 0
  - give a **bonus**
- Every one of these actions is audit-logged.

### 7. Masked sender ID
1. The school ADMIN requests a sender ID in **SMS Credits → Sender ID & alerts**. Rules: 3–11 characters, English letters, digits, space, `.`, `-` or `&`, and at least one letter. Only one request can be pending at a time.
2. PeopleNIT sends the school's papers to the provider/operators.
3. After the operator approves, the super-admin opens **SMS & Credits → Sender IDs → Review**. They enter the exact approved value and, optionally, the provider it is registered with.
4. The school's messages then use it. On a provider it isn't registered with (for example after a failover), the message goes out from the default non-masking number.
5. The super-admin can clear a sender ID, which switches the school back to the default number.

**How to get a masked sender ID in Bangladesh:** BTRC rules require every masking ID to be registered by the SMS provider with all operators (GP, Robi/Airtel, Banglalink, Teletalk). The usual papers are:
- an application on the school's letterhead naming the requested ID
- the trade licence or institution registration / EIIN letter
- the head's NID

Providers charge a one-time masking fee and a higher per-SMS masking rate. Approval usually takes 3–7 working days. Greenweb ties the mask to the API token. BulkSMSBD and SSL Wireless issue a sender/SID per mask.

### 8. Delivery status
- **Webhook:** set each provider's DLR URL to `https://<api>/api/v1/sms-credits/dlr/<greenweb|bulksmsbd|sslwireless>?token=<SMS_DLR_TOKEN>` (the header `X-DLR-Token` also works).
  - The endpoint is disabled (404) until `SMS_DLR_TOKEN` (at least 16 characters) is set.
  - A wrong token gets 403.
  - The parser accepts common shapes: `message_id`/`reference_id`/`csms_id` plus `status`/`dlr_status`, as single objects, arrays or `smsinfo[]`.
- **Poll:** every 15 minutes, only when `BACKGROUND_JOBS` is on, for providers with a status API (SSL Wireless today). It checks SENT messages from 2 minutes to 24 hours old, at most 100 per run. `SMS_STATUS_POLL=false` turns it off.
- A failure reported *after* the provider accepted a message is **not** refunded by default, because operators still charge for it. `SMS_REFUND_ON_DLR_FAILURE=true` refunds those too.

### 9. Screens (Bangla + English, works at 360 px)
- **School ADMIN, `/sms`** (sidebar: Communication → SMS Credits):
  - balance, free allowance, usage, and packs with bKash/SSLCommerz checkout
  - a credit calculator for a draft message
  - the SMS log with filters (status, type, phone, dates) and CSV export
  - credit history
  - sender ID request
  - low-balance level
- **Super-admin, `/super-admin/sms`** (sidebar: Support & Ops → SMS & Credits):
  - credits sold and used, credits held by schools, failures
  - provider status (primary, fallback, keys) and live provider balances
  - per-school balances with paid credits, adjust and bonus
  - the sender ID queue
  - packs and purchases
  - the all-school SMS log (numbers masked, message text hidden) with CSV export

## Environment variables (names only)
| Name | Meaning |
|---|---|
| `SMS_ENABLED` | Master switch (existing) |
| `SMS_PROVIDER_PRIMARY` | `GREENWEB` (default), `BULKSMSBD` or `SSLWIRELESS` |
| `SMS_PROVIDER_FALLBACK` | Optional backup, tried once on a provider error |
| `GREENWEB_API_TOKEN`, `GREENWEB_BASE_URL` | Existing Greenweb settings |
| `BULKSMSBD_API_KEY`, `BULKSMSBD_SENDER_ID`, `BULKSMSBD_BASE_URL` | BulkSMSBD (sender ID = the non-masking number) |
| `SSLWIRELESS_API_TOKEN`, `SSLWIRELESS_SID`, `SSLWIRELESS_BASE_URL` | SSL Wireless ISMS v3 |
| `SMS_CREDITS_ENFORCED` | `false` = log only, never deduct (rollout kill-switch). Default on |
| `SMS_WELCOME_CREDITS` | Bonus credits for each school's new wallet. Default 0 |
| `SMS_DLR_TOKEN` | Enables the delivery-report webhook |
| `SMS_STATUS_POLL` | `false` disables the 15-minute status poll |
| `SMS_REFUND_ON_DLR_FAILURE` | `true` refunds failures reported after acceptance |
| `SSLCOMMERZ_*`, `PLATFORM_BKASH_*` / `BKASH_*`, `FEE_DEMO_PAYMENTS_ENABLED` | Existing payment settings, reused for buying packs |

The startup log now prints the SMS mode, for example `SMS: LIVE (Greenweb, fallback BulkSMSBD)`.

## Not yet verified against a live account
- **BulkSMSBD:** `POST {base}/smsapi` (api_key, type text/unicode, number, senderid, message), JSON `response_code` (202 = accepted, 1001 = invalid number, 1007 = no balance …), and balance via `getBalanceApi`.
- **SSL Wireless:** `POST {base}/api/v3/send-sms` (api_token, sid, msisdn, sms, csms_id) and `smsinfo[]`. The balance call (`/api/v3/balance`) and the status call (`/api/v3/sms-status`) are best guesses from the public docs.
- **Greenweb:** the balance call (`g_api.php?…&balance`).

All of these are built from public docs. The Greenweb send path is the verified P0 code.

Every parser treats an unknown reply as a failure. Do one real ৳-cost test per provider before relying on failover; the super-admin page marks them "verify with a live account".

## How to verify
1. As super-admin, create a pack (for example 1,000 SMS for ৳350).
2. As school admin, open `/sms`, buy it with the demo checkout, and check that the balance is 1,000 and the receipt opens.
3. Send a campaign in Bangla: each message uses 2+ credits, and the log shows the parts and credits.
4. Set the balance to 0 (Adjust −N): the next guardian SMS is Skipped "No credits", and the admins get one alert.
5. With a wrong `GREENWEB_API_TOKEN` and a fallback configured, the log shows the BulkSMSBD/SSL provider and two attempts.

## Tests
- `backend/tests/p5-sms-providers.test.ts` (32): the three adapters' parsing with mocked HTTP, failover rules, sender ID validation, segment and Bangla deduction planning, DLR parsing, dates, receipts and CSV.
- `backend/tests/p5-sms-credits.test.ts` (20, real DB `sms_track_p5`):
  - per-segment deduction including Bangla
  - 25 concurrent sends with 10 credits give exactly 10 sent and never a negative balance
  - the DB CHECK
  - refund on failure, and that it is idempotent
  - failover through `sendSms`
  - platform messages never deduct
  - insufficient credits → SKIPPED, plus one alert
  - free allowance and the low-balance email
  - pack crediting idempotency (double confirm, concurrent IPN, replayed reference)
  - manual credit and adjust limits
  - sender ID approval used in sends
  - routes and RBAC, CSV, and the DLR token
- `frontend/src/pages/sms/__tests__/sms-logic.test.ts` (7, self-running with esbuild).
