import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as studentRepository from './student.repository';
import { studentDetailSelect } from './student.repository';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { BulkImportRowDto } from './student.dto';
import type {
  CreateStudentDtoType,
  UpdateStudentDtoType,
  StudentQueryDtoType,
  CreateStudentDocumentDtoType,
  UpdateRollNumbersDtoType,
  BulkAssignClassDtoType,
  PublicStudentApplicationDtoType,
} from './student.dto';

// =============================================================================
// Student Service — Business logic layer
// institutionId ALWAYS comes from req.tenantId (never from body)
// =============================================================================

// Matches "Class 9", "Grade 10", "9", etc. — class names are free-text
// (see Class.name in schema.prisma), so we detect grade 9/10 by pulling the
// trailing number out of the name rather than relying on a fixed format.
const DEPARTMENT_REQUIRED_GRADES = new Set([9, 10]);

function extractGradeNumber(className: string): number | null {
  const match = className.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

async function assertDepartmentIfRequired(
  institutionId: string,
  classId: string | null | undefined,
  department: string | null | undefined,
) {
  if (!classId) return;

  const cls = await prisma.class.findFirst({
    where: { id: classId, branch: { institutionId } },
    select: { name: true },
  });
  if (!cls) return;

  const grade = extractGradeNumber(cls.name);
  if (grade !== null && DEPARTMENT_REQUIRED_GRADES.has(grade) && !department) {
    throw new ValidationError(`Department is required for ${cls.name} students`);
  }
}

// A caller-supplied categoryId must belong to the same institution —
// otherwise a Student could be wired to another tenant's StudentCategory row.
// Mirrors assertClassLookupsBelongToInstitution in academics.service.ts.
async function assertCategoryBelongsToInstitution(institutionId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const category = await prisma.studentCategory.findFirst({ where: { id: categoryId, institutionId } });
  if (!category) {
    throw new NotFoundError(`Student category with ID '${categoryId}' not found`);
  }
}

export async function listStudents(institutionId: string, query: StudentQueryDtoType) {
  return studentRepository.findAll(institutionId, query);
}

export async function getStudent(institutionId: string, id: string) {
  const student = await studentRepository.findById(institutionId, id);
  if (!student) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }
  return student;
}

// Creating a student here always provisions a linked login User (role
// STUDENT) in the same transaction — the Users page (/users?role=STUDENT)
// lists User rows, while the Students page lists Student rows, and the two
// only stay in sync if every Student created through this path also gets a
// User. Mirrors the reverse direction already done in user.service.ts
// createUser's STUDENT branch.
export async function createStudent(
  institutionId: string,
  data: CreateStudentDtoType & { password: string },
) {
  // Check for duplicate studentId within this institution
  const existing = await studentRepository.findByStudentId(institutionId, data.studentId);
  if (existing) {
    throw new ConflictError(
      `Student ID '${data.studentId}' already exists in this institution`,
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) {
    throw new ConflictError(`Email '${data.email}' is already in use`);
  }

  await assertDepartmentIfRequired(institutionId, data.classId, data.department);
  await assertCategoryBelongsToInstitution(institutionId, data.categoryId);

  const { password, ...studentFields } = data;
  // New admissions land in the school's default session year unless one was picked.
  if (!studentFields.academicYearId) {
    const defaultSession = await prisma.academicYear.findFirst({
      where: { institutionId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    if (defaultSession) studentFields.academicYearId = defaultSession.id;
  }
  const rounds = env.BCRYPT_ROUNDS ?? 12;
  const passwordHash = await bcrypt.hash(password, rounds);

  const student = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        institutionId,
        email: data.email,
        passwordHash,
        role: 'STUDENT',
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? undefined,
        avatarUrl: data.avatarUrl ?? undefined,
      },
    });

    return tx.student.create({
      data: {
        ...studentFields,
        institutionId,
        userId: user.id,
      },
      select: studentDetailSelect,
    });
  });

  logger.info('Student created', { studentId: student.id, institutionId });
  return student;
}

