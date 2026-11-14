import { Prisma, type PlatformInvoiceStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import { normalizeBdMobile } from '../../utils/phone';
import {
  addMonths,
  computeInvoiceAmounts,
  computePlatformAccess,
  daysPastDue,
  dhakaMidnight,
  dhakaParts,
  duePaisa,
  effectiveDueDate,
  invoiceNumberFor,
  monthsBetween,
  nextSequence,
  paisaToDecimalString,
  paisaToNumber,
  periodBounds,
  periodOf,
  shouldLiftOverride,
  toPaisa,
  totalsFromLines,
  UNPAID_STATUSES,
  type InvoiceLine,
  type PlatformAccessLevel,
} from './platformBilling.logic';
import { computePlatformAccessState, invalidatePlatformAccess } from './platformBilling.access';
import { actorName, isUniqueViolation, writeAudit } from './platformBilling.shared';
import type {
  EditInvoiceLinesDtoType,
  ListInvoicesQueryDtoType,
  SetOverrideDtoType,
  UpsertBillingProfileDtoType,
} from './platformBilling.dto';

// =============================================================================
// P1 platform billing service: billing profiles, monthly invoices (generate,
// edit, waive, cancel), owner access override + automatic lift, overdue scan,
// super-admin dashboard and invoice list, and the school's own read views.
// Payments live in platformBilling.payments.ts, reminders in
// platformBilling.reminders.ts, the collections board in
// platformBilling.collections.ts.
// =============================================================================

const toDec = (p: number) => new Prisma.Decimal(paisaToDecimalString(p));

function dhakaDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return dhakaMidnight(y, m, d);
}

function startOfDhakaToday(now: Date): Date {
  const p = dhakaParts(now);
  return dhakaMidnight(p.year, p.month, p.day);
}

/** Active, non-trashed students — the PER_STUDENT count. */
export async function countActiveStudents(institutionId: string): Promise<number> {
  return prisma.student.count({ where: { institutionId, status: 'ACTIVE', deletedAt: null } });
}

// ── Billing profile ─────────────────────────────────────────────────────────

const PROFILE_AUDIT_FIELDS = [
  'isActive',
  'pricingModel',
  'flatAmount',
  'perStudentRate',
  'minimumCharge',
  'discountType',
  'discountValue',
  'discountNote',
  'dueDay',
  'billingStartMonth',
  'serviceStartDate',
  'firstMonthMode',
  'freeMonths',
  'remindSms',
  'remindEmail',
  'smsLanguage',
  'autoRestrictAfterDays',
  'billingPhone',
  'billingEmail',
] as const;

function auditValue(v: unknown): unknown {
  if (v instanceof Prisma.Decimal) return v.toString();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v ?? null;
}

export async function getProfile(institutionId: string, now: Date = new Date()) {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { id: true, name: true, slug: true, isActive: true, phone: true, contactPhone: true, email: true, contactEmail: true, createdAt: true },
  });
  if (!institution) throw new NotFoundError('Institution not found');
  const profile = await prisma.institutionBillingProfile.findUnique({ where: { institutionId } });
  const admins = await prisma.user.findMany({
    where: { institutionId, role: 'ADMIN', isActive: true },
    select: { email: true, phone: true },
    take: 5,
  });
  const activeStudents = await countActiveStudents(institutionId);
  const access = await computePlatformAccessState(institutionId, now);

  let preview: ReturnType<typeof computeInvoiceAmounts> | null = null;
  const period = periodOf(now);
  if (profile && monthsBetween(profile.billingStartMonth, period) >= 0) {
    preview = computeInvoiceAmounts(profile, period, activeStudents);
  }

  return {
    institution,
    profile,
    defaults: {
      phones: [institution.contactPhone, institution.phone, ...admins.map((a) => a.phone)].filter((p): p is string => !!p && !!normalizeBdMobile(p)),
      emails: admins.map((a) => a.email).filter(Boolean),
    },
    activeStudents,
    access,
    preview: preview
      ? { period, lines: preview.lines, total: paisaToNumber(preview.totalPaisa), free: preview.free }
      : null,
  };
}

