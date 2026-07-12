# Skill: Bulk Data Ingestion & Stream Processing

## Rule Overview
This module governs importing large datasets (e.g., student grades, Excel templates, attendance logs) into the system. It establishes requirements for stream parsing to avoid memory exhaustion, Zod validation for row-level integrity, and Prisma database transaction batching.

---

## Stream Ingestion (Avoiding Memory Bloat)

Loading entire Excel or CSV sheets directly into memory (e.g., via `readFileSync` or parsing a 50MB file to a single array) can crash the container or cause severe request timeouts.

### ✅ REQUIRED — Stream the payload in chunks
Use event-driven stream parsing (such as `csv-parser` or sheet streams in `xlsx`) to read data row-by-row. Process rows in manageable chunk sizes (e.g., batches of 500 to 1000).

```typescript
// ✅ CORRECT — Reading files as streams and processing in chunks
import { Readable } from 'stream';
import csv from 'csv-parser';

export async function processBulkResultUpload(
  fileStream: Readable,
  institutionId: string
) {
  let batch: any[] = [];
  const BATCH_SIZE = 500;

  fileStream
    .pipe(csv())
    .on('data', async (row) => {
      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        fileStream.pause(); // Pause stream to handle DB write backpressure
        await processBatch(batch, institutionId);
        batch = [];
        fileStream.resume();
      }
    })
    .on('end', async () => {
      if (batch.length > 0) {
        await processBatch(batch, institutionId);
      }
    });
}
```

---

## Row-Level Validation (Zod)

Every row must be validated against a precise schema. Collecting all validation errors is required so that the client receives a single, detailed report of which rows failed and why.

### ✅ REQUIRED — Validate row schema and accumulate errors
Validate rows using Zod's `safeParse`. Do not let one malformed row fail the entire ingestion process immediately without providing feedback; instead, compile an error report listing the row index.

```typescript
import { z } from 'zod';

const ResultRowSchema = z.object({
  studentId: z.string().uuid(),
  subject: z.string().min(1),
  marksObtained: z.coerce.number().min(0).max(100),
  grade: z.string().optional(),
});

// ✅ CORRECT — Map errors with exact row index
const errors: { row: number; issues: string[] }[] = [];
const validRecords: z.infer<typeof ResultRowSchema>[] = [];

rows.forEach((row, index) => {
  const result = ResultRowSchema.safeParse(row);
  if (!result.success) {
    errors.push({
      row: index + 1,
      issues: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    });
  } else {
    validRecords.push(result.data);
  }
});
```

---

## Batch-Inserting with Transactions

To prevent database locks and pool exhaustion while ensuring atomicity, batch operations must run within controlled transactions.

### ✅ REQUIRED — Run updates inside chunked Prisma transaction blocks
Do not run individual `prisma.model.create` operations in a simple loop (causes N database connections/network roundtrips). Instead, use `prisma.$transaction` with grouped writes.

```typescript
// ✅ CORRECT — Chunked transactions
async function processBatch(records: any[], institutionId: string) {
  const ops = records.map((rec) => {
    return prisma.examResult.upsert({
      where: {
        institutionId_examId_studentId_subject: {
          institutionId,
          examId: rec.examId,
          studentId: rec.studentId,
          subject: rec.subject,
        },
      },
      update: { marksObtained: rec.marksObtained },
      create: { ...rec, institutionId },
    });
  });

  await prisma.$transaction(ops); // Atomic write for this batch
}
```

---

## Cross-Tenant Reference Validation

When importing records referencing other entities (like `studentId` or `classId`), you must verify that the referenced records actually belong to the current institution.

```typescript
// ✅ CORRECT — Verify all studentIds belong to the tenant before writing
const dbCount = await prisma.student.count({
  where: {
    institutionId,
    id: { in: studentIds },
  },
});
if (dbCount !== new Set(studentIds).size) {
  throw new BadRequestError('Upload contains students from another institution or invalid student IDs');
}
```

---

## Prohibited Patterns

| Pattern | Reason |
|---|---|
| `fs.readFileSync` for large Excel/CSV requests | Blocks the event loop; leads to high memory utilization |
| Running `$transaction` with more than 2,000 operations | High database lock times; connection pool starvation |
| Direct inserts without verifying referenced IDs' `institutionId` | Bypasses tenant isolation boundaries (cross-tenant reference leak) |
| Dropping database constraints to speed up bulk uploads | Destroys data integrity; bypasses schema validations |

---

## Testing Requirement

Every bulk ingestion service test must:
1. Verify behavior with a simulated file stream containing valid rows.
2. Verify behavior with malformed row data (validate that Zod errors are caught and properly formatted for return).
3. Assert that if even one student ID in the batch belongs to a different institution, the request is rejected with a validation error (cross-tenant write prevention).
4. Assert that database transactions successfully rollback if any database-level constraint fails during batch processing.
