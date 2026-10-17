# T2: Character (আখলাক) scoring and badges

Module key: **`islamic.character`** (off by default). Switch it on in **Settings → Modules → Islamic / Madrasah**. While it is off:
- the **Character** menu, pages, profile tab and dashboard cards disappear;
- the API answers **403 `MODULE_DISABLED`**;
- report cards print no character section.

## How to use

### Admin or management: set up once
Open **Character → Character (Akhlaq) → Setup**.

1. **Traits.** Press **Add recommended traits** to get the seven defaults: Punctuality (সময়ানুবর্তিতা), Manners/Adab (আদব), Salah (সালাত), Cleanliness (পরিচ্ছন্নতা), Respect (শ্রদ্ধাবোধ), Responsibility (দায়িত্বশীলতা) and Honesty (সততা).
   - Rename them, add a Bangla name, choose the scale (1–5, 1–10, 0–5, 1–3), set a weight (0 leaves a trait out of the overall %), or switch one off.
   - A trait that already has scores can't be deleted; switch it off instead.
   - Its scale can't change if existing scores would fall outside it.
2. **Assessment periods.** Weekly (Saturday–Friday), monthly or term. The dates are suggested for you. **Lock** a period when report cards are final; locked periods refuse score changes.
3. **Badges.** Press **Add starter badges** or create your own. Each has a name (EN/BN), an icon from a fixed set of 16, a colour, points, and how it is awarded:

| Awarded | Rule (checked per period) |
|---|---|
| Manual only | Teachers give it by hand, with a reason |
| Score in one trait ≥ X | The student's score for that trait in the period is at least X (on the trait's scale) |
| Overall ≥ X % | The weighted overall for the period is at least X % |
| N days on time in a row | At least N consecutive **recorded** school days marked PRESENT inside the period. LATE, ABSENT and HALF_DAY break the run; days with no attendance row (weekends, holidays) neither break nor extend it. |

4. **Settings.**
   - Notify guardians when a badge is awarded: on by default.
   - **Class leaderboards**: off by default.
   - **Show leaderboards to students and guardians**: off by default, so staff only.

### Teachers: score a period
**Character → Scores.** Pick the period and the class/section. Teachers only see sections where they are **class teacher** or teach in the **timetable** (the same rule attendance and analytics use).

- Type a number in a cell. Arrow keys or Enter move between cells. Leave a cell empty to clear it. Out-of-scale numbers turn red and block saving.
- **Fill all with N** (e.g. "all 4") fills every cell, or only the empty ones.
- Add an optional comment per student.
- **Save** sends only the cells you changed.
- **Check automatic badges** applies every active rule badge for that section and period. It is idempotent: running it again never gives the same badge twice for the same period.

### Badges and points
**Character → Badges & points.**
- **Award a badge** to one or many students of a section, with a reason.
- Recent awards are listed. A teacher can **revoke** their own awards; admins can revoke any, with a reason.
- Every award adds its points to the student's **points ledger**; a revoke adds the matching negative entry. The balance is the sum.
- When leaderboards are on, the class leaderboard shows **rank, first name, class and points** only.

### Where students and guardians see it
- **Guardian and student dashboards:** a "Character & badges" card per child (points, latest band, badges).
- **Character → My character:** full trait bars, teacher comment, period history, all badges, and the class leaderboard if the school allows it.
- **Notifications:** `BADGE_AWARDED` goes to the student's login and every linked guardian with a login. Channels are in-app and email, with bilingual text (English then Bangla). It respects each user's notification preferences (Settings → Notifications → "Character & badges").
- **Student profile → Character tab** (staff). Teachers only for students in their sections.
- **Report card PDF:** a **Character (Akhlaq)** section with the latest period that started on or before the exam's end date: trait scores, overall % and band, badges in that period, total points and the teacher's note.
  - The PDF uses the built-in Helvetica font, which has **no Bangla glyphs**, so trait/badge names print in English.
  - A Bangla comment is replaced by "see the student's character page in the portal".
  - If the owner wants Bangla in PDFs, a Bengali TTF (e.g. Noto Sans Bengali, OFL) must be bundled and registered in `reportCard.pdf.ts`. That applies to the whole report card, not only this section.

