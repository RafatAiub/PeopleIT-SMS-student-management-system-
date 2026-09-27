# Deploying the redesign branch — read before going live

## 1. Apply the database migration FIRST

The Wave C features read new tables and columns. The migration `backend/prisma/migrations/20260927000000_wave_c_feature_foundation` is **additive only**: new tables, nullable or defaulted columns, and indexes. It has **not** been applied to any database.

**Deploying the new backend before this migration will break existing screens.** For example, recording a fee payment reads `Payment.receiptNo`.

Order:

1. **Back up** the production database (for Neon, create a branch or snapshot).
2. Apply the migration to a **staging copy** first:
   ```bash
   cd backend
   DATABASE_URL=<staging-url> npx prisma migrate deploy
   ```
3. Smoke-test staging:
   - Login
   - Students list and profile
   - Record an offline fee payment
   - Attendance save
   - Marks save
4. Apply the migration to production (`npx prisma migrate deploy` with the production URL).
5. Deploy the backend, then the frontend.

## 2. Environment variables

See `.env.example`. None of the variables below are required for the app to run. Missing keys switch the related feature to **demo mode**, which is clearly labelled in the UI.

| Feature | Variables | Without them |
|---|---|---|
| SSLCommerz fees | `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD` (same as billing) | Demo checkout |
| bKash fees | `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_BASE_URL` | Demo checkout |
| Nagad fees | `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_PUBLIC_KEY` / `NAGAD_PUBLIC_KEY`, `NAGAD_MERCHANT_PRIVATE_KEY` / `NAGAD_PRIVATE_KEY`, `NAGAD_BASE_URL`, optional `NAGAD_CLIENT_IP` | Demo checkout |
| Demo payments switch | `FEE_DEMO_PAYMENTS_ENABLED` | **Off in production by default.** Set it to `true` only on staging or for demos: a simulated success marks invoices paid without money moving |
| AI features | `ANTHROPIC_API_KEY`, optional `AI_MODEL`, `AI_MODEL_ADVANCED` | Rule-based output from real school data, labelled demo |
| SMS / email campaigns | SMS provider and SMTP variables | Messages are logged but not sent, labelled demo |

## 3. Payment gateway setup

- **Callback URLs** to register with each gateway: `https://<api-host>/api/v1/fees/gateway/{sslcommerz|bkash|nagad}/{ipn|success|fail|cancel|callback}`.
- **Security checks** on these routes:
  - They are public.
  - They are exempt from CORS and from the global IP rate limit.
  - Every callback is verified with the gateway before anything is credited.
- **Before going live:** test each gateway in its sandbox. The integrations follow each provider's documented API but have not yet been run against a sandbox.

## 4. Background jobs

The backend runs these as in-process timers, so they work without Redis:

| Job | Frequency |
|---|---|
| Government holiday sync | Daily |
| Fee overdue marking | Daily; can also be run from **Fees → Mark overdue** |
