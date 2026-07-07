# Skill: Multi-Tenant Isolation

## Rule Overview
Every database query and API endpoint in PeopleIT SMS MUST strictly enforce
multi-tenant separation. Tenant identity is determined by `institution_id`.

---

## Database Layer Rules (Prisma)

### ✅ REQUIRED — Always filter by institutionId

Every `findMany`, `findFirst`, `findUnique`, `update`, `delete` call on any
tenant-scoped model MUST include `institutionId` in the `where` clause.

```typescript
// ✅ CORRECT
const students = await prisma.student.findMany({
  where: {
    institutionId: req.tenantId,  // Always injected from JWT
    // ... other filters
  },
});

// ❌ WRONG — missing tenant filter, leaks cross-tenant data
const students = await prisma.student.findMany();
```

### ✅ REQUIRED — Validate ownership before mutations

Before any UPDATE or DELETE, verify the resource belongs to the current tenant:

```typescript
// ✅ CORRECT
const student = await prisma.student.findFirst({
  where: { id: studentId, institutionId: req.tenantId },
});
if (!student) throw new NotFoundError('Student not found');
```

### ✅ REQUIRED — Include institutionId on all CREATE operations

```typescript
// ✅ CORRECT
await prisma.student.create({
  data: {
    ...dto,
    institutionId: req.tenantId,  // Always set from JWT, never from request body
  },
});
```

---

## API Layer Rules (Express)

### ✅ REQUIRED — Tenant middleware must run before all routes

```typescript
// app.ts
app.use('/api', tenantMiddleware);  // Must be before all route handlers
app.use('/api/students', studentRoutes);
```

### ✅ REQUIRED — tenantId comes from JWT, never from request body/params

```typescript
// ❌ WRONG — attacker can forge institution_id
const institutionId = req.body.institutionId;

// ✅ CORRECT — extracted from verified JWT
const institutionId = req.tenantId; // Set by tenantMiddleware
```

### ✅ REQUIRED — Tenant header for super-admin cross-tenant access only

Super admins may pass `X-Institution-Id` header. This must be validated:
- User must have `SUPER_ADMIN` role
- The institution must exist and be active

---

## Prohibited Patterns

| Pattern | Reason |
|---|---|
| `prisma.student.findMany()` with no where | Cross-tenant data leak |
| `req.body.institutionId` used as tenant | Forgeable by client |
| Hardcoded `institutionId` in tests | Masks isolation bugs |
| Skipping tenant filter in aggregate queries | Exposes aggregate cross-tenant data |

---

## Testing Requirement

Every repository method test must:
1. Create two institutions (A and B)
2. Create records for institution A
3. Query using institution B's tenantId
4. Assert that **zero** results are returned
