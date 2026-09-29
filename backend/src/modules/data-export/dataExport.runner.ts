import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import archiver from 'archiver';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { notifySafe } from '../notifications/notifications.service';
import { CSV_BOM, csvRow, expiryFrom, exportFileName, fileNameFromUrl, STALE_EXPORT_MS } from './dataExport.logic';

// =============================================================================
// Builds a tenant's data export ZIP in-process (background, never on the
// request path). Each CSV is produced by a lazy async generator that pages
// through the table with a cursor, so memory stays flat for large schools.
//
// Storage: local disk under DATA_EXPORT_DIR (default <os tmpdir>/peopleit-exports).
// The job row stores only `local:<file name>`; downloads go through an
// authenticated, tenant-checked endpoint. On hosts with an ephemeral disk
// (Render free tier) the file disappears on redeploy — the job then shows as
// expired and the admin simply requests a new export.
// =============================================================================

const BATCH = 1000;

export function exportDir(): string {
  return process.env.DATA_EXPORT_DIR?.trim() || path.join(os.tmpdir(), 'peopleit-exports');
}

export function exportFilePath(fileUrl: string | null): string | null {
  const name = fileNameFromUrl(fileUrl);
  return name ? path.join(exportDir(), name) : null;
}

type Counts = Record<string, number>;

/** Cursor pagination over any `{ id }` model. */
async function* byCursor<T extends { id: string }>(fetch: (cursor: string | undefined) => Promise<T[]>): AsyncGenerator<T> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetch(cursor);
    for (const row of rows) yield row;
    if (rows.length < BATCH) return;
    cursor = rows[rows.length - 1].id;
  }
}

const page = (cursor: string | undefined) => ({
  take: BATCH,
  orderBy: { id: 'asc' as const },
  ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
});

function csvStream<T>(header: string[], rows: () => AsyncGenerator<T>, toValues: (row: T) => unknown[], counts: Counts, key: string): Readable {
  async function* gen() {
    yield CSV_BOM + csvRow(header);
    let n = 0;
    for await (const row of rows()) {
      n++;
      yield csvRow(toValues(row));
    }
    counts[key] = n;
  }
  return Readable.from(gen());
}

