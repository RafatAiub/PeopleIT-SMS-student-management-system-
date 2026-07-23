import * as studentRepository from './student.repository';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { prisma } from '../../config/prisma';
import { BulkImportRowDto } from './student.dto';
import type {
  CreateStudentDtoType,
  UpdateStudentDtoType,
  StudentQueryDtoType,
  CreateStudentDocumentDtoType,
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

export async function createStudent(institutionId: string, data: CreateStudentDtoType) {
  // Check for duplicate studentId within this institution
  const existing = await studentRepository.findByStudentId(institutionId, data.studentId);
  if (existing) {
    throw new ConflictError(
      `Student ID '${data.studentId}' already exists in this institution`,
    );
  }

  await assertDepartmentIfRequired(institutionId, data.classId, data.department);

  const student = await studentRepository.create(institutionId, data);
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

  const updated = await studentRepository.update(institutionId, id, data);
  logger.info('Student updated', { studentId: id, institutionId });
  return updated;
}

export async function deleteStudent(institutionId: string, id: string) {
  const existing = await studentRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Student with ID '${id}' not found`);
  }

  await studentRepository.remove(institutionId, id);
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
