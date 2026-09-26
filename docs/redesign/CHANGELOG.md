# UI Redesign — Changelog

The UI redesign is a running log, grouped by phase and module. The hard rules still apply: no schema or API changes, no removed features, role-based access preserved, no mock data on real screens.

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
