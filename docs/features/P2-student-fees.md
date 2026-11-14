# P2: student fee profile, monthly auto-invoices, collect-fee counter, refunds, late fine

Track P2 of `docs/plans/SAAS_PRODUCTION_PLAN.md` (Part B).
- Migration: `backend/prisma/migrations/20261031100000_p2_student_fees` (additive only: 8 new tables, no change to existing columns).
- Code:
  - backend: `backend/src/modules/fees/student-fees/`
  - frontend: `frontend/src/pages/fees/studentFees/` and `frontend/src/pages/fees/collect/`

## How to use

### 1. Settings → Fees (ADMIN)
**Monthly invoices**
- **Generate monthly invoices automatically.** Off by default. The run happens on the chosen day (1–28, Asia/Dhaka time).
  - The scheduled run only happens when `BACKGROUND_JOBS` is on.
  - **Generate now** always works.
- **Due on day.** Default 10. Short months use their last day.
- **Monthly fee categories.** Default: every active category whose frequency is *Monthly*. You can also pick categories by hand.
- **Previous dues**
  - *Keep separate invoices* (default).
  - *Carry unpaid months into the new invoice*: an older monthly invoice with **nothing paid** is cancelled with the note "Carried forward to INV-…". Its lines are copied onto the new invoice as "Arrears <month>: …". Part-paid old invoices always stay separate.

**Late fine.** Add a rule, either school-wide or for one category:
- flat ৳ or % of the due
- applies after N days past the due date
- charged once, or every month while unpaid
- optional maximum total per invoice

A category rule wins for invoices that bill that category. The fine is added as its own invoice line ("Late fine") by the daily overdue check and by the **Mark overdue** button. The "Late fine" fee category is created automatically on first use.

### 2. Custom fee for a student (ADMIN, ACCOUNTANT)
**Where to set it**
- One student: Student profile → **Fees** tab → **Set custom fee**.
- Many students: Fees → **Custom fees** tab → **Bulk set custom fee**, then choose a class/section and tick students.

**What you choose**
- *Applies to*: one fee category, or the **whole monthly fee**. The whole fee is spread over the class's monthly lines in proportion.
- *Monthly fee*, or *Yearly total*:
  - **Spread over 12 months**: total ÷ 12, rounded down to whole taka. The 12th month absorbs the difference, e.g. ৳10,000 is ৳833 × 11 + ৳837.
  - **Once, in the first month.**
  - Each 12-month cycle is counted from *Effective from*.
- Effective from (month), optional effective to, and a reason (required).
- ৳0 = free (full scholarship); that line is dropped.

**History**
- A new rate for the same fee automatically ends the old one the month before it starts.
- **End** sets the last month at that rate.
- **Void** marks a rate entered by mistake.
- Nothing is deleted, and every change is audit-logged.

### 3. Generate monthly invoices
Fees → **Generate monthly** (or Settings → Fees → Generate now).
1. Choose the month (and optionally a class).
2. The preview shows how many invoices, the gross amount, concessions, the total, the due date, and how many students were skipped (already billed / no class fees).
3. Confirm.

**What goes on each invoice**
- Only **active** students are billed. Inactive, graduated, transferred and trashed students are skipped.
- Amounts are resolved in this order (last wins): institution-wide monthly fee schedule → class fee assignment (*Assign Fees Classes*) → class-specific monthly fee schedule.
- Then the custom fee overrides those amounts.
- Then active concessions are applied (existing logic).

**Safety and notifications**
- **One invoice per student per month, guaranteed** by a unique key (`InvoicePeriod.activeKey`). Running again, or two runs at once, only fills gaps.
- Lines carry the tag `[YYYY-MM]`, so the old bulk wizard (with period `2026-11`) and this generator don't bill the same category twice.
- Notifications use the existing invoice-issued path, the same as the bulk wizard: an in-app/email/SMS notification to the student login, plus the due-date reminder that goes to the guardian's phone (P0).

### 4. Collect fee (Fees → Collect, `/fees/collect`) — ADMIN, ACCOUNTANT
1. Type a name, student ID, roll, or phone.
   - A **guardian's phone** lists all their children.
   - Use ↑/↓ and Enter to pick.
2. All unpaid months show, oldest first, with month labels; each month includes any late fine. Untick the months you don't want.
3. Enter the payment:
   - Leave the amount empty to take the full selected amount, or type a smaller amount, which pays the **oldest month first**. A badge shows the split.
   - Method: Cash / Bank / bKash (personal) / Nagad (personal) / Cheque / Other. Cheque and Bank need a reference.
   - **Give a discount**: an amount per month plus a reason (required).
4. **Ctrl+Enter** takes the payment, all in one database transaction with the invoice rows locked (the P0 pattern). Two cashiers can't overpay.
5. The receipt print dialog opens immediately. There is a Print button per receipt, and **Esc** moves to the next student.

Siblings appear as chips. **My collections today** (top right) totals the cashier's own completed payments for today (Dhaka).

### 5. Cancel / reverse / refund / waive
All of these are in the invoice drawer (Fees → click an invoice).
- **Cancel invoice** (ADMIN, ACCOUNTANT; reason required).
  - Only invoices with nothing paid can be cancelled. The record is kept with status CANCELLED and due 0.
  - A cancelled monthly invoice frees its month, so **Generate** can bill it again. Delete (trash, T5) is still separate.
- **Reverse** a payment (ADMIN only; reason required).
  - The payment is kept with status **REVERSED**, and the reversal is stored.
  - Invoice paid/due/status are recalculated. For an online payment that was overpaid, only the amount that was credited is reversed.
  - The receipt shows as reversed (struck through) to staff and guardians.
