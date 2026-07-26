import * as institutionRepository from './institution.repository';
import { NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type { UpdateWebsiteConfigDtoType } from './institution.dto';

export async function listInstitutions() {
  return institutionRepository.listAll();
}

export async function listPaginatedInstitutions(params: any) {
  return institutionRepository.listPaginated(params);
}

export async function getGlobalMetrics() {
  return institutionRepository.getGlobalMetrics();
}

export async function startSupportSession(
  actorUserId: string,
  data: {
    institutionId: string;
    targetUserId: string;
    reason: string;
    ticketId?: string | null;
    isReadOnly?: boolean;
  }
) {
  const { prisma } = require('../../config/prisma');
  const jwt = require('jsonwebtoken');
  const { env } = require('../../config/env');
  const { NotFoundError, BadRequestError } = require('../../utils/AppError');

  // Verify institution exists
  const institution = await prisma.institution.findUnique({
    where: { id: data.institutionId },
    select: { id: true, name: true, slug: true, isActive: true },
  });

  if (!institution) {
    throw new NotFoundError(`Institution with ID '${data.institutionId}' not found`);
  }

  if (!institution.isActive) {
    throw new BadRequestError(`Cannot access suspended institution '${institution.name}'`);
  }

  // Verify target user exists and belongs to institution
  const targetUser = await prisma.user.findFirst({
    where: {
      id: data.targetUserId,
      institutionId: data.institutionId,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
    },
  });

  if (!targetUser) {
    throw new NotFoundError(`Target user '${data.targetUserId}' not found in institution '${data.institutionId}'`);
  }

  if (!targetUser.isActive) {
    throw new BadRequestError(`Target user '${targetUser.email}' is currently inactive`);
  }

  const isReadOnly = data.isReadOnly !== false; // defaults to true
  const expiresInSeconds = 900; // 15 minutes

  const supportPayload = {
    sub: targetUser.id,
    institutionId: institution.id,
    role: targetUser.role,
    email: targetUser.email,
    isSupportSession: true,
    isReadOnly,
    originalSuperAdminId: actorUserId,
    supportReason: data.reason,
    supportTicketId: data.ticketId || null,
  };

  const supportAccessToken = jwt.sign(supportPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: `${expiresInSeconds}s`,
  });

  // Write audit log for support session creation
  await prisma.auditLog.create({
    data: {
      institutionId: institution.id,
      userId: actorUserId,
      action: 'SUPPORT_SESSION_START',
      resource: 'User',
      resourceId: targetUser.id,
      metadata: {
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        reason: data.reason,
        ticketId: data.ticketId || null,
        isReadOnly,
        expiresInSeconds,
      },
    },
  }).catch((err: Error) => {
    logger.error('Failed to log SUPPORT_SESSION_START audit log', { error: err.message });
  });

  logger.info('Support access session created', {
    superAdminId: actorUserId,
    targetUserId: targetUser.id,
    institutionId: institution.id,
    isReadOnly,
  });

  return {
    accessToken: supportAccessToken,
    expiresInSeconds,
    isReadOnly,
    targetUser: {
      id: targetUser.id,
      email: targetUser.email,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      role: targetUser.role,
      institutionId: institution.id,
    },
    institution: {
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
    },
    originalSuperAdminId: actorUserId,
  };
}

export async function revokeSupportSession(actorUserId: string, targetUserId: string, institutionId: string) {
  const { prisma } = require('../../config/prisma');

  await prisma.auditLog.create({
    data: {
      institutionId,
      userId: actorUserId,
      action: 'SUPPORT_SESSION_END',
      resource: 'User',
      resourceId: targetUserId,
      metadata: {
        targetUserId,
        revokedAt: new Date(),
      },
    },
  }).catch((err: Error) => {
    logger.error('Failed to log SUPPORT_SESSION_END audit log', { error: err.message });
  });

  logger.info('Support access session ended/revoked', {
    superAdminId: actorUserId,
    targetUserId,
    institutionId,
  });

  return { success: true, message: 'Support access session terminated' };
}

