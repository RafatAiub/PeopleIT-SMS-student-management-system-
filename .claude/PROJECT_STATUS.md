# PeopleIT SMS — Project Status

**Purpose:** this file is the source of truth for "what's left." Read it at the start of every session before deciding scope. Update it (check items off, add newly-discovered items) whenever something is completed or a new gap is found — don't let it drift out of sync with reality.

**Last updated:** 2026-07-17

---

## Phase 0 — Emergency Authorization Lockdown ✅ COMPLETE
Commit: `111fa25`

- [x] Add `requireRole` to `students`, `results`, `hr`, `notices`, `library`, `transport`, `timetables` routes (previously had zero role checks)
- [x] Lock down remaining open `attendance.routes.ts` gaps (`/bulk`, `/sheet`, `/` fallback)
- [x] Fix `requirePermission()` — missing `institutionId` + `granted: true` filter (cross-tenant leak + deny-row-as-allow bug)
- [x] Add `GET /guardians/me/students` self-service route
- [x] Ownership-scope `fee.service.ts` (`getInvoice`/`listInvoices`/`initiateOnlinePayment`) so GUARDIAN/STUDENT can only reach their own/linked invoices
- [x] Stand up Jest + Supertest test infra (`backend/tests/`) — 172-test authorization matrix suite, run against a real DB

## Phase 1 — Correctness Fixes ✅ COMPLETE
Commit: `d1ed98d`

- [x] Fix timetable conflict boundaries (`lte`/`gte` → `lt`/`gt`, was false-flagging back-to-back periods)
- [x] Add section and room double-booking checks (new `TimetableSlot.roomNumber` column + migration)
- [x] Fix `Reports.tsx` field-name mismatches (`averageAttendance`→`attendanceRate`, `activeStaff`→`totalTeachers`)
- [x] Replace hardcoded chart arrays with real last-7-days attendance/fee trend data

## Phase 2 — Pilot-Ready Workflow ✅ COMPLETE
Commit: `9b789af`

- [x] Excel/CSV student bulk import with server-side validation (`POST /students/bulk-import`, multer + xlsx)
- [x] Server-side grade computation (`utils/grading.ts`) — grade is no longer client-supplied input
- [x] Report card PDF generation (`GET /results/:studentId/report-card`, Puppeteer HTML→PDF, ownership-scoped for STUDENT/GUARDIAN)
- [x] Guardian dashboard (`frontend/src/pages/GuardianDashboard.tsx`) — linked children's fees, attendance, report cards
- [x] Real Greenweb SMS integration — fee-due reminders (scheduled via BullMQ delay at invoice creation) + absence reminders (triggered from attendance submission)

## Phase 3 — Usage Metrics ✅ COMPLETE
Commit: `59745f2`

- [x] `BULK_IMPORT_COMPLETED`, `REPORT_CARD_GENERATED`, `GUARDIAN_PORTAL_VIEW` events logged to `AuditLog`

## Phase 3.2 — Commercial Validation ⬜ NOT CODE WORK
Business process, not an engineering task — do not attempt to "complete" this via code:
- [ ] Recruit 3 paid pilot schools (private schools/coaching centres, 300–1,500 students)
- [ ] Test pricing around ৳3,000–৳5,000/month, SMS billed separately
- [ ] Measure onboarding time, teacher attendance usage, completed report-card cycles, guardian usage, admin time saved (the `AuditLog` events above make this queryable — no new code needed to measure it)

---

## Performance Fix ✅ COMPLETE
Commit: `366cdf6`

- [x] Batch the class/section auto-seed inserts (`createMany` instead of ~104 sequential awaited creates on a single GET request)
- [ ] **Open question, not resolved:** remaining ~6.8s latency on that same endpoint in local testing looks environment/network-bound (Neon connection latency from this dev sandbox), not further fixable in code without production timing data. `pgbouncer=true` on `DATABASE_URL` was tried and made it *worse* (11.8s) — do not retry that without re-measuring first. If the user reports specific slow endpoints from real Render/production logs, investigate those directly rather than guessing.

---

## Medium-Priority Cleanup / Deferred Items (not yet scheduled into a phase)

These were identified during the engagement but explicitly deferred — not forgotten, not silently dropped. Pull from this list when starting new work rather than rediscovering them.

