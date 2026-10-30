# PeopleNIT SMS: production plan for Bangladesh

Revised 2026-10-30, after the owner's direction: **Bangladesh only for now**, no international payments. There are two money flows:

```
PeopleNIT (owner) ──monthly bill──▶ School / Madrasah ──monthly fees──▶ Students / Guardians
  paid by SSLCommerz or bKash         (PeopleNIT's merchant)               cash, bank, or online
```

The order of work is research, then plan, then build in phases. The owner pushes to GitHub.

---

## Part A: PeopleNIT bills schools (platform billing)

### What the owner asked for
1. **Price set per school** when the super-admin adds or edits the school. There are two models:
   - **Flat:** for example ৳3,000 a month, whatever the size of the school.
   - **Per student:** for example ৳30 or ৳50 per student per month.
2. **A bill every month**, due **by the 10th**.
3. **Reminders from the 1st to the 10th** by **SMS and email** until the bill is paid.
4. **Phone follow-up:** the owner's team calls the school and records each call (who called, what was said, the promised date).
5. **Full control:** if a school doesn't respond, the owner can restrict or disable its dashboard, and switch it back on at any time.
6. **Payment by SSLCommerz or bKash merchant**, into PeopleNIT's own merchant accounts.

### What exists today vs what's missing
| Need | Today | To build |
|---|---|---|
| Price per school | Only fixed plans (`Plan`/`PlanPrice`) shared by all schools | **Billing profile per school:** model (FLAT / PER_STUDENT), rate, minimum charge, free months or discount, due day (default 10), billing start date |
| Monthly bill | No; a payment record is only created at checkout | **A monthly invoice to each school** (`PlatformInvoice`), created on the 1st by a job. Invoice number, period, student count snapshot, line items, PDF, status (DUE / PAID / OVERDUE / WAIVED / PARTIAL) |
| Student count | — | Number of **active students on the 1st** (shown on the invoice, so the school can check it) |
| Reminders on days 1–10 | No; only a few lifecycle notices | Daily 09:00 job: SMS and email with the amount, due date and a pay link, until paid. A final notice on the 10th. "Overdue" after the 10th |
| Call log | No | **Collections board:** unpaid schools, a log for each call (note, outcome, promise-to-pay date), the next follow-up, the assigned staff member |
| Restrict or disable | Partial: hard-suspend after grace. **Bug:** an expired trial keeps working, because the block is only in the screens | **Three access levels, enforced on the server:** Active, **Restricted** (read-only plus a "pay now" banner; payment still works) and **Disabled** (only the billing page and logout). Set by hand by the owner, with an optional per-school rule "auto-restrict after N days overdue" (off by default) |
| Pay online | SSLCommerz only, and no `verify_sign` check on billing | SSLCommerz **plus bKash** (reuse the fee-side bKash adapter), a pay link in every SMS and email, an instant receipt, and access unlocks automatically after payment |
| Manual payments | The super-admin can mark a payment by hand | Record cash, bank or bKash personal payments against an invoice, with a reference number. Waivers and discounts need a reason (audit-logged) |
| Super-admin view | MRR analytics (partial) | Billed, collected and outstanding this month, a list of defaulting schools, collection rate, export to Excel |

### Rules
- **Per-student bill** = rate × active students on the 1st, never below the minimum charge (for example a ৳500 minimum).
- **Proration:** a school that joins mid-month gets a first bill for the remaining days, or a free first month. The owner chooses this per school.
- **School admins** see their **Billing** page: current bill, history, PDFs, a Pay button, and the student count used.
- **Every action is audit-logged:** price change, waiver, restrict, disable, re-enable.

---

## Part B: schools collect fees from students (school fee management)

### What the owner asked for
1. Schools and madrasahs **create invoices for students** and give or print them.
2. **Their own invoice design:** header, logo, school name, address, colours and footer text. Editable, then printed or exported.
3. **Record payments** (mostly cash). Every payment is stored against the student.
4. **Students and guardians get SMS and email:** for a new invoice, a payment receipt and due reminders.
5. **Fee changeable per student:** the monthly fee and the yearly total can be set by hand for one student.
6. **Reports:** who paid and who didn't, by month, class and section, with export.
7. **Restrict students who haven't paid,** if the school wants to.
8. All of this suited to schools **and** madrasahs.

### What exists today vs what's missing
| Need | Today | To build |
|---|---|---|
| Fee setup | Fee categories, class fees, fee schedules, concessions | Keep. Add **monthly auto-generation**: on the 1st, each active student gets that month's invoice from their class fees (the school can switch this off) |
| **Fee per student** | Only concessions (discount rules) | **Student fee profile:** a monthly fee and/or yearly total set for one student (for example orphan, sibling or scholarship rates), with an effective-from month and a reason. Monthly invoices use it automatically |
| Create and print invoices | Single and bulk invoices; a fixed print layout; PDFs are Helvetica (no Bangla) | **Invoice and receipt designer** in Settings → Fees: logo, header text, address, colours, which fields show, Bangla/English, signature line, footer note, paper size (A4, A5, or 2 copies per page as office and student copies). Live preview. Bangla PDFs |
| Record payment | Cash, bank and online exist. **Bug:** two cash entries at the same moment can overpay | Fix the race. Quick **"collect fee" counter screen:** search a student, see all dues, take payment, print the receipt at once |
| Notifications | Exist, but **buggy** (repeat emails are silently dropped; SMS goes to the student instead of the guardian; a reminder is sent even after payment) | Fix. Send to the guardian's phone. Settings per school for which messages to send. Bulk "send due SMS" to all defaulters, using the school's SMS credits |
| **Paid / unpaid tracking** | An invoice list with filters | **Dues dashboard:** month × student grid (paid, partial, unpaid), totals per class, collection rate, a defaulter list with phone numbers, one-click SMS. **Excel and PDF export** for every report |
| Reports | Reconciliation CSV only | Daily collection (cash book per collector), monthly summary, category-wise income, defaulters, concessions given, yearly statement per student |
| **Restrict students who haven't paid** | None | School setting "when dues exceed X months or ৳Y" → choose what is blocked: **result/report card download, admit card, student/guardian portal login, ID card**. Manual block or unblock per student, and a list of blocked students |
| Online payment by guardians | SSLCommerz, bKash and Nagad, but into **PeopleNIT's** account | **Optional, off by default.** Phase 2: the school enters **its own** merchant credentials, so fee money never passes through PeopleNIT |
| Refunds and adjustments | None | Cancel an invoice, reverse a payment (with a reason), and record a refund. All audit-logged |
| Late fine | None | Optional rule per category: a flat or % fine after the due day |

