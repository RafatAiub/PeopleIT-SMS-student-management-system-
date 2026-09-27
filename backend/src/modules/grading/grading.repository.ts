import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { GradeBandDtoType } from './grading.dto';

const scaleInclude = {
  bands: { orderBy: { minPercent: 'desc' as const } },
} satisfies Prisma.GradingScaleInclude;

export async function findScales(institutionId: string, page: number, pageSize: number) {
  const where = { institutionId };
  const [items, total] = await prisma.$transaction([
    prisma.gradingScale.findMany({
      where,
      include: scaleInclude,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.gradingScale.count({ where }),
  ]);
  return { items, total };
}

export async function findScaleById(institutionId: string, id: string) {
  return prisma.gradingScale.findFirst({ where: { id, institutionId }, include: scaleInclude });
}

export async function findDefaultScale(institutionId: string) {
  return prisma.gradingScale.findFirst({
    where: { institutionId, isDefault: true },
    include: scaleInclude,
    orderBy: { updatedAt: 'desc' },
  });
}

function bandRows(bands: GradeBandDtoType[]) {
  return bands.map((b) => ({
    grade: b.grade.trim(),
    minPercent: new Prisma.Decimal(b.minPercent),
    maxPercent: new Prisma.Decimal(b.maxPercent),
    gradePoint: new Prisma.Decimal(b.gradePoint),
    remark: b.remark?.trim() || null,
  }));
}

export async function createScale(
  institutionId: string,
  data: { name: string; isDefault: boolean; bands: GradeBandDtoType[] },
) {
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.gradingScale.updateMany({ where: { institutionId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.gradingScale.create({
      data: {
        institutionId,
        name: data.name,
        isDefault: data.isDefault,
        bands: { create: bandRows(data.bands) },
      },
      include: scaleInclude,
    });
  });
}

export async function updateScale(
  institutionId: string,
  id: string,
  data: { name?: string; bands?: GradeBandDtoType[] },
) {
  return prisma.$transaction(async (tx) => {
    if (data.name !== undefined) {
      await tx.gradingScale.updateMany({ where: { id, institutionId }, data: { name: data.name } });
    }
    if (data.bands) {
      await tx.gradeBand.deleteMany({ where: { gradingScaleId: id, gradingScale: { institutionId } } });
      await tx.gradeBand.createMany({
        data: bandRows(data.bands).map((b) => ({ ...b, gradingScaleId: id })),
      });
      // Touch updatedAt so "last changed" reflects a bands-only edit too.
      await tx.gradingScale.updateMany({ where: { id, institutionId }, data: { updatedAt: new Date() } });
    }
    return tx.gradingScale.findFirst({ where: { id, institutionId }, include: scaleInclude });
  });
}

export async function deleteScale(institutionId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.gradeBand.deleteMany({ where: { gradingScaleId: id, gradingScale: { institutionId } } });
    await tx.gradingScale.deleteMany({ where: { id, institutionId } });
  });
}

export async function setDefault(institutionId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.gradingScale.updateMany({ where: { institutionId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
    await tx.gradingScale.updateMany({ where: { id, institutionId }, data: { isDefault: true } });
    return tx.gradingScale.findFirst({ where: { id, institutionId }, include: scaleInclude });
  });
}