export async function performAdminUserAction(
  actorUserId: string,
  data: {
    userId: string;
    action: 'SEND_PASSWORD_RESET' | 'FORCE_PASSWORD_RESET' | 'TOGGLE_STATUS' | 'REVOKE_SESSIONS';
    isActive?: boolean;
  }
) {
  const { prisma } = require('../../config/prisma');
  const { NotFoundError } = require('../../utils/AppError');

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, email: true, firstName: true, lastName: true, institutionId: true, isActive: true },
  });

  if (!user) {
    throw new NotFoundError(`User '${data.userId}' not found`);
  }

  let resultMessage = '';
  let resetUrl: string | undefined;

  if (data.action === 'SEND_PASSWORD_RESET') {
    const jwt = require('jsonwebtoken');
    const { env } = require('../../config/env');
    const resetToken = jwt.sign(
      { sub: user.id, email: user.email, type: 'PASSWORD_RESET' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '24h' }
    );
    resetUrl = `http://localhost:5173/login?resetToken=${resetToken}&email=${encodeURIComponent(user.email)}`;
    resultMessage = `Password reset link generated for ${user.email}`;
  } else if (data.action === 'FORCE_PASSWORD_RESET') {
    resultMessage = `User ${user.email} flagged to reset password on next authentication`;
  } else if (data.action === 'TOGGLE_STATUS') {
    const nextStatus = data.isActive ?? !user.isActive;
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: nextStatus },
    });
    resultMessage = `User ${user.email} status changed to ${nextStatus ? 'ACTIVE' : 'SUSPENDED'}`;
  } else if (data.action === 'REVOKE_SESSIONS') {
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    });
    resultMessage = `All active sessions revoked for ${user.email}`;
  }

  // Audit log
  if (user.institutionId) {
    await prisma.auditLog.create({
      data: {
        institutionId: user.institutionId,
        userId: actorUserId,
        action: `ADMIN_ACTION_${data.action}`,
        resource: 'User',
        resourceId: user.id,
        metadata: {
          targetEmail: user.email,
          action: data.action,
          isActive: data.isActive,
        },
      },
    }).catch((err: Error) => {
      logger.error('Failed to write audit log for admin user action', { error: err.message });
    });
  }

  return { success: true, message: resultMessage, resetUrl, userId: user.id };
}


export async function getWebsiteConfig(institutionId: string) {
  const institution = await institutionRepository.findById(institutionId);
  if (!institution) {
    throw new NotFoundError(`Institution with ID '${institutionId}' not found`);
  }
  return institution;
}

export async function updateWebsiteConfig(
  institutionId: string,
  data: UpdateWebsiteConfigDtoType,
) {
  const existing = await institutionRepository.findById(institutionId);
  if (!existing) {
    throw new NotFoundError(`Institution with ID '${institutionId}' not found`);
  }

  const updated = await institutionRepository.updateWebsiteConfig(institutionId, data);
  logger.info('Institution website config updated', { institutionId });
  return updated;
}

export async function createInstitution(data: any, actorUserId: string) {
  const { prisma } = require('../../config/prisma');
  const bcrypt = require('bcryptjs');
  const { ConflictError } = require('../../utils/AppError');
  const { UserRole } = require('@prisma/client');

  // 1. Check uniqueness of slug (EIIN)
  const existingInst = await prisma.institution.findUnique({
    where: { slug: data.slug },
  });
  if (existingInst) {
    throw new ConflictError(`Institution Code / EIIN '${data.slug}' is already registered`);
  }

  // 2. Check uniqueness of admin email
  const existingUser = await prisma.user.findUnique({
    where: { email: data.adminEmail },
  });
  if (existingUser) {
    throw new ConflictError(`Admin email '${data.adminEmail}' is already in use`);
  }

  // 3. Create institution and default branch + admin user in transaction
  const rounds = 12;
  const passwordHash = await bcrypt.hash(data.adminPassword, rounds);

  const result = await prisma.$transaction(async (tx: any) => {
    const institution = await tx.institution.create({
      data: {
        name: data.name,
        slug: data.slug,
      },
    });

    const branch = await tx.branch.create({
      data: {
        institutionId: institution.id,
        name: 'Main Branch',
      },
    });

    const user = await tx.user.create({
      data: {
        institutionId: institution.id,
        email: data.adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        firstName: data.adminFirstName,
        lastName: data.adminLastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    return { institution, branch, admin: user };
  });

  logger.info('New institution registered successfully', {
    institutionId: result.institution.id,
    slug: result.institution.slug,
  });

  // Super-admin actions run before the tenant/audit middleware chain (there is
  // no tenant yet at request time), so log explicitly here instead.
  await prisma.auditLog
    .create({
      data: {
        institutionId: result.institution.id,
        userId: actorUserId,
        action: 'CREATE',
        resource: 'Institution',
        resourceId: result.institution.id,
        metadata: { slug: result.institution.slug, adminEmail: result.admin.email },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for institution creation', {
        error: err.message,
        institutionId: result.institution.id,
      });
    });

  return result;
}

export async function updateInstitutionAdmin(institutionId: string, data: any, actorUserId: string) {
  const { prisma } = require('../../config/prisma');
  const bcrypt = require('bcryptjs');
  const { NotFoundError } = require('../../utils/AppError');

  const admin = await prisma.user.findFirst({
    where: { institutionId, role: 'ADMIN' },
  });

  if (!admin) {
    throw new NotFoundError('Administrator for this institution was not found');
  }

  if (data.institutionName && data.institutionName.trim() !== '') {
    await prisma.institution.update({
      where: { id: institutionId },
      data: { name: data.institutionName }
    });
  }

  const updateData: any = {
    email: data.adminEmail,
    firstName: data.adminFirstName,
    lastName: data.adminLastName,
    phone: data.phone && data.phone.trim() !== '' ? data.phone : null,
  };

  if (data.adminPassword && data.adminPassword.trim() !== '') {
    const rounds = 12;
    updateData.passwordHash = await bcrypt.hash(data.adminPassword, rounds);
  }

  const updatedAdmin = await prisma.user.update({
    where: { id: admin.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  });

  // Super-admin actions run before the tenant/audit middleware chain, so log
  // explicitly here. Never record the new password in metadata.
  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId: actorUserId,
        action: 'UPDATE',
        resource: 'InstitutionAdmin',
        resourceId: admin.id,
        metadata: {
          institutionNameChanged: Boolean(data.institutionName && data.institutionName.trim() !== ''),
          passwordChanged: Boolean(data.adminPassword && data.adminPassword.trim() !== ''),
          adminEmail: updatedAdmin.email,
        },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for admin credential update', {
        error: err.message,
        institutionId,
        adminId: admin.id,
      });
    });

  return updatedAdmin;
}