### Security-adjacent, lower urgency than Phase 0
- [x] STUDENT "own library issues" self-service view — added `GET /library/me/issues` (`requireRole(STUDENT, GUARDIAN)`) with server-side ownership scoping (STUDENT forced to own id, GUARDIAN validated against linked-children set, both institutionId-scoped); new `frontend/src/pages/library/MyLibraryIssues.tsx` renders for STUDENT/GUARDIAN at the existing `/library` route while staff keep `LibraryManagement`. Tester-evaluator PASS — verified no cross-tenant/cross-student leak paths, added regression test for the no-Student-record edge case (`backend/tests/library-myissues-edge.test.ts`).
- [x] STUDENT/GUARDIAN "own transport assignment" self-service view — added `GET /transport/me/assignment` (`requireRole(STUDENT, GUARDIAN)`) with server-side ownership scoping (STUDENT forced to own id, GUARDIAN validated against linked-children set, both institutionId-scoped); new `frontend/src/pages/transport/MyTransportAssignment.tsx` card view renders for STUDENT/GUARDIAN at the existing `/transport` route while staff keep `TransportManagement`. Tester-evaluator PASS — verified no cross-tenant/cross-student leak paths, confirmed staff behavior unchanged, 200/200 backend tests passing.
- [ ] STUDENT/GUARDIAN scoped "my results" **list** route — only the report-card PDF endpoint is ownership-scoped; there's no equivalent for browsing raw exam results (`results.routes.ts` comment: "tracked separately")
- [ ] Revive the fine-grained `Permission` table / `requirePermission` middleware — modeled in schema, bug-fixed in Phase 0, but still wired into zero routes (`requireRole` coarse checks are what's actually enforced everywhere)

### Known stubs / unfinished integrations
- [ ] Live bKash/Nagad/SSLCommerz payment gateway integration — `fee.service.ts` still calls stub classes (`gateways/*.stub.ts`), no real payment provider wired up despite the schema/UI supporting it
- [ ] Confirm Puppeteer's Chromium binary actually runs on the Render.com deployment target — never verified against real Render infra (only tested locally); if the report-card feature fails in production, this is the first thing to check
- [ ] AI module (`ai.service.ts`) is rule-based (fixed thresholds, string templates), not a real LLM — decide: honestly rebrand ("Smart Rules"/"Automated Insights") or actually build LLM-backed features per `.antigravity/skills/ai-predictive-analytics.md`. Currently mislabeled as "AI" in the UI, which is a trust risk if a technical buyer looks under the hood

### Technical debt / hygiene
- [ ] No ESLint config exists despite `lint` scripts in `package.json` — `npm run lint` will fail out of the box
- [ ] No CI pipeline (GitHub Actions or similar) — the 172-test Jest suite exists but nothing runs it automatically on push/PR
- [ ] Frontend has two parallel, unreconciled data-fetching patterns — React Query hooks (`useStudents`, `useFees`) exist but real pages use ad hoc `apiClient` + `useState`/`useEffect`. Follow whichever pattern the file you're editing already uses; don't mix both in one file
- [ ] `reports.repository.ts`'s attendance-rate calculation fetches the entire institution's attendance history into memory (`findMany` with no date bound on the base stats, separate from the already-fixed 7-day trend) — fine at current data volume, will degrade as institutions accumulate years of records
- [ ] Object storage migration off Base64-in-DB for uploaded images — works today, will matter more as Website Builder / student photo usage grows
- [ ] Git history still contains the originally-leaked Neon/Upstash credentials in old commits (rotated, so low risk, but never scrubbed from history) — user explicitly deferred this decision, don't act on it without asking again

### Explicitly out of scope until pilot customers justify it
- [ ] Super Admin feature-toggle / tiered-plans system (`Feature`/`Plan`/`PlanFeature`/`InstitutionFeature` models) — fully designed in an earlier planning session, deliberately not built; revisit only once 5–10 paying customers exist and packaging differentiation is a real question
- [ ] Website Builder expansion (custom domain, more sections, image upload)
- [ ] Multi-branch/chain cross-institution reporting for the `MANAGEMENT` role — this role currently has **zero** frontend experience at all (not in `Sidebar.tsx`, not in `DashboardRouter`)

---

## How to use this file

- **Starting a session:** read this file first. If the user names a specific feature not listed here, add it before starting work.
- **Finishing a task:** check the box, add the commit hash next to the phase/section header if it's a phase-completing commit.
- **Finding a new gap while working on something else:** add it to the relevant Medium-Priority section immediately, don't just mention it in chat and let it evaporate.
- **Don't** re-litigate items in "Explicitly out of scope" without the user raising it first — they were deliberately deferred, not overlooked.