---

## Part C: messaging (needed by both A and B)

- **SMS:**
  - **Fix:** check the provider's reply so failures are reported, not shown as "sent".
  - Normalise phone numbers.
  - Add a backup Bangladeshi provider (BulkSMSBD or SSL Wireless).
- **SMS credits per school** (prepaid, as decided): schools buy packs from PeopleNIT through the same SSLCommerz/bKash checkout.
  - Credits are deducted per SMS segment.
  - Low-balance warnings.
  - **Platform billing SMS (Part A) uses PeopleNIT's own balance,** not the school's.
- **Email fixes:**
  - Repeat password resets, 2FA codes and invoice emails are silently dropped as duplicates.
  - Skipped emails are recorded as "sent".
  - The Render dev service eats production's email queue. Give dev its own Redis/DB with workers off.
  - Production needs an always-on instance so jobs run.

---

## Build order (one track at a time; the lead commits after each one passes)

| # | Track | Content | Estimate |
|---|---|---|---|
| **P0** | Stop the bleeding | Email and SMS bugs, separate dev from prod, the cash race, a server-side block on expired trials | 3–4 days |
| **P1** | **Platform billing** | Billing profile per school (flat or per student), monthly invoices and PDFs, SSLCommerz + bKash, reminders on days 1–10, collections board and call log, Restricted/Disabled access, super-admin dashboard | 2 weeks |
| **P2** | **Student fee profile + monthly auto-invoices** | Fee per student, auto-generation on the 1st, collect-fee counter, refunds and cancels, late fine | 1.5 weeks |
| **P3** | **Invoice and receipt designer + Bangla PDFs** | Designer, preview, A4/A5/2-copy layouts, Excel/PDF export | 1 week |
| **P4** | **Dues dashboard, reports and student restrictions** | Paid/unpaid grid, defaulters + bulk SMS, all reports, restriction rules | 1.5 weeks |
| **P5** | **SMS credits + backup provider** | Wallet, packs, deduction, low-balance warnings, delivery status | 1 week |
| **P6** | Launch hardening | Remaining security fixes, error monitoring, backups with a tested restore, staging, legal pages (Terms/Privacy/Refund), live ৳10 test payments | 1 week |
| later | Online fee payment into each school's own merchant account; finish the T6 permissions track; T7–T14 | after launch | — |

**Total: about 8–9 weeks to a sellable Bangladeshi product.**

## Defaults chosen (the owner can change any of them)
1. The per-student count is **active students on the 1st of the month**, with a minimum charge per school.
2. After the 10th: the school is marked **overdue** and the owner decides by hand. Auto-restrict is available per school but **off**.
3. **Restricted** means read-only plus a pay banner. **Disabled** means only the billing page. Payment always stays possible, and access unlocks automatically after payment.
4. Student fees are collected **offline first** (cash/bank recorded in the system). Online guardian payment comes later, into the school's own merchant account.
5. Reminder SMS to schools come from PeopleNIT's SMS balance, and reminders to guardians from the school's credits.

## Audit references (code facts behind this plan)
- **Plans are fixed price only:** `backend/prisma/schema.prisma:314-395` (`Plan`, `PlanPrice`, `Subscription`, `SubscriptionPayment`; the gateway enum is SSLCOMMERZ only).
- **Student fees:** `schema.prisma:1032-1116` (`FeeCategory`, `Invoice`, `Payment`) and `:1977-2056` (`Concession`, `FeeSchedule`, `InvoiceBatch`). No per-student fee and no print-template model.
- **Expired trial not blocked:**
  - `billing/subscriptionLifecycle.ts:89-99`
  - `middleware/tenant.middleware.ts:54-64`
  - frontend-only paywall: `frontend/src/App.tsx:247`
- **Cash race:** `fees/fee.service.ts:314-337`.
- **SMS always "success":** `utils/sms.service.ts:18-35`.
- **Fee reminder sends to the student and ignores payment:** `fees/.../reminderWorker.ts:48-89`.
- **Email duplicate keys drop repeats:**
  - `notifications/channels/email.channel.ts:74`
  - `utils/mailer.ts:33-41`
  - `email/sender.ts:58-81`
- **Dev shares production's queue:** `render.yaml` (the dev service copies prod REDIS_URL/DATABASE_URL, email off, workers on).
- **Receipt PDFs have no Bangla font:** `utils/pdfHeader.ts:72`.
