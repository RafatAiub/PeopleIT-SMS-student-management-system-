import { Prisma, type SmsMessageStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/AppError';
import { describeSmsMode, isSmsConfigured } from '../../utils/sms.service';
import { describeProviders, SMS_PROVIDERS, type SmsProviderName } from '../../utils/sms.providers';
import { adjustCredits, creditsEnforced, ensureWallet, getFreeAllowance } from './smsWallet.service';
import { dhakaMonthKey, freeRemaining, isLowBalance, maskForDisplay, pricePerUnit, toCsv } from './smsCredits.logic';
import { writeAudit } from './smsCredits.shared';
import type { LogQueryDtoType } from './smsCredits.dto';
import { listCreditGateways } from './smsCredits.payments';

// =============================================================================
// P5 SMS credits — read models and settings for the school ADMIN and the
// SUPER_ADMIN pages. Balance changes live in smsWallet.service.ts.
// =============================================================================

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** UTC start of the current Dhaka month. */
function dhakaMonthStart(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - DHAKA_OFFSET_MS);
}

function dayRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (from) range.gte = new Date(Date.parse(`${from}T00:00:00+06:00`));
  if (to) range.lte = new Date(Date.parse(`${to}T23:59:59.999+06:00`));
  return range;
}

function packView(p: { id: string; name: string; nameBn: string | null; units: number; priceBdt: Prisma.Decimal; isActive: boolean; sortOrder: number }) {
  const price = Number(p.priceBdt);
  return { id: p.id, name: p.name, nameBn: p.nameBn, units: p.units, priceBdt: price, perUnit: pricePerUnit(price, p.units), isActive: p.isActive, sortOrder: p.sortOrder };
}

// ── School ADMIN ────────────────────────────────────────────────────────────

export async function getMyOverview(institutionId: string, now: Date = new Date()) {
  await ensureWallet(institutionId);
  const [wallet, allowance, packs, latestRequest, usage] = await Promise.all([
    prisma.smsWallet.findUniqueOrThrow({ where: { institutionId } }),
    getFreeAllowance(institutionId),
    prisma.smsCreditPack.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { units: 'asc' }] }),
    prisma.smsSenderIdRequest.findFirst({ where: { institutionId }, orderBy: { createdAt: 'desc' } }),
    prisma.smsMessage.groupBy({
      by: ['status'],
      where: { institutionId, billing: 'SCHOOL', createdAt: { gte: dhakaMonthStart(now) } },
      _count: { _all: true },
      _sum: { segments: true, costUnits: true, freeUnits: true },
    }),
  ]);
  const month = dhakaMonthKey(now);
  const byStatus: Record<string, { count: number; segments: number }> = {};
  for (const g of usage) byStatus[g.status] = { count: g._count._all, segments: g._sum.segments ?? 0 };
  return {
    balance: wallet.balance,
    totalPurchased: wallet.totalPurchased,
    totalUsed: wallet.totalUsed,
    lowBalanceThreshold: wallet.lowBalanceThreshold,
    isLow: isLowBalance(wallet.balance, wallet.lowBalanceThreshold),
    freeAllowance: allowance,
    freeRemaining: freeRemaining(wallet, allowance, month),
    month,
    senderId: wallet.senderId,
    senderIdProvider: wallet.senderIdProvider,
    latestSenderRequest: latestRequest,
    thisMonth: byStatus,
    smsLive: isSmsConfigured(),
    enforced: creditsEnforced(),
    packs: packs.map(packView),
    gateways: listCreditGateways(),
  };
}

export async function updateSettings(institutionId: string, userId: string, dto: { lowBalanceThreshold: number }) {
  await ensureWallet(institutionId);
  const w = await prisma.smsWallet.update({
    where: { institutionId },
    data: { lowBalanceThreshold: dto.lowBalanceThreshold, lowBalanceAlertedAt: null },
    select: { lowBalanceThreshold: true },
  });
  await writeAudit(prisma, { institutionId, userId, action: 'SMS_SETTINGS_UPDATE', resource: 'SmsWallet', metadata: { lowBalanceThreshold: dto.lowBalanceThreshold } });
  return w;
}

export async function listLedger(institutionId: string, page: number, pageSize: number) {
  const where = { institutionId };
  const [rows, total] = await Promise.all([
    prisma.smsCreditLedger.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.smsCreditLedger.count({ where }),
  ]);
  return { data: rows, meta: { page, pageSize, total } };
}

