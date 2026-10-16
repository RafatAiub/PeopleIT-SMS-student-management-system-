# T1: Donations, Zakat and Sadaqah

Module key: **`islamic.donations`** (off by default). Switch it on in **Settings → Modules → Islamic / Madrasah**. While it is off:
- the menu, pages, dashboard widget, guardian shortcut and website blocks disappear;
- the API answers **403 `MODULE_DISABLED`**;
- the public donate endpoints answer **404**.

## How to use (school staff)
Open **Donations → Donations & Zakat** in the sidebar (ADMIN and ACCOUNTANT). The page has seven tabs.

| Tab | What you do there |
|---|---|
| **Overview** | This month's total, the Zakat balance, pledges due, and a date-range report: by fund, by method and by month. It also shows **Zakat collected vs distributed** and the balance of every fund. |
| **Donations** | **Record donation** for cash, bank or bKash/Nagad gifts received at the office. A receipt number (`DON-2026-000042`) is issued immediately, and the receipt is emailed if the donor has an email. You can also filter, search, **export CSV**, **print** a receipt, **email** it again, or **refund** it (with a reason). |
| **Funds** | Create funds: Zakat, Sadaqah, Waqf, Lillah, Building, General, Other. Each fund has an optional goal, an active switch and a **Show on website** switch. Cards show collected, paid out and balance. A fund with history can't be deleted; make it inactive instead. |
| **Donors** | Donor profiles (name, phone, email, address, anonymous flag, notes) with their total given. Online donors are added automatically, matched by phone, then email. A donor linked to a portal user (e.g. a guardian) sees their gifts under **My donations**. |
| **Campaigns** | Time-bound appeals tied to a fund, with a goal, dates, cover image, description and a **Show on website** switch. Progress is computed from paid donations. |
| **Monthly pledges** | A donor promises a fixed amount on a day of the month (1–28). |
| **Payouts** | Money paid **out** of a fund, e.g. Zakat given to a family: paid to, purpose, date. A payout can't exceed the fund's balance, so a fund never goes negative. |

