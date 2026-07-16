import { Request, Response, NextFunction } from 'express';
import * as studentService from './student.service';
import {
  successResponse,
  paginatedResponse,
} from '../../utils/response';
import { NotFoundError } from '../../utils/AppError';

// =============================================================================
// Student Controller — thin layer, delegates to student.service.ts
// =============================================================================

export async function listStudents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { students, total } = await studentService.listStudents(
      req.tenantId!,
      req.query as never,
    );
    paginatedResponse(
      res,
      students,
      total,
      Number(req.query.page) || 1,
      Number(req.query.pageSize) || 20,
    );
  } catch (error) {
    next(error);
  }
}

export async function getStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const student = await studentService.getStudent(req.tenantId!, req.params.id);
    successResponse(res, student);
  } catch (error) {
    next(error);
  }
}

export async function createStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const student = await studentService.createStudent(req.tenantId!, req.body);
    successResponse(res, student, 'Student created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const student = await studentService.updateStudent(
      req.tenantId!,
      req.params.id,
      req.body,
    );
    successResponse(res, student, 'Student updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await studentService.deleteStudent(req.tenantId!, req.params.id);
    successResponse(res, null, 'Student deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function bulkImportStudents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded (expected field name "file")' });
      return;
    }

    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: unknown[] = XLSX.utils.sheet_to_json(firstSheet, { defval: null });

    const result = await studentService.bulkImportStudents(req.tenantId!, rows, req.user!.sub);
    successResponse(
      res,
      result,
      `Import complete: ${result.successCount} created, ${result.errorCount} failed`,
      result.errorCount > 0 ? 207 : 201,
    );
  } catch (error) {
    next(error);
  }
}

export async function getStudentDocuments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const docs = await studentService.getStudentDocuments(req.tenantId!, req.params.id);
    successResponse(res, docs);
  } catch (error) {
    next(error);
  }
}

export async function addStudentDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doc = await studentService.addStudentDocument(
      req.tenantId!,
      req.params.id,
      req.body,
    );
    successResponse(res, doc, 'Document added successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listClasses(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { prisma } = require('../../config/prisma');
    let classes = await prisma.class.findMany({
      where: { branch: { institutionId: req.tenantId! } }
    });

    // Self-healing: if no classes exist, auto-seed default ones
    if (classes.length === 0) {
      // Find or create default branch
      let branch = await prisma.branch.findFirst({
        where: { institutionId: req.tenantId! }
      });
      if (!branch) {
        branch = await prisma.branch.create({
          data: {
            institutionId: req.tenantId!,
            name: 'Main Branch'
          }
        });
      }

      // Find or create default academic year
      const currentYear = new Date().getFullYear().toString();
      let academicYear = await prisma.academicYear.findFirst({
        where: { institutionId: req.tenantId!, label: currentYear }
      });
      if (!academicYear) {
        academicYear = await prisma.academicYear.create({
          data: {
            institutionId: req.tenantId!,
            label: currentYear,
            startDate: new Date(`${currentYear}-01-01`),
            endDate: new Date(`${currentYear}-12-31`),
            isCurrent: true
          }
        });
      }

      // Seed default classes. Batched (createMany) instead of one
      // sequential await per class/section — the previous version issued
      // ~104 sequential round trips to the database on a single GET
      // request (13 classes + 13*7 sections), which against a remote DB
      // can turn one request into many seconds. IDs are generated
      // client-side so sections can reference their class in the same
      // batch without needing the created rows back (createMany doesn't
      // return them).
      const classesToSeed = [
        'KG', 'Nursery', 'Junior One',
        'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
        'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
      ];
      const sectionsToSeed = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

      const { randomUUID } = require('crypto');
      const classRows = classesToSeed.map((name, i) => ({
        id: randomUUID(),
        branchId: branch.id,
        name,
        level: i + 1,
      }));
      await prisma.class.createMany({ data: classRows });

      const sectionRows = classRows.flatMap((cls) =>
        sectionsToSeed.map((name) => ({ id: randomUUID(), classId: cls.id, name })),
      );
      await prisma.section.createMany({ data: sectionRows });

      // Query classes again
      classes = await prisma.class.findMany({
        where: { branch: { institutionId: req.tenantId! } }
      });
    }

    successResponse(res, classes);
  } catch (error) {
    next(error);
  }
}

export async function listSections(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { prisma } = require('../../config/prisma');
    const { classId } = req.query;

    if (!classId) {
      res.status(400).json({ success: false, message: 'classId query parameter is required' });
      return;
    }

    // Verify the class belongs to the caller's tenant before reading or
    // self-healing any sections — classId is client-supplied and must never
    // be trusted across institutions.
    const ownedClass = await prisma.class.findFirst({
      where: { id: classId as string, branch: { institutionId: req.tenantId! } },
      select: { id: true },
    });
    if (!ownedClass) {
      throw new NotFoundError('Class not found');
    }

    let sections = await prisma.section.findMany({
      where: { classId: classId as string },
      include: {
        classTeacher: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      }
    });

    // Self-healing: Ensure sections A to G exist for this class
    const requiredSections = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const existingSectionNames = sections.map((s: any) => s.name);
    const missingSections = requiredSections.filter(name => !existingSectionNames.includes(name));

    if (missingSections.length > 0) {
      // Batched — was one sequential await per missing section (up to 7
      // round trips) for what should be a single insert.
      await prisma.section.createMany({
        data: missingSections.map((name) => ({ classId: classId as string, name })),
      });

      // Re-fetch updated list
      sections = await prisma.section.findMany({
        where: { classId: classId as string },
        include: {
          classTeacher: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });
    }

    successResponse(res, sections);
  } catch (error) {
    next(error);
  }
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { prisma } = require('../../config/prisma');
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.sub },
      include: {
        class: true,
        section: true,
        branch: true,
        academicYear: true
      }
    });
    if (!student) {
      res.status(404).json({ success: false, message: 'Student profile not found' });
      return;
    }
    successResponse(res, student);
  } catch (error) {
    next(error);
  }
}
