import { prisma } from '../../../config/prisma';
import { BadRequestError, NotFoundError } from '../../../utils/AppError';
import { dec, num, writeAudit, type Db, type FeeCtx } from './studentFees.shared';
import type { FineRuleDtoType, SettingsDtoType } from './studentFees.dto';

// Settings → Fees: monthly auto-invoices and late-fine rules.

export const FINE_CATEGORY_NAME = 'Late fine';

export interface MonthlySettings {
  autoGenerate: boolean;
  generateDay: number;
  dueDay: number;
  /** As saved (empty = every active MONTHLY category). */
  monthlyCategoryIds: string[];
  arrearsMode: 'SEPARATE' | 'ARREARS_LINE';
  fineCategoryId: string | null;
  lastAutoPeriod: string | null;
  lastAutoRunAt: Date | null;
  lastRunSummary: unknown;
}

const DEFAULTS: MonthlySettings = {
  autoGenerate: false,
  generateDay: 1,
  dueDay: 10,
  monthlyCategoryIds: [],
  arrearsMode: 'SEPARATE',
  fineCategoryId: null,
  lastAutoPeriod: null,
  lastAutoRunAt: null,
  lastRunSummary: null,
};

export async function getSettings(institutionId: string, db: Db = prisma): Promise<MonthlySettings> {
  const row = await db.studentFeeSettings.findUnique({ where: { institutionId } });
  if (!row) return { ...DEFAULTS };
  return {
    autoGenerate: row.autoGenerate,
    generateDay: row.generateDay,
    dueDay: row.dueDay,
    monthlyCategoryIds: row.monthlyCategoryIds,
    arrearsMode: row.arrearsMode === 'ARREARS_LINE' ? 'ARREARS_LINE' : 'SEPARATE',
    fineCategoryId: row.fineCategoryId,
    lastAutoPeriod: row.lastAutoPeriod,
    lastAutoRunAt: row.lastAutoRunAt,
    lastRunSummary: row.lastRunSummary,
  };
}

/** Settings plus what the UI needs: the categories actually billed monthly. */
export async function getSettingsView(institutionId: string) {
  const settings = await getSettings(institutionId);
  const effective = await effectiveMonthlyCategories(institutionId, settings.monthlyCategoryIds);
  return { ...settings, effectiveMonthlyCategories: effective };
}

/** The categories billed monthly, in a stable order. */
export async function effectiveMonthlyCategories(institutionId: string, configured: string[], db: Db = prisma) {
  const cats = await db.feeCategory.findMany({
    where: {
      institutionId,
      isActive: true,
      ...(configured.length > 0 ? { id: { in: configured } } : { frequency: 'MONTHLY' }),
    },
    select: { id: true, name: true },
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
  });
  return cats;
}

export async function updateSettings(ctx: FeeCtx, dto: SettingsDtoType) {
  if (dto.monthlyCategoryIds && dto.monthlyCategoryIds.length > 0) {
    const owned = await prisma.feeCategory.count({ where: { institutionId: ctx.institutionId, id: { in: dto.monthlyCategoryIds } } });
    if (owned !== new Set(dto.monthlyCategoryIds).size) throw new BadRequestError('One or more fee categories were not found');
  }
  const data = {
    ...(dto.autoGenerate !== undefined ? { autoGenerate: dto.autoGenerate } : {}),
    ...(dto.generateDay !== undefined ? { generateDay: dto.generateDay } : {}),
    ...(dto.dueDay !== undefined ? { dueDay: dto.dueDay } : {}),
    ...(dto.monthlyCategoryIds !== undefined ? { monthlyCategoryIds: [...new Set(dto.monthlyCategoryIds)] } : {}),
    ...(dto.arrearsMode !== undefined ? { arrearsMode: dto.arrearsMode } : {}),
    updatedByUserId: ctx.userId,
  };
  await prisma.$transaction(async (tx) => {
    await tx.studentFeeSettings.upsert({
      where: { institutionId: ctx.institutionId },
      create: { institutionId: ctx.institutionId, ...data },
      update: data,
    });
    await writeAudit(tx, { institutionId: ctx.institutionId, userId: ctx.userId, action: 'UPDATE', resource: 'StudentFeeSettings', metadata: { ...dto } });
  });
  return getSettingsView(ctx.institutionId);
}

/** The "Late fine" category (ONE_TIME), created on first use. Fine and arrears lines need a category. */
export async function ensureFineCategory(institutionId: string, db: Db = prisma): Promise<string> {
  const settings = await db.studentFeeSettings.findUnique({ where: { institutionId }, select: { fineCategoryId: true } });
  if (settings?.fineCategoryId) {
    const ok = await db.feeCategory.findFirst({ where: { id: settings.fineCategoryId, institutionId }, select: { id: true } });
    if (ok) return ok.id;
  }
  const existing = await db.feeCategory.findFirst({ where: { institutionId, name: FINE_CATEGORY_NAME }, select: { id: true } });
  const id =
    existing?.id ??
    (
      await db.feeCategory.create({
        data: { institutionId, name: FINE_CATEGORY_NAME, description: 'Late payment fine (added automatically)', amount: dec(0), frequency: 'ONE_TIME' },
        select: { id: true },
      })
    ).id;
  await db.studentFeeSettings.upsert({ where: { institutionId }, create: { institutionId, fineCategoryId: id }, update: { fineCategoryId: id } });
  return id;
}