export async function updateStudent(
  institutionId: string,
  id: string,
  data: UpdateStudentDtoType,
) {
  // Confirm student belongs to this institution
  const existing = await studentRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }

  const nextClassId = data.classId !== undefined ? data.classId : existing.class?.id;
  const nextDepartment =
    data.department !== undefined ? data.department : (existing as { department?: string | null }).department;
  await assertDepartmentIfRequired(institutionId, nextClassId, nextDepartment);
  await assertCategoryBelongsToInstitution(institutionId, data.categoryId);

  const updated = await studentRepository.update(institutionId, id, data);
  logger.info('Student updated', { studentId: id, institutionId });
  return updated;
}

export async function deleteStudent(institutionId: string, id: string) {
  const existing = await studentRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }

  // Guardian links (and any documents) reference this student with no
  // cascade configured at the DB level — deleting the Student directly would
  // hit a foreign key violation the moment a guardian is linked, which the
  // Admission form and Online Registrations can both now do. Clear them
  // first, in the same transaction, so the delete always succeeds.
  await prisma.$transaction([
    prisma.guardianStudent.deleteMany({ where: { studentId: id } }),
    prisma.studentDocument.deleteMany({ where: { studentId: id, institutionId } }),
    prisma.student.deleteMany({ where: { id, institutionId } }),
  ]);
  logger.info('Student deleted', { studentId: id, institutionId });
}

export interface BulkImportError {
  row: number;
  issues: string[];
}

export interface BulkImportResult {
  successCount: number;
  errorCount: number;
  errors: BulkImportError[];
}

/**
 * Bulk-imports students from parsed spreadsheet rows. Validates every row
 * with Zod, resolves className/sectionName to internal ids (fetched once,
 * not per-row — avoids N+1 queries per bulk-data-ingestion conventions),
 * rejects duplicate studentIds (both against the DB and within the batch),
 * and writes valid rows in a single chunked transaction. One malformed row
 * never aborts the whole import — every row gets its own pass/fail result.
 */
export async function bulkImportStudents(
  institutionId: string,
  rawRows: unknown[],
  actorUserId: string,
): Promise<BulkImportResult> {
  const errors: BulkImportError[] = [];
  const validRows: Array<{
    row: number;
    data: ReturnType<typeof BulkImportRowDto.parse> & { classId: string | null; sectionId: string | null };
  }> = [];

  // Resolve class/section name -> id once for the whole batch.
  const classes = await prisma.class.findMany({
    where: { branch: { institutionId } },
    select: { id: true, name: true, sections: { select: { id: true, name: true } } },
  });
  const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c]));

  const seenStudentIds = new Set<string>();
  const existingStudentIds = new Set(
    (await prisma.student.findMany({ where: { institutionId }, select: { studentId: true } })).map(
      (s) => s.studentId,
    ),
  );

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const parsed = BulkImportRowDto.safeParse(raw);
    if (!parsed.success) {
      errors.push({
        row: rowNumber,
        issues: parsed.error.errors.map((e) => `${e.path.join('.') || 'row'}: ${e.message}`),
      });
      return;
    }

    const rowIssues: string[] = [];
    const data = parsed.data;

    if (existingStudentIds.has(data.studentId) || seenStudentIds.has(data.studentId)) {
      rowIssues.push(`studentId '${data.studentId}' already exists or is duplicated in this file`);
    }

    let classId: string | null = null;
    let sectionId: string | null = null;
    if (data.className) {
      const match = classByName.get(data.className.trim().toLowerCase());
      if (!match) {
        rowIssues.push(`class '${data.className}' not found`);
      } else {
        classId = match.id;
        if (data.sectionName) {
          const section = match.sections.find(
            (s) => s.name.trim().toLowerCase() === data.sectionName!.trim().toLowerCase(),
          );
          if (!section) {
            rowIssues.push(`section '${data.sectionName}' not found in class '${data.className}'`);
          } else {
            sectionId = section.id;
          }
        }
      }
    }

    if (rowIssues.length > 0) {
      errors.push({ row: rowNumber, issues: rowIssues });
      return;
    }

    seenStudentIds.add(data.studentId);
    validRows.push({
      row: rowNumber,
      data: { ...data, classId, sectionId },
    });
  });

  // Chunked transaction writes — never one giant $transaction with
  // thousands of ops (connection pool / lock time risk per the
  // bulk-data-ingestion conventions already documented in this repo).
  const CHUNK_SIZE = 500;
  let successCount = 0;
  for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
    const chunk = validRows.slice(i, i + CHUNK_SIZE);
    const ops = chunk.map(({ data }) =>
      prisma.student.create({
        data: {
          institutionId,
          studentId: data.studentId,
          firstName: data.firstName,
          lastName: data.lastName,
          classId: data.classId,
          sectionId: data.sectionId,
          rollNumber: data.rollNumber,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth,
          phone: data.phone,
          email: data.email || null,
          bloodGroup: data.bloodGroup,
        },
        select: { id: true },
      }),
    );
    await prisma.$transaction(ops);
    successCount += chunk.length;
  }

  logger.info('Bulk student import completed', {
    institutionId,
    successCount,
    errorCount: errors.length,
  });

  // Usage-event log for pilot measurement (onboarding effort, adoption) —
  // reuses the existing AuditLog model rather than a new logging system.
  // Distinct from the generic CREATE entry the route's auditLog middleware
  // already writes, since that one carries no success/error counts.
  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId: actorUserId,
        action: 'BULK_IMPORT_COMPLETED',
        resource: 'Student',
        metadata: { successCount, errorCount: errors.length, totalRows: rawRows.length },
      },
    })
    .catch(() => {});

  return { successCount, errorCount: errors.length, errors };
}

