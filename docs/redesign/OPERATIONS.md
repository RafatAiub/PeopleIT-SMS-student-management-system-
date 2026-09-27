# Operations runbook

This covers error tracking, backups and restore drills, monitoring, and the operational side of the SaaS layer part B features: API keys, webhooks, support tickets, data export, usage metering and the offline-capable PWA.

**Deployment topology.** The owner's server is **cPanel shared hosting**, not a VPS. It has 3 GB of disk, no root and no Docker. The realistic split is:

| Part | Where it runs |
|---|---|
| Frontend | Static files in `public_html` on cPanel, or on Vercel |
| Backend | Render, or cPanel "Setup Node.js App" if the plan includes it |
| Database | PostgreSQL on **Neon** |
| Redis | Separate host (see `DEPLOYMENT.md`) |

Every recommendation below assumes this setup.

---

## 1. Error tracking (optional Sentry)

`backend/src/config/errorTracking.ts` is a **strict no-op unless `SENTRY_DSN` is set**. `@sentry/node` is not a dependency, so nothing is loaded by default.

**To enable it:**

1. Install the package:
   ```bash
   npm install @sentry/node --workspace=backend
   ```
2. Set these variables (see `.env.example`):
   - `SENTRY_DSN`
   - optionally `SENTRY_ENVIRONMENT` (default `NODE_ENV`)
   - optionally `SENTRY_TRACES_SAMPLE_RATE` (default `0`, errors only)
3. Wire it in. The lead makes these edits; this feature does not edit those files.
   - `backend/src/server.ts` — put these at the very top, before the other imports:
     ```ts
     import { initErrorTracking } from './config/errorTracking';
     initErrorTracking();
     ```
   - `backend/src/app.ts` — add the import with the others, then register the handler immediately **before** `app.use(globalErrorHandler)`:
     ```ts
     import { errorTrackingHandler } from './config/errorTracking';
     app.use(errorTrackingHandler);
     ```

**What gets reported:**
- Only 5xx errors and unexpected throws. Validation, 401/403 and 404 errors are not sent.
- Tags: method, path (without the query string), `institutionId` and `userId`.

**Privacy:**
- Request bodies, cookies, and the `Authorization` and `X-API-Key` headers are stripped in `beforeSend`.
- `sendDefaultPii` is off.

**Failure behaviour:** if `SENTRY_DSN` is set but the package is missing, the app logs one warning and keeps running.

**Frontend:** there is no frontend Sentry. If you want it later, use `@sentry/react` with the same DSN project, the same `beforeSend` scrubbing, and `import.meta.env.VITE_SENTRY_DSN`.

**Without Sentry:** errors still go to the winston logger as JSON lines in production. Render keeps them in its log view; cPanel keeps them in `stderr.log` for the Node app.

---

## 2. Backups

### 2.1 Neon (primary protection)

Neon keeps a write-ahead log, so you can restore to any point inside its **history retention window**.
- Free tier: about 24 hours (6 hours on some plans).
- Paid plans: up to 7 or 30 days.
- Check the current window in the Neon console under **Settings → Storage → History retention**, and raise it if the plan allows.

**Before any risky change** (migrations, bulk imports, promotion runs), create a branch:
- Console: **Branches → New branch → from `main` at "now"**.
- CLI:
  ```bash
  neonctl branches create --name pre-migration-$(date +%F) --parent main
  ```
- A branch is a copy-on-write snapshot. It costs almost nothing until data diverges.
- Delete it after about a week.

**Point-in-time restore:**
1. Go to **Branches → main → Restore**, pick a timestamp, and restore to a **new** branch first.
2. Verify the new branch.
3. Either promote it, or point `DATABASE_URL` at it.

Never restore over `main` blindly.

### 2.2 Logical dumps (off-Neon copy)

Neon's history does not protect you against losing the Neon account or project, or against corruption older than the retention window. So also keep a **weekly `pg_dump`** stored somewhere other than Neon.

**Option A — cPanel cron.** Only if `pg_dump` exists there. Check first:
```bash
which pg_dump && pg_dump --version   # must be ≥ the Neon server major version (e.g. 16)
```
Shared hosting often has no PostgreSQL client tools. If it has none, use option B.

If `pg_dump` is available:
- Create `~/backups/pg_backup.sh`, outside `public_html`, with `chmod 700`.
- Put the connection string in a file with `chmod 600`. Never put it on the command line or in the cron line.

```bash
#!/bin/sh
set -eu
umask 077
DIR="$HOME/backups/pg"
mkdir -p "$DIR"
. "$HOME/backups/.pgenv"            # contains: export DATABASE_URL='postgresql://…?sslmode=require'
STAMP=$(date +%Y%m%d-%H%M)
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file "$DIR/sms-$STAMP.dump"
# 3 GB disk: keep only the newest 4 dumps
ls -1t "$DIR"/sms-*.dump | tail -n +5 | xargs -r rm -f
```

Add a cron entry in cPanel → **Cron Jobs**, for example weekly on Friday at 02:30:
```
30 2 * * 5 $HOME/backups/pg_backup.sh >> $HOME/backups/pg_backup.log 2>&1
```