function datasets(institutionId: string, counts: Counts): Array<{ name: string; stream: Readable }> {
  return [
    {
      name: 'students.csv',
      stream: csvStream(
        ['id', 'student_id', 'roll_number', 'first_name', 'last_name', 'gender', 'date_of_birth', 'blood_group', 'religion', 'nationality',
          'email', 'phone', 'address', 'permanent_address', 'class', 'section', 'department', 'status', 'admission_date',
          'previous_school', 'previous_class', 'medical_notes', 'allergies', 'emergency_contact_name', 'emergency_contact_phone',
          'emergency_contact_relation', 'created_at'],
        () =>
          byCursor((c) =>
            prisma.student.findMany({
              where: { institutionId },
              select: {
                id: true, studentId: true, rollNumber: true, firstName: true, lastName: true, gender: true, dateOfBirth: true,
                bloodGroup: true, religion: true, nationality: true, email: true, phone: true, address: true, permanentAddress: true,
                class: { select: { name: true } }, section: { select: { name: true } }, department: true, status: true,
                admissionDate: true, previousSchool: true, previousClass: true, medicalNotes: true, allergies: true,
                emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true, createdAt: true,
              },
              ...page(c),
            }),
          ),
        (s) => [s.id, s.studentId, s.rollNumber, s.firstName, s.lastName, s.gender, s.dateOfBirth, s.bloodGroup, s.religion, s.nationality,
          s.email, s.phone, s.address, s.permanentAddress, s.class?.name, s.section?.name, s.department, s.status, s.admissionDate,
          s.previousSchool, s.previousClass, s.medicalNotes, s.allergies, s.emergencyContactName, s.emergencyContactPhone,
          s.emergencyContactRelation, s.createdAt],
        counts,
        'students',
      ),
    },
    {
      name: 'guardians.csv',
      stream: csvStream(
        ['id', 'first_name', 'last_name', 'relationship', 'phone', 'email', 'occupation', 'nid_number', 'emergency_phone', 'created_at'],
        () =>
          byCursor((c) =>
            prisma.guardian.findMany({
              where: { institutionId },
              select: { id: true, firstName: true, lastName: true, relationship: true, phone: true, email: true, occupation: true, nidNumber: true, emergencyPhone: true, createdAt: true },
              ...page(c),
            }),
          ),
        (g) => [g.id, g.firstName, g.lastName, g.relationship, g.phone, g.email, g.occupation, g.nidNumber, g.emergencyPhone, g.createdAt],
        counts,
        'guardians',
      ),
    },
    {
      name: 'guardian_students.csv',
      stream: csvStream(
        ['guardian_id', 'student_id', 'relationship', 'is_primary'],
        async function* () {
          let skip = 0;
          for (;;) {
            const rows = await prisma.guardianStudent.findMany({
              where: { guardian: { institutionId }, student: { institutionId } },
              select: { guardianId: true, studentId: true, relationship: true, isPrimary: true },
              orderBy: [{ guardianId: 'asc' }, { studentId: 'asc' }],
              skip,
              take: BATCH,
            });
            for (const r of rows) yield r;
            if (rows.length < BATCH) return;
            skip += BATCH;
          }
        },
        (r) => [r.guardianId, r.studentId, r.relationship, r.isPrimary],
        counts,
        'guardianStudents',
      ),
    },
    {
      name: 'staff.csv',
      stream: csvStream(
        ['id', 'first_name', 'last_name', 'email', 'phone', 'role', 'active', 'employee_id', 'department', 'designation', 'joining_date', 'created_at'],
        () =>
          byCursor((c) =>
            prisma.user.findMany({
              where: { institutionId, role: { notIn: [UserRole.STUDENT, UserRole.GUARDIAN] } },
              select: {
                id: true, firstName: true, lastName: true, email: true, phone: true, role: true, isActive: true, createdAt: true,
                staffProfile: { select: { employeeId: true, department: true, designation: true, joiningDate: true } },
              },
              ...page(c),
            }),
          ),
        (u) => [u.id, u.firstName, u.lastName, u.email, u.phone, u.role, u.isActive, u.staffProfile?.employeeId, u.staffProfile?.department,
          u.staffProfile?.designation, u.staffProfile?.joiningDate, u.createdAt],
        counts,
        'staff',
      ),
    },
    {
      name: 'attendance.csv',
      stream: csvStream(
        ['date', 'student_internal_id', 'student_id', 'student_name', 'status', 'notes'],
        () =>
          byCursor((c) =>
            prisma.attendance.findMany({
              where: { institutionId },
              select: { id: true, date: true, studentId: true, status: true, notes: true, student: { select: { studentId: true, firstName: true, lastName: true } } },
              ...page(c),
            }),
          ),
        (a) => [a.date.toISOString().slice(0, 10), a.studentId, a.student.studentId, `${a.student.firstName} ${a.student.lastName}`.trim(), a.status, a.notes],
        counts,
        'attendance',
      ),
    },
    {
      name: 'exam_results.csv',
      stream: csvStream(
        ['exam', 'exam_start', 'student_internal_id', 'student_id', 'student_name', 'subject', 'marks_obtained', 'max_marks', 'grade', 'remarks'],
        () =>
          byCursor((c) =>
            prisma.examResult.findMany({
              where: { institutionId },
              select: {
                id: true, subject: true, marksObtained: true, maxMarks: true, grade: true, remarks: true, studentId: true,
                exam: { select: { name: true, startDate: true } },
                student: { select: { studentId: true, firstName: true, lastName: true } },
              },
              ...page(c),
            }),
          ),
        (r) => [r.exam.name, r.exam.startDate.toISOString().slice(0, 10), r.studentId, r.student.studentId, `${r.student.firstName} ${r.student.lastName}`.trim(),
          r.subject, r.marksObtained, r.maxMarks, r.grade, r.remarks],
        counts,
        'examResults',
      ),
    },
    {
      name: 'invoices.csv',
      stream: csvStream(
        ['id', 'invoice_no', 'student_internal_id', 'student_id', 'student_name', 'total_amount', 'paid_amount', 'due_amount', 'due_date', 'status', 'notes', 'created_at'],
        () =>
          byCursor((c) =>
            prisma.invoice.findMany({
              where: { institutionId },
              select: {
                id: true, invoiceNo: true, studentId: true, totalAmount: true, paidAmount: true, dueAmount: true, dueDate: true, status: true, notes: true, createdAt: true,
                student: { select: { studentId: true, firstName: true, lastName: true } },
              },
              ...page(c),
            }),
          ),
        (i) => [i.id, i.invoiceNo, i.studentId, i.student.studentId, `${i.student.firstName} ${i.student.lastName}`.trim(), i.totalAmount, i.paidAmount,
          i.dueAmount, i.dueDate.toISOString().slice(0, 10), i.status, i.notes, i.createdAt],
        counts,
        'invoices',
      ),
    },
    {
      name: 'payments.csv',
      stream: csvStream(
        ['id', 'invoice_id', 'invoice_no', 'receipt_no', 'amount', 'method', 'transaction_ref', 'status', 'paid_at', 'recorded_by_user_id', 'notes'],
        () =>
          byCursor((c) =>
            prisma.payment.findMany({
              where: { invoice: { institutionId } },
              select: {
                id: true, invoiceId: true, receiptNo: true, amount: true, method: true, transactionRef: true, status: true, paidAt: true, recordedBy: true, notes: true,
                invoice: { select: { invoiceNo: true } },
              },
              ...page(c),
            }),
          ),
        (p) => [p.id, p.invoiceId, p.invoice.invoiceNo, p.receiptNo, p.amount, p.method, p.transactionRef, p.status, p.paidAt, p.recordedBy, p.notes],
        counts,
        'payments',
      ),
    },
  ];
}

