# T0: Module switches

Every school can switch whole features on or off in **Settings → Modules**. A feature that is off disappears everywhere: sidebar, routes, dashboards, the guardian and student views, and the public website. The API also refuses its requests.

## How to use (school admin)
1. Go to **Settings → Modules** (admins only; a super admin must first select the school).
2. Two groups:
   - **Islamic / Madrasah** (ইসলামিক / মাদ্রাসা), **off by default**: Donations, Zakat & Sadaqah (`islamic.donations`), Character/Akhlaq scoring (`islamic.character`), Qur'an/Hifz tracker (`islamic.hifz`).
   - **Optional modules** (ঐচ্ছিক মডিউল), **on by default**: Tutor sessions & payouts (`tutor_payouts`), Parent–teacher appointments (`appointments`), Shared school mailbox (`mailbox`).
3. Flip a switch. It saves immediately and is audit-logged (`MODULES_UPDATED`, with the changed keys).
4. A module marked **Not in your plan** can't be switched on. Upgrade the plan, or ask the platform super admin, who can switch it on for this school anyway. That is recorded as a per-school plan override.

Turning a module off never deletes its data. Turning it back on brings everything back.

## Storage decision
**A nullable JSON column, `Institution.modules`**, holds only the explicit choices, e.g. `{ "islamic.donations": true, "mailbox": false }`. Migration: `20261016090000_t0_module_switches`.

Why a column and not an `InstitutionModule` table:
- **One read.** `requireModule()` runs on every gated request. A column comes back in the same row lookup, with no join and no N rows per school.
- **No backfill.** Absent keys fall back to the registry default, so a later track adds a key in code and every school picks up the right default. A table would need seeding, or the same "missing row = default" logic anyway.
- **Small and closed.** The set of keys is small and fixed by code (unknown keys are rejected and stripped on read). Nobody needs to query "which schools have X on" often enough to justify a table. If that becomes a reporting need, a JSONB `?` query or a GIN index covers it.
- **Already history-tracked.** History lives in the audit log, so the table's one advantage (per-row timestamps) isn't needed.

## Plan entitlements
Each module key is also a plan feature key (`saas/entitlements.logic.ts` `FEATURE_CATALOG`). A module is **enabled** only when it is **switched on** *and* **entitled** by the plan. With nothing configured, it resolves to entitled, like every other feature.
- ADMIN switching on an unentitled module gets **422**.
- SUPER_ADMIN (with `X-Institution-Id`) may switch it on. The server upserts a `FeatureFlag` and an `InstitutionFeatureOverride { enabled: true }` for that school.
- Switching **off** is always allowed.

## API
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/v1/institution/modules` | any signed-in user of the school | `{ modules: [{ key, group, label, labelBn, description, descriptionBn, defaultEnabled, switchedOn, entitled, enabled }], enabled: { key: bool } }` |
| PUT | `/api/v1/institution/modules` | ADMIN, SUPER_ADMIN | body `{ modules: { "<key>": true/false } }`. Unknown keys or non-booleans get 422; an unentitled switch-on gets 422 (except a super admin). |

The public site's `GET /api/v1/public/sites/resolve` also returns `site.modules`: the keys that are enabled.

## For engineers (later tracks)
- **Add a module:** add an entry to `backend/src/modules/institution/modules.registry.ts` **and** `frontend/src/lib/modules.ts` (same order), plus a label in `FEATURE_CATALOG`. That's all.
- **Backend gate:** `router.use(authenticate, setTenant, requireModule('<key>'))` from `src/middleware/requireModule.middleware.ts`. When the module is off it returns **403** `{ success: false, code: 'MODULE_DISABLED', module, message }`. There is a 15 s in-process cache, cleared on write.
- **Frontend:**
  - `useModuleEnabled(key)` and `useModules()` (`hooks/useModules.ts`; React Query, one cached request).
  - `<ModuleGate module="…">` (`components/common/ModuleGate.tsx`) hides children; add `redirectTo="/"` for pages.
  - Routes: `<ProtectedRoute module="…">` in `App.tsx` redirects to the dashboard.
  - Sidebar: add `module: '…'` to a nav item or category in `Sidebar.tsx`. The command palette follows automatically.
- **Website builder:** add `BlockName: '<key>'` to `BLOCK_MODULES` in `frontend/src/site/config.tsx`. The block then leaves the editor palette, renders nothing on the public site, and shows a "hidden" stub in the editor if a page still contains it.

## Tests
- `backend/tests/module-switches.test.ts`: registry logic, the GET/PUT API, role checks, validation, audit row, tenant isolation, and the plan block with super-admin override. It also checks the `MODULE_DISABLED` gate.
- `frontend/src/lib/__tests__/modules-logic.test.ts` (self-running): defaults, nav filtering, block availability.

## Bangla terms
মডিউল (module) · চালু (on) · বন্ধ (off) · ইসলামিক / মাদ্রাসা · ঐচ্ছিক মডিউল (optional modules) · আপনার প্ল্যানে নেই (not in your plan)