function messageWhere(q: LogQueryDtoType, institutionId: string | null): Prisma.SmsMessageWhereInput {
  const created = dayRange(q.from, q.to);
  const digits = q.search?.replace(/\D/g, '');
  return {
    ...(institutionId ? { institutionId } : q.institutionId ? { institutionId: q.institutionId } : {}),
    ...(q.status ? { status: q.status as SmsMessageStatus } : {}),
    ...(q.purpose ? { purpose: q.purpose } : {}),
    ...(q.provider ? { provider: q.provider } : {}),
    ...(q.billing ? { billing: q.billing } : {}),
    ...(digits ? { to: { contains: digits } } : {}),
    ...(created ? { createdAt: created } : {}),
  };
}

const MESSAGE_SELECT = {
  id: true,
  institutionId: true,
  to: true,
  body: true,
  segments: true,
  encoding: true,
  billing: true,
  purpose: true,
  provider: true,
  providerMessageId: true,
  senderId: true,
  status: true,
  costUnits: true,
  freeUnits: true,
  refundedAt: true,
  error: true,
  attempts: true,
  sentAt: true,
  deliveredAt: true,
  createdAt: true,
} satisfies Prisma.SmsMessageSelect;

/** School scope (institutionId set) or all schools (super-admin, phones masked). */
export async function listMessages(q: LogQueryDtoType, institutionId: string | null) {
  const where = messageWhere(q, institutionId);
  const [rows, total] = await Promise.all([
    prisma.smsMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { ...MESSAGE_SELECT, institution: { select: { name: true } } },
    }),
    prisma.smsMessage.count({ where }),
  ]);
  const data = rows.map((r) => ({
    ...r,
    to: institutionId ? r.to : maskForDisplay(r.to),
    // Super-admins see metadata, not the school's message text.
    body: institutionId ? r.body : null,
    institutionName: r.institution?.name ?? null,
    institution: undefined,
  }));
  return { data, meta: { page: q.page, pageSize: q.pageSize, total } };
}

export const EXPORT_LIMIT = 20_000;

export async function exportMessagesCsv(q: LogQueryDtoType, institutionId: string | null) {
  const rows = await prisma.smsMessage.findMany({
    where: messageWhere(q, institutionId),
    orderBy: { createdAt: 'desc' },
    take: EXPORT_LIMIT,
    select: { ...MESSAGE_SELECT, institution: { select: { name: true } } },
  });
  const header = ['Created', 'School', 'To', 'Purpose', 'Status', 'Segments', 'Credits', 'Free', 'Refunded', 'Provider', 'Provider ID', 'Sender', 'Sent', 'Delivered', 'Error', ...(institutionId ? ['Message'] : [])];
  const csv = toCsv(
    header,
    rows.map((r) => [
      r.createdAt,
      r.institution?.name ?? '',
      institutionId ? r.to : maskForDisplay(r.to),
      r.purpose ?? '',
      r.status,
      r.segments,
      r.costUnits,
      r.freeUnits,
      r.refundedAt ? 'yes' : '',
      r.provider ?? '',
      r.providerMessageId ?? '',
      r.senderId ?? '',
      r.sentAt ?? '',
      r.deliveredAt ?? '',
      r.error ?? '',
      ...(institutionId ? [r.body ?? ''] : []),
    ]),
  );
  // BOM so Excel opens Bangla text correctly.
  return { buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'), filename: `sms-log-${new Date().toISOString().slice(0, 10)}.csv`, contentType: 'text/csv; charset=utf-8' };
}

// ── Sender ID requests ──────────────────────────────────────────────────────

export async function requestSenderId(institutionId: string, userId: string, dto: { senderId: string; note?: string | null }) {
  const pending = await prisma.smsSenderIdRequest.findFirst({ where: { institutionId, status: 'REQUESTED' }, select: { id: true } });
  if (pending) throw new ConflictError('A sender ID request is already waiting for approval');
  const row = await prisma.smsSenderIdRequest.create({
    data: { institutionId, requested: dto.senderId, note: dto.note ?? null, requestedById: userId },
  });
  await writeAudit(prisma, { institutionId, userId, action: 'SMS_SENDER_ID_REQUEST', resource: 'SmsSenderIdRequest', resourceId: row.id, metadata: { requested: dto.senderId } });
  return row;
}

export async function cancelSenderRequest(institutionId: string, userId: string, id: string) {
  const r = await prisma.smsSenderIdRequest.deleteMany({ where: { id, institutionId, status: 'REQUESTED' } });
  if (r.count === 0) throw new NotFoundError('No pending request to cancel');
  await writeAudit(prisma, { institutionId, userId, action: 'SMS_SENDER_ID_CANCEL', resource: 'SmsSenderIdRequest', resourceId: id });
  return { id };
}

export async function listMySenderRequests(institutionId: string) {
  return prisma.smsSenderIdRequest.findMany({ where: { institutionId }, orderBy: { createdAt: 'desc' }, take: 20 });
}

export async function listSenderRequests(status?: 'REQUESTED' | 'APPROVED' | 'REJECTED') {
  return prisma.smsSenderIdRequest.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: { institution: { select: { id: true, name: true } } },
  });
}

