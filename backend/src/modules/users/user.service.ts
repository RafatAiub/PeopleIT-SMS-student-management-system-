import bcrypt from 'bcryptjs';
import { UserRepository } from './user.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError';
import { UserRole } from '@prisma/client';
import { env } from '../../config/env';

export class UserService {
  static async createUser(tenantId: string, data: {
    email: string;
    password: UserPassword;
    role: UserRole;
    firstName: string;
    lastName: string;
    phone?: string;
  } & any) {
    const existing = await UserRepository.getUserByEmail(data.email);
    if (existing) {
      throw new ConflictError('Email already in use');
    }

    const rounds = env.BCRYPT_ROUNDS ?? 12;
    const passwordHash = await bcrypt.hash(data.password, rounds);

    const user = await UserRepository.createUser(tenantId, {
      email: data.email,
      passwordHash,
      plainPassword: data.password,
      role: data.role,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      avatarUrl: data.avatarUrl,
    });

    if (data.role === 'STUDENT') {
      const { prisma } = require('../../config/prisma');
      await prisma.student.create({
        data: {
          institutionId: tenantId,
          userId: user.id,
          studentId: data.rollNumber || `STU-${Date.now()}`,
          rollNumber: data.rollNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          avatarUrl: data.avatarUrl || null,
          classId: data.classId || null,
          sectionId: data.sectionId || null,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          gender: data.gender,
          bloodGroup: data.bloodGroup,
          religion: data.religion,
          nationality: data.nationality || 'Bangladeshi',
          address: data.address,
          admissionDate: data.admissionDate ? new Date(data.admissionDate) : new Date(),
        }
      });
    }

    if (data.role === 'TEACHER') {
      const { prisma } = require('../../config/prisma');
      await prisma.teacher.create({
        data: {
          userId: user.id,
          employeeId: `TCH-${Date.now()}`,
          qualification: data.qualification,
          subjectExpertise: data.subjectExpertise,
          joiningDate: data.joiningDate ? new Date(data.joiningDate) : new Date(),
        }
      });
    }

    return user;
  }

  static async getUser(tenantId: string, id: string) {
    const user = await UserRepository.getUserById(tenantId, id);
    if (!user) throw new NotFoundError('User not found');
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  static async listUsers(
    tenantId: string,
    filters: {
      role?: UserRole;
      search?: string;
      page?: number;
      pageSize?: number;
    }
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
    return UserRepository.listUsers(tenantId, {
      ...filters,
      page,
      pageSize,
    });
  }

  static async updateUser(tenantId: string, id: string, data: any) {
    const user = await UserRepository.getUserById(tenantId, id);
    if (!user) throw new NotFoundError('User not found');

    const userFields = {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      avatarUrl: data.avatarUrl,
      isActive: data.isActive,
      role: data.role,
    };

    const updatedUser = await UserRepository.updateUser(tenantId, id, userFields);

    const { prisma } = require('../../config/prisma');

    if (updatedUser.role === 'STUDENT') {
      const studentData = {
        firstName: data.firstName || updatedUser.firstName,
        lastName: data.lastName || updatedUser.lastName,
        phone: data.phone || updatedUser.phone,
        rollNumber: data.rollNumber,
        avatarUrl: data.avatarUrl || updatedUser.avatarUrl || null,
        classId: data.classId || null,
        sectionId: data.sectionId || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender,
        bloodGroup: data.bloodGroup,
        religion: data.religion,
        nationality: data.nationality,
        address: data.address,
        admissionDate: data.admissionDate ? new Date(data.admissionDate) : undefined,
      };

      await prisma.student.upsert({
        where: { userId: id },
        update: studentData,
        create: {
          ...studentData,
          institutionId: tenantId,
          userId: id,
          studentId: data.rollNumber || `STU-${Date.now()}`,
        }
      });
    }

    if (updatedUser.role === 'TEACHER') {
      const teacherData = {
        qualification: data.qualification,
        subjectExpertise: data.subjectExpertise,
        joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
      };

      await prisma.teacher.upsert({
        where: { userId: id },
        update: teacherData,
        create: {
          ...teacherData,
          userId: id,
          employeeId: `TCH-${Date.now()}`,
        }
      });
    }

    return UserRepository.getUserById(tenantId, id);
  }

  static async changePassword(
    tenantId: string,
    userId: string,
    data: {
      oldPassword: UserPassword;
      newPassword: UserPassword;
    } & any
  ) {
    const user = await UserRepository.getUserById(tenantId, userId);
    if (!user) throw new NotFoundError('User not found');

    const isValid = await bcrypt.compare(data.oldPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestError('Invalid old password');
    }

    const rounds = env.BCRYPT_ROUNDS ?? 12;
    const passwordHash = await bcrypt.hash(data.newPassword, rounds);

    await UserRepository.updatePassword(tenantId, userId, passwordHash, data.newPassword);
  }

  static async deleteUser(tenantId: string, id: string) {
    const user = await UserRepository.getUserById(tenantId, id);
    if (!user) throw new NotFoundError('User not found');

    if (user.role === 'STUDENT') {
      const { prisma } = require('../../config/prisma');
      const student = await prisma.student.findFirst({ where: { userId: id } });
      if (student) {
        await prisma.attendance.deleteMany({ where: { studentId: student.id } });
        await prisma.examResult.deleteMany({ where: { studentId: student.id } });
        await prisma.invoiceItem.deleteMany({ where: { invoice: { studentId: student.id } } });
        await prisma.payment.deleteMany({ where: { invoice: { studentId: student.id } } });
        await prisma.invoice.deleteMany({ where: { studentId: student.id } });
        await prisma.studentDocument.deleteMany({ where: { studentId: student.id } });
        await prisma.guardianStudent.deleteMany({ where: { studentId: student.id } });
        await prisma.libraryIssue.deleteMany({ where: { studentId: student.id } });
        await prisma.transportAssignment.deleteMany({ where: { studentId: student.id } });
        await prisma.student.delete({ where: { id: student.id } });
      }
    }

    if (user.role === 'TEACHER') {
      const { prisma } = require('../../config/prisma');
      const teacher = await prisma.teacher.findFirst({ where: { userId: id } });
      if (teacher) {
        await prisma.section.updateMany({
          where: { classTeacherId: teacher.id },
          data: { classTeacherId: null }
        });
        await prisma.timetableSlot.updateMany({
          where: { teacherId: teacher.id },
          data: { teacherId: null }
        });
        await prisma.teacher.delete({ where: { id: teacher.id } });
      }
    }

    return UserRepository.deleteUser(tenantId, id);
  }
}

type UserPassword = string;
