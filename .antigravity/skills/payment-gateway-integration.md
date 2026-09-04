# Skill: Payment Gateway Integration (Student Fees)

## Rule Overview
This module governs wiring **real** payment providers (bKash, Nagad, SSLCommerz) into the
**student fee** flow (`modules/fees`) — replacing the mock classes in
`modules/fees/gateways/*.stub.ts`. It covers gateway client structure, the public
callback/IPN route, idempotent crediting, amount/tenant verification, credential handling,
and settlement reconciliation.

The platform **subscription** billing flow (`modules/billing`, institutions paying PeopleIT
via SSLCommerz) is already fully implemented and is the reference to copy from —
`modules/billing/gateways/sslcommerz.client.ts` and `billing.service.ts` `creditPayment` are
the proven templates. **Do not modify `modules/billing` and do not merge the two flows.**
`Payment` (student fees) and `SubscriptionPayment` (platform billing) are separate tables and
must stay separate.

---

## System Separation

### ✅ REQUIRED — Keep student-fee and platform-billing payments physically separate

| Concern | Student fees | Platform subscription billing |
|---|---|---|
| Prisma model | `Payment` (relation to `Invoice`) | `SubscriptionPayment` (relation to `Subscription`) |
| Service | `modules/fees/fee.service.ts` | `modules/billing/billing.service.ts` |
| Gateway client | `modules/fees/gateways/<provider>.client.ts` (new) | `modules/billing/gateways/sslcommerz.client.ts` (done) |
| Callback route | `/api/v1/fees/gateway/*` (new) | `/api/v1/billing/gateway/*` (done) |
| Enabled flags | `BKASH_ENABLED` / `NAGAD_ENABLED` / `SSLCOMMERZ_ENABLED` (shared env, different consumers) | same flags, `modules/billing` consumer |

A single gateway client instance, transaction ID, or `rawGatewayResponse` row must never be
shared across the two. If SSLCommerz is used for both, they still get **separate client
files** and **separate `tran_id` namespaces** (prefix fee transactions, e.g.
`FEE-{invoiceNo}-{nonce}`).

---

## Gateway Client Structure

### ✅ REQUIRED — One real client + one mock sibling + a factory

Mirror `modules/billing/gateways/sslcommerz.client.ts`: a class of `static async` methods,
each guarded by the provider's `*_ENABLED` flag, each wrapping `fetch` in `try/catch` and
returning a **structured result object — never throwing** on a network/gateway error.

