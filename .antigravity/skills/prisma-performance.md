# Skill: Prisma DB Performance & Pooling

## Connection Pooling

### ✅ Singleton PrismaClient with connection limit

```typescript
// config/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL, // Must include ?connection_limit=10&pool_timeout=20
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### DATABASE_URL parameters for PgBouncer-compatible pooling:
```
postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20&pgbouncer=true
```

---

## Query Performance Rules

### ✅ ALWAYS use `select` projections on large tables

```typescript
// ❌ WRONG — fetches all columns including large text fields
const students = await prisma.student.findMany({ where: { institutionId } });

// ✅ CORRECT — only fetch what you need
const students = await prisma.student.findMany({
  where: { institutionId },
  select: {
    id: true,
    firstName: true,
    lastName: true,
    admissionNo: true,
    status: true,
  },
});
```

### ✅ Always paginate list queries

```typescript
// ✅ CORRECT
const students = await prisma.student.findMany({
  where: { institutionId },
  skip: (page - 1) * pageSize,
  take: pageSize,        // Max 100
  orderBy: { createdAt: 'desc' },
});
```

### ✅ Use transactions for multi-step writes

```typescript
// ✅ CORRECT — invoice + items in one atomic transaction
const [invoice, items] = await prisma.$transaction([
  prisma.invoice.create({ data: invoiceData }),
  prisma.invoiceItem.createMany({ data: itemsData }),
]);
```

### ✅ Batch reads — prefer `findMany` with `in` over N+1 loops

```typescript
// ❌ WRONG — N+1 query
for (const id of studentIds) {
  const student = await prisma.student.findUnique({ where: { id } });
}

// ✅ CORRECT
const students = await prisma.student.findMany({
  where: { id: { in: studentIds }, institutionId },
});
```

---

## Indexing Requirements

Every foreign key column **must** have an `@@index` in schema.prisma.
The following fields **must** have indexes:

| Table | Indexed Fields |
|---|---|
| Student | institutionId, branchId, admissionNo, status |
| User | institutionId, email |
| Invoice | institutionId, studentId, status, dueDate |
| Payment | invoiceId |
| AuditLog | institutionId, userId, createdAt |
| FeeCategory | institutionId |

---

## Migrations

- Always name migrations descriptively: `npx prisma migrate dev --name add_student_documents`
- Never edit migration files after they have been applied to any environment
- Run `npx prisma validate` before every PR