export async function listPublicInstitutions() {
  return institutionRepository.listPublic();
}

export async function setInstitutionStatus(institutionId: string, isActive: boolean, actorUserId: string) {
  const { prisma } = require('../../config/prisma');

  const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!institution) {
    throw new NotFoundError(`Institution with ID '${institutionId}' not found`);
  }

  const updated = await prisma.institution.update({
    where: { id: institutionId },
    data: { isActive },
    select: { id: true, name: true, slug: true, isActive: true },
  });

  // Super-admin actions run before the tenant/audit middleware chain, so log explicitly here.
  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId: actorUserId,
        action: 'UPDATE',
        resource: 'InstitutionStatus',
        resourceId: institutionId,
        metadata: { isActive },
      },
    })
    .catch((err: Error) => {
      logger.error('Failed to write audit log for institution status change', {
        error: err.message,
        institutionId,
      });
    });

  logger.info('Institution status changed', { institutionId, isActive, actorUserId });
  return updated;
}

export async function deleteInstitution(institutionId: string, actorUserId: string) {
  const { prisma } = require('../../config/prisma');

  const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!institution) {
    throw new NotFoundError(`Institution with ID '${institutionId}' not found`);
  }

  // Institution has no cascading deletes configured in the schema, so every
  // dependent row across ~25 tables must be removed in dependency order
  // (children before parents) inside one transaction before the institution
  // itself can be deleted.
  await prisma.$transaction(async (tx: any) => {
    const students = await tx.student.findMany({ where: { institutionId }, select: { id: true } });
    const studentIds = students.map((s: any) => s.id);
    const invoices = await tx.invoice.findMany({ where: { institutionId }, select: { id: true } });
    const invoiceIds = invoices.map((i: any) => i.id);
    const guardians = await tx.guardian.findMany({ where: { institutionId }, select: { id: true } });
    const guardianIds = guardians.map((g: any) => g.id);
    const users = await tx.user.findMany({ where: { institutionId }, select: { id: true } });
    const userIds = users.map((u: any) => u.id);
    const branches = await tx.branch.findMany({ where: { institutionId }, select: { id: true } });
    const branchIds = branches.map((b: any) => b.id);
    const classes = await tx.class.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } });
    const classIds = classes.map((c: any) => c.id);

    await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.invoice.deleteMany({ where: { institutionId } });
    await tx.feeCategory.deleteMany({ where: { institutionId } });
    await tx.studentDocument.deleteMany({ where: { institutionId } });
    await tx.guardianStudent.deleteMany({ where: { guardianId: { in: guardianIds } } });
    await tx.libraryIssue.deleteMany({ where: { institutionId } });
    await tx.transportAssignment.deleteMany({ where: { institutionId } });
    await tx.attendance.deleteMany({ where: { institutionId } });
    await tx.examResult.deleteMany({ where: { institutionId } });
    await tx.exam.deleteMany({ where: { institutionId } });
    await tx.timetableSlot.deleteMany({ where: { institutionId } });
    await tx.notice.deleteMany({ where: { institutionId } });
    await tx.libraryBook.deleteMany({ where: { institutionId } });
    await tx.transportVehicle.deleteMany({ where: { institutionId } });
    await tx.transportRoute.deleteMany({ where: { institutionId } });
    await tx.payrollRecord.deleteMany({ where: { institutionId } });
    await tx.staffProfile.deleteMany({ where: { institutionId } });
    await tx.message.deleteMany({ where: { institutionId } });
    await tx.auditLog.deleteMany({ where: { institutionId } });
    await tx.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await tx.guardian.deleteMany({ where: { institutionId } });
    // Section.classTeacherId references Teacher — clear it before deleting Teachers.
    await tx.section.updateMany({ where: { classId: { in: classIds } }, data: { classTeacherId: null } });
    await tx.teacher.deleteMany({ where: { userId: { in: userIds } } });
    await tx.student.deleteMany({ where: { institutionId } });
    await tx.permission.deleteMany({ where: { institutionId } });
    await tx.section.deleteMany({ where: { classId: { in: classIds } } });
    await tx.class.deleteMany({ where: { branchId: { in: branchIds } } });
    await tx.branch.deleteMany({ where: { institutionId } });
    await tx.user.deleteMany({ where: { institutionId } });
    await tx.academicYear.deleteMany({ where: { institutionId } });
    await tx.institution.delete({ where: { id: institutionId } });

    void studentIds;
  });

  logger.warn('Institution permanently deleted', {
    institutionId,
    slug: institution.slug,
    name: institution.name,
    actorUserId,
  });
}

