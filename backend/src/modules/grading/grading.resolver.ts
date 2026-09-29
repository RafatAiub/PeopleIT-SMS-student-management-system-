// Resolves an institution's default grading scale as plain-number bands for
// the pure helpers in grading.core.ts. Returns null when no default scale is
// configured — callers then fall back to the fixed utils/grading.ts scale, so
// output is unchanged for institutions that never set one up.
//
// Also returns null (and logs) if the lookup itself fails — e.g. before the
// Wave C migration that creates the GradingScale table has been applied.
// Grading must never break marks entry, marksheets or report cards.
import { logger } from '../../utils/logger';
import * as gradingRepository from './grading.repository';
import type { GradeBandInput } from './grading.core';

export interface ResolvedScale {
  id: string;
  name: string;
  bands: GradeBandInput[];
}

type BandRow = { grade: string; minPercent: unknown; maxPercent: unknown; gradePoint: unknown; remark: string | null };

export function toBandInputs(rows: BandRow[]): GradeBandInput[] {
  return rows.map((b) => ({
    grade: b.grade,
    minPercent: Number(b.minPercent),
    maxPercent: Number(b.maxPercent),
    gradePoint: Number(b.gradePoint),
    remark: b.remark,
  }));
}

export async function getDefaultScale(institutionId: string): Promise<ResolvedScale | null> {
  try {
    const scale = await gradingRepository.findDefaultScale(institutionId);
    if (!scale || scale.bands.length === 0) return null;
    return { id: scale.id, name: scale.name, bands: toBandInputs(scale.bands) };
  } catch (err) {
    logger.warn('Default grading scale lookup failed — using fixed fallback scale', {
      institutionId,
      error: (err as Error).message,
    });
    return null;
  }
}

export async function getDefaultBands(institutionId: string): Promise<GradeBandInput[] | null> {
  return (await getDefaultScale(institutionId))?.bands ?? null;
}
