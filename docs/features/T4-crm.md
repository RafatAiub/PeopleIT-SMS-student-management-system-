# T4: Admissions CRM extras

Every school has it; there is no module switch. It builds on the existing **Admission enquiries** (`/admissions/enquiries`) and keeps every old API working: the status values, `PATCH /enquiries/:id/status`, the status board, the funnel and "Convert to online application".

## How to use

### Admins (ADMIN, or SUPER_ADMIN in a support session)
**Students → Admission Enquiries** now has seven tabs:

| Tab | What you can do |
|---|---|
| **Board** | One column per pipeline stage. **Drag a card** (mouse, or press-and-hold on a phone) to move it, or use the card's **Move to…** list (keyboard and small screens). Dropping on a *lost* stage asks for an optional lost reason. Cards show owner, next step and its due date (red **Overdue**, amber **Today**), priority and open tasks. |
| **List** | The same enquiries as a table with stage, owner, next step and due date. |
| **Follow-ups due** | Open enquiries whose next step is due today or earlier (unchanged). |
| **Tasks** | My tasks or everyone's: Open / Overdue / Due today / Done, an overdue badge on the tab, and a quick "add task" form. |
| **Contacts** | People who are not applicants: **volunteers**, **donors**, general **enquirers**, **other**. Type, tags (e.g. `eid`, `drivers`), owner, notes. With **Donations** on (Settings → Modules), **Link to donor** finds the donor by phone/email or creates one. |
| **Duplicates** | Groups of enquiries with the same phone (last 10 digits), the same email, or a similar name (the guardian must look alike too when both are known). **Merge** keeps one record. |
| **Report** | Funnel by stage, conversion by source / class / owner / month, average days to admit, and **Download CSV**. |

**Quick filters** above the board and list: **Mine**, **Overdue**, **Due today**, then stage (list), source, class, owner and priority, plus search.

**Pipeline stages** (button at the top) is the stage editor:
- rename in English and Bangla, pick a colour, and reorder;
- mark which stage means **admitted (won)** and which means **lost**;
- add or remove stages.

A stage that still holds enquiries can only be removed after you pick where they go. You must keep at least one open, one won and one lost stage. For older reports, an open stage "counts as" New, Contacted, Visited or Applied (automatic by default).

**Enquiry drawer** (click a card or row):
- **Overview:**
  - change stage and priority, plus the lost reason when lost;
  - set the owner, the **next step** and its **due date**;
  - Edit, Delete (moves to Trash, see T5) and Convert to online application, exactly as before.
