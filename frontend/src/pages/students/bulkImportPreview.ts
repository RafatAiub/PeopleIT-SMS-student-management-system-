// Client-side parsing + quick validation for AddBulkData's "Preview &
// Validate" step. This is a fast, non-blocking pre-check only — the server
// (BulkImportRowDto / bulkImportStudents in student.service.ts) remains the
// authoritative validator; a row flagged clean here can still be rejected
// server-side (e.g. a duplicate studentId already in the database, or a
// className/sectionName that doesn't resolve), and that's reported after
// import in the existing per-row errors table.

// Column names must match BulkImportRowDto in backend/src/modules/students/student.dto.ts.
export const IMPORT_COLUMNS = [
  'studentId', 'firstName', 'lastName', 'className', 'sectionName',
  'rollNumber', 'gender', 'dateOfBirth', 'phone', 'email', 'bloodGroup',
] as const;

export interface PreviewRow {
  rowNumber: number;
  studentId: string;
  firstName: string;
  lastName: string;
  className: string;
  sectionName: string;
  rollNumber: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  bloodGroup: string;
  issues: string[];
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function validateRow(row: Omit<PreviewRow, 'rowNumber' | 'issues'>): string[] {
  const issues: string[] = [];
  if (!row.studentId) issues.push('Student ID is required');
  if (!row.firstName) issues.push('First name is required');
  if (!row.lastName) issues.push('Last name is required');
  if (row.gender && !['MALE', 'FEMALE', 'OTHER'].includes(row.gender.toUpperCase())) {
    issues.push('Gender must be MALE, FEMALE or OTHER');
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    issues.push('Email looks invalid');
  }
  if (row.dateOfBirth && Number.isNaN(new Date(row.dateOfBirth).getTime())) {
    issues.push('Date of birth is not a valid date');
  }
  return issues;
}

/** Parses the first sheet of an .xlsx/.xls/.csv file into preview rows. */
export async function parseBulkImportFile(file: File): Promise<PreviewRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  // Keyed by the sheet's own header row (not by column position) — same as
  // the server's XLSX.utils.sheet_to_json(firstSheet, { defval: null }) in
  // student.controller.ts, so a re-ordered (but still correctly-named)
  // column layout previews the same way it will actually be imported.
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  return raw
    .filter((r) => IMPORT_COLUMNS.some((c) => cell(r[c])))
    .map((r, index) => {
      const base = {
        studentId: cell(r.studentId),
        firstName: cell(r.firstName),
        lastName: cell(r.lastName),
        className: cell(r.className),
        sectionName: cell(r.sectionName),
        rollNumber: cell(r.rollNumber),
        gender: cell(r.gender),
        dateOfBirth: cell(r.dateOfBirth),
        phone: cell(r.phone),
        email: cell(r.email),
        bloodGroup: cell(r.bloodGroup),
      };
      return { rowNumber: index + 1, ...base, issues: validateRow(base) };
    });
}