**Disk:** watch it. The account has about 1.2 GB free. A custom-format dump of a school-sized database is typically tens of MB, but check the first one with `ls -lh`. Download a copy to a separate location (Google Drive or a local disk) at least monthly.

**Option B — scheduled GitHub Action or any machine with `pg_dump`.**
- Run the same `pg_dump` command against Neon.
- Store `DATABASE_URL` as an encrypted secret.
- Upload the dump as a private artifact, or to cloud storage.

Do **not** commit dumps: they contain personal data.

**Tenant self-service export.** The in-app **Data export** feature (`/data-export`) gives each school a ZIP of its own data. It is a portability feature, **not** a backup: there is no schema and no system tables, and it cannot be restored.

### 2.3 Restore drill (do it quarterly, and after major migrations)

1. Create an empty Neon branch named `restore-drill`, or use a local PostgreSQL of the same major version.
2. Restore:
   ```bash
   pg_restore --no-owner --no-privileges --clean --if-exists -d "$DRILL_URL" sms-YYYYMMDD-HHMM.dump
   ```
3. Check that `_prisma_migrations` has the latest migration, and compare row counts against production:
   ```sql
   SELECT count(*) FROM "Student";
   SELECT count(*) FROM "Invoice";
   SELECT count(*) FROM "Attendance";
   ```
4. Point a **local** backend at `DRILL_URL`, using a separate `.env`, never `backend/.env`. Run the `DEPLOYMENT.md` smoke test: login, the students list, record a payment, save attendance, save marks.
5. Record the date, dump age, restore time and any problems in the team log.
6. Delete the drill branch.

**Targets:**
- RPO: at most 24 hours with Neon history alone, at most 1 week for the dump.
- RTO: under 1 hour (Neon branch restore plus a `DATABASE_URL` switch).

---

## 3. Monitoring

| What | How | Alert |
|---|---|---|
| API up | External uptime check (UptimeRobot / Better Stack, free) on `GET https://<api-host>/health` every 5 min | 2 consecutive failures |
| Frontend up | Same tool on the site root | 2 consecutive failures |
| Cold starts (Render free) | Uptime pings also keep the instance warm | — |
| Errors | Sentry (section 1) or searching the logs for `"level":"error"` | Sentry issue alerts |
| Redis | Startup log line `Redis NOT reachable …` (see `server.ts`) | Manual check after deploys |
| Neon | Console: compute hours, storage, connections | Neon usage emails |
| Background jobs | Log lines: `Data export cleanup`, `Webhook delivery gave up after max attempts`, holiday / fee / library overdue jobs | Log search |
| Usage and cost | `/super-admin/usage` (platform) and `/usage` (tenant) — SMS, email, AI calls, estimated BDT | Review monthly |
| Support backlog | `/super-admin/support` — open and in-progress counts | Daily glance |

**Useful log searches.** Production logs are JSON.

| Search for | Meaning |
|---|---|
| `Webhook dispatch failed` | A code error when fanning out webhooks |
| `Webhook delivery gave up` | A receiver down for all 5 attempts |
| `Data export failed` | An export build error, for example disk full |
| `API key lastUsedAt update failed` | A database write hiccup; harmless |
| `SaaS: Wave C schema not available` / `Wave C database migration` | The migration is not applied |

---

## 4. SaaS layer part B — operational notes

### API keys and the public API

- Keys look like `psk_<8 hex>_<secret>`.
- Only the SHA-256 is stored. A lost key cannot be recovered: revoke it and create a new one.
- Clients send the key as `X-API-Key: psk_…` (or `Authorization: Bearer psk_…`) to `/api/v1/public-api/*`.
- **Rate limits:**
  - Per key: `PUBLIC_API_RATE_LIMIT_PER_MIN` (default 60).
  - Per IP: the global limiter (100/min) also applies.
  - The limiter is in-memory, so it resets on restart and is per instance.
- CORS: the public API is meant for **server-to-server** use. Browsers on other origins are blocked by the CORS allow-list, which is intended: a browser should never hold a key.

### Webhooks

**Delivery:**
- HTTPS POST with a 10-second timeout. Redirects are not followed.
- Signature header: `X-PeopleNIT-Signature: t=<unix>,v1=<hex>`. The value is the HMAC-SHA256 of `"<t>.<raw body>"` using the endpoint secret.
- Receivers should reject timestamps more than 5 minutes old. A Node receiver can reuse `verifySignature` from `backend/src/modules/webhooks/webhooks.logic.ts`.

**SSRF protection:**
- Only `https://` URLs are accepted.
- Rejected at save time: localhost, `.local`, `.internal` and similar names, private, loopback, link-local and metadata IPs, URLs with credentials, and ports below 1024 other than 443.
- **Every resolved IP is checked again at connect time**, which also defeats DNS rebinding.

**Retries:**
- Up to 5 attempts, about 10 s, 50 s, 4 min and 21 min apart.
- Only network errors, 408, 425, 429 and 5xx are retried.
- **Retries are in-process timers**, so a restart drops pending retries. The delivery log keeps every attempt, and admins can press **Redeliver**.

**Events currently emitted:**

