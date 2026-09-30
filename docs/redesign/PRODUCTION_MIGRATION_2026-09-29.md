# Production migration — 2026-09-29

Production (Neon) was migrated from branch `Habib` **without** merging `origin/main` first, at the owner's request. This note records the one deviation, so the future merge handles it.

## What production had
- Before this run, production's last migration in common with `Habib` was `20260925150000_add_session_years_and_events`.
- It also had 4 migrations from `origin/main` that `Habib` does not have:
  - `20260924090000_add_exam_module`
  - `20260927090000_add_staff_roles`
  - `20260927120000_add_staff_attendance`
  - `20260928090000_add_class_fees_broadcasts_website_items`

## What was applied
1. **`20260927000000_wave_c_feature_foundation`**, run with its 7 `StaffAttendance` statements removed (the table, 3 indexes, 3 foreign keys), as a single transaction via `prisma db execute`. It was then marked applied with `prisma migrate resolve --applied`.
2. **`20260928000000_sites_builder`**, **`20260929000000_sites_commerce_lms`**, **`20260929100000_email_delivery`** and **`20260929200000_sites_portal_data`**, applied normally with `prisma migrate deploy`.

The same procedure was rehearsed first on a local database built with production's exact history (`sms_prodsim`). A full `pg_dump` backup was taken before the run and saved at `D:/PeopleIT/backups/prod-before-v3-migration-2026-09-29.dump` (80 tables, outside the repo).

## Open conflict: `StaffAttendance`

| Side | Columns | Links to |
|---|---|---|
| `main` (**what production has now**) | `staffId`, `date TIMESTAMP` | `StaffProfile` |
| `Habib` | `staffUserId`, `date DATE`, `checkIn`, `checkOut`, `note`, `markedByUserId` | `User` |

**Consequence:** until the branches are merged, `Habib`'s staff-attendance screens won't work against production. Everything `main` serves today keeps working.

**When merging:** choose one model. Then write a migration that converts production's `main`-shaped table, mapping `staffId` → the profile's user id and adding the extra columns. Don't recreate the table.

## Update 2026-09-30: conflict resolved

The `dev` branch (a teammate's merge of `main` + `Habib`) added two migrations, and they were applied to production on 2026-09-29 at 13:35 UTC:

- **`20260929300000_unify_staff_attendance`** converted production's `main`-shaped `StaffAttendance` to the `Habib` model (`staffUserId`, check-in/out, note, marked-by). The table had 0 rows.
- **`20260929310000_drop_duplicate_tables`** dropped `ExamTimetableSlot`, `ExamGrade`, `WebsiteItem` and the `WebsiteItemType` enum.
  - If any of those held data, it is in the pre-migration backup `D:/PeopleIT/backups/prod-before-v3-migration-2026-09-29.dump`.
- `main`'s `20260927120000_add_staff_attendance` is now a guarded no-op when the table exists, so a fresh database replays the full chain cleanly.

`Habib` merged `origin/dev` (`b413fe7`). The repo's migration history now matches production exactly: `prisma migrate status` reports "up to date".

One new forward migration is pending for production:

- **`20260930090000_leave_request_type_set_null`** changes the `LeaveRequest.leaveTypeId` foreign key from RESTRICT to SET NULL, to match the schema. It's safe: it only changes how deleting a leave type affects leave requests.