- **Refund** (ADMIN, ACCOUNTANT): records money handed back, with method, reference and reason. You can refund up to:
  - the whole payment once it is reversed, or
  - the overpaid excess of an online payment (P0's "Overpaid — refund due").

  Refunds are locked per payment, so they can never exceed that limit.
- **Waive late fine** (ADMIN; reason required). This reduces the invoice by the unpaid part of the fine. Optionally it also stops future fines on that invoice.

All of these are written to the audit log and to the invoice's **Adjustments** history.

### 6. Student / guardian (My Invoices)
Cards show the month name (e.g. "December 2026"). The expanded card lists the line items, including late-fine lines, and the receipts. A reversed receipt is struck through and marked **Reversed**. Cancelled invoices no longer offer *Pay online*.

## API (all under `/api/v1/fees`, tenant-scoped)
| Method | Path | Roles |
|---|---|---|
| GET / PUT | `/settings/monthly` | staff / ADMIN |
| GET, POST, PUT, DELETE | `/fine-rules[/:id]` | staff / ADMIN |
| GET | `/profiles`, `/profiles/students/:studentId` | staff |
| POST | `/profiles`, `/profiles/bulk`, `/profiles/:id/end` | ADMIN, ACCOUNTANT |
| POST | `/monthly/preview`, `/monthly/generate` | ADMIN, ACCOUNTANT |
| GET | `/counter/search?q=`, `/counter/students/:id`, `/counter/today` | staff |
| POST | `/counter/collect` | staff |
| POST | `/invoices/:id/cancel` | staff |
| GET | `/invoices/:id/history` | staff |
| POST | `/invoices/:id/fines/:fineId/waive` | ADMIN |
| POST | `/payments/:paymentId/reverse` | ADMIN |
| GET / POST | `/payments/:paymentId/refunds` | staff |

"Staff" means SUPER_ADMIN, ADMIN and ACCOUNTANT. `GET /invoices/:id` now also returns `feePeriod`, `fines` and `payments[].reversal`. `GET /invoices` returns `feePeriod`.

## Tests
- `backend/tests/p2-student-fees-logic.test.ts` (24): yearly spread, profile override maths, oldest-first allocation, status recalculation, refundable, fine keys/cap/rule choice.
- `backend/tests/p2-monthly-invoices.test.ts` (9): preview, profile + concession, skip inactive/trashed, idempotency incl. concurrent runs, cancel → regenerate, yearly profile, bulk set, scheduled run, arrears mode.
- `backend/tests/p2-counter-refunds.test.ts` (10): search incl. guardian phone, oldest-first collect, two cashiers at once, discount, today, reversal (twice and concurrent), refunds (concurrent), online overpayment, cancel.
- `backend/tests/p2-late-fine.test.ts` (4): once/idempotent incl. concurrent, monthly % with cap, waiver + STOP, category vs school-wide.
- `backend/tests/p2-routes.test.ts` (3): roles, tenant isolation, guardian view.
- `frontend/src/pages/fees/studentFees/__tests__/studentFees-logic.test.ts` (10, self-running via esbuild).

## Risks and limits
- **Mid-month admissions:** the scheduled run bills each school once per month, on day N. Students admitted later that month need **Generate now** (it only fills gaps). It does not re-run daily, so a month you cancelled is not silently re-billed.
- **Server down on day N:** the run catches up on the next start in the same month. If the whole month is missed, use Generate now.
- **Trashed monthly invoice:** it keeps its month, so it is not regenerated (restoring it would make a duplicate). To re-bill a month, **cancel** the invoice instead of deleting it.
- **Online-gateway refunds are record-only.** Refund the money in the SSLCommerz/bKash/Nagad merchant panel, then record it here with method "Online gateway".
- **Counter methods:** new payment method values `BKASH_PERSONAL`, `NAGAD_PERSONAL`, `CHEQUE`, `OTHER`; `BANK` is stored as `BANK_TRANSFER`. The receipt print (P3-owned `PrintDocuments.tsx`) shows these raw codes until P3 adds labels. Reports that filter by method should include them.
- **Reversed payments remain `Payment` rows** with status `REVERSED`. Any report that sums payments must filter `status = 'COMPLETED'` (P4).
- **Late-fine percentage** is taken on the fee due excluding earlier fines. With several category rules, only one rule (the one for the invoice's biggest category) applies to an invoice.
- **Counter discount and fine waiver lower the invoice total.** The original amounts stay on the lines (`amount` vs `discount`) and in the Adjustments history.
- **Concessions in monthly runs** use assignments valid at run time for the current month, or on the 15th of the month for other months.

## Owner decisions (defaults chosen; change any)
1. Auto-generation **off** by default. Defaults: generate on the 1st, due on the 10th, separate invoices (not arrears lines).
2. Yearly spread rounds to **whole taka**, and the 12th month absorbs the rest.
3. A whole-fee custom rate overrides category rates for that student. Category rates apply only when there is no whole-fee rate.
4. Cancel: ADMIN and ACCOUNTANT. Reverse and fine waiver: ADMIN only. Refund record: ADMIN and ACCOUNTANT.
5. Counter discount: ADMIN and ACCOUNTANT, reason required, no maximum. **Should a cap or approval be added?**
6. The new-invoice notification goes to the student login, as for the existing paths. Guardian SMS comes through the P0 due-date reminder. **Should a separate SMS to guardians on invoice issue be added (uses school SMS credits, P5)?**