```typescript
// modules/fees/gateways/sslcommerz.client.ts  — REAL client (student fees)
// Structure copied from modules/billing/gateways/sslcommerz.client.ts
export interface GatewaySessionResult {
  success: boolean;
  paymentUrl?: string;
  message: string;
}
export interface GatewayValidationResult {
  valid: boolean;
  amount?: number;
  currency?: string;
  tranId?: string;
  raw: unknown;
}

export class FeeSslCommerzClient {
  static async initiateSession(params: InitiateSessionParams): Promise<GatewaySessionResult> {
    if (!env.SSLCOMMERZ_ENABLED) {
      return { success: false, message: 'SSLCommerz is not enabled' };
    }
    try {
      const response = await fetch(`${env.SSLCOMMERZ_BASE_URL}/gwprocess/v4/api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ /* store_id, store_passwd, total_amount, tran_id, *_url, cus_* */ }).toString(),
      });
      const json: any = await response.json();
      return { success: json?.status === 'SUCCESS', paymentUrl: json?.GatewayPageURL, message: json?.failedreason || json?.status || 'OK' };
    } catch (error) {
      logger.error('FeeSslCommerz initiateSession failed', { error: error instanceof Error ? error.message : String(error), tranId: params.tranId });
      return { success: false, message: 'Failed to reach SSLCommerz gateway' };
    }
  }

  static async validateTransaction(valId: string): Promise<GatewayValidationResult> {
    // GET validator/api/validationserverAPI.php?val_id=&store_id=&store_passwd=&format=json
    // valid = json.status === 'VALID' || json.status === 'VALIDATED'
    // amount = parseFloat(json.amount); currency = json.currency; return { ..., raw: json }
  }
}
```

```typescript
// modules/fees/gateways/sslcommerz.mock.ts  — used in tests and when the flag is off
export class FeeSslCommerzMock {
  static async initiateSession(p: InitiateSessionParams): Promise<GatewaySessionResult> {
    return { success: true, paymentUrl: `mock://pay/${p.tranId}`, message: 'MOCK' };
  }
  static async validateTransaction(valId: string): Promise<GatewayValidationResult> {
    return { valid: true, amount: MOCK_AMOUNT_SET_BY_TEST, currency: 'BDT', tranId: valId, raw: { mock: true } };
  }
}
```

```typescript
// modules/fees/gateways/index.ts — factory
export function feeGateway(provider: 'BKASH' | 'NAGAD' | 'SSLCOMMERZ') {
  const useMock = env.NODE_ENV === 'test' || !isProviderEnabled(provider);
  switch (provider) {
    case 'SSLCOMMERZ': return useMock ? FeeSslCommerzMock : FeeSslCommerzClient;
    // bKash: token grant (POST /tokenized/checkout/token/grant) then create/execute
    // Nagad: RSA-signed initialize + complete; keep the crypto in the client, not the service
  }
}
```

`fee.service.ts#initiateOnlinePayment` (currently calling `SslCommerzGateway` stub) switches
to `feeGateway(method).initiateSession(...)` and, **before** returning the URL, creates a
`Payment` row with `status: 'PENDING'` carrying the `tran_id` so the callback can find it.

### ✅ REQUIRED — Never block server startup on a gateway

Gateway job/health registration must run **after** `server.listen()`, non-blocking, with a
`.catch()` that logs — exactly as `server.ts` registers `registerSubscriptionLifecycleJob()`
(commit `e8bb2a5` fixed a Redis-hang boot failure caused by `await`ing it before `listen`).
Never `await` a gateway reachability check in the module top level or in `app.ts`.

---

## Callback / IPN Route

### ✅ REQUIRED — Public, CORS-exempt, mounted before the authed fees router

Add a `feeGatewayRouter` mirroring `gatewayBillingRouter` (`billing.routes.ts:172`):

```typescript
// modules/fees/fee.routes.ts (or a new fee.gateway.routes.ts)
export const feeGatewayRouter = Router();
feeGatewayRouter.post('/ipn', feeController.handleGatewayIpn);
feeGatewayRouter.get('/success', feeController.handleGatewayRedirect);   // SSLCommerz redirects via
feeGatewayRouter.post('/success', feeController.handleGatewayRedirect);  // an auto-submitting POST form
feeGatewayRouter.get('/fail', feeController.handleGatewayRedirect);
feeGatewayRouter.post('/fail', feeController.handleGatewayRedirect);
feeGatewayRouter.get('/cancel', feeController.handleGatewayRedirect);
feeGatewayRouter.post('/cancel', feeController.handleGatewayRedirect);
// NO authenticate, NO setTenant — the gateway's servers cannot send our JWT.
```

Mount it in `app.ts` **before** the authenticated `feesRouter`, at `/api/v1/fees/gateway`,
and extend the CORS bypass (`app.ts:62`) so foreign origins are allowed for it:

```typescript
// app.ts cors() callback
if (req.path.startsWith('/api/v1/billing/gateway/') || req.path.startsWith('/api/v1/fees/gateway/')) {
  callback(null, { origin: true, credentials: false });
  return;
}
```

### ✅ REQUIRED — The redirect params are NOT proof of payment

The browser redirect (`success_url`) and even the IPN body are attacker-influenceable. The
**only** trusted signal is a server-to-server re-validation call. Copy `creditPayment`
(`billing.service.ts:188`):