export async function upsertProfile(actorUserId: string, institutionId: string, dto: UpsertBillingProfileDtoType) {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { id: true } });
  if (!institution) throw new NotFoundError('Institution not found');

  const before = await prisma.institutionBillingProfile.findUnique({ where: { institutionId } });

  const data = {
    isActive: dto.isActive,
    pricingModel: dto.pricingModel,
    flatAmount: dto.pricingModel === 'FLAT' && dto.flatAmount != null ? toDec(toPaisa(dto.flatAmount)) : null,
    perStudentRate: dto.pricingModel === 'PER_STUDENT' && dto.perStudentRate != null ? toDec(toPaisa(dto.perStudentRate)) : null,
    minimumCharge: toDec(toPaisa(dto.minimumCharge ?? 0)),
    discountType: dto.discountType ?? null,
    discountValue: dto.discountType && dto.discountValue != null ? toDec(toPaisa(dto.discountValue)) : null,
    discountNote: dto.discountType ? dto.discountNote || null : null,
    dueDay: dto.dueDay,
    billingStartMonth: dto.billingStartMonth,
    serviceStartDate: dto.serviceStartDate ? new Date(`${dto.serviceStartDate}T00:00:00.000Z`) : null,
    firstMonthMode: dto.firstMonthMode,
    freeMonths: dto.freeMonths,
    remindSms: dto.remindSms,
    remindEmail: dto.remindEmail,
    smsLanguage: dto.smsLanguage,
    autoRestrictAfterDays: dto.autoRestrictAfterDays ?? null,
    billingPhone: dto.billingPhone ? normalizeBdMobile(dto.billingPhone) : null,
    billingEmail: dto.billingEmail || null,
    notes: dto.notes ?? null,
    updatedById: actorUserId,
  };

  const profile = await prisma.institutionBillingProfile.upsert({
    where: { institutionId },
    create: { institutionId, createdById: actorUserId, ...data },
    update: data,
  });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of PROFILE_AUDIT_FIELDS) {
    const from = auditValue(before?.[f]);
    const to = auditValue(profile[f]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[f] = { from, to };
  }
  await writeAudit(prisma, {
    institutionId,
    userId: actorUserId,
    action: before ? 'PLATFORM_BILLING_PROFILE_UPDATE' : 'PLATFORM_BILLING_PROFILE_CREATE',
    resource: 'InstitutionBillingProfile',
    resourceId: profile.id,
    metadata: { changes, reason: dto.reason ?? null },
  }).catch((e) => logger.error('Audit write failed (billing profile)', { error: (e as Error).message }));

  invalidatePlatformAccess(institutionId);
  return profile;
}

// ── Access override ─────────────────────────────────────────────────────────

export async function setOverride(actorUserId: string, institutionId: string, dto: SetOverrideDtoType) {
  const profile = await prisma.institutionBillingProfile.findUnique({ where: { institutionId } });
  if (!profile) throw new BadRequestError('Set up billing for this school first (Billing profile)');

  const updated = await prisma.institutionBillingProfile.update({
    where: { institutionId },
    data: dto.level
      ? { accessOverride: dto.level, overrideReason: dto.reason ?? null, overrideKeep: dto.keep, overrideSetAt: new Date(), overrideSetById: actorUserId }
      : { accessOverride: null, overrideReason: null, overrideKeep: false, overrideSetAt: new Date(), overrideSetById: actorUserId },
  });

  const name = await actorName(actorUserId);
  const summary = dto.level
    ? `Access set to ${dto.level}${dto.keep ? ' (kept until changed)' : ''}: ${dto.reason}`
    : `Access override removed${dto.reason ? `: ${dto.reason}` : ''}`;
  await prisma.platformCollectionActivity.create({
    data: {
      institutionId,
      type: 'ACCESS_CHANGE',
      body: summary,
      metadata: { from: profile.accessOverride, to: dto.level, keep: dto.keep },
      actorUserId,
      actorName: name,
    },
  });
  await writeAudit(prisma, {
    institutionId,
    userId: actorUserId,
    action: 'PLATFORM_ACCESS_OVERRIDE',
    resource: 'InstitutionBillingProfile',
    resourceId: profile.id,
    metadata: { from: profile.accessOverride, to: dto.level, keep: dto.keep, reason: dto.reason ?? null },
  }).catch((e) => logger.error('Audit write failed (access override)', { error: (e as Error).message }));

  invalidatePlatformAccess(institutionId);
  return updated;
}

