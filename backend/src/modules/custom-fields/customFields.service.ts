import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as repo from './customFields.repository';
import { CustomFieldDef, CustomFieldValues, keyFromLabel, validateCustomFieldValues } from './customFields.validation';
import type { CreateCustomFieldDtoType, UpdateCustomFieldDtoType } from './customFields.dto';

// =============================================================================
// Custom field definitions (entity STUDENT for now)
// =============================================================================

export function listDefinitions(institutionId: string, entity = 'STUDENT') {
  return repo.list(institutionId, entity);
}

export async function createDefinition(institutionId: string, data: CreateCustomFieldDtoType) {
  const key = data.key ?? keyFromLabel(data.label);
  if (await repo.findByKey(institutionId, data.entity, key)) {
    throw new ConflictError(`A custom field with key '${key}' already exists`);
  }
  const created = await repo.create({
    institutionId,
    entity: data.entity,
    key,
    label: data.label,
    type: data.type,
    options: data.type === 'select' && data.options ? data.options : Prisma.DbNull,
    required: data.required,
    sortOrder: data.sortOrder,
  });
  logger.info('Custom field created', { institutionId, key, entity: data.entity });
  return created;
}

export async function updateDefinition(institutionId: string, id: string, data: UpdateCustomFieldDtoType) {
  const existing = await repo.findById(institutionId, id);
  if (!existing) throw new NotFoundError('Custom field not found');

  const type = data.type ?? existing.type;
  const options = data.options !== undefined ? data.options : (existing.options as string[] | null);
  if (type === 'select' && (!Array.isArray(options) || options.length === 0)) {
    throw new ValidationError('A select field needs at least one option');
  }

  const updated = await repo.update(institutionId, id, {
    ...(data.label !== undefined ? { label: data.label } : {}),
    ...(data.type !== undefined ? { type: data.type } : {}),
    ...(data.required !== undefined ? { required: data.required } : {}),
    ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    ...(data.options !== undefined || data.type !== undefined
      ? { options: type === 'select' && options ? options : Prisma.DbNull }
      : {}),
  });
  return updated;
}

/** Deleting a definition leaves stored values in place (harmless: unknown keys are ignored and dropped on next save). */
export async function deleteDefinition(institutionId: string, id: string) {
  const existing = await repo.findById(institutionId, id);
  if (!existing) throw new NotFoundError('Custom field not found');
  await repo.remove(institutionId, id);
}

export async function reorderDefinitions(institutionId: string, ids: string[]) {
  await repo.reorder(institutionId, ids);
  return repo.list(institutionId, 'STUDENT');
}

// ── Used by the students module ────────────────────────────────────────────

/**
 * Loads STUDENT definitions. Before the Wave C migration is applied the table
 * does not exist; that case returns [] so student create/update keep working
 * exactly as before instead of failing on a feature nobody has configured.
 */
export async function loadStudentDefinitions(institutionId: string): Promise<CustomFieldDef[]> {
  try {
    return (await repo.list(institutionId, 'STUDENT')) as CustomFieldDef[];
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') return [];
    throw error;
  }
}

/**
 * Validates submitted customFields for a student write. Returns the value to
 * persist (undefined = leave the column untouched) or throws a 422 listing
 * every invalid field.
 */
export async function resolveStudentCustomFields(
  institutionId: string,
  submitted: unknown,
  opts: { existing?: unknown; isCreate: boolean },
): Promise<CustomFieldValues | undefined> {
  // Update without customFields in the payload: nothing to validate or change.
  if (!opts.isCreate && submitted === undefined) return undefined;

  const defs = await loadStudentDefinitions(institutionId);
  if (defs.length === 0) {
    return submitted === undefined ? undefined : {};
  }

  const { values, issues } = validateCustomFieldValues(defs, submitted ?? {}, {
    existing: opts.existing,
    enforceRequired: true,
  });
  if (issues.length) throw new ValidationError('Custom field validation failed', issues);
  return values;
}
