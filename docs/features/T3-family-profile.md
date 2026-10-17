# T3: Family profile

Every school has it; there is no module switch. A **family** is one household: its guardians and all their children, shown on one page with attendance, fees for every child, payments, staff notes and documents. When those modules are on, the page also shows each child's character/badges (T2) and the guardians' donations (T1). Guardians can **pay all** their children's fees in one online payment, and staff can record **one offline payment split across children**.

## How to use

### Staff (ADMIN, ACCOUNTANT, MANAGEMENT)
- **Students → Families** lists every household. Search by guardian name, phone, child name/ID or family name.
- **Command palette** (Ctrl/⌘ K): type 2+ letters of a guardian, phone or child and the matching families appear under "Families".
- **Student profile → Family** button, the **Family** row action on the students list, and **Family** on each row of **Parents** all open that household.

On the family page:

| Block | What you can do |
|---|---|
| **Header** | Family name (✎ rename) and the **family total due** (overdue shown separately). **Record payment** (ADMIN/ACCOUNTANT): enter one cash/bank amount; by default it pays the **oldest due invoice first**. Tick "Choose the split myself" to type each invoice's share; the split must add up exactly. Each invoice gets its own normal payment and receipt number. |
| **Children** (siblings) | Photo, class, section, roll and ID. Attendance for the current session year (present / absent / late, rate as on report cards). Fees due and overdue per child with the unpaid invoices. Character points, band and latest badges (when T2 is on). **Take out of family** moves a child into a household of their own. |
| **Guardians** | Contact details (tap to call), relationship, **Primary** flag (**Make primary**), remove from family. "Also linked to these children" lists other guardians linked to the children but not in this family; **Add** them. **Merge** pulls another family (found by search) into this one, together with its notes and payment history. |
| **Recent payments** | The last 15 payments across all children; family payments are marked. |
| **Staff notes** | Author and date; never shown to guardians or teachers. The author or an admin can delete. |
| **Documents** | Every child's uploaded documents. |
| **Donations** (T1 on) | Gifts from this family's guardians, matched by their portal login or phone. |
| **Sibling concession** (ADMIN) | Pick an existing concession (e.g. "Sibling 10%" from **Fees → Concessions**) and tick the siblings. It uses the existing concession assignment, so future invoices apply it. |

### Teachers
**Family** on a student opens a read-only page, only when one of the children is in a section they teach (class teacher or timetable). They see contacts, children, attendance and character. They don't see fees, payments, notes, documents or donations.

### Guardians
- **My family** in the sidebar, or the shortcut on the guardian dashboard: all their children, attendance, fees and recent payments.
- **Pay all** opens one checkout (bKash, Nagad or card) for every unpaid invoice of every child. After paying they return to **My family** with a success/failed banner, and each child's invoice gets its own receipt.
- When no gateway is configured, a clearly labelled **demo checkout** is used. It is never available in production unless `FEE_DEMO_PAYMENTS_ENABLED=true`, the same rule as single-invoice fees.
- Guardians can never open another family; the API returns 404.

## Data model decision: an explicit `Family` table
I chose an explicit model over deriving families on the fly from `GuardianStudent`, for three reasons:
1. **Admins must be able to group and ungroup.** A derived "students sharing a primary guardian" set can't express "these two cousins live together" or "this child's household is separate", and it shifts whenever a primary flag changes. Explicit membership is stable.
2. **Notes and pay-all need an anchor.** Staff notes and family payments must belong to *something* that survives guardian edits. A derived key (e.g. a guardian id) would orphan them when the primary guardian changes.
3. **Speed.** The list, search and profile are single indexed lookups, not a graph walk over links on every request.

The rules:
- **One family per household.** A student is in at most one family (`FamilyStudent.studentId` unique), and so is a guardian (`FamilyGuardian.guardianId` unique).
- **Backfill** (migration `20261016120000_t3_family`, deterministic and safe to re-run):
  - A student's *anchor* is its primary guardian, else its earliest-created linked guardian.
  - Students sharing an anchor become one family named "<anchor name> family", with the anchor as primary guardian.
  - Every other guardian linked to those children joins too: the family they anchor, else their first child's family.
  - Guardians and students of different schools are never mixed.
- **New links** are grouped lazily by the same rule (`families.sync.ts`) whenever the family list, "My family" or a student/guardian → family lookup runs, up to 200 students per call. No hook in the guardian/student code is needed.
- Sync **never re-attaches** someone staff removed:
  - an ungrouped child is put into its own family;
  - a removed guardian only rejoins if staff add them back, or if a new child of theirs is grouped.
- Siblings whose parents have **different primary guardians** end up as two families. **Merge** fixes that in one click.

