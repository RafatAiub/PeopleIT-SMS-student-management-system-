# T5: Trash & restore

Every school has it; there is no module switch. Deleting most records now moves them to a **30-day recycle bin** instead of erasing them. Records in the trash disappear from every list, count, lookup, report, export and public website page. An admin can restore them, or delete them permanently.

## How to use

### Deleting (everyone who could delete before)
- Delete works as before, but the toast now says **"… moved to trash"** and has an **Undo** button for 8 seconds. Undo restores the record at once. You can always undo your own deletes.
- **Covered:**
  - students, including rejecting an online application;
  - guardians: **Parents → Delete** (new, ADMIN);
  - users and teachers (**Users**, **Teacher details**);
  - invoices: **Fees → invoice → Delete** (new; ADMIN/ACCOUNTANT; only unpaid/overdue/cancelled with nothing paid);
  - notices, events, admission enquiries, website pages and posts, donation funds and campaigns (when Donations is on);
  - families: **family page → delete icon** (new, ADMIN).
- **Staff (HR)** "delete" is unchanged: it already **deactivates** the staff member (reversible from their profile), so it does not use the trash. Deleting the *login* from **Users** does.

### The Trash page (ADMIN)
**Administration → Trash** (or **Settings → Trash**) lists everything deleted:
- **Type filter** with counts, and search by name.
- **Item** (name and type), **Deleted by**, **Deleted** (date/time), **Days left** (amber in the last week, red in the last 3 days).
- **Restore** or **Delete permanently** per row; tick rows for **bulk** restore or delete.
- Permanent delete asks you to type **DELETE**.
- Items the system can't delete permanently show **Kept** with the reason (e.g. "Has fee records — kept so the money history stays complete"). They stay restorable.

### What happens on delete and restore
| Type | On delete | Restore is refused when… | Permanent delete |
|---|---|---|---|
| Student | Hidden everywhere: lists, rosters, guardian/family views, attendance, results, character, transport, public application status. Their portal login is paused. | Another student now has the same **student ID**, or the same **roll in the same section** | Removes guardian links, documents, attendance, results, promotions, concessions, ID cards and check-ins. **Refused while invoices or online payments exist**, or a library book is still issued. |
| Guardian | Hidden from lists and children's profiles; login paused | — | Removes links, then the guardian |
| User | Login switched off at once (sessions revoked). Email/phone are freed for a new account. A student's or guardian's profile goes to the trash with it. Teacher/staff profiles are hidden. You can't delete yourself or the last active admin. | The email, phone or public profile link is now used by another account | The old cascade: unassigns sections and timetable slots, removes the teacher/staff profile, messages and the account's own audit rows. **Refused while payroll records exist** (and for a linked student with fee records). |
| Invoice | Only **unpaid / overdue / cancelled with ৳0 paid**, no payments, and no online payment in progress or done. **Paid and part-paid invoices refuse (409).** | — | Removes items and failed online attempts |
| Notice, event, enquiry | Hidden, including the public website notices. An enquiry's tasks leave "My tasks" and the digest. | — | Deleted (an enquiry's timeline and tasks go with it) |
| Website page / post | Off the public site; its link (slug) is freed for a new page. The home page can't be deleted. | Another page/post now uses the same link | Deleted |
| Donation fund / campaign | Hidden from lists and the donate page; their donations stay (money records). | A campaign whose **fund is in the trash** ("restore the fund first") | Deleted |
| Family | Page and list hidden; children and guardians stay attached | — | The family is deleted; payments keep their history; members are regrouped automatically |

**Daily purge:** at most once a day (only while `BACKGROUND_JOBS` is on), every item older than 30 days is deleted permanently. One **audit-log** row per school records what was purged and what was kept. Manual restores and permanent deletes are audit-logged through the normal request audit.

## How hiding works (for developers)
`backend/src/config/softDelete.ts` is a Prisma query middleware (`$use`, registered in `config/prisma.ts`). It rewrites reads (`findUnique`, `findFirst`, `findMany` and their `OrThrow` variants, `count`, `aggregate`, `groupBy`) and `updateMany`. It works in four layers:
1. **Trash-able models** (`Student`, `Guardian`, `User`, `Invoice`, `Notice`, `Event`, `AdmissionEnquiry`, `SitePage`, `SitePost`, `DonationFund`, `DonationCampaign`, `Family`) get `deletedAt: null`.
2. **Child rows** that only make sense with their parent are hidden with it (`CHILD_SCOPED`):
   - a student's attendance, subject attendance, results, guardian links, documents, transport, promotions, character records and family membership;
   - a guardian's links;
   - a user's teacher/staff profile and staff attendance;
   - a fund's campaigns.
3. **Relation filters** in `where` (`some`, `none`, `is`, direct, nested `AND`/`OR`/`NOT`) get the same rules.
4. **List relations** in `include`/`select` and filtered `_count` are scoped. So `section.students`, `guardian.students`, `family.students` and their counts skip trashed rows.