| Event | Emitted from |
|---|---|
| `student.created` | `POST /students` |
| `payment.received` | Offline payment recording (`POST /fees/invoices/:id/payments/offline`) |

`attendance.submitted` and `invoice.overdue` can already be subscribed to, but nothing emits them yet. To add them, call `emitWebhook(institutionId, 'attendance.submitted', {...})` after a successful bulk submit, and `emitWebhook(..., 'invoice.overdue', {...})` from the overdue job.

**Housekeeping:** the delivery log grows without limit. If it gets large, delete rows older than 90 days:
```sql
DELETE FROM "WebhookDelivery" WHERE "createdAt" < now() - interval '90 days';
```

### Data export

- ZIPs are written to `DATA_EXPORT_DIR`. The default is `<os tmpdir>/peopleit-exports`.
  - **On cPanel**, set a path **outside `public_html`**.
  - Watch disk: each export is roughly 1–5 MB per 1,000 students, plus attendance.
- **Retention:** files are deleted after 7 days by the hourly cleanup job. At boot, jobs left `RUNNING` are marked `FAILED` and `PENDING` jobs are re-queued.
- **Render:** Render's disk is ephemeral, so a redeploy removes files. The download then returns 410 and the admin requests a new export.
- **Limits:** at most one export in progress, and 5 requests per 24 hours, per institution.
- **Audit:** every download writes an `AuditLog` row with action `DATA_EXPORT_DOWNLOAD`. Completion writes `DATA_EXPORT_COMPLETED` with row counts.
- **Wiring (lead):** in `server.ts`, start and stop the cleanup job next to the other in-process jobs:
  ```ts
  import { startDataExportJob, stopDataExportJob } from './modules/data-export/dataExport.scheduler';
  // after startReportScheduleJob();
  startDataExportJob();
  // in gracefulShutdown, after stopReportScheduleJob();
  stopDataExportJob();
  ```

### Usage and cost estimates

**Data sources:**

| Metric | Source |
|---|---|
| `AI_CALL` | `UsageRecord`, written by the AI module |
| Campaign SMS and email | `UsageRecord`, written by campaigns. SMS is counted in segments |
| Transactional SMS and email | `NotificationDelivery` rows with status `SENT`. Campaign rows are excluded so nothing is double-counted |

`SKIPPED` deliveries (demo mode or opted out) and demo AI calls are shown as "not billed".

**Pricing:**
- Unit prices come from `COST_PER_SMS_BDT`, `COST_PER_EMAIL_BDT`, `COST_PER_AI_CALL_BDT` and `COST_PER_STORAGE_MB_BDT`.
- If a price is unset, that metric shows usage with no cost.
- Every figure is labelled **estimate** in the UI. Reconcile against the SMS provider's and Anthropic's invoices monthly, and adjust the prices.

### Support tickets

- Tenant users use `/support`.
- Platform super admins use `/super-admin/support`, which is cross-tenant with no `X-Institution-Id` needed, mirroring `billing/super-admin`.
- Platform replies and updates write an `AuditLog` row in the ticket's institution, with action `SUPPORT_REPLY` or `SUPPORT_UPDATE`.
- There are no attachments yet (no storage utility), and no email notification on reply.

---

## 5. PWA (installable app and offline attendance)

`vite-plugin-pwa` and `idb-keyval` are installed. The app code lives in `frontend/src/pwa/`. The lead makes these edits; `vite.config.mts`, `main.tsx` and the layout are not edited by this feature.

**1. `frontend/vite.config.mts`:**

```ts
import { VitePWA } from 'vite-plugin-pwa';
import { pwaManifest } from './src/pwa/manifest';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,            // registration is done in src/pwa/registerServiceWorker.tsx
      includeAssets: ['favicon.svg'],
      manifest: pwaManifest,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Never cache API responses: they carry personal data and must be fresh.
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // …resolve, build, server unchanged
});
```

- The existing `manualChunks` split is unaffected.
- On Vercel, serve `sw.js` with `Cache-Control: no-cache` so updates are picked up. Vercel's default for non-hashed files already does this.

**2. `frontend/src/main.tsx`** — register the service worker. Do this only after step 1; the virtual module does not exist without the plugin:
```ts
import { registerServiceWorker } from './pwa/registerServiceWorker';
registerServiceWorker();
```

**3. App layout** — optional, shows offline status everywhere. Put it above the page outlet:
```tsx
import { OfflineBanner } from '@/components/saas/OfflineBanner';
<OfflineBanner className="mb-4" />
```

**Icons:**
- Only `public/favicon.svg` exists. Chrome and Edge accept an SVG with `sizes: "any"`.
- For iOS and older Android, add `public/pwa-192.png`, `public/pwa-512.png` and `public/apple-touch-icon.png`, list them in `src/pwa/manifest.ts`, and add `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` to `index.html`.

**Offline attendance behaviour:** see the help article `/help?article=offline-attendance`.
- Queued registers live in IndexedDB (`peoplenit-offline` / `attendance-queue`), scoped per user and institution.
- A replay rejected with a 4xx becomes a conflict that the user retries or discards.
- A 401 waits until the user signs in again.