/**
 * Runs after money or a waiver/cancel settles invoices. Auto-restrictions
 * lift by themselves (they are computed); a manual RESTRICTED/DISABLED
 * override is cleared too once no unpaid invoice is past due — unless the
 * owner ticked "keep until I change it".
 */
export async function afterSettlement(institutionId: string, actorUserId: string | null, trigger: string, now: Date = new Date()) {
  invalidatePlatformAccess(institutionId);
  const profile = await prisma.institutionBillingProfile.findUnique({
    where: { institutionId },
    select: { id: true, accessOverride: true, overrideKeep: true },
  });
  if (!profile) return { lifted: false };
  const overdueUnpaid = await prisma.platformInvoice.count({
    where: { institutionId, status: { in: UNPAID_STATUSES }, dueDate: { lt: startOfDhakaToday(now) } },
  });
  if (!shouldLiftOverride(profile.accessOverride, profile.overrideKeep, overdueUnpaid)) return { lifted: false };

  const res = await prisma.institutionBillingProfile.updateMany({
    where: { institutionId, accessOverride: profile.accessOverride, overrideKeep: false },
    data: { accessOverride: null, overrideReason: null, overrideSetAt: now, overrideSetById: actorUserId },
  });
  if (res.count !== 1) return { lifted: false };

  await prisma.platformCollectionActivity.create({
    data: {
      institutionId,
      type: 'ACCESS_CHANGE',
      body: `${profile.accessOverride} lifted automatically: all overdue bills settled (${trigger})`,
      metadata: { from: profile.accessOverride, to: null, automatic: true },
      actorUserId,
      actorName: actorUserId ? await actorName(actorUserId) : 'System',
    },
  });
  await writeAudit(prisma, {
    institutionId,
    userId: actorUserId,
    action: 'PLATFORM_ACCESS_OVERRIDE_LIFTED',
    resource: 'InstitutionBillingProfile',
    resourceId: profile.id,
    metadata: { from: profile.accessOverride, trigger },
  }).catch((e) => logger.error('Audit write failed (override lift)', { error: (e as Error).message }));
  invalidatePlatformAccess(institutionId);
  return { lifted: true };
}

// ── Invoice generation ──────────────────────────────────────────────────────

export interface GenerateResult {
  institutionId: string;
  status: 'created' | 'existing' | 'skipped';
  reason?: string;
  invoiceId?: string;
  invoiceNumber?: string;
}

/**
 * Idempotent per (school, period): returns the existing invoice when there is
 * one (unique index on institutionId+period also stops a concurrent double).
 */
