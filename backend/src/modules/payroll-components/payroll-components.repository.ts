import { prisma } from '../../config/prisma';
import type { CreateComponentDtoType, UpdateComponentDtoType } from './payroll-components.dto';

export async function list(institutionId: string, opts: { activeOnly: boolean; skip: number; take: number }) {
  const where = { institutionId, ...(opts.activeOnly ? { isActive: true } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.salaryComponent.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      skip: opts.skip,
      take: opts.take,
      include: { _count: { select: { staffOverrides: true } } },
    }),
    prisma.salaryComponent.count({ where }),
  ]);
  return { items, total };
}

export async function findById(institutionId: string, id: string) {
  return prisma.salaryComponent.findFirst({ where: { id, institutionId } });
}

export async function create(institutionId: string, data: CreateComponentDtoType) {
  return prisma.salaryComponent.create({ data: { institutionId, ...data } });
}

export async function update(institutionId: string, id: string, data: UpdateComponentDtoType) {
  await prisma.salaryComponent.updateMany({ where: { id, institutionId }, data });
  return findById(institutionId, id);
}

export async function remove(institutionId: string, id: string) {
  return prisma.$transaction([
    prisma.staffSalaryComponent.deleteMany({ where: { componentId: id, institutionId } }),
    prisma.salaryComponent.deleteMany({ where: { id, institutionId } }),
  ]);
}

export async function findStaff(institutionId: string, staffId: string) {
  return prisma.staffProfile.findFirst({
    where: { id: staffId, institutionId },
    select: { id: true, baseSalary: true, user: { select: { firstName: true, lastName: true } } },
  });
}

export async function findAssignments(institutionId: string, staffId: string) {
  return prisma.staffSalaryComponent.findMany({
    where: { institutionId, staffId },
    include: { component: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function countComponentsInTenant(institutionId: string, ids: string[]) {
  return prisma.salaryComponent.count({ where: { institutionId, id: { in: ids } } });
}

export async function replaceAssignments(
  institutionId: string,
  staffId: string,
  rows: { componentId: string; overrideValue: number | null }[],
) {
  return prisma.$transaction([
    prisma.staffSalaryComponent.deleteMany({ where: { institutionId, staffId } }),
    prisma.staffSalaryComponent.createMany({
      data: rows.map((r) => ({ institutionId, staffId, componentId: r.componentId, overrideValue: r.overrideValue })),
    }),
  ]);
}