export async function getStudentDocuments(institutionId: string, studentId: string) {
  // Verify student exists in this institution
  const student = await studentRepository.findById(institutionId, studentId);
  if (!student) {
    throw new NotFoundError(`Student with ID '${studentId}' not found`);
  }

  return studentRepository.findDocuments(institutionId, studentId);
}

export async function addStudentDocument(
  institutionId: string,
  studentId: string,
  data: CreateStudentDocumentDtoType,
) {
  const student = await studentRepository.findById(institutionId, studentId);
  if (!student) {
    throw new NotFoundError(`Student with ID '${studentId}' not found`);
  }

  const doc = await studentRepository.createDocument(institutionId, studentId, data);
  logger.info('Student document added', { studentId, docId: doc.id, institutionId });
  return doc;
}

// Chunk size shared by the bulk write paths below — mirrors bulkImportStudents'
// own CHUNK_SIZE, per the bulk-data-ingestion convention documented there
// (never one giant $transaction with thousands of ops).
const BULK_WRITE_CHUNK_SIZE = 500;

/**
 * PATCH /students/roll-numbers — Assign Roll Numbers screen.
 * sectionId and every assignment's studentId are validated in one findMany
 * up front (both that they belong to this institution AND to this section):
 * the whole request is rejected if any id doesn't belong — no silent skips.
 */
export async function updateRollNumbers(
  institutionId: string,
  actorUserId: string,
  data: UpdateRollNumbersDtoType,
) {
  const section = await prisma.section.findFirst({
    where: { id: data.sectionId, class: { branch: { institutionId } } },
    select: { id: true },
  });
  if (!section) {
    throw new NotFoundError(`Section with ID '${data.sectionId}' not found`);
  }

  const studentIds = data.assignments.map((a) => a.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    throw new ValidationError('Duplicate studentId in assignments');
  }

  const owned = await prisma.student.findMany({
    where: { id: { in: studentIds }, institutionId, sectionId: data.sectionId },
    select: { id: true },
  });
  if (owned.length !== studentIds.length) {
    const ownedIds = new Set(owned.map((s) => s.id));
    const missing = studentIds.filter((id) => !ownedIds.has(id));
    throw new NotFoundError(
      `Student(s) not found in section '${data.sectionId}' for this institution: ${missing.join(', ')}`,
    );
  }

  for (let i = 0; i < data.assignments.length; i += BULK_WRITE_CHUNK_SIZE) {
    const chunk = data.assignments.slice(i, i + BULK_WRITE_CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((a) =>
        prisma.student.update({
          where: { id: a.studentId },
          data: { rollNumber: a.rollNumber },
        }),
      ),
    );
  }

  logger.info('Roll numbers updated', {
    institutionId,
    sectionId: data.sectionId,
    count: data.assignments.length,
    actorUserId,
  });

  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId: actorUserId,
        action: 'BULK_ROLL_NUMBER_UPDATE',
        resource: 'Student',
        metadata: { sectionId: data.sectionId, count: data.assignments.length },
      },
    })
    .catch(() => {});

  return { updatedCount: data.assignments.length, sectionId: data.sectionId };
}

