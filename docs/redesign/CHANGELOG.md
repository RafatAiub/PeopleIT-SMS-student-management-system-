# UI Redesign — Changelog

The UI redesign is a running log, grouped by phase and module. The hard rules still apply: no schema or API changes, no removed features, role-based access preserved, no mock data on real screens.

---

## Wave C — Missing features (2026-09-27/28)

The owner approved building the missing features, including additive schema changes. **Read `DEPLOYMENT.md` before deploying: the migration `20260927000000_wave_c_feature_foundation` must be applied first.** Features that need an API key run in a clearly labelled demo mode until the key is set.

| Commit | Area | What was added |
|---|---|---|
| `d9dff01` | Schema | 47 new models, 14 enums, new nullable/defaulted columns. Migration written, not applied |
| `dfebf5e` | Fees | Online payments (SSLCommerz, bKash, Nagad, demo checkout), receipts, concessions, bulk invoicing, overdue job, reconciliation |
| `c0d4b8d` | Communication, admissions | SMS/email/in-app campaigns, message groups, admission enquiry CRM with public enquiry and status pages, custom fields, targeted notices |
| `1b5c575` | Academics | Configurable grading scales, bulk promotion with undo, merit list, class performance, transcript and progress report, exam timetable with clash detection |
| `f89aa7e` | AI | Claude → Gemini → demo fallback, review queue for all AI text shown to guardians/students, knowledge base with Voyage semantic search, risk scoring breakdown, attendance and fee risk, workload, enrolment forecast, data cleanup, guardian and admission assistants |
| `98b1694` | Attendance, HR | Teacher section restriction, monthly summary, deduplicated absence alerts, staff and subject attendance, signed QR check-in kiosk, salary components, batch payroll, payroll report |
| `ad58a69` | Inventory, library, transport | Asset register, stock and purchases, library fine rules and overdue job, route stops, vehicle last-known location, monthly transport invoicing |
| `0ecb266` | Analytics | Role-scoped finance, attendance and academic analytics with shared filters, saved views, CSV export and scheduled report emails |
| `91219ae` | SaaS | Plan entitlements and limits, institution locale defaults, branch management and switcher, device sessions, setup wizard and onboarding checklist |
| `cd2739f` | i18n | 1,821 Bangla strings for the new pages |
| `3d2925e` | SaaS | Scoped API keys and read-only public API, signed webhooks with delivery log, support tickets with a platform console, tenant data export, usage and estimated cost reports, help centre and What's new, installable PWA with offline attendance queue, optional Sentry. See `OPERATIONS.md` |

| `8dde358` | Fixes | Found by a role-by-role test of every sidebar page (219 pages, 9 roles) against a local Docker database with the migration applied: teacher attendance no longer queries before a section is chosen; non-teaching staff settings no longer call the forbidden exam list |
| `6b4ee18` | i18n | 501 more Bangla strings (settings, setup wizard, developer, support, help, usage, data export). Only sample dates, test data and technical names remain English |

**Verified locally (2026-09-28):** the full migration history, including the Wave C migration, applies cleanly to an empty PostgreSQL 16 database; every sidebar page loads for all 9 roles with no server errors.

### Behaviour changes to existing features