async function buildZip(jobId: string, institutionId: string, institutionName: string): Promise<{ fileName: string; bytes: number; counts: Counts }> {
  const dir = exportDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const fileName = exportFileName(jobId);
  const finalPath = path.join(dir, fileName);
  const partPath = `${finalPath}.part`;
  const counts: Counts = {};

  const output = fs.createWriteStream(partPath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  const closed = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err) => logger.warn('Data export: archiver warning', { jobId, error: err.message }));
  });
  archive.pipe(output);

  for (const entry of datasets(institutionId, counts)) archive.append(entry.stream, { name: entry.name });
  // Lazily evaluated after every CSV above has been consumed, so counts are final.
  archive.append(
    Readable.from(
      (async function* () {
        yield JSON.stringify(
          {
            institution: { id: institutionId, name: institutionName },
            generatedAt: new Date().toISOString(),
            jobId,
            format: 'PeopleNIT SMS tenant export v1 (UTF-8 CSV with BOM)',
            rowCounts: counts,
          },
          null,
          2,
        );
      })(),
    ),
    { name: 'manifest.json' },
  );

  try {
    await archive.finalize();
    await closed;
  } catch (error) {
    await fs.promises.rm(partPath, { force: true }).catch(() => undefined);
    throw error;
  }
  await fs.promises.rename(partPath, finalPath);
  const stat = await fs.promises.stat(finalPath);
  return { fileName, bytes: stat.size, counts };
}

/** Runs one job end to end. Never throws (errors mark the job FAILED). */
export async function runDataExportJob(jobId: string): Promise<void> {
  const claimed = await prisma.dataExportJob
    .updateMany({ where: { id: jobId, status: 'PENDING' }, data: { status: 'RUNNING' } })
    .catch((err: Error) => {
      logger.error('Data export: could not claim job', { jobId, error: err.message });
      return { count: 0 };
    });
  if (claimed.count === 0) return;

  const job = await prisma.dataExportJob.findUnique({
    where: { id: jobId },
    select: { id: true, institutionId: true, requestedByUserId: true, institution: { select: { name: true } } },
  });
  if (!job) return;

  try {
    const result = await buildZip(job.id, job.institutionId, job.institution.name);
    const completedAt = new Date();
    const expiresAt = expiryFrom(completedAt);
    await prisma.dataExportJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', fileUrl: `local:${result.fileName}`, completedAt, expiresAt },
    });

    // "Data export ready" — P1, to the requester, with the (authenticated
    // app) download link and its expiry. The actual file download endpoint
    // requires a Bearer token, so the link is the app page that lists
    // exports and downloads them, not a bare public URL.
    notifySafe({
      institutionId: job.institutionId,
      type: 'DATA_EXPORT_READY',
      recipientUserIds: [job.requestedByUserId],
      contextId: job.id,
      data: { link: '/data-export' },
      vars: { downloadUrl: `${env.FRONTEND_URL}/data-export`, expiresAt: expiresAt.toDateString() },
    });
    await prisma.auditLog
      .create({
        data: {
          institutionId: job.institutionId,
          userId: job.requestedByUserId,
          action: 'DATA_EXPORT_COMPLETED',
          resource: 'data-export',
          resourceId: job.id,
          metadata: { bytes: result.bytes, rowCounts: result.counts },
        },
      })
      .catch((err: Error) => logger.error('Data export: audit write failed', { jobId, error: err.message }));
    logger.info('Data export completed', { jobId, institutionId: job.institutionId, bytes: result.bytes });
  } catch (error) {
    logger.error('Data export failed', { jobId, error: error instanceof Error ? error.message : String(error) });
    await prisma.dataExportJob
      .update({ where: { id: job.id }, data: { status: 'FAILED', completedAt: new Date() } })
      .catch(() => undefined);
  }
}

/** Queue a job on the next tick — the HTTP request never waits for the build. */
export function scheduleDataExportJob(jobId: string): void {
  setImmediate(() => {
    runDataExportJob(jobId).catch((err) => logger.error('Data export crashed', { jobId, error: err instanceof Error ? err.message : String(err) }));
  });
}

/** Deletes expired files, expires their jobs, and fails jobs interrupted by a restart. */
export async function cleanupDataExports(now = new Date()): Promise<{ expired: number; failed: number }> {
  const expiredJobs = await prisma.dataExportJob.findMany({
    where: { status: 'COMPLETED', expiresAt: { lte: now } },
    select: { id: true, fileUrl: true },
    take: 500,
  });
  for (const job of expiredJobs) {
    const file = exportFilePath(job.fileUrl);
    if (file) await fs.promises.rm(file, { force: true }).catch(() => undefined);
    await prisma.dataExportJob.update({ where: { id: job.id }, data: { status: 'EXPIRED', fileUrl: null } });
  }
  const stale = await prisma.dataExportJob.updateMany({
    where: { status: { in: ['PENDING', 'RUNNING'] }, createdAt: { lt: new Date(now.getTime() - STALE_EXPORT_MS) } },
    data: { status: 'FAILED', completedAt: now },
  });
  return { expired: expiredJobs.length, failed: stale.count };
}
