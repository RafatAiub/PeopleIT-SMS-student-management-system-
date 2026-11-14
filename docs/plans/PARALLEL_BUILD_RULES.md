# Parallel build rules (P1–P5 run at the same time in one working tree)

The owner approved 5 engineers working at once (2026-10-31). Everyone edits the **same checkout** on branch `Habib`, so these rules prevent us from breaking each other's work. The "Rules for every track" in `ISLAMIC_OPS_BUILD.md` still apply, except where this file changes them.

## Who owns what
| Track | Owns (create/edit freely) | Migration folder |
|---|---|---|
| P1 Platform billing | `backend/src/modules/billing/**`, `frontend/src/pages/billing/**`, `frontend/src/pages/superadmin/billing/**`, `backend/src/modules/billing/accessLevel.ts`, tenant/subscription middleware | `20261031090000_p1_platform_billing` |
| P2 Student fees | `backend/src/modules/fees/**` (except `receipts/` PDF rendering), `backend/src/modules/fee-setup/**`, `frontend/src/pages/fees/**` (except print/PDF files) | `20261031100000_p2_student_fees` |
| P3 Print designer and Bangla PDF | new `backend/src/modules/print-templates/**`, `backend/src/utils/pdf*.ts`, `backend/src/modules/fees/receipts/**` (PDF parts), `frontend/src/pages/fees/PrintDocuments.tsx`, new `frontend/src/pages/settings/print/**`, font assets | `20261031110000_p3_print_templates` |
| P4 Dues, reports and restrictions | new `backend/src/modules/fee-dues/**`, new `frontend/src/pages/fees/dues/**`, the restriction checks inserted into results/admit-card/ID-card/login code | `20261031120000_p4_dues_restrictions` |
| P5 SMS credits and providers | `backend/src/utils/sms*.ts`, new `backend/src/modules/sms-credits/**`, `backend/src/modules/notifications/channels/sms.channel.ts`, campaigns' SMS sending, new `frontend/src/pages/sms/**` or settings tab | `20261031130000_p5_sms_credits` |

You may need to touch a file another track owns (for example, P4 reading fee tables). In that case:
- make the **smallest possible targeted edit**
- **re-read the file immediately before editing**
- never rewrite or reformat a whole file
- note the edit in your final report

## Shared hot files (everyone edits a few lines, so be surgical)
These files are `backend/prisma/schema.prisma`, `backend/src/app.ts` (route registration), `frontend/src/App.tsx` (routes), `frontend/src/components/Layout/Sidebar.tsx`, `frontend/src/i18n/bn.ts`, `.env.example` and `render.yaml`.
- Re-read right before each edit, and use a small unique `old_string`.
- If an edit fails because the file changed, re-read it and retry. Never overwrite someone else's lines.
- **schema.prisma:** put your models in your **own commented section at the END of the file**, headed `// ── P<n> <name> ──`. Add back-relation fields on existing models (Institution, Student, User…) as single lines. Don't reorder anything.

## Migrations (important)
- Your migration must contain **only your track's changes**. Do NOT diff HEAD against the live schema.prisma, because it also contains other tracks' in-progress models. Instead:
  1. `git show HEAD:backend/prisma/schema.prisma > <scratch>/base.prisma`
  2. Copy base.prisma to `<scratch>/mine.prisma` and add ONLY your section, plus your back-relation and enum lines, to it.
  3. `npx prisma migrate diff --from-schema-datamodel <scratch>/base.prisma --to-schema-datamodel <scratch>/mine.prisma --script > prisma/migrations/<your folder>/migration.sql`
- **Your track DB:** `sms_track_p<n>`. Other tracks' migration folders may also exist and be applied there; that's fine.
  - If `migrate deploy` says another track's migration was modified, recreate your DB:
    `docker exec sms_postgres psql -U sms_user -d postgres -c "DROP DATABASE sms_track_p<n>" -c "CREATE DATABASE sms_track_p<n> TEMPLATE sms_redesign"`, then `migrate deploy`.
  - If your tests fail on a column another track added (Prisma selects every column), run `npx prisma migrate deploy` again on your DB.
- `prisma generate` may hit EPERM (the dev server locks the DLL) or run at the same moment as another track's. Retry once. The generated client includes everyone's models, which is fine.

## Running things
- **Env, always:** `SKIP_DOTENV=true DATABASE_URL=postgresql://sms_user:sms_pass@localhost:5433/sms_track_p<n> BACKGROUND_JOBS=false`.
- For jest, also set `DOTENV_CONFIG_PATH=<path to an empty file>`. Never read, use or print `backend/.env` (it is PRODUCTION).
- **Tests:** run only your own new test files (`backend/tests/p<n>-*.test.ts`, plus frontend logic tests). Also run existing test files that cover code you changed. Never the full suite. No sub-agents.
- **tsc:** run `tsc --noEmit` per workspace at the end. **Fix only errors in your files.** If errors come from another track's in-progress files, list them in your report and don't touch them.
- **Do NOT run `vite build`.** The lead runs one integrated build after all tracks finish.
- Don't stop or start the owner's dev servers (backend :3001 with tsx watch, frontend :5173).
- No git commit, stash, checkout, reset or clean. The lead commits.
