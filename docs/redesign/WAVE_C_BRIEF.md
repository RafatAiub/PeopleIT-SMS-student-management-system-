# Wave C — Feature Engineer Brief (full-stack)

Wave C builds the missing features. The owner has approved them. **Read `docs/redesign/ENGINEER_BRIEF.md` first**; every rule there still applies to frontend work. This file adds the backend rules and the demo-mode rules.

## Database

- The schema is **already done**. All new models and columns are in `backend/prisma/schema.prisma`, and each is listed with a one-line description in `docs/redesign/WAVE_C_SCHEMA.md`.
- **Do not edit `schema.prisma`.** If something is truly missing, stop and report it.
- The migration `20260927000000_wave_c_feature_foundation` is **not applied** to any database.
  - Never run `prisma migrate`, `db push`, `reset`, seeds or jest.
  - `backend/.env` is **production**.
  - `npx prisma generate` is safe, because it doesn't connect to a database.
- Code must still **compile and degrade gracefully** in production until the migration runs. A new endpoint may fail at runtime before the migration is applied. That's acceptable, but existing endpoints must not change behaviour.

## Backend conventions (copy an existing module such as `leave` or `holidays`)

- **Module layout:** `backend/src/modules/<feature>/` with `<feature>.routes.ts`, `.controller.ts`, `.service.ts`, `.repository.ts` and `.dto.ts` (zod).
- **Routers:** `router.use(authenticate, setTenant, auditLog)`, then `requireRole(...)` on each route, then `validate({ body | query | params: Dto })`.
- **Responses:** `successResponse(res, data, message)` from `utils/response`. Errors go through `next(error)`, using `AppError`, `NotFoundError`, `ForbiddenError` or `ValidationError` from `utils/AppError`.
- **Tenant isolation is mandatory:**
  - Every query filters by `institutionId = req.tenantId`.
  - Every client-supplied foreign-key ID is verified to belong to the tenant before it's written.
- **Pagination:** every list endpoint takes `page` and `pageSize` (max 100) and returns `{ items|data, meta: { total, page, pageSize } }`, matching the existing modules.
- **Mounting routers:** do **not** edit `backend/src/app.ts`. Report the exact mount line, for example `app.use('/api/v1/inventory', inventoryRouter)`, and the lead adds it.
- **Tests:** write DB-free unit tests (mock prisma the way `backend/tests/invoiceNumber-tenantTag.test.ts` does) for pure logic: calculations, validators, adapters. Don't execute DB-backed tests.
- **Verify:** `cd backend && npx tsc --noEmit -p .` must show 0 errors, and `npx eslint src/modules/<feature>` must show 0 errors.

## Demo mode (features that need an API key)

- Read keys only from `process.env` (for example `SSLCOMMERZ_STORE_ID`, `BKASH_APP_KEY`, `NAGAD_MERCHANT_ID`, `ANTHROPIC_API_KEY`, `SMS_API_KEY`, `SMTP_HOST`). Add every new variable name, with a comment, to the root `.env.example` and `backend/.env.example` if it exists. **Never commit real values.**
- **Key missing → demo mode:**
  - The service must still work end to end with realistic behaviour: simulated gateway, templated AI text, SMS logged rather than sent.
  - Persist `isDemo = true` where the model has that column.
  - Return `demo: true` in the API response.
- **Key present:** use the real integration. Make it server-side only, with timeouts and error handling.
- **Frontend:** whenever the API says `demo: true`, show `<Alert tone="warning" title="Demo mode">…API key not configured; nothing was really sent/charged…</Alert>`. Never present demo output as real.
- **AI output:** anything shown to guardians or students goes through an `AiDraft` with status DRAFT, and staff approve or edit it before it's published. Always label AI text with `<AiGeneratedNotice>`. Call AI server-side only.

## Frontend

- Pages go in `frontend/src/pages/<feature>/`. Call the API through `apiClient`, and use React Query.
- **Do not edit** `App.tsx`, `Sidebar.tsx` or `src/components/**`. Report routes (path, component, `allowedRoles`) and sidebar entries (group, label, roles), and the lead adds them.
- Role access must mirror your backend `requireRole` lists exactly.

## Final report (required)

1. Files created and changed.
2. Endpoints: method, path, roles, request, response.
3. Mount lines for `app.ts`.
4. Routes and sidebar entries for the frontend.
5. New environment variables.
6. What runs in demo mode.
7. Anything incomplete.