// Random alphanumeric+symbol password generator — same approach as
// institution-application.service.ts's generatePassword (12 chars, drawn
// from crypto.randomBytes so it's not Math.random-predictable).
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(12);
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[bytes[i] % chars.length];
  }
  return pwd;
}

/**
 * POST /students/:id/reset-password — resets the password on the Student's
 * linked login User. Returns the plaintext password once for the caller to
 * display/copy; never logged or persisted in plaintext anywhere.
 */
export async function resetStudentPassword(institutionId: string, id: string, password: string | undefined) {
  const student = await prisma.student.findFirst({
    where: { id, institutionId },
    select: { id: true, userId: true },
  });
  if (!student) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }
  if (!student.userId) {
    throw new NotFoundError(`Student with ID '${id}' has no linked login account`);
  }

  const plaintextPassword = password ?? generateRandomPassword();
  const rounds = env.BCRYPT_ROUNDS ?? 12;
  const passwordHash = await bcrypt.hash(plaintextPassword, rounds);

  await prisma.user.update({
    where: { id: student.userId },
    data: { passwordHash },
  });

  // Never log the plaintext password — only the fact that a reset happened.
  logger.info('Student password reset', { studentId: id, institutionId });

  return { password: plaintextPassword };
}

/**
 * POST /students/bulk-assign-class — Bulk Assign Class screen. classId (and
 * sectionId, if given — also checked as belonging to classId) must belong to
 * this institution; every studentId is validated in one findMany up front.
 * Omitting sectionId clears any existing section on the moved students,
 * since a section belongs to exactly one class and would otherwise dangle
 * pointing at the student's old class.
 */
export async function bulkAssignClass(institutionId: string, actorUserId: string, data: BulkAssignClassDtoType) {
  const cls = await prisma.class.findFirst({
    where: { id: data.classId, branch: { institutionId } },
    select: { id: true, name: true },
  });
  if (!cls) {
    throw new NotFoundError(`Class with ID '${data.classId}' not found`);
  }

  let section: { id: string; name: string } | null = null;
  if (data.sectionId) {
    section = await prisma.section.findFirst({
      where: { id: data.sectionId, classId: data.classId },
      select: { id: true, name: true },
    });
    if (!section) {
      throw new NotFoundError(`Section with ID '${data.sectionId}' not found under class '${data.classId}'`);
    }
  }

  const studentIds = Array.from(new Set(data.studentIds));
  const owned = await prisma.student.findMany({
    where: { id: { in: studentIds }, institutionId },
    select: { id: true },
  });
  if (owned.length !== studentIds.length) {
    const ownedIds = new Set(owned.map((s) => s.id));
    const missing = studentIds.filter((id) => !ownedIds.has(id));
    throw new NotFoundError(`Student(s) not found in this institution: ${missing.join(', ')}`);
  }

  for (let i = 0; i < studentIds.length; i += BULK_WRITE_CHUNK_SIZE) {
    const chunk = studentIds.slice(i, i + BULK_WRITE_CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((studentId) =>
        prisma.student.update({
          where: { id: studentId },
          data: { classId: data.classId, sectionId: data.sectionId ?? null },
        }),
      ),
    );
  }

  logger.info('Students bulk-assigned to class', {
    institutionId,
    classId: data.classId,
    sectionId: data.sectionId ?? null,
    count: studentIds.length,
    actorUserId,
  });

  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId: actorUserId,
        action: 'BULK_CLASS_ASSIGN',
        resource: 'Student',
        metadata: {
          count: studentIds.length,
          classId: data.classId,
          className: cls.name,
          sectionId: data.sectionId ?? null,
          sectionName: section?.name ?? null,
        },
      },
    })
    .catch(() => {});

  return {
    updatedCount: studentIds.length,
    classId: data.classId,
    sectionId: data.sectionId ?? null,
  };
}

// ── Online Registrations (public apply + admin review) ─────────────────────