export async function reviewSenderRequest(
  actorUserId: string,
  id: string,
  dto: { decision: 'APPROVE'; approvedValue: string; provider?: SmsProviderName | null; reviewNote?: string | null } | { decision: 'REJECT'; reviewNote: string },
) {
  const req = await prisma.smsSenderIdRequest.findUnique({ where: { id } });
  if (!req) throw new NotFoundError('Sender ID request not found');
  if (req.status !== 'REQUESTED') throw new BadRequestError(`This request is already ${req.status}`);
  const now = new Date();
  await ensureWallet(req.institutionId);
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.smsSenderIdRequest.update({
      where: { id },
      data:
        dto.decision === 'APPROVE'
          ? { status: 'APPROVED', approvedValue: dto.approvedValue, provider: dto.provider ?? null, reviewNote: dto.reviewNote ?? null, reviewedById: actorUserId, reviewedAt: now }
          : { status: 'REJECTED', reviewNote: dto.reviewNote, reviewedById: actorUserId, reviewedAt: now },
    });
    if (dto.decision === 'APPROVE') {
      await tx.smsWallet.update({ where: { institutionId: req.institutionId }, data: { senderId: dto.approvedValue, senderIdProvider: dto.provider ?? null } });
    }
    await writeAudit(tx, {
      institutionId: req.institutionId,
      userId: actorUserId,
      action: dto.decision === 'APPROVE' ? 'SMS_SENDER_ID_APPROVE' : 'SMS_SENDER_ID_REJECT',
      resource: 'SmsSenderIdRequest',
      resourceId: id,
      metadata: dto.decision === 'APPROVE' ? { approvedValue: dto.approvedValue, provider: dto.provider ?? null } : { reason: dto.reviewNote },
    });
    return r;
  });
  return updated;
}

/** Super-admin: switch a school back to the non-masking default. */
export async function clearSenderId(actorUserId: string, institutionId: string) {
  await ensureWallet(institutionId);
  await prisma.smsWallet.update({ where: { institutionId }, data: { senderId: null, senderIdProvider: null } });
  await writeAudit(prisma, { institutionId, userId: actorUserId, action: 'SMS_SENDER_ID_CLEAR', resource: 'SmsWallet' });
  return { institutionId };
}

// ── Super-admin: packs, overview, credits ───────────────────────────────────

export async function listPacks(includeInactive: boolean) {
  const packs = await prisma.smsCreditPack.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { units: 'asc' }],
  });
  return packs.map(packView);
}

type PackInput = { name: string; nameBn?: string | null; units: number; priceBdt: number; isActive: boolean; sortOrder: number };

export async function createPack(actorUserId: string, dto: PackInput) {
  const p = await prisma.smsCreditPack.create({
    data: { name: dto.name, nameBn: dto.nameBn ?? null, units: dto.units, priceBdt: new Prisma.Decimal(dto.priceBdt.toFixed(2)), isActive: dto.isActive, sortOrder: dto.sortOrder },
  });
  await writeAudit(prisma, { institutionId: null, userId: actorUserId, action: 'SMS_PACK_CREATE', resource: 'SmsCreditPack', resourceId: p.id, metadata: { ...dto } });
  return packView(p);
}

export async function updatePack(actorUserId: string, id: string, dto: PackInput) {
  const exists = await prisma.smsCreditPack.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Pack not found');
  const p = await prisma.smsCreditPack.update({
    where: { id },
    data: { name: dto.name, nameBn: dto.nameBn ?? null, units: dto.units, priceBdt: new Prisma.Decimal(dto.priceBdt.toFixed(2)), isActive: dto.isActive, sortOrder: dto.sortOrder },
  });
  await writeAudit(prisma, { institutionId: null, userId: actorUserId, action: 'SMS_PACK_UPDATE', resource: 'SmsCreditPack', resourceId: id, metadata: { ...dto } });
  return packView(p);
}