export async function generateInvoice(
  institutionId: string,
  period: string,
  opts: { actorUserId?: string | null; now?: Date; manual?: boolean } = {},
): Promise<GenerateResult> {
  const now = opts.now ?? new Date();
  const profile = await prisma.institutionBillingProfile.findUnique({ where: { institutionId } });
  if (!profile) return { institutionId, status: 'skipped', reason: 'No billing profile' };
  if (!profile.isActive) return { institutionId, status: 'skipped', reason: 'Billing is paused for this school' };
  if (monthsBetween(profile.billingStartMonth, period) < 0) {
    return { institutionId, status: 'skipped', reason: `Billing starts in ${profile.billingStartMonth}` };
  }

  const existing = await prisma.platformInvoice.findUnique({
    where: { institutionId_period: { institutionId, period } },
    select: { id: true, invoiceNumber: true },
  });
  if (existing) return { institutionId, status: 'existing', invoiceId: existing.id, invoiceNumber: existing.invoiceNumber };

  const studentCount = await countActiveStudents(institutionId);
  const computed = computeInvoiceAmounts(profile, period, studentCount);
  const { start, end } = periodBounds(period);
  const dueDate = effectiveDueDate(period, profile.dueDay, now);
  const zero = computed.totalPaisa === 0;
  const prefix = invoiceNumberFor(period, 0).replace(/0000$/, '');

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const last = await prisma.platformInvoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const invoiceNumber = invoiceNumberFor(period, nextSequence(last?.invoiceNumber) + attempt);
    try {
      const invoice = await prisma.platformInvoice.create({
        data: {
          institutionId,
          invoiceNumber,
          period,
          periodStart: start,
          periodEnd: end,
          issueDate: now,
          dueDate,
          studentCount: profile.pricingModel === 'PER_STUDENT' ? studentCount : null,
          pricingModel: profile.pricingModel,
          rate: toDec(computed.ratePaisa),
          lines: computed.lines as unknown as Prisma.InputJsonValue,
          subtotal: toDec(computed.subtotalPaisa),
          discount: toDec(computed.discountPaisa),
          total: toDec(computed.totalPaisa),
          status: zero ? 'WAIVED' : 'DUE',
          statusReason: zero ? (computed.free ? 'Free month' : 'Nothing to bill this month') : null,
          waivedAt: zero ? now : null,
          generatedBy: opts.manual ? 'MANUAL' : 'SCHEDULER',
          createdById: opts.actorUserId ?? null,
        },
      });
      if (opts.manual) {
        await writeAudit(prisma, {
          institutionId,
          userId: opts.actorUserId,
          action: 'PLATFORM_INVOICE_GENERATE',
          resource: 'PlatformInvoice',
          resourceId: invoice.id,
          metadata: { invoiceNumber, period, total: paisaToNumber(computed.totalPaisa), studentCount },
        }).catch((e) => logger.error('Audit write failed (invoice generate)', { error: (e as Error).message }));
      }
      invalidatePlatformAccess(institutionId);
      return { institutionId, status: 'created', invoiceId: invoice.id, invoiceNumber };
    } catch (error) {
      if (isUniqueViolation(error, 'invoiceNumber')) continue;
      if (isUniqueViolation(error)) {
        const again = await prisma.platformInvoice.findUnique({
          where: { institutionId_period: { institutionId, period } },
          select: { id: true, invoiceNumber: true },
        });
        if (again) return { institutionId, status: 'existing', invoiceId: again.id, invoiceNumber: again.invoiceNumber };
      }
      throw error;
    }
  }
  throw new Error('Could not allocate an invoice number — try again');
}

export async function generateForAll(period: string, opts: { actorUserId?: string | null; now?: Date; manual?: boolean } = {}) {
  const profiles = await prisma.institutionBillingProfile.findMany({
    where: { isActive: true, billingStartMonth: { lte: period } },
    select: { institutionId: true },
  });
  const results: GenerateResult[] = [];
  for (const p of profiles) {
    try {
      results.push(await generateInvoice(p.institutionId, period, opts));
    } catch (error) {
      logger.error('Platform invoice generation failed', { institutionId: p.institutionId, period, error: (error as Error).message });
      results.push({ institutionId: p.institutionId, status: 'skipped', reason: (error as Error).message });
    }
  }
  return {
    period,
    created: results.filter((r) => r.status === 'created').length,
    existing: results.filter((r) => r.status === 'existing').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  };
}

/** DUE/PARTIAL invoices whose due day has passed → OVERDUE. Returns the count. */
export async function markOverdue(now: Date = new Date()): Promise<number> {
  const res = await prisma.platformInvoice.updateMany({
    where: { status: { in: ['DUE', 'PARTIAL'] }, dueDate: { lt: startOfDhakaToday(now) } },
    data: { status: 'OVERDUE', overdueAt: now },
  });
  if (res.count > 0) invalidatePlatformAccess();
  return res.count;
}

// ── Invoice edit / waive / cancel ───────────────────────────────────────────

