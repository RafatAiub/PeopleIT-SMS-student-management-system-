import bcrypt from 'bcryptjs';
import { UserRepository } from './user.repository';
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from '../../utils/AppError';
import { EmailPriority, UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { sendEmail } from '../email/sender';
import { staffInviteEmail } from '../email/templates/invite.templates';
import { findInstitutionBranding } from '../notifications/notifications.repository';

// F8: classId/sectionId are client-supplied on the STUDENT branch of
// create/updateUser — must belong to this tenant (Section/Class are scoped
// indirectly via their Branch's institutionId). Mirrors the same check in
// student.service.ts for the dedicated /students endpoints.
async function assertStudentClassLookupsBelongToInstitution(
  tenantId: string,
  classId: string | null | undefined,
  sectionId: string | null | undefined,
) {
  const { prisma } = require('../../config/prisma');
  if (classId) {
    const cls = await prisma.class.findFirst({ where: { id: classId, branch: { institutionId: tenantId } } });
    if (!cls) throw new BadRequestError(`Class with ID '${classId}' not found`);
  }
  if (sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId, class: { branch: { institutionId: tenantId } } },
    });
    if (!section) throw new BadRequestError(`Section with ID '${sectionId}' not found`);
  }
}

export class UserService {
  static async createUser(tenantId: string, data: {
    email: string;
    password: UserPassword;
    role: UserRole;
    firstName: string;
    lastName: string;
    phone?: string;
  } & any, actingRole: UserRole) {
    // U1: only a SUPER_ADMIN may create another SUPER_ADMIN account.
    if (data.role === UserRole.SUPER_ADMIN && actingRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Only a super admin can create a super admin user');
    }

    const existing = await UserRepository.getUserByEmail(data.email);
    if (existing) {
      throw new ConflictError('Email already in use');
    }

    const rounds = env.BCRYPT_ROUNDS ?? 12;
    const passwordHash = await bcrypt.hash(data.password, rounds);

    const user = await UserRepository.createUser(tenantId, {
      email: data.email,
      passwordHash,
      role: data.role,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      avatarUrl: data.avatarUrl,
    });

    if (data.role === 'STUDENT') {
      await assertStudentClassLookupsBelongToInstitution(tenantId, data.classId, data.sectionId);
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
          gender: data.gender,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          address: data.address,
          permanentAddress: data.permanentAddress,
          canManageStudents: data.canManageStudents ?? false,
        }
      });
    }

    if (data.role === 'GUARDIAN') {
      const { prisma } = require('../../config/prisma');
      const guardian = await prisma.guardian.create({
        data: {
          institutionId: tenantId,
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || '',
          email: data.email,
          relationship: data.relationship || 'GUARDIAN',
          occupation: data.occupation || null,
          nidNumber: data.nidNumber || null,
          emergencyPhone: data.emergencyPhone || null,
        },
      });

      await linkGuardianStudents(tenantId, guardian.id, data.studentIds, data.relationship);
    }

    // The initial insert predates the role-specific profile (student/teacher/
    // guardian) created above — re-fetch so the response actually reflects it,
    // instead of always reporting studentProfile/guardianProfile as null.
    const created = await UserRepository.getUserById(tenantId, user.id);
    const { passwordHash: _passwordHash, ...createdWithoutPassword } = created!;

    // Fire-and-forget invite mail — an admin just handed this user a
    // password out-of-band (this call), so emailing it too is the delivery
    // channel, not a duplicate secret store; never blocks the response, and a
    // delivery failure never fails account creation itself.
    findInstitutionBranding(tenantId)
      .then((branding) => {
        const mail = staffInviteEmail({
          firstName: data.firstName,
          institutionName: branding.name,
          role: data.role,
          loginEmail: data.email,
          temporaryPassword: data.password,
          loginUrl: `${env.FRONTEND_URL}/login`,
          institution: { name: branding.name, logoUrl: branding.logoUrl, color: branding.color },
        });
        return sendEmail({
          to: data.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          template: 'users.invite',
          priority: EmailPriority.P0_SECURITY,
          institutionId: tenantId,
          fromName: branding.name,
          replyTo: branding.contactEmail ?? undefined,
        });
      })
      .catch((error) => {
        logger.error('Failed to send user invite email', { tenantId, error: error instanceof Error ? error.message : String(error) });
      });

    return createdWithoutPassword;
  }

  static async getUser(tenantId: string, id: string) {
    const user = await UserRepository.getUserById(tenantId, id);
    if (!user) throw new NotFoundError('User not found');
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  static async listUsers(
    tenantId: string | undefined,
    filters: {
      role?: UserRole;
      search?: string;
      page?: number;
      pageSize?: number;
      institutionId?: string;
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

  static async updateUser(tenantId: string, id: string, data: any, actingRole: UserRole) {
    const user = await UserRepository.getUserById(tenantId, id);
    if (!user) throw new NotFoundError('User not found');

    // U1: non-super-admins may never touch a super admin account, nor
    // promote anyone to super admin, nor move a user to another tenant.
    if (actingRole !== UserRole.SUPER_ADMIN) {
      if (user.role === UserRole.SUPER_ADMIN) {
        throw new ForbiddenError('Only a super admin can modify a super admin user');
      }
      if (data.role === UserRole.SUPER_ADMIN) {
        throw new ForbiddenError('Only a super admin can promote a user to super admin');
      }
      if (data.institutionId !== undefined && data.institutionId !== tenantId) {
        throw new ForbiddenError('You do not have permission to change the institution of a user');
      }
    }

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
      await assertStudentClassLookupsBelongToInstitution(tenantId, data.classId, data.sectionId);
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
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        address: data.address,
        permanentAddress: data.permanentAddress,
        canManageStudents: data.canManageStudents,
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

    if (updatedUser.role === 'GUARDIAN') {
      const guardianData = {
        firstName: data.firstName || updatedUser.firstName,
        lastName: data.lastName || updatedUser.lastName,
        phone: data.phone || updatedUser.phone || '',
        relationship: data.relationship || 'GUARDIAN',
        occupation: data.occupation,
        nidNumber: data.nidNumber,
        emergencyPhone: data.emergencyPhone,
      };

      const guardian = await prisma.guardian.upsert({
        where: { userId: id },
        update: guardianData,
        create: {
          ...guardianData,
          email: updatedUser.email,
          institutionId: tenantId,
          userId: id,
        },
      });

      // studentIds is only sent when the admin actually edited the children
      // list — undefined means "leave links untouched", [] means "unlink all".
      if (data.studentIds !== undefined) {
        await linkGuardianStudents(tenantId, guardian.id, data.studentIds, data.relationship, { replace: true });
      }
    }

    const updated = await UserRepository.getUserById(tenantId, id);
    const { passwordHash: _passwordHash, ...updatedWithoutPassword } = updated!;
    return updatedWithoutPassword;
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

    await UserRepository.updatePassword(tenantId, userId, passwordHash);
  }

  static async deleteUser(tenantId: string, id: string) {
    const { prisma } = require('../../config/prisma');
    const user = await UserRepository.getUserById(tenantId, id);
    if (!user) throw new NotFoundError('User not found');

    if (user.role === 'STUDENT') {
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

    if (user.role === 'GUARDIAN') {
      const guardian = await prisma.guardian.findFirst({ where: { userId: id } });
      if (guardian) {
        await prisma.guardianStudent.deleteMany({ where: { guardianId: guardian.id } });
        await prisma.guardian.delete({ where: { id: guardian.id } });
      }
    }

    // HR staff (Admin/Accountant/Librarian/Transport Officer/Management) profile
    const staff = await prisma.staffProfile.findFirst({ where: { userId: id } });
    if (staff) {
      await prisma.payrollRecord.deleteMany({ where: { staffId: staff.id } });
      await prisma.staffProfile.delete({ where: { id: staff.id } });
    }

    // Records that reference the user account directly - would otherwise block
    // deletion with a foreign key constraint regardless of role
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
    await prisma.auditLog.deleteMany({ where: { userId: id } });
    await prisma.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });

    return UserRepository.deleteUser(tenantId, id);
  }
}

// Links a guardian to a set of student IDs (silently ignoring any that don't
// belong to this institution). With `replace: true` (update flow), the link
// set is synced to exactly `studentIds` — missing ones are unlinked, new ones
// added — while leaving isPrimary on already-linked students untouched.
async function linkGuardianStudents(
  tenantId: string,
  guardianId: string,
  studentIds: string[] | null | undefined,
  relationship: string | null | undefined,
  options: { replace?: boolean } = {},
) {
  const { prisma } = require('../../config/prisma');
  const requestedIds = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [];

  const validStudents = requestedIds.length > 0
    ? await prisma.student.findMany({
        where: { id: { in: requestedIds }, institutionId: tenantId },
        select: { id: true },
      })
    : [];
  const validIds: string[] = validStudents.map((s: { id: string }) => s.id);

  if (options.replace) {
    await prisma.guardianStudent.deleteMany({
      where: {
        guardianId,
        studentId: { notIn: validIds.length > 0 ? validIds : ['__none__'] },
      },
    });
  }

  const existingLinks = await prisma.guardianStudent.findMany({
    where: { guardianId },
    select: { studentId: true },
  });
  const existingIds = new Set(existingLinks.map((l: { studentId: string }) => l.studentId));
  const toCreate = validIds.filter((studentId) => !existingIds.has(studentId));

  if (toCreate.length > 0) {
    await prisma.guardianStudent.createMany({
      data: toCreate.map((studentId) => ({
        guardianId,
        studentId,
        isPrimary: existingIds.size === 0 && studentId === toCreate[0],
        relationship: relationship || 'GUARDIAN',
      })),
      skipDuplicates: true,
    });
  }
}

type UserPassword = string;
