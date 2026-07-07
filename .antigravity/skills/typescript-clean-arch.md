# Skill: TypeScript + Clean Architecture

## Layer Structure

```
src/
  modules/<feature>/
    domain/
      entities/       ← Pure domain models (no Prisma types)
      value-objects/  ← Immutable typed wrappers (Email, Money, etc.)
      errors/         ← Domain-specific error classes
    application/
      use-cases/      ← One class per use case
      dtos/           ← Input/Output shape definitions (Zod schemas)
      interfaces/     ← IRepository, IMailer, ISmsService abstractions
    infrastructure/
      repositories/   ← Prisma implementation of IRepository
      services/       ← External service adapters (SMS, email, payment)
    presentation/
      routes/         ← Express router (no business logic here)
      controllers/    ← Thin — validate input, call use-case, return response
      validators/     ← Zod schema parsers for req.body/params/query
```

---

## Hard Rules

### ✅ No direct Prisma calls in controllers

```typescript
// ❌ WRONG — controller reaching into DB directly
router.get('/students', async (req, res) => {
  const students = await prisma.student.findMany({ where: { institutionId: req.tenantId } });
  res.json(students);
});

// ✅ CORRECT — controller delegates to use case
router.get('/students', async (req, res) => {
  const result = await listStudentsUseCase.execute({ tenantId: req.tenantId, ...req.query });
  res.json(result);
});
```

### ✅ Use cases depend on interfaces, not implementations

```typescript
// ✅ CORRECT
class CreateStudentUseCase {
  constructor(private readonly studentRepo: IStudentRepository) {}
}

// Injected at the composition root (not inside the use case)
const useCase = new CreateStudentUseCase(new PrismaStudentRepository(prisma));
```

### ✅ Validate all inputs with Zod at the controller boundary

```typescript
const CreateStudentSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  admissionNo: z.string().min(1),
  dateOfBirth: z.string().datetime().optional(),
});
```

### ✅ Typed errors — never throw raw strings

```typescript
// ❌ WRONG
throw new Error('Student not found');

// ✅ CORRECT
throw new StudentNotFoundError(studentId);
```

---

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Use case class | VerbNounUseCase | `CreateStudentUseCase` |
| Repository interface | I + Noun + Repository | `IStudentRepository` |
| DTO | Noun + Dto | `CreateStudentDto` |
| Controller | Noun + Controller | `StudentController` |
| Route file | noun.routes.ts | `student.routes.ts` |
| Error class | NounVerbError | `StudentNotFoundError` |