The middleware deliberately leaves these alone:
- **Single-row writes** (`update`, `upsert`, `delete`), `deleteMany`, `create`.
- **To-one includes:** an invoice still shows its trashed student's name.
- **Money and history models** (`RELATION_EXEMPT`): invoices, items, payments, gateway transactions, family payments, donations, payroll, concessions, library loans, audit logs, notifications, email logs, messages.
- **Raw SQL:** each `$queryRaw` must add `"deletedAt" IS NULL` itself. The only one touching these tables, the AI enrolment trend, does.

To include trashed rows, put an explicit `deletedAt` key in the top-level `where`: `deletedAt: { not: null }`, or `...WITH_TRASHED`, which is `{ deletedAt: undefined }`. For a child-scoped relation, use `student: { deletedAt: undefined }`.

## API (all under `/api/v1`, `authenticate → setTenant → requireTenant → auditLog`)
| Method | Path | Who |
|---|---|---|
| GET | `/trash?type&search&page&pageSize` · `/trash/summary` | ADMIN |
| POST | `/trash/restore` `{ids[]}` (one id → its own error status, e.g. 409 conflict) | ADMIN; any staff for items **they** deleted (Undo) |
| POST | `/trash/purge` `{ids[], confirm:"DELETE"}` | ADMIN |
| DELETE | `/fees/invoices/:id` (new) · `/families/:id` (new) | ADMIN/ACCOUNTANT · ADMIN |

Existing `DELETE` endpoints (students, guardians, users, notices, events, enquiries, site pages/posts, donation funds/campaigns) now answer `{ trash: { trashEntryId, type, id, label, purgeAfter } }`.

## Data
Migration `20261017100000_t5_trash` is additive:
- nullable `deletedAt` and `deletedByUserId` on the twelve tables;
- the `TrashEntityType` enum;
- **`TrashEntry`**: type, entity id (unique pair), label, who deleted it (id and name), when, `purgeAfter` (+30 days), `purgeError`, and `metadata` (original slug/email/phone, linked rows, logins paused).

No rows change and nothing is backfilled.

## Tests
- `backend/tests/trash-logic.test.ts` (8): query rewriting (top level, opt-out, child scope, relation filters, includes and `_count`, money exemptions), retention maths, suffix.
- `backend/tests/trash.test.ts` (12), on a real database:
  - **student** hidden from the list, lookup, section roster (`_count` and include), guardian profile, family page, attendance and public application status; login paused; restore brings everything back;
  - restore **conflicts** for student ID, user email (new account took it), website post link (with the post off the public site meanwhile), and website page link; donation campaign waiting for its fund;
  - guardian; user guards (self, last admin); **paid and part-paid invoices refuse**, unpaid ones trash and the accountant can Undo;
  - notice hidden from the public website notices; event; enquiry hidden from the list, board, funnel counts and "My tasks"; family;
  - **purge after 30 days** with the audit row, a fee-linked student **kept**, a fresh item untouched;
  - permissions (teacher, accountant), the typed confirmation, and **tenant isolation**.
- `frontend/src/pages/settings/trash/__tests__/trash-logic.test.ts` (self-running, 4): days-left tones, type filter, bulk summary, the Undo toast finding the entry in every response shape.
- **Changed existing test:** `backend/tests/student-applications.test.ts` now expects a rejected application to be in the trash, not hard-deleted. It was **not re-run** (the rules say run only your own new test files).

## Known gaps and risks
- **To-one displays:** a few rows linked to a trashed record still show it by name:
  - a trashed teacher shown as a section's class teacher;
  - ID cards and QR check-ins of a trashed student (their student link is optional);
  - library loans and fee concessions (exempt by design);
  - a CRM contact's linked enquiry;
  - a family whose primary guardian is trashed.
- **Finance totals** still include a trashed student's invoices (money is never hidden), while student counts exclude them.
- **Access tokens:** a trashed user's current access token stays valid until it expires. The auth middleware only checks the JWT; refresh tokens are revoked, and most data lookups for that user fail at once.
- **Single-row writes aren't filtered.** A crafted request with a trashed id that skips the usual "look it up first" step could still write to it. Every covered service looks the row up first.
- **Prisma `$use` is deprecated** (removed in Prisma 6). When upgrading, port `softDelete.ts` to a `$extends` query extension; the logic is the same.
- **Website template apply** still hard-deletes stale template pages (an internal sync, not a user delete).
- **A trashed family keeps its members.** Looking up that student's family returns the trashed family, so its page says not found. Moving the children to another family works.
- Purging a user deletes that account's own **audit rows**: the same as the old hard delete, because the column is a required foreign key.

## Decisions for the owner
- Should **staff (HR) delete** also go to the trash, instead of today's "deactivate"?
- Should students with **fee records** ever be purgeable (e.g. by anonymising), or stay in the trash until restored, as now?
- Is a **30-day** retention right? It is one constant, `RETENTION_DAYS`.

## Bangla terms
ট্র্যাশ (trash) · ফেরত আনুন (restore) · স্থায়ীভাবে মুছুন (delete permanently) · পূর্বাবস্থায় ফেরান (undo) · বাকি দিন (days left) · যিনি মুছেছেন (deleted by) · রাখা হয়েছে (kept)
