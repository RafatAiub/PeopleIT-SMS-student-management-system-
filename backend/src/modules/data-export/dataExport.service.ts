import fs from 'fs';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { ACTIVE_EXPORT_STATUSES, EXPORT_RETENTION_DAYS, isExpired } from './dataExport.logic';
import { exportFilePath, scheduleDataExportJob } from './dataExport.runner';

// =============================================================================
// Tenant data export jobs — every query pinned to institutionId.
// =============================================================================

export const MAX_EXPORTS_PER_DAY = 5;

const jobSelect = {
  id: true,
  status: true,
  createdAt: true,
  completedAt: true,
  expiresAt: true,
  fileUrl: true,
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

type JobRow = {
  id: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  fileUrl: string | null;
  requestedBy: { id: string; firstName: string; lastName: string };
};

function present(job: JobRow, now = new Date()) {
  const { fileUrl, ...rest } = job;
  const expired = job.status === 'EXPIRED' || (job.status === 'COMPLETED' && isExpired(job.expiresAt, now));
  return {
    ...rest,
    status: expired ? 'EXPIRED' : job.status,
    downloadable: job.status === 'COMPLETED' && !expired && !!fileUrl,
  };
}

export async function listJobs(institutionId: string, page: number, pageSize: number) {
  const where = { institutionId };
  const [rows, total] = await Promise.all([
    prisma.dataExportJob.findMany({ where, select: jobSelect, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.dataExportJob.count({ where }),
  ]);
  return { items: rows.map((r) => present(r)), meta: { total, page, pageSize }, retentionDays: EXPORT_RETENTION_DAYS };
}

export async function requestExport(institutionId: string, userId: string) {
  const active = await prisma.dataExportJob.findFirst({
    where: { institutionId, status: { in: ACTIVE_EXPORT_STATUSES } },
    select: { id: true },
  });
  if (active) throw new ConflictError('An export is already being prepared. Please wait for it to finish.');

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.dataExportJob.count({ where: { institutionId, createdAt: { gte: since } } });
  if (recent >= MAX_EXPORTS_PER_DAY) {
    throw new AppError(`At most ${MAX_EXPORTS_PER_DAY} exports can be requested per 24 hours`, 429);
  }

  const job = await prisma.dataExportJob.create({
    data: { institutionId, requestedByUserId: userId, status: 'PENDING' },
    select: jobSelect,
  });
  scheduleDataExportJob(job.id);
  return present(job);
}

export async function getJob(institutionId: string, id: string) {
  const job = await prisma.dataExportJob.findFirst({ where: { id, institutionId }, select: jobSelect });
  if (!job) throw new NotFoundError('Export not found');
  return present(job);
}

/** Resolves the file for download (tenant-checked) and writes an audit entry. */
export async function openDownload(institutionId: string, id: string, userId: string, meta: { ip?: string; userAgent?: string }) {
  const job = await prisma.dataExportJob.findFirst({ where: { id, institutionId }, select: jobSelect });
  if (!job) throw new NotFoundError('Export not found');
  const view = present(job);
  if (!view.downloadable) throw new AppError(view.status === 'EXPIRED' ? 'This export has expired — request a new one' : 'This export is not ready', 410);
  const file = exportFilePath(job.fileUrl);
  if (!file || !fs.existsSync(file)) {
    throw new AppError('The export file is no longer on the server (it may have been cleared by a redeploy). Request a new export.', 410);
  }
  await prisma.auditLog
    .create({
      data: {
        institutionId,
        userId,
        action: 'DATA_EXPORT_DOWNLOAD',
        resource: 'data-export',
        resourceId: job.id,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    })
    .catch((err: Error) => logger.error('Data export: download audit failed', { error: err.message }));
  const stamp = (job.completedAt ?? job.createdAt).toISOString().slice(0, 10);
  return { file, downloadName: `peoplenit-export-${stamp}-${job.id.slice(-6)}.zip` };
}