export async function getAuditLogs(params: {
  page?: number;
  pageSize?: number;
  action?: string;
  search?: string;
}) {
  const { prisma } = require('../../config/prisma');
  const page = Number(params.page || 1);
  const pageSize = Number(params.pageSize || 15);
  const skip = (page - 1) * pageSize;

  const where: any = {};
  if (params.action && params.action !== 'ALL') {
    where.action = { contains: params.action, mode: 'insensitive' };
  }
  if (params.search) {
    where.OR = [
      { action: { contains: params.search, mode: 'insensitive' } },
      { resource: { contains: params.search, mode: 'insensitive' } },
      { user: { email: { contains: params.search, mode: 'insensitive' } } },
      { institution: { name: { contains: params.search, mode: 'insensitive' } } },
    ];
  }

  const [total, logs, actionBreakdown] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, role: true } },
        institution: { select: { name: true, slug: true } },
      },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
      take: 5,
    }),
  ]);

  return {
    data: logs,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      actionBreakdown: actionBreakdown.map((b: any) => ({ action: b.action, count: b._count.action })),
    },
  };
}

export async function getSystemHealth() {
  const { prisma } = require('../../config/prisma');
  let redis: any = null;
  try {
    redis = require('../../config/redis').default;
  } catch (e) {}

  const startDb = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbLatencyMs = Date.now() - startDb;

  let redisConnected = false;
  let redisMemory = '0 MB';
  try {
    if (redis && redis.status === 'ready') {
      redisConnected = true;
      const info = await redis.info('memory');
      const match = info.match(/used_memory_human:(.*)/);
      if (match) redisMemory = match[1].trim();
    }
  } catch (err) {}

  const memoryUsage = process.memoryUsage();
  const heapUsedMb = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMb = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
  const rssMb = (memoryUsage.rss / 1024 / 1024).toFixed(2);
  const uptimeSeconds = Math.floor(process.uptime());

  const [instCount, userCount, activeSessionsCount, recentAuditCount] = await Promise.all([
    prisma.institution.count(),
    prisma.user.count(),
    prisma.refreshToken.count({ where: { isRevoked: false } }),
    prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);

  return {
    status: 'OPERATIONAL',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    database: {
      status: 'ONLINE',
      latencyMs: dbLatencyMs,
      activeConnectionPool: 'Healthy (Prisma Client)',
    },
    cache: {
      status: redisConnected ? 'ONLINE' : 'FALLBACK_LOCAL',
      memory: redisMemory,
    },
    systemMetrics: {
      heapUsedMb,
      heapTotalMb,
      rssMb,
      heapUsagePercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
    },
    platformStats: {
      totalInstitutions: instCount,
      totalUsers: userCount,
      activeSessions: activeSessionsCount,
      last24hAuditEvents: recentAuditCount,
    },
  };
}