```typescript
async function creditFeePayment(payment: PaymentWithInvoice, valId: string | null | undefined): Promise<void> {
  if (!valId) { logger.error('Fee payment callback missing val_id', { paymentId: payment.id }); return; }

  const validation = await feeGateway('SSLCOMMERZ').validateTransaction(valId);   // trusted source of truth

  const amountMatches =
    validation.valid && validation.amount !== undefined &&
    Math.abs(validation.amount - Number(payment.amount)) < 0.01;                  // Decimal → Number, epsilon compare
  const currencyMatches = !validation.currency || validation.currency === (payment.currency ?? 'BDT');

  if (!validation.valid || !amountMatches || !currencyMatches) {
    await feeRepository.updatePaymentStatus(payment.id, 'FAILED', validation.raw);
    logger.error('Fee payment validation failed or amount/currency mismatch — potential tampering', {
      paymentId: payment.id, expectedAmount: Number(payment.amount), validation,
    });
    return;
  }
  // ...settle inside a transaction (next rule)
}
```

### ✅ REQUIRED — Crediting is idempotent via a status-guarded `updateMany`

Whichever of IPN / success-redirect arrives first does the crediting; the other is a
guaranteed no-op. Never `update` by id alone — use `updateMany` with a status guard and check
the count, exactly as `billing.service.ts:222`:

```typescript
await prisma.$transaction(async (tx) => {
  const res = await tx.payment.updateMany({
    where: { id: payment.id, status: { not: 'COMPLETED' } },   // guard: not already credited
    data: { status: 'COMPLETED', transactionRef: valId, rawGatewayResponse: validation.raw as any },
  });
  if (res.count !== 1) return;   // lost the race to a concurrent callback — do NOT recompute the invoice twice

  const invoice = await tx.invoice.findFirst({ where: { id: payment.invoiceId, institutionId: payment.institutionId } });
  if (!invoice) { logger.error('Fee payment credited but invoice missing', { paymentId: payment.id }); return; }

  const newPaid = Decimal.add(invoice.paidAmount, payment.amount);
  const newDue = Decimal.sub(invoice.totalAmount, newPaid);
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      paidAmount: newPaid,
      dueAmount: newDue.lt(0) ? new Decimal(0) : newDue,
      status: newDue.lte(0) ? 'PAID' : newPaid.gt(0) ? 'PARTIAL' : 'UNPAID',
    },
  });

  await tx.auditLog.create({
    data: {
      institutionId: payment.institutionId, userId: payment.recordedBy ?? systemActorId,
      action: 'FEE_PAYMENT_SUCCESS', resource: 'Invoice', resourceId: invoice.id,
      metadata: { tranId: payment.transactionRef, valId, amount: Number(payment.amount) },
    },
  });
});
```

The invoice recompute logic is the same one `fee.repository.ts#recordPayment` already uses
for offline payments — extract it into one shared helper so offline and online settlement
cannot drift.

### ✅ REQUIRED — `handleIpn` short-circuits on already-settled payments

```typescript
export async function handleGatewayIpn(payload: Record<string, unknown>): Promise<void> {
  const tranId = payload?.tran_id as string | undefined;
  const valId = payload?.val_id as string | undefined;
  if (!tranId) { logger.warn('Fee IPN without tran_id', { payload }); return; }

  const payment = await feeRepository.findPaymentByTransactionRef(tranId);
  if (!payment) { logger.warn('Fee IPN for unknown tran_id', { tranId }); return; }   // 200 OK, not 404 — never leak existence
  if (payment.status === 'COMPLETED') return;                                          // idempotent no-op

  await creditFeePayment(payment, valId);
}
```

The controller responds `200` to the gateway even for unknown/failed cases (a `4xx`/`5xx`
makes the gateway retry forever). Redirect handlers wrap `creditFeePayment` in `try/catch`
and always end by redirecting the browser to a frontend result page.

---

## Tenant Isolation

### ✅ REQUIRED — `Payment` has no `institutionId` column — every read must join through `Invoice`