async function generateNextStudentId(institutionId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const total = await prisma.student.count({ where: { institutionId } });
    const candidate = `${year}-${String(total + 1 + attempt).padStart(4, '0')}`;
    const exists = await studentRepository.findByStudentId(institutionId, candidate);
    if (!exists) return candidate;
  }
  // Extremely unlikely fallback (five collisions in a row) — guarantees
  // uniqueness without an unbounded retry loop.
  return `${year}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * GET /student-applications/classes?institutionSlug= — public class list for
 * the Online Registration form's class picker. institutionSlug resolves the
 * institution server-side; an unknown or inactive slug reads as not found.
 */
export async function getPublicClassesForInstitution(institutionSlug: string) {
  const institution = await prisma.institution.findFirst({
    where: { slug: institutionSlug, isActive: true },
    select: { id: true },
  });
  if (!institution) {
    throw new NotFoundError('Institution not found');
  }
  return prisma.class.findMany({
    where: { branch: { institutionId: institution.id } },
    select: { id: true, name: true },
    orderBy: { level: 'asc' },
  });
}

/**
 * POST /student-applications/apply — public Online Registration form.
 * Creates a PENDING Student (no linked login — that's provisioned on
 * approval) plus its Guardian record and link, scoped to the institution
 * resolved from the public slug. GR Number is generated server-side so an
 * unauthenticated caller never supplies or guesses one.
 */
export async function applyForAdmission(data: PublicStudentApplicationDtoType) {
  const institution = await prisma.institution.findFirst({
    where: { slug: data.institutionSlug, isActive: true },
    select: { id: true },
  });
  if (!institution) {
    throw new NotFoundError('Institution not found');
  }
  const institutionId = institution.id;

  if (data.classId) {
    const cls = await prisma.class.findFirst({
      where: { id: data.classId, branch: { institutionId } },
      select: { id: true },
    });
    if (!cls) {
      throw new NotFoundError(`Class with ID '${data.classId}' not found`);
    }
  }

  const studentId = await generateNextStudentId(institutionId);

  const created = await prisma.$transaction(async (tx) => {
    const guardian = await tx.guardian.create({
      data: {
        institutionId,
        firstName: data.guardianFirstName,
        lastName: data.guardianLastName,
        phone: data.guardianPhone,
        email: data.guardianEmail,
        relationship: 'GUARDIAN',
      },
    });

    return tx.student.create({
      data: {
        institutionId,
        studentId,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth ?? undefined,
        gender: data.gender ?? undefined,
        classId: data.classId ?? undefined,
        status: 'PENDING',
        guardians: {
          create: { guardianId: guardian.id, isPrimary: true, relationship: 'GUARDIAN' },
        },
      },
      select: { id: true, studentId: true },
    });
  });

  logger.info('Student application submitted', { studentId: created.id, institutionId });
  return created;
}

/**
 * POST /students/:id/approve — Online Registrations review screen. Flips a
 * PENDING application to ACTIVE and provisions its login (none exists yet
 * for a pending application). Returns the plaintext password once, same
 * pattern as resetStudentPassword.
 */
export async function approveStudentApplication(institutionId: string, id: string, email: string) {
  const student = await prisma.student.findFirst({
    where: { id, institutionId },
    select: { id: true, userId: true, status: true, firstName: true, lastName: true, phone: true, avatarUrl: true },
  });
  if (!student) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }
  if (student.status !== 'PENDING') {
    throw new ConflictError(`Student with ID '${id}' is not a pending application`);
  }
  if (student.userId) {
    throw new ConflictError(`Student with ID '${id}' already has a linked login`);
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ConflictError(`Email '${email}' is already in use`);
  }

  const plaintextPassword = generateRandomPassword();
  const rounds = env.BCRYPT_ROUNDS ?? 12;
  const passwordHash = await bcrypt.hash(plaintextPassword, rounds);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        institutionId,
        email,
        passwordHash,
        role: 'STUDENT',
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone ?? undefined,
        avatarUrl: student.avatarUrl ?? undefined,
      },
    });
    await tx.student.update({
      where: { id },
      data: { status: 'ACTIVE', userId: user.id, email },
    });
  });

  // Never log the plaintext password — only the fact that an approval happened.
  logger.info('Student application approved', { studentId: id, institutionId });
  return { email, password: plaintextPassword };
}