// ── Late fine rules ──────────────────────────────────────────────────────────

const ruleView = (r: {
  id: string;
  feeCategoryId: string | null;
  feeCategory?: { name: string } | null;
  type: string;
  value: unknown;
  graceDays: number;
  recurrence: string;
  maxAmount: unknown;
  isActive: boolean;
  createdAt: Date;
}) => ({
  id: r.id,
  feeCategoryId: r.feeCategoryId,
  categoryName: r.feeCategory?.name ?? null,
  type: r.type,
  value: num(r.value as number),
  graceDays: r.graceDays,
  recurrence: r.recurrence,
  maxAmount: r.maxAmount === null ? null : num(r.maxAmount as number),
  isActive: r.isActive,
  createdAt: r.createdAt,
});

export async function listFineRules(institutionId: string) {
  const rows = await prisma.lateFineRule.findMany({
    where: { institutionId },
    include: { feeCategory: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(ruleView);
}

async function assertCategory(institutionId: string, feeCategoryId: string | null | undefined) {
  if (!feeCategoryId) return;
  const ok = await prisma.feeCategory.findFirst({ where: { id: feeCategoryId, institutionId }, select: { id: true } });
  if (!ok) throw new BadRequestError('Fee category not found');
}

function validateRule(dto: Partial<FineRuleDtoType>) {
  if (dto.type === 'PERCENT' && dto.value !== undefined && dto.value > 100) throw new BadRequestError('A percentage fine cannot be more than 100%');
}

export async function createFineRule(ctx: FeeCtx, dto: FineRuleDtoType) {
  validateRule(dto);
  await assertCategory(ctx.institutionId, dto.feeCategoryId);
  const dup = await prisma.lateFineRule.findFirst({
    where: { institutionId: ctx.institutionId, feeCategoryId: dto.feeCategoryId ?? null, isActive: true },
    select: { id: true },
  });
  if (dup && dto.isActive !== false) {
    throw new BadRequestError(dto.feeCategoryId ? 'This category already has an active fine rule' : 'A school-wide fine rule already exists');
  }
  const row = await prisma.$transaction(async (tx) => {
    const r = await tx.lateFineRule.create({
      data: {
        institutionId: ctx.institutionId,
        feeCategoryId: dto.feeCategoryId ?? null,
        type: dto.type,
        value: dec(dto.value),
        graceDays: dto.graceDays,
        recurrence: dto.recurrence,
        maxAmount: dto.maxAmount === null || dto.maxAmount === undefined ? null : dec(dto.maxAmount),
        isActive: dto.isActive ?? true,
      },
      include: { feeCategory: { select: { name: true } } },
    });
    await writeAudit(tx, { institutionId: ctx.institutionId, userId: ctx.userId, action: 'CREATE', resource: 'LateFineRule', resourceId: r.id, metadata: { ...dto } });
    return r;
  });
  return ruleView(row);
}

export async function updateFineRule(ctx: FeeCtx, id: string, dto: Partial<FineRuleDtoType>) {
  const existing = await prisma.lateFineRule.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!existing) throw new NotFoundError('Fine rule not found');
  validateRule({ type: dto.type ?? (existing.type as 'FLAT'), value: dto.value ?? num(existing.value) });
  if (dto.feeCategoryId !== undefined) await assertCategory(ctx.institutionId, dto.feeCategoryId);
  const row = await prisma.$transaction(async (tx) => {
    const r = await tx.lateFineRule.update({
      where: { id },
      data: {
        ...(dto.feeCategoryId !== undefined ? { feeCategoryId: dto.feeCategoryId ?? null } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: dec(dto.value) } : {}),
        ...(dto.graceDays !== undefined ? { graceDays: dto.graceDays } : {}),
        ...(dto.recurrence !== undefined ? { recurrence: dto.recurrence } : {}),
        ...(dto.maxAmount !== undefined ? { maxAmount: dto.maxAmount === null ? null : dec(dto.maxAmount) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { feeCategory: { select: { name: true } } },
    });
    await writeAudit(tx, { institutionId: ctx.institutionId, userId: ctx.userId, action: 'UPDATE', resource: 'LateFineRule', resourceId: id, metadata: { ...dto } });
    return r;
  });
  return ruleView(row);
}

export async function deleteFineRule(ctx: FeeCtx, id: string) {
  const existing = await prisma.lateFineRule.findFirst({ where: { id, institutionId: ctx.institutionId }, select: { id: true } });
  if (!existing) throw new NotFoundError('Fine rule not found');
  await prisma.$transaction(async (tx) => {
    await tx.lateFineRule.delete({ where: { id } });
    await writeAudit(tx, { institutionId: ctx.institutionId, userId: ctx.userId, action: 'DELETE', resource: 'LateFineRule', resourceId: id });
  });
}