Unlike `SubscriptionPayment` (which carries a denormalized `institutionId`), `Payment` and
`InvoiceItem` are tenant-scoped **only by relation**. A query that forgets the join leaks
across institutions.

```typescript
// ❌ WRONG — no tenant boundary; returns every institution's payments
const rows = await prisma.payment.findMany({ where: { status: 'COMPLETED' } });

// ✅ CORRECT — scoped through the invoice relation
const rows = await prisma.payment.findMany({
  where: { status: 'COMPLETED', invoice: { institutionId: tenantId } },
});
```

A callback resolves a `Payment` from an untrusted `tran_id`; before mutating anything,
re-load its invoice with `where: { id, institutionId: payment.institutionId }` and abort if
it doesn't match (the transaction block above does this).

### ✅ REQUIRED — Add `institutionId` + `rawGatewayResponse` to `Payment` in the same migration

Before shipping the callback flow, migrate `Payment` to match the `SubscriptionPayment`
precedent (`schema.prisma:174`), so reconciliation and analytics queries filter on a real
indexed column instead of a join every time:

```prisma
model Payment {
  // ...existing fields...
  institutionId      String?  // denormalized from invoice.institutionId; backfill in the migration
  institution        Institution? @relation(fields: [institutionId], references: [id])
  currency           String   @default("BDT")
  rawGatewayResponse Json?     // full validationserverAPI response, for dispute/audit
  gatewayName        String?   // BKASH | NAGAD | SSLCOMMERZ (distinct from `method`)

  @@unique([transactionRef])   // makes findPaymentByTransactionRef safe + blocks double-insert
  @@index([invoiceId])
  @@index([institutionId])
  @@index([status])
}
```

This is a multi-tenant scoping migration → **human review required** (see
`.antigravity/skills/tenant-isolation.md`). Backfill `institutionId` from `invoice.institutionId`
for existing rows in the migration itself; keep it nullable for one release, then tighten.

---

## Credential Handling

### ✅ REQUIRED — Secrets only through the `env.ts` Zod schema, with a per-provider fail-fast

`config/env.ts` already declares `BKASH_*`, `NAGAD_*`, `SSLCOMMERZ_*` and a `superRefine`
that hard-fails startup when `SSLCOMMERZ_ENABLED=true` without all three SSLCommerz creds
(`env.ts:85`). Extend the same `superRefine` for every provider you turn on for fees:

```typescript
// env.ts superRefine — add alongside the existing SSLCOMMERZ block
if (data.BKASH_ENABLED) {
  for (const k of ['BKASH_APP_KEY', 'BKASH_APP_SECRET', 'BKASH_USERNAME', 'BKASH_PASSWORD', 'BKASH_BASE_URL'] as const) {
    if (!data[k]) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${k} is required when BKASH_ENABLED=true`, path: [k] });
  }
}
```

- Sandbox vs. production is **only** the `*_BASE_URL` value — no other code path changes.
- Never `logger.*` a key, never place one in an API response, never commit one. `.env` is
  gitignored; `.env.example` carries placeholder names only.
- The credential setup itself (obtaining live merchant keys) is a **human critical-path task** —
  the skill's job is to make a misconfigured deploy fail loudly at boot, not silently at first
  checkout.

---

## Settlement Reconciliation

### ✅ REQUIRED — A daily reconciliation job, mirroring `billingQueue.ts`

```typescript
// modules/fees/queues/feeReconcileQueue.ts — structure copied from queues/billingQueue.ts
export const feeReconcileQueue = new Queue('feeReconcile', {
  connection: { url: env.REDIS_URL, maxRetriesPerRequest: null } as any,
});
export async function registerFeeReconcileJob(): Promise<void> {
  await feeReconcileQueue.add('fee-settlement-scan', {}, {
    repeat: { pattern: '0 3 * * *' },   // 03:00, after the 02:00 billing scan
    jobId: 'fee-settlement-scan',       // fixed id → no duplicate repeatables on restart
  });
}
```

The worker must:
1. Move `Payment` rows stuck in `PENDING` past a threshold (e.g. 2h) to `FAILED` — a
   customer who abandoned the gateway page never generates a callback.
2. For each provider that offers a settlement/transaction report API, pull the day's settled
   transactions and flag any that are `SUCCESS` at the gateway but not `COMPLETED` in our DB
   (a dropped IPN) for manual review — never auto-credit from the report alone; route it
   through `creditFeePayment` so validation still runs.
3. Never double-credit — reuse the status-guarded `updateMany` path.

Register it after `server.listen()`, non-blocking, `.catch()` logging — like the billing job.

---

## Prohibited Patterns

| Pattern | Reason |
|---|---|
| Marking an invoice `PAID` from the `success_url` redirect params without a server-to-server `validateTransaction` call | Redirect params are forgeable — this is the #1 payment fraud vector |
| `prisma.payment.update({ where: { id } })` in a callback (instead of status-guarded `updateMany` + count check) | Concurrent IPN + redirect double-credit the invoice |
| Any `prisma.payment` / `prisma.invoiceItem` query without `invoice: { institutionId }` | Cross-tenant financial data leak (`Payment` has no own `institutionId`) |
| Throwing / returning `4xx`–`5xx` from the IPN endpoint for an unknown or failed `tran_id` | Gateway retries the IPN indefinitely; also leaks whether a `tran_id` exists |
| Sharing a gateway client, `tran_id`, or `rawGatewayResponse` between `modules/fees` and `modules/billing` | The two payment systems must stay isolated; a bug in one must not corrupt the other |
| `await`ing a gateway reachability/health call before `server.listen()` | Repeats the `e8bb2a5` boot-hang outage when the dependency is slow/down |
| Storing card numbers, wallet PINs, or full PANs anywhere | PCI / regulatory violation — store only the gateway's `tran_id` / `val_id` / ref ids |
| `*_BASE_URL` pointing at production while `*_ENABLED=false` "to test the config" | The `superRefine` won't catch it; a stray `true` later hits live money |
| Real gateway HTTP calls in tests / CI | Flaky, slow, can move real sandbox money; use the `*.mock.ts` sibling via the factory |

---

## Testing Requirement

Every payment-gateway service test must (mock the gateway HTTP client via the factory — no
real network calls):

1. **Happy path** — `initiateOnlinePayment` creates a `PENDING` `Payment` with the `tran_id`;
   a matching IPN with a valid `val_id` credits it: `Payment.status` → `COMPLETED`, invoice
   `paidAmount`/`dueAmount`/`status` recomputed correctly, one `FEE_PAYMENT_SUCCESS` AuditLog row.
2. **Replayed IPN** — delivering the same IPN twice (and IPN-then-success-redirect for the
   same `tran_id`) credits the invoice **exactly once**; the second call is a no-op, no second
   AuditLog, no doubled `paidAmount`.
3. **Amount mismatch** — `validateTransaction` returns an amount ≠ the invoice due amount →
   `Payment.status` → `FAILED`, invoice untouched, tampering logged.
4. **Out-of-order callback** — a `success` redirect arriving before `initiateOnlinePayment`
   finished persisting the `Payment` row → handled gracefully (unknown `tran_id` → 200, no crash).
5. **Unknown `tran_id`** — IPN for a `tran_id` with no `Payment` row → 200 response, warning
   logged, nothing mutated (never 404/500).
6. **Cross-tenant** — a callback for Institution A's invoice, exercised while Institution B
   data exists, never reads or mutates any Institution B row; a `Payment` list query for B
   returns zero of A's payments.
7. **Gateway timeout / unreachable** — `initiateSession` returns `{ success: false }` →
   `initiateOnlinePayment` throws `BadRequestError`, no `Payment` row left in a bad state;
   `validateTransaction` throwing/failing in a callback leaves the invoice `UNPAID` with no
   partial write.
8. **Disabled provider** — with `*_ENABLED=false`, `initiateOnlinePayment` for that method
   fails cleanly with the "not enabled" message and creates no `Payment` row.