- **Timeline:** every change is logged automatically: created (including by the website form), stage moves, owner, next step, edits, tasks added and done, conversion and merges. **Log activity** records a call, SMS, email, meeting or note by hand.
- **Tasks:** add tasks for this enquiry (they default to the enquiry's owner) and tick them done.
- **Possible duplicates** appear at the top with **Merge into this one**. The **New enquiry** form also warns while you type when the phone, email or name matches an existing enquiry.

### Any staff member (teacher, management, accountant, librarian, transport officer)
- Admins can make any staff member an enquiry's **owner** or a task's **assignee**.
- **Students → My Admission Tasks** (`/admissions/tasks`) lists their own tasks, with the student's name and a tap-to-call phone number. They can tick tasks done; they can't create, reassign or delete them.
- **Daily digest:** at **07:00 Dhaka time**, everyone with open tasks, or open enquiries they own, that are overdue or due today gets **one** in-app notification and **one** email. Both are bilingual and link to My Admission Tasks.
  - It is sent once per person per day; restarts and multiple servers never repeat it.
  - It runs only when `BACKGROUND_JOBS` is on.
  - Staff can turn it off in their notification preferences ("Admissions CRM → Daily task digest").

## Rules
- **Stage ↔ status.** Every stage maps to one legacy status (a won stage is `ENROLLED`, a lost stage is `LOST`), and `status` always follows the stage.
  - The legacy `PATCH /enquiries/:id/status` moves the enquiry to the first stage that counts as that status, or keeps it where it is if its stage already counts as that status.
  - Converting an enquiry moves it to the first "Applied" stage.
- **`wonAt`** is stamped the first time an enquiry reaches a won stage. Leaving a lost stage clears the lost reason.
- **Merge** fills the kept enquiry's empty fields (guardian, email, class, source, owner, next step and due date, lost reason), appends the other record's notes, keeps the earlier enquiry date and carries over a converted application.
  - It then moves timeline entries, tasks and linked contacts across, writes a **MERGED** entry holding a snapshot of the removed record, and **deletes** the duplicate.
  - If both enquiries were converted to *different* applications, the merge is refused.
- **Report maths:**
  - Conversion = enquiries now in a won stage ÷ all enquiries created in the range, per group.
  - Average days to admit = the mean of (`wonAt` − `createdAt`) over won enquiries.
  - The funnel's "reached" count for a stage includes enquiries now at or past it. For lost enquiries it uses their stage history (the furthest stage they reached).
  - Owner groups show the owner's name ("Unassigned" when there is none).
  - Up to 20,000 enquiries per report; a banner appears when that cap is hit.
- **Times:** "today" and "overdue" use the Asia/Dhaka calendar day on the server. The browser shows the viewer's local day, which is the same for Bangladesh users.

## API (all under `/api/v1`, `authenticate → setTenant → requireTenant → auditLog`)
| Method | Path | Who |
|---|---|---|
| GET · PUT | `/crm/stages` · `{stages:[{id?,name,nameBn?,color,isWon,isLost,status?}], reassign?:{oldStageId:newStageId}}` | ADMIN |
| GET | `/crm/board?search&assignedToUserId&mine&due&source&classInterested&priority&limit` · `/crm/filter-options` | ADMIN |
| PATCH | `/crm/enquiries/:id/stage` `{stageId, lostReason?, note?}` | ADMIN |
| GET · POST | `/crm/enquiries/:id/timeline` · `/crm/enquiries/:id/activities` `{type: NOTE\|CALL\|SMS\|EMAIL\|MEETING, body, at?}` | ADMIN |
| GET | `/crm/tasks?scope=mine\|all&status=open\|done\|overdue\|today\|all&enquiryId&assigneeUserId` · `/crm/tasks/summary` | any staff (non-admins only see their own) |
| POST · DELETE | `/crm/tasks` · `/crm/tasks/:id` | ADMIN |
| PATCH | `/crm/tasks/:id` `{done?, notes?, title?, dueAt?, assigneeUserId?}` | ADMIN; the assignee only `done`/`notes` |
| GET · POST · PUT · DELETE | `/crm/contacts`, `/crm/contacts/:id`, `/crm/contacts/tags`, `POST /crm/contacts/:id/link-donor` | ADMIN |
| GET · POST | `/crm/duplicates` · `/crm/duplicates/check` `{studentName, guardianName?, phone?, email?, excludeId?}` | ADMIN |
| POST | `/crm/merge` `{keepId, dropId}` | ADMIN |
| GET | `/crm/report?from&to&groupBy=source\|class\|owner\|month` · `/crm/report.csv?…` | ADMIN |

The existing enquiry endpoints gained **optional** fields and filters:
- **Create/update body:** `stageId`, `nextStep`, `priority` (`LOW`/`NORMAL`/`HIGH`), `lostReason`.
- **List filters:** `stageId`, `classInterested`, `priority`, `due=overdue|today`, `mine=true`.
- **Responses** add `stage`, `nextStep`, `priority`, `lostReason`, `stageChangedAt`, `wonAt` and the open-task count.

## Data
Migration `20261017090000_t4_crm` is additive. It adds:
- **`CrmStage`:** name, nameBn, colour, order, isWon/isLost, mapped status.
- **`CrmTask`:** optional enquiry, title, notes, due, assignee, done/doneAt.
- **`CrmActivity`:** an append-only timeline per enquiry.
- **`CrmContact`:** type, tags `text[]`, owner, and optional enquiry/donor links.
- **The `CrmContactType` enum.**
- **Nullable/defaulted columns on `AdmissionEnquiry`:** `stageId`, `nextStep`, `priority`, `lostReason`, `stageChangedAt`, `wonAt`.

**Backfill** (at the end of the migration; deterministic and safe to re-run):
1. It seeds the six default stages for every school that has none: New, Contacted, Visit scheduled, Applied, Admitted (won), Lost, with Bangla names. Ids are `crmst_` + md5(institution:status).
2. It points every enquiry at the stage matching its current status.
3. It sets `wonAt = updatedAt` for already-enrolled enquiries.

Schools created later get the same stages lazily, with the same ids, on first use. The next step's due date is the existing `followUpAt` column.

## Tests
- `backend/tests/crm-logic.test.ts` (16): stage ↔ status mapping, stage-set validation, Dhaka day bounds, digest selection (overdue/today/done/future/unassigned/closed, cap), duplicate rules (phone, email, honorifics, guardian check, clustering), merge fill, conversion by source/month/class, funnel with history, CSV escaping.
- `backend/tests/crm.test.ts` (11):
  - the **migration backfill run verbatim** (stages and mapping, re-run no-op) and the lazy seed;
  - board moves keeping status, `wonAt` and lost reason in sync, the legacy status API, and the timeline;
  - the quick filters; the stage editor (rename, add, reassign on delete, validation);
  - task scoping (the teacher sees and closes only their own; 403/404), the summary, and idempotent done-logging;
  - **digest selection plus one notification per day**; duplicate detection and **merge**; **report maths and CSV**;
  - contacts and donor linking behind the module switch; **tenant isolation**.
- `frontend/src/pages/admissions/__tests__/crm-logic.test.ts` (self-running, 5): optimistic card move, Bangla labels, due states, stage editor rules, bar widths.

## Decisions for the owner
- **Who can work leads?** Only ADMIN (as before) sees enquiries; other staff only see their own tasks. If MANAGEMENT should also run the pipeline, it is a one-line role change.
- **Merge deletes the duplicate permanently**; a snapshot is kept in the MERGED timeline entry. Say so if merged duplicates should go to the Trash instead.
- **Digest time:** 07:00 Dhaka. It could be made a per-school setting.
- **Name-only duplicate matching** at similarity ≥ 0.8 catches "Karim/Kareem" but can flag different children with near-identical names; the guardian check reduces that.

## Bangla terms
পাইপলাইনের ধাপ (pipeline stages) · দায়িত্বপ্রাপ্ত (owner) · পরবর্তী ধাপ (next step) · অগ্রাধিকার (priority) · হারানোর কারণ (lost reason) · টাইমলাইন (timeline) · আমার ভর্তি কাজ (my admission tasks) · দৈনিক কাজের সারসংক্ষেপ (daily digest) · স্বেচ্ছাসেবক (volunteer) · দাতা (donor) · ডুপ্লিকেট একত্র করুন (merge duplicate) · রূপান্তরের হার (conversion rate) · ভর্তি হতে গড় দিন (average days to admit)
