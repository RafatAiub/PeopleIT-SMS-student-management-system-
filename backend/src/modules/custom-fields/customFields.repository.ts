import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

// =============================================================================
// Custom field definition repository — every query takes institutionId.
// =============================================================================

export const definitionSelect = {
  id: true,
  entity: true,
  key: true,
  label: true,
  type: true,
  options: true,
  required: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function list(institutionId: string, entity: string) {
  return prisma.customFieldDefinition.findMany({
    where: { institutionId, entity },
    select: definitionSelect,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export function findById(institutionId: string, id: string) {
  return prisma.customFieldDefinition.findFirst({ where: { id, institutionId }, select: definitionSelect });
}

export function findByKey(institutionId: string, entity: string, key: string) {
  return prisma.customFieldDefinition.findFirst({ where: { institutionId, entity, key }, select: { id: true } });
}

export function create(data: Prisma.CustomFieldDefinitionUncheckedCreateInput) {
  return prisma.customFieldDefinition.create({ data, select: definitionSelect });
}

export async function update(institutionId: string, id: string, data: Prisma.CustomFieldDefinitionUpdateManyMutationInput) {
  await prisma.customFieldDefinition.updateMany({ where: { id, institutionId }, data });
  return findById(institutionId, id);
}

export function remove(institutionId: string, id: string) {
  return prisma.customFieldDefinition.deleteMany({ where: { id, institutionId } });
}

export async function reorder(institutionId: string, ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.customFieldDefinition.updateMany({ where: { id, institutionId }, data: { sortOrder: index * 10 } }),
    ),
  );
}
