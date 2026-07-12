# Skill: Time-Grid Scheduling & Conflict Resolution

## Rule Overview
This module governs the visual weekly timetable builder, class slot allocations, and the automated conflict detection engine. Preventing schedule collisions for teachers, sections, and physical classrooms is a core requirement of this subsystem.

---

## Overlapping Interval Algorithm

To determine if two slots on the same day overlap, use the standard exclusive time boundary condition. Two slots **A** and **B** conflict if:
$$\text{Start}_A < \text{End}_B \quad \text{AND} \quad \text{End}_A > \text{Start}_B$$

### SQL / Prisma representation:
```typescript
OR: [
  {
    startTime: { lte: data.endTime },
    endTime: { gte: data.startTime },
  }
]
```

---

## Conflict Constraints

During any slot creation or update, the engine **MUST** check for three distinct types of collisions within the same institution context:

### 1. Teacher Double-Booking
A teacher cannot be assigned to two different classes or sections at the same time.

```typescript
// ✅ CORRECT — Check teacher slot conflict
const teacherConflict = await prisma.timetableSlot.findFirst({
  where: {
    institutionId, // Strict multi-tenant isolation
    teacherId: data.teacherId,
    dayOfWeek: data.dayOfWeek,
    id: { not: slotId }, // Exclude current slot on updates
    OR: [
      {
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
      },
    ],
  },
});
if (teacherConflict) throw new BadRequestError('Teacher is already booked.');
```

### 2. Section/Class Double-Booking
A student section cannot have two different subjects or teachers scheduled at the same time.

```typescript
// ✅ CORRECT — Check class section slot conflict
const sectionConflict = await prisma.timetableSlot.findFirst({
  where: {
    institutionId,
    classId: data.classId,
    sectionName: data.sectionName,
    dayOfWeek: data.dayOfWeek,
    id: { not: slotId },
    OR: [
      {
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
      },
    ],
  },
});
if (sectionConflict) throw new BadRequestError('Section already has a class scheduled.');
```

### 3. Room/Classroom Double-Booking
A physical room cannot host two different sections or subjects at the same time.

```typescript
// ✅ CORRECT — Check room allocation conflict
const roomConflict = await prisma.timetableSlot.findFirst({
  where: {
    institutionId,
    roomNumber: data.roomNumber,
    dayOfWeek: data.dayOfWeek,
    id: { not: slotId },
    OR: [
      {
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
      },
    ],
  },
});
if (roomConflict) throw new BadRequestError('Room is already occupied.');
```

---

## Performance & Multi-Tenancy Optimization

Timetable queries run frequently when builders render visual grids. To maintain low latency, follow these rules:

1. **Leverage Composite Indexes**: Ensure the database has indexes covering `(institutionId, dayOfWeek, startTime, endTime)` to optimize search operations during conflict checks.
2. **Batch Query Checks**: When bulk generating or auto-scheduling routines, never run N+1 queries. Retrieve existing routines for the institution/branch in a single query, index them in memory by `dayOfWeek` or `teacherId`, and perform in-memory checks instead.

---

## Prohibited Patterns

| Pattern | Reason |
|---|---|
| Querying conflicts without filtering by `institutionId` | Exposes other schools' schedules and risks query table scans |
| Relying on frontend-only validation | Easily bypassed; causes database-level state inconsistencies |
| In-memory checks on high-volume tables | Causes memory bloat; retrieve database slots with exact indexes |
| Using inclusive boundaries (`<=` and `>=`) on touchpoints | Prevents back-to-back classes (e.g. 9:00–10:00 and 10:00–11:00) |

---

## Testing Requirement

Every timetable validation test must verify:
1. Back-to-back routines do **not** trigger a conflict (e.g. Slot A: 09:00 - 10:00, Slot B: 10:00 - 11:00 is allowed).
2. Creating an overlapping slot for the same teacher in a separate section triggers a conflict error.
3. Tenant boundaries are respected (creating a conflict in School A does not prevent School B from scheduling at that exact same time).
