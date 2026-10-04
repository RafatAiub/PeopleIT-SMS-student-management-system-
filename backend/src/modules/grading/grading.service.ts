import { NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as gradingRepository from './grading.repository';
import { BANGLADESH_STANDARD_BANDS, validateBands } from './grading.core';
import { toBandInputs } from './grading.resolver';
import type {
  CreateGradingScaleDtoType,
  GradingScaleQueryDtoType,
  SeedBangladeshDtoType,
  UpdateGradingScaleDtoType,
} from './grading.dto';

type ScaleRow = NonNullable<Awaited<ReturnType<typeof gradingRepository.findScaleById>>>;

function serialize(scale: ScaleRow) {
  return {
    id: scale.id,
    name: scale.name,
    isDefault: scale.isDefault,
    createdAt: scale.createdAt,
    updatedAt: scale.updatedAt,
    bands: scale.bands.map((b) => ({
      id: b.id,
      grade: b.grade,
      minPercent: Number(b.minPercent),
      maxPercent: Number(b.maxPercent),
      gradePoint: Number(b.gradePoint),
      remark: b.remark,
    })),
  };
}

function assertValidBands(bands: CreateGradingScaleDtoType['bands']) {
  const errors = validateBands(bands);
  if (errors.length > 0) {
    throw new ValidationError(errors[0], errors.map((message) => ({ field: 'body.bands', message })));
  }
}

export async function listScales(institutionId: string, query: GradingScaleQueryDtoType) {
  const { items, total } = await gradingRepository.findScales(institutionId, query.page, query.pageSize);
  return { items: items.map(serialize), meta: { total, page: query.page, pageSize: query.pageSize } };
}

export async function getScale(institutionId: string, id: string) {
  const scale = await gradingRepository.findScaleById(institutionId, id);
  if (!scale) throw new NotFoundError('Grading scale not found');
  return serialize(scale);
}

/**
 * The scale results are graded with right now: the default scale, or the
 * fixed built-in scale (flagged isFallback) when none is configured.
 */
export async function getEffectiveScale(institutionId: string) {
  // Same graceful degradation as grading.resolver.ts: if the lookup fails
  // (e.g. migration not yet applied) report the built-in scale, which is
  // what results are actually graded with in that situation.
  const scale = await gradingRepository.findDefaultScale(institutionId).catch((err: Error) => {
    logger.warn('Default grading scale lookup failed', { institutionId, error: err.message });
    return null;
  });
  if (scale && scale.bands.length > 0) {
    return { ...serialize(scale), isFallback: false };
  }
  return {
    id: null,
    name: 'Bangladesh standard (built-in)',
    isDefault: true,
    isFallback: true,
    bands: BANGLADESH_STANDARD_BANDS.map((b) => ({ id: null, ...b })),
  };
}

export async function createScale(institutionId: string, data: CreateGradingScaleDtoType) {
  assertValidBands(data.bands);
  const scale = await gradingRepository.createScale(institutionId, {
    name: data.name,
    isDefault: data.isDefault ?? false,
    bands: data.bands,
  });
  logger.info('Grading scale created', { institutionId, scaleId: scale.id });
  return serialize(scale);
}

export async function updateScale(institutionId: string, id: string, data: UpdateGradingScaleDtoType) {
  const existing = await gradingRepository.findScaleById(institutionId, id);
  if (!existing) throw new NotFoundError('Grading scale not found');
  if (data.bands) assertValidBands(data.bands);
  const updated = await gradingRepository.updateScale(institutionId, id, data);
  if (!updated) throw new NotFoundError('Grading scale not found');
  logger.info('Grading scale updated', { institutionId, scaleId: id });
  return serialize(updated);
}

export async function deleteScale(institutionId: string, id: string) {
  const existing = await gradingRepository.findScaleById(institutionId, id);
  if (!existing) throw new NotFoundError('Grading scale not found');
  await gradingRepository.deleteScale(institutionId, id);
  logger.info('Grading scale deleted', { institutionId, scaleId: id, wasDefault: existing.isDefault });
}

export async function setDefaultScale(institutionId: string, id: string) {
  const existing = await gradingRepository.findScaleById(institutionId, id);
  if (!existing) throw new NotFoundError('Grading scale not found');
  // Re-validate on promotion to default — a scale created before a rule
  // tightened must not silently become the grading source.
  assertValidBands(toBandInputs(existing.bands));
  const updated = await gradingRepository.setDefault(institutionId, id);
  if (!updated) throw new NotFoundError('Grading scale not found');
  logger.info('Default grading scale set', { institutionId, scaleId: id });
  return serialize(updated);
}

export async function seedBangladeshStandard(institutionId: string, data: SeedBangladeshDtoType) {
  return createScale(institutionId, {
    name: data.name ?? 'Bangladesh standard (A+ – F)',
    isDefault: data.setDefault ?? true,
    bands: BANGLADESH_STANDARD_BANDS.map((b) => ({ ...b, remark: b.remark ?? null })),
  });
}