- Teachers can only mark attendance for sections they are class teacher of or teach in the timetable.
- `POST /students` and student approval return 402 when a plan's student cap would be exceeded (tenants without a plan are unaffected).
- Library `status=ISSUED` now includes overdue loans; `status=OVERDUE` includes issued loans already past due.
- `/ai/risk-scoring` is paginated and returns `null` instead of a made-up score when a student has no data.
- The AI and reports routers now write audit logs for mutating requests.
- Access tokens carry a `sessionId`; refresh-token ids are UUIDs.
- Saving attendance while offline queues the register on the device and syncs it on reconnect (previously it failed).
- Creating a student and recording an offline payment also fire webhooks (after the response; they can't affect it).

### Known limits

- Live GPS needs a tracking device integration; only last-known location is supported.
- Two concurrent batch-payroll or transport-billing runs on different servers could duplicate a record (no unique constraint in the schema).
- The branch switcher only scopes the branch screens so far; other lists can adopt `resolveBranchScope` later.
- Signing out a device doesn't revoke its current access token until it expires (15 min).
- Webhook retries and the public-API rate limit live in memory (lost on restart, per instance). Only `student.created` and `payment.received` are emitted so far.
- Data export files sit on local disk; a redeploy on Render removes them (download then asks for a new export).
- PWA icons: only `favicon.svg` exists; add 192/512 px PNGs and an apple-touch icon for iOS.
- None of the new endpoints has been exercised against a database yet: the production `.env` rules out running tests or migrations locally.

---

## Phase 3 and Wave A — Screen redesign and security fixes (2026-09-26/27)

- `635ffdd`: security fixes U1–U6 (no SUPER_ADMIN creation by tenant admins, SSLCommerz transaction checks, audit redaction, URL validation, role guards on reports and AI, tenant-prefixed invoice numbers), role dashboards, full student profile, removed fake trend data.
- `3fbba52` … `b8aa88e`: every module redesigned on the Phase 2 design system (academics, admission wizard, attendance grid, fees, students, marks entry, timetable, lectures, HR, reports, leave, calendar, library, transport, ID cards, settings, billing, website builder, notices, messages, users, super admin console, login and public pages). Front-end routes for library, transport and fees now match the roles the API allows.

---

## Phase 2 — Design system (2026-09-26)

### Summary

The brand palette, tokens and a reusable component set are in place. Because Tailwind's `slate`, `blue`, `emerald` and `amber` scales are retinted, all ~80 existing screens pick up the new look without per-page edits. Typecheck and production build both pass.

A visual check ran at 1440px (light and dark), at 360px (no horizontal overflow) and in Bangla. The preview page is at **`/design-system`** (Admin; Super Admin while in a support session). It is not in the sidebar and uses clearly labelled sample content only.

### Tokens — `frontend/src/styles/theme.css`

- **Primary scale (orange):**
  - 500 `#F57722` is the brand highlight.
  - 600 `#C2550A` is the "darkened primary" for buttons and links; it gives 4.57:1 with white.
  - 700 `#A3460B` is for hover and small link text (6.11:1).
- **Accent:** `#FF9D2A` scale.
- **Info:** built on `#67ADED`; overrides Tailwind `blue`.
- **Neutrals:** `#393939` = slate-700 and `#D3D3D3` = slate-300; overrides Tailwind `slate`.
- **Success and warning:** emerald and amber, darkened one step so 600 passes AA both as text and behind white text.
- **Muted grey:** slate-400 is `#737373` in light mode (4.74:1) and is lifted to `#A3A3A3` in dark mode through a CSS variable. The 895 `text-slate-400` usages now pass in both themes.
- **Shell variables:** theme-aware CSS variables for the app shell and charts (`--bg-*`, `--fg-*`, `--border-*`, `--chart-1…6`), plus radius and shadow scales and reduced-motion support.
- **Contrast check:** every text pairing was measured. **Brand `#F57722` fails with white text (2.78:1), even for large bold text**, so it is never used behind white text.

### Global styles — `frontend/src/styles/index.css`

- Fonts: Inter + Hind Siliguri, loaded once. Previously Inter was loaded twice.
- `html[lang=bn]` switches to the Bangla font and line height.
- Global `:focus-visible` ring.
- Every existing component class name is kept and restyled: `.glass-card` (247 uses), `.input-field` (409), `.btn-*`, `.badge-*`, `.sidebar-link`, `.table-*`.
- Added: `.field-label`, `.field-error`, `.kbd`, `.link`, and print utilities.

### `index.html`

- The theme and language are applied before first paint. This removes the forced `class="dark"`, which made light-mode users see a dark flash on every load.

### Components (`frontend/src/components/ui`)

| Component | Change |
|---|---|
| Button | Same props. Adds `outline`, `danger-soft`, `link`; sizes `xs`–`lg` and icon sizes; `leftIcon`/`rightIcon`; `aria-busy`. No default `type` (native form-submit behaviour kept). `danger` is now solid red |
| Badge | Adds `primary`, `accent` and `dot` |
| Card, CardHeader | `Card` now has built-in padding (it had 0 uses before) |
| Input, Textarea, Select, Checkbox | Label linked by `htmlFor`, `aria-invalid`, error and hint via `aria-describedby`. Fixes the old label colour, which was unreadable in light mode |
| Modal | Same API. Adds `role="dialog"`, `aria-modal`, focus trap, focus restore, scroll lock, optional title / description / footer / size. Shows as a bottom sheet on phones. Still renders in place, because some pages wrap a modal in a `<form>` |
| New | Drawer (side panel), Tabs + TabPanel (keyboard-accessible), Skeleton set, Dropdown menu, Alert, ErrorState, IncompleteNotice, UpgradePrompt, AiGeneratedNotice ("AI generated — review before sending"), PageHeader, StatCard, Avatar, Tooltip, Kbd, DescriptionList |
| ConfirmModal, EmptyState, LoadingSpinner | Restyled. Destructive confirms focus **Cancel** first |
| KpiCard | Same API. **No longer draws a trend arrow:** every call site hard-coded `"up"`, which showed a green "rising" arrow on figures that weren't rising. StatCard shows a trend only when one is passed from real data |
| DataTable (28 screens) | Every existing prop works. Adds card layout below 768px, a Columns menu, CSV/Excel/Print export of the current view (xlsx loaded on demand), a bulk-action bar, row click, `aria-sort`, and labelled action buttons. Column options: `primary`, `hideOnMobile`, `defaultHidden`, `exportValue`, `align` |
| New in other folders | `Charts/AttendanceHeatmap` (Saturday-start school week); `print/PrintLayout` + `SignatureLines` (A4/A5/card letterhead frame for receipts, invoices, report cards, payslips and certificates); `lib/chartTheme` (series colours and recharts defaults from tokens) |

### App shell

- **Sidebar:**
  - Dark neutral (`#393939` light / `#171717` dark), with the orange active marker.
  - Labels are translated.
  - Sign-out is always visible; it was hover-only before.
  - Nav links use exact matching, so parent routes no longer highlight on child pages.
  - **Entries and role rules are unchanged.**
  - Exports `getNavTargets(role)` and `ROLE_LABEL`.
- **Header:**
  - Page title.
  - Institution chip (the branch-switcher slot).
  - Global search button (Ctrl/⌘ K).
  - English/Bangla toggle.
  - Theme menu.
  - Notifications (full width on phones).
  - Profile menu: Settings and My ID Card shown only to the roles whose routes allow them; language, theme, shortcuts, sign out.
- **Command palette** (Ctrl/⌘ K, `/`; `?` opens shortcuts): only offers pages the current role can already reach from the sidebar, plus theme, language and sign-out actions.
- **Layout:**
  - Skip-to-content link.
  - `h-dvh` for mobile browsers.
  - Content width up to 1440px.
  - Toasts restyled and placed below the header.

### i18n — `frontend/src/i18n`

- `useT()` / `translate()` with English source strings as keys, so a missing translation shows English, never a raw key.
- Bangla dictionary for the app shell, navigation, common actions and statuses.
- Formatters:
  - `formatCurrency` (৳ with lakh grouping)
  - `formatNumber`
  - `formatDate` (timezone and format aware)
  - Optional Bangla numerals
- Preferences are saved **per browser** (`locale-storage`).

### Performance

- Vite `manualChunks` split react, router, motion, react-query and lucide into long-lived vendor chunks.
- The first-load app chunk is 262 KB, down from 754 KB in one bundle. Charts and xlsx stay out of the first load.

### Other

- API client: the global 403 / 500 / cold-start toasts are de-duplicated. They used to stack four identical copies.
- LogoMark gradient rebranded to orange.

### Incomplete / needs decision

- **Branch switcher:** there are no branch endpoints, so the header shows the institution name only.
- **Institution-wide timezone, date format and numerals:** there is no column for them, so they are kept per browser for now. Needs schema approval.
- **Plan gating:** `UpgradePrompt` exists, but there are no feature flags or plan-module data, so nothing is locked.
- **Command-palette student search:** waits for the student profile page (Phase 3), because the students list can't be deep-linked yet.
- **Page text** is still English until each module is redesigned in Phase 3.

### Bugs found (not fixed — backend or approval needed)

See `PHASE1_ANALYSIS.md` §0 (U1–U7) and §A3. The confirmed broken frontend calls are library book edit/delete and transport route edit.
