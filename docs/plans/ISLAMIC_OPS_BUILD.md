# Islamic and Operations Feature Build: brief and rules

Owner request (2026-10-16): build every gap from `AMANAHLY_GAP_PLAN.md` §3. Islamic/madrasah features are switched on per school in **Settings**; when they're off, they don't appear anywhere (sidebar, routes, dashboards, guardian app, website blocks), and the backend refuses their APIs.

## Build order (one track at a time; the lead commits after each one passes)
| # | Track | Islamic switch? |
|---|---|---|
| T0 | **Module switches**: the Settings → Modules page, plus sidebar, route and API gating | — |
| T1 | **Donations, Zakat and Sadaqah**: funds, donors, one-off and monthly giving, receipts, campaigns, public donate page and website block | ✅ `islamic.donations` |
| T2 | **Character (আখলাক) scoring and badges** | ✅ `islamic.character` |
| T3 | **Family profile**: siblings, guardians, combined fees, notes, pay all children at once | — |
| T4 | **Admissions CRM extras**: stage board, owner, next step and due date, tasks, follow-up reminders, conversion report, duplicate merge | — |
| T5 | **Trash and restore**: soft delete plus a 30-day recycle bin | — |
| T6 | **Permission editor and branch scoping**: custom roles, per-feature rights, branch-limited staff | — |
| T7 | **Tutor sessions and payouts**: per session or hour, timesheets, payout statements, "My payouts" | optional `tutor_payouts` |
| T8 | **General ledger**: fees, donations, payouts and expenses in one ledger; cash book; income vs expense | — |
| T9 | **Parent–teacher appointments**: availability, slot booking, reminders | optional `appointments` |
| T10 | **Class discussions**: a feed per class | — |
| T11 | **Events RSVP**, plus volunteer sign-ups | — |
| T12 | **Shared school mailbox**: Brevo inbound email shown as threads, assigned to staff | optional `mailbox` |
| T13 | **Custom report builder** | — |
| T14 | **School groups**: one board over many schools, with roll-up dashboards | super-admin managed |

Later and optional: a **Qur'an/Hifz tracker** (`islamic.hifz`), recommended for madrasahs but not in the owner's list.

## Module switches (T0 contract; every later track uses it)
- **Storage:** per institution (an additive column or table, chosen in T0), and editable by ADMIN in **Settings → Modules**.
- **Groups:**
  - "Islamic / Madrasah": `islamic.donations`, `islamic.character`, `islamic.hifz`. **All off by default.**
  - "Optional modules": `tutor_payouts`, `appointments`, `mailbox`. **Default on.**
- **Backend:** one middleware, `requireModule('<key>')`, on every route of a switchable feature. When the module is off it returns 403 with code `MODULE_DISABLED`.
- **Frontend:**
  - One hook, `useModuleEnabled(key)`, plus `GET /institution/modules` (cached with React Query).
  - The sidebar, routes (redirect to the dashboard), dashboard widgets and guardian/student views all hide when the module is off.
- **Website builder:** blocks or modules for a disabled feature are hidden from the palette and render nothing publicly.
- **Plan entitlements:** switches sit on top of the existing plan entitlements. A module the school's plan doesn't include can't be switched on.

## Rules for every track
- **Data:** additive schema only. Multi-tenant: every query scoped by `institutionId`. Role-based access on every route. Audit-logged. Bangla and English UI. No mock data.
- **Database:**
  - Put the new models in their own clearly commented section of `backend/prisma/schema.prisma`.
  - Generate **one migration per track**: `npx prisma migrate diff --from-schema-datamodel <copy of HEAD's schema> --to-schema-datamodel prisma/schema.prisma --script` into `backend/prisma/migrations/<timestamp>_<track>/migration.sql`.
  - Test it on a local copy of `sms_redesign` (`createdb -T sms_redesign sms_track_tN`, then `npx prisma migrate deploy`). **Never touch `backend/.env`; it points at production.**
- **Performance (the owner's PC hangs under load):**
  - One engineer at a time. Never run the full jest suite; run only your own new test files.
  - Never set `--max-old-space-size` above 4096.
  - Run `tsc --noEmit` once per workspace at the end, eslint on touched files, and one `vite build` at the very end.
  - Don't start or stop the owner's dev servers.
- **UI:** match the existing redesign (brand #f57722 never carries white text; buttons #c2550a). Accessible, and works at 360 px.
- **Finishing:** no git commit or push (the lead commits). Write a short "how to use" section for the feature into `docs/features/<track>.md`.