## Pay all: how the money is kept safe
- **One `FamilyPayment` per checkout**, with one `FamilyPaymentAllocation` per invoice (the invoice's due at the time), on a single gateway transaction id. It reuses the fee gateway adapters, `decideVerification` and the fee receipt numbers (`RCP-…`).
- **Crediting only after re-verification.** The gateway's tran id, amount and currency must match; in demo, the guardian presses "Simulate success".
  - Inside one DB transaction: an atomic `status ≠ SUCCESS → SUCCESS` claim, then one ordinary `Payment` per invoice through `FeeRepository.applyPaymentToInvoice` (the same rule offline and single-invoice online payments use), then the allocation is linked to its payment.
  - Duplicate callbacks or IPNs, or two clicks at once, lose the claim and create nothing (tested with two concurrent confirmations).
- **Replay protection.** A gateway reference (`val_id`, `trxID` or issuer ref) can credit only one payment: it is unique on `FamilyPayment.gatewayValId`, and the code also checks it against single-invoice `FeePaymentTransaction`s.
- **Callbacks** go to `/api/v1/fees/gateway/family/:gateway/:kind`, so they inherit the fee gateway CORS and rate-limit exemptions. IPN always answers 200; the browser gets a 303 to `/family/mine?payment=…`.
- **Offline split** re-checks each invoice's due inside the transaction, so a payment recorded meanwhile can't be overpaid.
- **Notifications.** Every created payment sends the usual `PAYMENT_RECEIVED` notice (one per child's invoice, idempotent by payment id).

## API (all under `/api/v1`)
Family routes go `authenticate → setTenant → requireTenant → auditLog`.

| Method | Path | Who |
|---|---|---|
| GET | `/families?q&page&pageSize` · `/families/search?q` | STAFF |
| GET | `/families/mine` | GUARDIAN |
| GET | `/families/by-student/:studentId` | STAFF, TEACHER (scoped) |
| GET | `/families/by-guardian/:guardianId` | STAFF |
| GET | `/families/:id` | STAFF; TEACHER and GUARDIAN only when theirs (else 404) |
| POST · PUT | `/families` `{name, studentIds[], guardianIds[], primaryGuardianId?}` · `/families/:id` `{name?, primaryGuardianId?}` | STAFF |
| POST | `/families/:id/members` `{studentIds[], guardianIds[]}` (moves them here) · `/families/:id/merge` `{otherFamilyId}` | STAFF |
| DELETE | `/families/:id/students/:studentId` (ungroup) · `/families/:id/guardians/:guardianId` | STAFF |
| POST · DELETE | `/families/:id/notes` · `/families/:id/notes/:noteId` | STAFF (delete: author or admin) |
| POST | `/families/:id/sibling-concession` `{concessionId, studentIds[], note?}` | ADMIN |
| POST | `/families/:id/pay-online` `{method: BKASH\|NAGAD\|SSLCOMMERZ, invoiceIds?}` | GUARDIAN of that family |
| GET · POST | `/families/payments/:id` · `/families/payments/:id/demo-confirm` `{outcome}` | family members/staff · GUARDIAN |
| POST | `/families/:id/payments/offline` `{amount, method: CASH\|BANK_TRANSFER, transactionRef?, notes?, allocations?[{invoiceId, amount}]}` | ADMIN, ACCOUNTANT |
| GET/POST | `/fees/gateway/family/:gateway/:kind` (public gateway callbacks) | gateway |

STAFF = ADMIN, ACCOUNTANT, MANAGEMENT, plus a SUPER_ADMIN in a support session.

## Data
Migration `20261016120000_t3_family`. It is additive, alters no existing column, and its backfill is at the end of the file.

| Table | Purpose |
|---|---|
| `Family` | name, optional primary guardian, `source` (AUTO/MANUAL) |
| `FamilyGuardian` / `FamilyStudent` | membership; guardian/student unique |
| `FamilyNote` | staff notes, author and date |
| `FamilyPayment` | ONLINE/OFFLINE; gateway fields as on `FeePaymentTransaction`; `gatewayTransactionId` and `gatewayValId` unique |
| `FamilyPaymentAllocation` | invoice, amount, resulting `paymentId` (unique) |

All rows are `institutionId`-scoped and cascade on institution delete. Members cascade on student/guardian delete. Allocations cascade from their invoice. A family payment keeps its history (`familyId` set null) if its family is merged away. The super-admin institution delete removes these rows explicitly.

## Tests
- `backend/tests/family-logic.test.ts` (7 tests): payable rules, oldest-first allocation, offline split validation, dues/overdue, anchor choice (same as the backfill), attendance rate, consecutive receipts.
- `backend/tests/family.test.ts` (12 tests):
  - the **migration backfill SQL run verbatim** (grouping, mother attached, other household separate, other tenant separate, re-run is a no-op) and lazy sync of later links;
  - the staff profile and totals; staff-only notes;
  - **a guardian can't see other families**, list or search; the teacher read-only scoped view; tenant isolation; search;
  - **pay-all idempotent multi-invoice credit**: two concurrent confirmations, a re-credit, distinct receipts, all invoices PAID; replay rejection and failure closing;
  - the offline split (oldest first, validation, partial); the ADMIN-only sibling concession; ungroup/merge/members/primary; character per child only while T2 is on.
- `frontend/src/pages/families/__tests__/family-logic.test.ts` (self-running, 3 tests): split preview, paisa sums, headline, siblings, payment banner.

## Owner decisions still open
- **Families with different primary guardians per child**: currently two families until staff merge them. If the owner prefers "any shared guardian ⇒ one family", the backfill and sync can switch to connected components.
- **Students' view of their family**: not built (guardians only). Easy to add if wanted.
- **Partial pay-all**: the API accepts `invoiceIds` to pay only some invoices, but the guardian UI always pays everything due.

## Bangla terms
পরিবার (family) · আমার পরিবার (my family) · ভাইবোন (siblings) · প্রধান অভিভাবক (primary guardian) · পরিবারের মোট বকেয়া (family total due) · সব পরিশোধ করুন (pay all) · কর্মীদের নোট (staff notes) · ভাইবোন ছাড় (sibling concession) · একত্র করুন (merge)
