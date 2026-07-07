import { Request, Response, NextFunction } from 'express';
import * as studentService from './student.service';
import {
  successResponse,
  paginatedResponse,
} from '../../utils/response';

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
    const classes = await prisma.class.findMany({
      where: { branch: { institutionId: req.tenantId! } },
      include: {
        sections: {
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
        }
      }
    });
    successResponse(res, classes);
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