How monthly pledges work:
- **Due this month** lists active pledges that are due or overdue.
- **Record payment** records the gift and moves the next due date one month on.
- **Remind all due** (or the bell icon on one row) sends the reminder. It sends at most once per pledge per month:
  - to donors linked to a portal user, through the notification pipeline (`DONATION_REMINDER`: in-app, email and SMS, respecting each user's preferences);
  - to everyone else, by direct email (Brevo) and/or SMS, within the plan's monthly SMS limit.

**Dashboard widget:** the admin and accountant dashboards show this month's donations, the Zakat balance, pledges due and the latest gifts.

**Guardian portal:** the dashboard shows a **My donations** shortcut. The page lists the guardian's donations and monthly pledges, with printable receipts.

### Receipts
**Print receipt** opens a one-page A5 receipt (browser print) with:
- the institution letterhead and receipt number;
- donor (or "Anonymous / বেনামী"), fund (EN + BN), method, date and reference;
- the amount in figures and **in words in English and Bangla**, using lakh/crore (e.g. *One Lakh Twenty-Five Thousand Taka Only* / *এক লক্ষ পঁচিশ হাজার টাকা মাত্র*).

Receipt numbers are per school, per year and gap-free. Refunded donations keep their number and print as REFUNDED. Online gifts get a number only once they are paid.

## Online giving (school website)
1. In the website builder, open the **Donations** palette group. It appears only while the module is on.
2. Add the **Donate** block. Its options are suggested amounts, minimum amount, an optional single fund or campaign, and the fund picker on or off.
3. Optionally add **Campaign progress** (a cover, goal bar and "Donate now" link). It shows a chosen campaign, or the newest running one.
4. Only funds and campaigns marked **Show on website** are offered.

What a donor does: picks a fund and amount, enters name, phone and email (or ticks "anonymous"), chooses bKash, Nagad or card, and pays. They land on `/donation/<reference>`, the thank-you/status page, which shows the receipt number once the payment is paid.

**Payments use the same gateway adapters as fees and the shop:**
- The platform's configured bKash, Nagad and SSLCommerz accounts are used.
- When a gateway isn't configured, a clearly labelled **demo checkout** is used instead. It is never available in production unless `FEE_DEMO_PAYMENTS_ENABLED=true`.
- A donation becomes PAID only after the adapter **re-verifies with the gateway**: tran id, amount and currency must all match.
- Crediting is idempotent. A single `PENDING → PAID` claim means duplicate callbacks and IPNs do nothing, and a reused gateway reference is rejected by a unique index and an explicit check.

## API (all under `/api/v1`)
**Staff routes** (ADMIN, ACCOUNTANT, or a super admin in a support session). Every route sits behind `authenticate → setTenant → requireTenant → requireModule('islamic.donations') → auditLog`.

| Method | Path |
|---|---|
| GET | `/donations/summary` (widget) · `/donations/reports/summary?from&to` |
| GET/POST · PUT/DELETE | `/donations/funds` · `/donations/funds/:id` |
| GET/POST · GET/PUT/DELETE | `/donations/donors` · `/donations/donors/:id` |
| GET/POST · PUT/DELETE | `/donations/campaigns` · `/donations/campaigns/:id` |
| GET/POST | `/donations/records` (list + filters / record an office donation) |
| GET | `/donations/records/export.csv` · `/donations/records/:id` · `/donations/records/:id/receipt` |
| POST | `/donations/records/:id/refund` · `/donations/records/:id/email-receipt` |
| GET/POST · PUT/DELETE · POST | `/donations/recurring` (`?dueThisMonth=true`) · `/donations/recurring/:id` · `/donations/recurring/remind` |
| GET/POST · DELETE | `/donations/disbursements` · `/donations/disbursements/:id` |

**Own records** (any signed-in user): `GET /donations/mine` and `GET /donations/mine/:id/receipt`.

**Public routes** are mounted on the existing public sites router. They return 404 when the module is off.
- `GET /public/sites/:siteId/donations/options`: website funds and campaigns with progress, plus the available gateways.
- `POST /public/sites/:siteId/donations`: creates a PENDING donation and returns `paymentUrl` or `demo: true`.
- `GET /public/sites/:siteId/donations/:reference`
- `POST /public/sites/:siteId/donations/:reference/demo-pay`
- Gateway callbacks: `GET|POST /public/sites/pay/donation/:gateway/:kind`. They sit inside the rate-limit- and CORS-exempt `/public/sites/pay/` prefix and never collide with the shop's `/pay/:gateway/:kind`.

## Data
Migration `20261016100000_t1_donations` adds these tables (additive only, all `institutionId`-scoped, cascading on institution delete):
- `DonationFund`
- `Donor` (optional `userId`)
- `DonationCampaign`
- `Donation`: `reference` unique; `receiptNo` unique per institution; `gatewayTranId` and `gatewayRef` unique; `isDemo`
- `RecurringDonation`
- `DonationDisbursement`

The super-admin institution delete also removes these rows explicitly.

## Owner decisions still open
- **Whose gateway account?** Donations currently go through the **platform's** configured bKash, Nagad and SSLCommerz accounts, the same as fees and the shop. Paying into each school's own merchant account needs per-school gateway credentials. That is a separate track, and it applies to fees as well.
- **Gateway refunds** are recorded here but must also be made in the merchant panel; there is no automatic refund API call.
- **Automatic monthly reminders:** reminders are sent on demand (button). A daily scheduler can call the same service later if the owner wants it automated.

## Tests
- `backend/tests/donations-logic.test.ts` (16 tests): receipt numbering, references, amounts in words EN/BN, recurring due logic, Zakat balance maths, verification rules, CSV safety.
- `backend/tests/donations.test.ts` (13 tests): `MODULE_DISABLED` gating, roles, tenant isolation, gap-free receipt numbers under concurrency, receipts, Zakat balance and payout limit, CSV, pledges and reminders, guardian "My donations", the public demo flow, gateway credit idempotency and replay rejection, and switching the module off again.
- `frontend/src/site/__tests__/donations-logic.test.ts` (self-running): preset amounts, amount validation, progress, campaign pick, normalisers, the `donation/<ref>` route.

## Key Bangla terms
দান (donation) · যাকাত (Zakat) · সদকা (Sadaqah) · ওয়াকফ (Waqf) · লিল্লাহ (Lillah) · ফান্ড (fund) · দাতা (donor) · রসিদ (receipt) · মাসিক অঙ্গীকার (monthly pledge) · ক্যাম্পেইন (campaign) · বিতরণ (distribution/payout) · ব্যালেন্স (balance) · বেনামী (anonymous) · জাযাকাল্লাহু খাইরান (thank-you)