async function loadInvoice(id: string) {
  const invoice = await prisma.platformInvoice.findUnique({ where: { id } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}

export async function editInvoiceLines(actorUserId: string, id: string, dto: EditInvoiceLinesDtoType, now: Date = new Date()) {
  const invoice = await loadInvoice(id);
  if (!['DUE', 'OVERDUE'].includes(invoice.status) || toPaisa(invoice.paidAmount) > 0) {
    throw new BadRequestError('Only an unpaid invoice (no payments yet) can be edited');
  }
  const lines: InvoiceLine[] = dto.lines.map((l) => {
    const unit = toPaisa(l.unitPrice);
    const amount = Math.round(unit * l.quantity);
    return { code: 'CUSTOM', description: l.description, quantity: l.quantity, unitPrice: paisaToNumber(unit), amount: paisaToNumber(amount) };
  });
  const totals = totalsFromLines(lines);
  if (totals.totalPaisa <= 0) throw new BadRequestError('The total must be more than zero — waive the invoice instead');

  const dueDate = dto.dueDate ? dhakaDay(dto.dueDate) : invoice.dueDate;
  const status: PlatformInvoiceStatus = daysPastDue(dueDate, now) > 0 ? 'OVERDUE' : 'DUE';

  const updated = await prisma.platformInvoice.updateMany({
    where: { id, status: invoice.status, paidAmount: invoice.paidAmount },
    data: {
      lines: lines as unknown as Prisma.InputJsonValue,
      subtotal: toDec(totals.subtotalPaisa),
      discount: toDec(totals.discountPaisa),
      total: toDec(totals.totalPaisa),
      dueDate,
      status,
      overdueAt: status === 'OVERDUE' ? invoice.overdueAt ?? now : null,
    },
  });
  if (updated.count !== 1) throw new BadRequestError('The invoice changed meanwhile (a payment may have arrived) — reload and try again');

  await writeAudit(prisma, {
    institutionId: invoice.institutionId,
    userId: actorUserId,
    action: 'PLATFORM_INVOICE_EDIT',
    resource: 'PlatformInvoice',
    resourceId: id,
    metadata: {
      reason: dto.reason,
      before: { lines: invoice.lines, total: invoice.total.toString(), dueDate: invoice.dueDate.toISOString() },
      after: { lines, total: paisaToDecimalString(totals.totalPaisa), dueDate: dueDate.toISOString() },
    },
  });
  invalidatePlatformAccess(invoice.institutionId);
  return loadInvoice(id);
}

export async function waiveInvoice(actorUserId: string, id: string, reason: string, now: Date = new Date()) {
  const invoice = await loadInvoice(id);
  if (!UNPAID_STATUSES.includes(invoice.status)) throw new BadRequestError(`A ${invoice.status} invoice cannot be waived`);
  const remaining = duePaisa(invoice);
  const res = await prisma.platformInvoice.updateMany({
    where: { id, status: invoice.status, paidAmount: invoice.paidAmount },
    data: { status: 'WAIVED', statusReason: reason, waivedAt: now, waivedAmount: toDec(toPaisa(invoice.waivedAmount) + remaining) },
  });
  if (res.count !== 1) throw new BadRequestError('The invoice changed meanwhile — reload and try again');
  await writeAudit(prisma, {
    institutionId: invoice.institutionId,
    userId: actorUserId,
    action: 'PLATFORM_INVOICE_WAIVE',
    resource: 'PlatformInvoice',
    resourceId: id,
    metadata: { reason, waived: paisaToNumber(remaining), invoiceNumber: invoice.invoiceNumber },
  });
  await afterSettlement(invoice.institutionId, actorUserId, 'invoice waived', now);
  return loadInvoice(id);
}

export async function cancelInvoice(actorUserId: string, id: string, reason: string, now: Date = new Date()) {
  const invoice = await loadInvoice(id);
  if (!UNPAID_STATUSES.includes(invoice.status)) throw new BadRequestError(`A ${invoice.status} invoice cannot be cancelled`);
  if (toPaisa(invoice.paidAmount) > 0) throw new BadRequestError('This invoice has payments — waive the rest instead of cancelling');
  const res = await prisma.platformInvoice.updateMany({
    where: { id, status: invoice.status, paidAmount: invoice.paidAmount },
    data: { status: 'CANCELLED', statusReason: reason, cancelledAt: now },
  });
  if (res.count !== 1) throw new BadRequestError('The invoice changed meanwhile — reload and try again');
  await writeAudit(prisma, {
    institutionId: invoice.institutionId,
    userId: actorUserId,
    action: 'PLATFORM_INVOICE_CANCEL',
    resource: 'PlatformInvoice',
    resourceId: id,
    metadata: { reason, invoiceNumber: invoice.invoiceNumber, total: invoice.total.toString() },
  });
  await afterSettlement(invoice.institutionId, actorUserId, 'invoice cancelled', now);
  return loadInvoice(id);
}

// ── Reads ───────────────────────────────────────────────────────────────────

export type InvoiceRow = Awaited<ReturnType<typeof prisma.platformInvoice.findMany>>[number];

export function presentInvoice(inv: InvoiceRow, now: Date = new Date()) {
  const due = duePaisa(inv);
  const past = daysPastDue(inv.dueDate, now);
  return {
    ...inv,
    rate: inv.rate !== null ? Number(inv.rate) : null,
    subtotal: Number(inv.subtotal),
    discount: Number(inv.discount),
    total: Number(inv.total),
    paidAmount: Number(inv.paidAmount),
    waivedAmount: Number(inv.waivedAmount),
    amountDue: paisaToNumber(due),
    daysOverdue: due > 0 && past > 0 ? past : 0,
  };
}

function buildInvoiceWhere(q: Partial<ListInvoicesQueryDtoType>, now: Date): Prisma.PlatformInvoiceWhereInput {
  const where: Prisma.PlatformInvoiceWhereInput = {};
  const statuses = (q.status ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is PlatformInvoiceStatus => ['DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED', 'CANCELLED'].includes(s));
  if (statuses.length) where.status = { in: statuses };
  if (q.period) where.period = q.period;
  if (q.institutionId) where.institutionId = q.institutionId;
  if (q.q) where.OR = [{ invoiceNumber: { contains: q.q, mode: 'insensitive' } }, { institution: { name: { contains: q.q, mode: 'insensitive' } } }];
  if (q.overdueOnly === 'true') {
    where.status = { in: UNPAID_STATUSES };
    where.dueDate = { lt: startOfDhakaToday(now) };
  }
  return where;
}

export async function listInvoices(q: ListInvoicesQueryDtoType, now: Date = new Date()) {
  const where = buildInvoiceWhere(q, now);
  const [total, rows] = await Promise.all([
    prisma.platformInvoice.count({ where }),
    prisma.platformInvoice.findMany({
      where,
      orderBy: [{ period: 'desc' }, { invoiceNumber: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { institution: { select: { id: true, name: true, slug: true } } },
    }),
  ]);
  return {
    data: rows.map((r) => ({ ...presentInvoice(r, now), institution: r.institution })),
    meta: { total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  };
}

/** All invoices matching the filters as CSV or XLSX (capped at 10,000 rows). */
export async function exportInvoices(q: ListInvoicesQueryDtoType, now: Date = new Date()): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const rows = await prisma.platformInvoice.findMany({
    where: buildInvoiceWhere(q, now),
    orderBy: [{ period: 'desc' }, { invoiceNumber: 'desc' }],
    take: 10_000,
    include: { institution: { select: { name: true, slug: true } } },
  });
  const header = ['Invoice', 'School', 'Code', 'Period', 'Students', 'Total (BDT)', 'Paid (BDT)', 'Waived (BDT)', 'Due (BDT)', 'Status', 'Due date', 'Days overdue'];
  const body = rows.map((r) => {
    const p = presentInvoice(r, now);
    return [p.invoiceNumber, r.institution.name, r.institution.slug, p.period, p.studentCount ?? '', p.total, p.paidAmount, p.waivedAmount, p.amountDue, p.status, p.dueDate.toISOString().slice(0, 10), p.daysOverdue];
  });
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  const stamp = new Date().toISOString().slice(0, 10);
  if (q.format === 'csv') {
    return { buffer: Buffer.from(`\uFEFF${XLSX.utils.sheet_to_csv(ws)}`, 'utf8'), filename: `platform-invoices-${stamp}.csv`, contentType: 'text/csv; charset=utf-8' };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
  return {
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    filename: `platform-invoices-${stamp}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/** One invoice with its payments. `tenantId` scopes it to a school (NotFound otherwise). */
export async function getInvoiceDetail(id: string, tenantId?: string, now: Date = new Date()) {
  const invoice = await prisma.platformInvoice.findFirst({
    where: { id, ...(tenantId ? { institutionId: tenantId } : {}) },
    include: {
      institution: { select: { id: true, name: true, slug: true, address: true, phone: true, email: true, contactEmail: true, contactPhone: true, logoUrl: true } },
      allocations: {
        include: {
          payment: { select: { id: true, receiptNumber: true, method: true, status: true, amount: true, paidAt: true, reference: true, isDemo: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  const payments = invoice.allocations
    .filter((a) => a.payment.status === 'SUCCESS')
    .map((a) => ({
      id: a.payment.id,
      receiptNumber: a.payment.receiptNumber,
      method: a.payment.method,
      amount: Number(a.appliedAmount),
      paymentTotal: Number(a.payment.amount),
      paidAt: a.payment.paidAt,
      reference: tenantId ? null : a.payment.reference,
      isDemo: a.payment.isDemo,
    }));
  const { allocations: _a, ...rest } = invoice;
  return { ...presentInvoice(rest as InvoiceRow, now), institution: invoice.institution, payments };
}

// ── School (tenant) views ───────────────────────────────────────────────────

export async function listMyInvoices(tenantId: string, now: Date = new Date()) {
  const rows = await prisma.platformInvoice.findMany({
    where: { institutionId: tenantId },
    orderBy: { period: 'desc' },
    take: 36,
  });
  return rows.map((r) => presentInvoice(r, now));
}

export async function listMyPayments(tenantId: string) {
  const rows = await prisma.platformPayment.findMany({
    where: { institutionId: tenantId, status: 'SUCCESS' },
    orderBy: { paidAt: 'desc' },
    take: 60,
    include: { allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, period: true } } } } },
  });
  return rows.map((p) => ({
    id: p.id,
    receiptNumber: p.receiptNumber,
    method: p.method,
    amount: Number(p.amount),
    paidAt: p.paidAt,
    isDemo: p.isDemo,
    invoices: p.allocations.map((a) => ({ ...a.invoice, amount: Number(a.appliedAmount) })),
  }));
}

/**
 * Status for every signed-in role of a school (banner + "disabled" screen).
 * The final level comes from accessLevel.ts so it always matches what the
 * middleware enforces. Amounts are shown to ADMIN only.
 */
export async function getMyBillingStatus(
  tenantId: string,
  role: string,
  final: { accessLevel: PlatformAccessLevel; reason: string | null },
  now: Date = new Date(),
) {
  const access = await computePlatformAccessState(tenantId, now);
  const base = {
    hasProfile: access.hasProfile,
    accessLevel: final.accessLevel,
    reason: final.reason,
    source: access.source,
    isAdmin: role === 'ADMIN',
  };
  if (!access.hasProfile || role !== 'ADMIN') return { ...base, summary: null };

  const unpaid = await prisma.platformInvoice.findMany({
    where: { institutionId: tenantId, status: { in: UNPAID_STATUSES } },
    orderBy: { dueDate: 'asc' },
  });
  const presented = unpaid.map((r) => presentInvoice(r, now));
  const totalDue = presented.reduce((s, r) => s + toPaisa(r.amountDue), 0);
  const current = presented.find((r) => r.period === periodOf(now)) ?? presented[presented.length - 1] ?? null;
  return {
    ...base,
    overrideReason: access.override ? access.overrideReason : null,
    summary: {
      unpaidCount: presented.length,
      totalDue: paisaToNumber(totalDue),
      overdueCount: presented.filter((r) => r.daysOverdue > 0).length,
      maxDaysOverdue: access.maxDaysOverdue,
      current: current
        ? { id: current.id, invoiceNumber: current.invoiceNumber, period: current.period, amountDue: current.amountDue, dueDate: current.dueDate, status: current.status, daysOverdue: current.daysOverdue }
        : null,
    },
  };
}

// ── Super-admin dashboard ───────────────────────────────────────────────────

export async function getDashboard(now: Date = new Date()) {
  const period = periodOf(now);
  const firstPeriod = addMonths(period, -11);
  const months: string[] = [];
  for (let i = 0; i < 12; i += 1) months.push(addMonths(firstPeriod, i));
  const fromDate = periodBounds(firstPeriod).start;

  const [invoices, payments, unpaid] = await Promise.all([
    prisma.platformInvoice.findMany({
      where: { period: { gte: firstPeriod }, status: { not: 'CANCELLED' } },
      select: { period: true, total: true, paidAmount: true, waivedAmount: true, status: true },
    }),
    prisma.platformPayment.findMany({
      where: { status: 'SUCCESS', paidAt: { gte: fromDate }, isDemo: false },
      select: { amount: true, paidAt: true },
    }),
    prisma.platformInvoice.findMany({
      where: { status: { in: UNPAID_STATUSES } },
      select: { institutionId: true, total: true, paidAmount: true, waivedAmount: true, status: true, dueDate: true },
    }),
  ]);

  const byMonth = new Map(months.map((m) => [m, { period: m, billed: 0, collected: 0, invoicePaid: 0 }]));
  for (const inv of invoices) {
    const row = byMonth.get(inv.period);
    if (!row) continue;
    row.billed += toPaisa(inv.total);
    row.invoicePaid += Math.min(toPaisa(inv.total), toPaisa(inv.paidAmount) + toPaisa(inv.waivedAmount));
  }
  for (const p of payments) {
    if (!p.paidAt) continue;
    const row = byMonth.get(periodOf(p.paidAt));
    if (row) row.collected += toPaisa(p.amount);
  }

  let outstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  const perSchool = new Map<string, { due: number; maxDays: number; invoices: number }>();
  for (const inv of unpaid) {
    const due = duePaisa(inv);
    outstanding += due;
    const past = daysPastDue(inv.dueDate, now);
    if (past > 0 && due > 0) {
      overdueCount += 1;
      overdueAmount += due;
      const s = perSchool.get(inv.institutionId) ?? { due: 0, maxDays: 0, invoices: 0 };
      s.due += due;
      s.maxDays = Math.max(s.maxDays, past);
      s.invoices += 1;
      perSchool.set(inv.institutionId, s);
    }
  }
  const topIds = [...perSchool.entries()].sort((a, b) => b[1].due - a[1].due).slice(0, 10);
  const schools = topIds.length
    ? await prisma.institution.findMany({ where: { id: { in: topIds.map(([id]) => id) } }, select: { id: true, name: true, slug: true } })
    : [];
  const nameOf = new Map(schools.map((s) => [s.id, s]));

  const thisMonth = byMonth.get(period)!;
  const [profiles, activeProfiles] = await Promise.all([
    prisma.institutionBillingProfile.count(),
    prisma.institutionBillingProfile.count({ where: { isActive: true } }),
  ]);

  return {
    period,
    thisMonth: {
      billed: paisaToNumber(thisMonth.billed),
      collected: paisaToNumber(thisMonth.collected),
      collectionRate: thisMonth.billed > 0 ? Math.round((thisMonth.invoicePaid / thisMonth.billed) * 1000) / 10 : null,
    },
    outstanding: paisaToNumber(outstanding),
    overdueCount,
    overdueAmount: paisaToNumber(overdueAmount),
    schoolsBilled: activeProfiles,
    schoolsWithProfile: profiles,
    months: [...byMonth.values()].map((m) => ({ period: m.period, billed: paisaToNumber(m.billed), collected: paisaToNumber(m.collected) })),
    topOverdue: topIds.map(([id, s]) => ({
      institutionId: id,
      name: nameOf.get(id)?.name ?? 'Unknown',
      slug: nameOf.get(id)?.slug ?? '',
      amountDue: paisaToNumber(s.due),
      maxDaysOverdue: s.maxDays,
      invoices: s.invoices,
    })),
  };
}

/** Pure re-export for the collections board (keeps one access rule). */
export { computePlatformAccess };