## Roles
| Who | Can |
|---|---|
| ADMIN, MANAGEMENT (and SUPER_ADMIN in a support session) | Everything: setup, all sections, revoke any award |
| TEACHER | Read traits, periods and badges; score, award, auto-award and adjust points **only in their sections**; revoke their own awards |
| ACCOUNTANT | Read-only: awards list, overview, student summary |
| STUDENT | Own summary (`/mine`) and own class leaderboard if public |
| GUARDIAN | Linked children only, and their class leaderboard if public |

## API (all under `/api/v1/character`)
Every route goes `authenticate → setTenant → requireTenant → requireModule('islamic.character') → auditLog`.

| Method | Path | Roles |
|---|---|---|
| GET / PUT | `/settings` | any / MANAGE |
| GET · POST · PUT · DELETE | `/traits` · `/traits` · `/traits/:id` · `/traits/:id` | staff read / MANAGE |
| POST · PUT | `/traits/defaults` · `/traits/order` | MANAGE |
| GET · POST · PUT · DELETE | `/periods` · `/periods/:id` | staff read / MANAGE (PUT `{locked}` locks) |
| GET | `/sections` (sections I can assess) | ASSESS |
| GET · PUT | `/grid?periodId&sectionId` · `/grid` `{periodId, sectionId, scores[{studentId,traitId,score\|null}], comments[]}` | ASSESS |
| GET · POST · PUT · DELETE | `/badges` · `/badges/defaults` · `/badges/:id` | staff read / MANAGE |
| GET · POST | `/awards` (paged) · `/awards` `{badgeId, studentIds[], periodId?, reason}` | staff read / ASSESS |
| POST | `/awards/auto` `{periodId, sectionId?}` (teachers must pass a section) | ASSESS |
| POST | `/awards/:id/revoke` `{reason}` | ASSESS (own award, or MANAGE) |
| POST · GET | `/points` `{studentId, points, reason}` · `/points/:studentId` | ASSESS / row-checked |
| GET | `/overview` · `/mine` · `/leaderboard?classId\|sectionId&periodId` · `/students/:studentId/summary` | see roles above |

## Data
Migration `20261016110000_t2_character` is additive only and touches no existing table:
- **Enums:** `CharacterPeriodKind`, `CharacterBadgeRule`, `CharacterAwardSource`.
- **`CharacterSettings`:** one row per school.
- **`CharacterTrait`:** scale min/max, weight, sort, active.
- **`CharacterPeriod`:** kind, dates, optional `academicYearId`, `locked`.
- **`CharacterScore`:** unique `(periodId, studentId, traitId)`, plus a `sectionId` snapshot.
- **`CharacterComment`:** unique `(periodId, studentId)`.
- **`CharacterBadge`:** icon, colour, points, rule fields.
- **`CharacterAward`:** points snapshot, `source`, unique `dedupeKey` for auto-awards, revoke fields.
- **`CharacterPointEntry`:** the ledger; ± points, reason, optional `awardId`.

Every table is `institutionId`-scoped and cascades on institution and student delete. The award → badge FK is `NO ACTION` (checked at end of statement), so institution deletes cascade cleanly. The super-admin institution delete also removes these rows explicitly. "Term" uses the period's own dates plus an optional link to the session year, because the codebase has no Term model.

## Tests
- `backend/tests/character-logic.test.ts` (10 tests): defaults, scale validation, weighted overall, bands, streak counting, all three rules, rule validation, period suggestion, leaderboard privacy, PDF-safe text.
- `backend/tests/character.test.ts` (13 tests): `MODULE_DISABLED` for staff/guardian/student; roles; teacher section limits on grid, award, auto-award and points; scale and membership validation; auto-award rules (overall, trait, attendance streak) and idempotent re-run; points ledger with revoke (idempotent); guardian notification; guardian/student isolation; leaderboard off/on/public with first name only; tenant isolation; locked period; delete protection; report card data; switching off again.
- `frontend/src/pages/character/__tests__/character-logic.test.ts` (self-running, 7 tests): cell parsing, overall, keyboard moves, bulk fill, diffs, bands, quick periods.

## Bangla terms
আখলাক (character) · গুণ (trait) · মূল্যায়নকাল (assessment period) · ব্যাজ (badge) · পয়েন্ট (points) · লিডারবোর্ড (leaderboard) · মন্তব্য (comment) · লক (lock)