export async function adjustSchoolCredits(actorUserId: string, institutionId: string, dto: { type: 'ADJUST' | 'BONUS'; units: number; reason: string }) {
  const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { id: true } });
  if (!inst) throw new NotFoundError('School not found');
  if (dto.type === 'BONUS' && dto.units < 0) throw new BadRequestError('A bonus must be positive — use Adjust to remove credits');
  const balance = await adjustCredits({ institutionId, type: dto.type, units: dto.units, reason: dto.reason, actorUserId });
  await writeAudit(prisma, { institutionId, userId: actorUserId, action: `SMS_CREDITS_${dto.type}`, resource: 'SmsWallet', metadata: { units: dto.units, reason: dto.reason, balance } });
  return { institutionId, balance };
}

export async function adminOverview(now: Date = new Date()) {
  const monthStart = dhakaMonthStart(now);
  const [soldAll, soldMonth, usedMonth, walletAgg, pendingSender, schools, failedMonth] = await Promise.all([
    prisma.smsCreditPurchase.aggregate({ where: { status: 'SUCCESS' }, _sum: { units: true, amount: true }, _count: { _all: true } }),
    prisma.smsCreditPurchase.aggregate({ where: { status: 'SUCCESS', paidAt: { gte: monthStart } }, _sum: { units: true, amount: true }, _count: { _all: true } }),
    prisma.smsMessage.aggregate({
      where: { billing: 'SCHOOL', status: { in: ['SENT', 'DELIVERED'] }, createdAt: { gte: monthStart } },
      _sum: { segments: true, costUnits: true, freeUnits: true },
      _count: { _all: true },
    }),
    prisma.smsWallet.aggregate({ _sum: { balance: true } }),
    prisma.smsSenderIdRequest.count({ where: { status: 'REQUESTED' } }),
    prisma.institution.findMany({
      where: { isActive: true },
      select: { id: true, name: true, smsWallet: true },
      orderBy: { name: 'asc' },
      take: 1000,
    }),
    prisma.smsMessage.count({ where: { status: 'FAILED', createdAt: { gte: monthStart } } }),
  ]);
  const platformMonth = await prisma.smsMessage.aggregate({
    where: { billing: 'PLATFORM', status: { in: ['SENT', 'DELIVERED'] }, createdAt: { gte: monthStart } },
    _sum: { segments: true },
    _count: { _all: true },
  });
  return {
    sold: {
      allTime: { units: soldAll._sum.units ?? 0, amount: Number(soldAll._sum.amount ?? 0), count: soldAll._count._all },
      thisMonth: { units: soldMonth._sum.units ?? 0, amount: Number(soldMonth._sum.amount ?? 0), count: soldMonth._count._all },
    },
    usedThisMonth: {
      messages: usedMonth._count._all,
      segments: usedMonth._sum.segments ?? 0,
      paidUnits: usedMonth._sum.costUnits ?? 0,
      freeUnits: usedMonth._sum.freeUnits ?? 0,
    },
    platformThisMonth: { messages: platformMonth._count._all, segments: platformMonth._sum.segments ?? 0 },
    failedThisMonth: failedMonth,
    outstandingBalance: walletAgg._sum.balance ?? 0,
    pendingSenderRequests: pendingSender,
    schools: schools.map((s) => ({
      institutionId: s.id,
      name: s.name,
      balance: s.smsWallet?.balance ?? 0,
      totalPurchased: s.smsWallet?.totalPurchased ?? 0,
      totalUsed: s.smsWallet?.totalUsed ?? 0,
      lowBalanceThreshold: s.smsWallet?.lowBalanceThreshold ?? 100,
      isLow: isLowBalance(s.smsWallet?.balance ?? 0, s.smsWallet?.lowBalanceThreshold ?? 100),
      senderId: s.smsWallet?.senderId ?? null,
    })),
    providers: describeProviders(),
    mode: describeSmsMode(),
    enforced: creditsEnforced(),
    smsEnabled: env.SMS_ENABLED,
  };
}

/** Live provider balances (one HTTP call per configured provider that supports it). */
export async function providerBalances() {
  const out: { name: SmsProviderName; ok: boolean; balance?: number; detail: string }[] = [];
  for (const row of describeProviders()) {
    const p = SMS_PROVIDERS[row.name];
    if (!row.configured || !p.getBalance) continue;
    try {
      out.push({ name: row.name, ...(await p.getBalance()) });
    } catch (error) {
      out.push({ name: row.name, ok: false, detail: (error as Error).message });
    }
  }
  return out;
}
