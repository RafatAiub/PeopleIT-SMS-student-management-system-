import { DonationFundType, DonationMethod, DonationStatus, EmailPriority, Prisma, UsageMetric } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { moveToTrash } from '../trash/trash.service';
import { logger } from '../../utils/logger';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../utils/AppError';
import { sendSms } from '../../utils/sms.service';
import { sendEmail } from '../email/sender';
import { donationReceiptEmail, donationReminderEmail } from '../email/templates/donation.templates';
import { findInstitutionBranding } from '../notifications/notifications.repository';
import { notifySafe } from '../notifications/notifications.service';
import {
  amountInWordsBn,
  amountInWordsEn,
  canDisburse,
  computeFundBalances,
  donationReceiptPrefix,
  firstDueDate,
  generateDonationReference,
  isDueThisMonth,
  monthKey,
  nextDonationReceiptNo,
  nextDueAfterPayment,
  pledgeDueState,
  progressPercent,
  remindedThisMonth,
  startOfNextUtcMonth,
  startOfUtcMonth,
  sumBalancesByType,
  toCsv,
  toPaisa,
  fromPaisa,
} from './donations.logic';
import type {
  CreateCampaignDtoType,
  CreateDisbursementDtoType,
  CreateDonorDtoType,
  CreateFundDtoType,
  CreateRecurringDtoType,
  DisbursementQueryDtoType,
  DonationQueryDtoType,
  DonorQueryDtoType,
  RecordDonationDtoType,
  RecurringQueryDtoType,
  ReportQueryDtoType,
  UpdateCampaignDtoType,
  UpdateDonorDtoType,
  UpdateFundDtoType,
  UpdateRecurringDtoType,
} from './donations.dto';

// =============================================================================
// Donations, Zakat & Sadaqah (T1) — admin service. Every query is scoped by
// ctx.institutionId (from the verified JWT via setTenant, never the client).
// Routes are gated by requireModule('islamic.donations').
// =============================================================================

export interface DonationCtx {
  institutionId: string;
  userId: string;
  role: string;
}

const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
const num = (v: Prisma.Decimal | null | undefined): number | null => (v == null ? null : Number(v));

export const METHOD_LABEL: Record<DonationMethod, string> = {
  CASH: 'Cash',
  BANK: 'Bank',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  SSLCOMMERZ: 'Card / SSLCommerz',
  OTHER: 'Other',
};

export function formatBdt(amount: number): string {
  return `BDT ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Receipt numbers ──────────────────────────────────────────────────────────

function isReceiptCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes('receiptNo');
}

/** Next DON-<year>-<n> for this school, computed inside the caller's transaction. */
export async function nextReceiptNo(tx: Prisma.TransactionClient, institutionId: string, at: Date): Promise<string> {
  const year = at.getUTCFullYear();
  const latest = await tx.donation.findFirst({
    where: { institutionId, receiptNo: { startsWith: donationReceiptPrefix(year) } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  });
  return nextDonationReceiptNo(latest?.receiptNo, year);
}

/**
 * Runs `fn` (which opens its own transaction and takes a receipt number)
 * again on a receiptNo unique collision. Two payments in the same school at
 * the same instant both read the same max; the loser's insert waits for the
 * winner to commit, fails on the unique index, and its retry (a fresh
 * transaction) re-reads the now-committed max — so numbers stay gap-free.
 */
export async function withReceiptRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isReceiptCollision(error)) throw error;
      last = error;
    }
  }
  throw last;
}

export async function uniqueReference(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const ref = generateDonationReference();
    const clash = await prisma.donation.findUnique({ where: { reference: ref }, select: { id: true } });
    if (!clash) return ref;
  }
  throw new ConflictError('Could not create a donation reference — please try again');
}

// ── Lookups (tenant-checked) ─────────────────────────────────────────────────

async function fundOrThrow(institutionId: string, id: string) {
  const fund = await prisma.donationFund.findFirst({ where: { id, institutionId } });
  if (!fund) throw new NotFoundError('Fund not found');
  return fund;
}

async function donorOrThrow(institutionId: string, id: string) {
  const donor = await prisma.donor.findFirst({ where: { id, institutionId } });
  if (!donor) throw new NotFoundError('Donor not found');
  return donor;
}

async function campaignOrThrow(institutionId: string, id: string) {
  const campaign = await prisma.donationCampaign.findFirst({ where: { id, institutionId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  return campaign;
}

async function pledgeOrThrow(institutionId: string, id: string) {
  const pledge = await prisma.recurringDonation.findFirst({ where: { id, institutionId } });
  if (!pledge) throw new NotFoundError('Monthly pledge not found');
  return pledge;
}

// ── Fund balances ────────────────────────────────────────────────────────────

async function sumsByFund(institutionId: string): Promise<{ collected: Record<string, number>; disbursed: Record<string, number> }> {
  const [paid, out] = await Promise.all([
    prisma.donation.groupBy({ by: ['fundId'], where: { institutionId, status: 'PAID' }, _sum: { amount: true } }),
    prisma.donationDisbursement.groupBy({ by: ['fundId'], where: { institutionId }, _sum: { amount: true } }),
  ]);
  return {
    collected: Object.fromEntries(paid.map((r) => [r.fundId, Number(r._sum.amount ?? 0)])),
    disbursed: Object.fromEntries(out.map((r) => [r.fundId, Number(r._sum.amount ?? 0)])),
  };
}

export async function fundBalances(institutionId: string) {
  const [funds, sums] = await Promise.all([
    prisma.donationFund.findMany({ where: { institutionId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    sumsByFund(institutionId),
  ]);
  const balances = computeFundBalances(
    funds.map((f) => ({ id: f.id, name: f.name, nameBn: f.nameBn, type: f.type, goalAmount: num(f.goalAmount) })),
    sums.collected,
    sums.disbursed,
  );
  return { funds, balances };
}

// ── Funds ────────────────────────────────────────────────────────────────────

export async function listFunds(ctx: DonationCtx) {
  const { funds, balances } = await fundBalances(ctx.institutionId);
  const byId = new Map(balances.map((b) => [b.fundId, b]));
  // The balance row carries goalAmount (as a number) and progress.
  return funds.map((f) => ({ ...f, ...byId.get(f.id)! }));
}

export async function createFund(ctx: DonationCtx, data: CreateFundDtoType) {
  const fund = await prisma.donationFund.create({
    data: {
      institutionId: ctx.institutionId,
      name: data.name,
      nameBn: data.nameBn,
      type: data.type as DonationFundType,
      description: data.description,
      goalAmount: data.goalAmount == null ? null : dec(data.goalAmount),
      active: data.active,
      showOnWebsite: data.showOnWebsite,
    },
  });
  return { ...fund, goalAmount: num(fund.goalAmount) };
}

export async function updateFund(ctx: DonationCtx, id: string, data: UpdateFundDtoType) {
  await fundOrThrow(ctx.institutionId, id);
  const fund = await prisma.donationFund.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.nameBn !== undefined ? { nameBn: data.nameBn } : {}),
      ...(data.type !== undefined ? { type: data.type as DonationFundType } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.goalAmount !== undefined ? { goalAmount: data.goalAmount == null ? null : dec(data.goalAmount) } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.showOnWebsite !== undefined ? { showOnWebsite: data.showOnWebsite } : {}),
    },
  });
  return { ...fund, goalAmount: num(fund.goalAmount) };
}

export async function deleteFund(ctx: DonationCtx, id: string) {
  await fundOrThrow(ctx.institutionId, id);
  const [d, c, r, o] = await Promise.all([
    prisma.donation.count({ where: { fundId: id } }),
    prisma.donationCampaign.count({ where: { fundId: id } }),
    prisma.recurringDonation.count({ where: { fundId: id } }),
    prisma.donationDisbursement.count({ where: { fundId: id } }),
  ]);
  if (d + c + r + o > 0) throw new ConflictError('This fund has donations, campaigns, pledges or payouts. Switch it off (inactive) instead of deleting it.');
  // T5: to the trash (restorable for 30 days).
  const trash = await moveToTrash(ctx, 'DONATION_FUND', id);
  return { id, trash };
}

// ── Donors ───────────────────────────────────────────────────────────────────

async function assertLinkableUser(institutionId: string, userId: string | null | undefined) {
  if (!userId) return;
  const user = await prisma.user.findFirst({ where: { id: userId, institutionId }, select: { id: true } });
  if (!user) throw new ValidationError('That portal user is not part of this school');
}

export async function listDonors(ctx: DonationCtx, q: DonorQueryDtoType) {
  const where: Prisma.DonorWhereInput = {
    institutionId: ctx.institutionId,
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { phone: { contains: q.q } },
            { email: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.donor.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    }),
    prisma.donor.count({ where }),
  ]);
  const totals = items.length
    ? await prisma.donation.groupBy({
        by: ['donorId'],
        where: { institutionId: ctx.institutionId, status: 'PAID', donorId: { in: items.map((d) => d.id) } },
        _sum: { amount: true },
        _count: { _all: true },
      })
    : [];
  const byDonor = new Map(totals.map((t) => [t.donorId, t]));
  return {
    items: items.map((d) => ({
      ...d,
      totalGiven: Number(byDonor.get(d.id)?._sum.amount ?? 0),
      donationCount: byDonor.get(d.id)?._count._all ?? 0,
    })),
    total,
  };
}

export async function getDonor(ctx: DonationCtx, id: string) {
  const donor = await donorOrThrow(ctx.institutionId, id);
  const [donations, pledges] = await Promise.all([
    prisma.donation.findMany({
      where: { institutionId: ctx.institutionId, donorId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { fund: { select: { name: true, nameBn: true, type: true } } },
    }),
    prisma.recurringDonation.findMany({ where: { institutionId: ctx.institutionId, donorId: id }, include: { fund: { select: { name: true } } } }),
  ]);
  return {
    ...donor,
    donations: donations.map(toAdminDonation),
    pledges: pledges.map((p) => ({ ...p, amount: Number(p.amount), dueState: pledgeDueState(p) })),
  };
}

export async function createDonor(ctx: DonationCtx, data: CreateDonorDtoType) {
  await assertLinkableUser(ctx.institutionId, data.userId);
  return prisma.donor.create({
    data: {
      institutionId: ctx.institutionId,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address,
      anonymous: data.anonymous,
      notes: data.notes,
      userId: data.userId ?? null,
    },
  });
}

export async function updateDonor(ctx: DonationCtx, id: string, data: UpdateDonorDtoType) {
  await donorOrThrow(ctx.institutionId, id);
  if (data.userId !== undefined) await assertLinkableUser(ctx.institutionId, data.userId);
  return prisma.donor.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
      ...(data.email !== undefined ? { email: data.email ?? null } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.anonymous !== undefined ? { anonymous: data.anonymous } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.userId !== undefined ? { userId: data.userId ?? null } : {}),
    },
  });
}

/** Deleting a donor keeps their donations (with the name snapshot) and removes their pledges. */
export async function deleteDonor(ctx: DonationCtx, id: string) {
  await donorOrThrow(ctx.institutionId, id);
  await prisma.donor.delete({ where: { id } });
  return { id };
}

// ── Campaigns ────────────────────────────────────────────────────────────────

async function raisedByCampaign(institutionId: string, ids: string[]): Promise<Map<string, { raised: number; count: number }>> {
  if (!ids.length) return new Map();
  const rows = await prisma.donation.groupBy({
    by: ['campaignId'],
    where: { institutionId, status: 'PAID', campaignId: { in: ids } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.campaignId as string, { raised: Number(r._sum.amount ?? 0), count: r._count._all }]));
}

export function toCampaignView<T extends { id: string; goalAmount: Prisma.Decimal | null }>(c: T, raised: { raised: number; count: number } | undefined) {
  const goal = num(c.goalAmount);
  const r = raised?.raised ?? 0;
  return { ...c, goalAmount: goal, raised: r, donationCount: raised?.count ?? 0, progress: progressPercent(r, goal) };
}

export async function listCampaigns(ctx: DonationCtx) {
  const campaigns = await prisma.donationCampaign.findMany({
    where: { institutionId: ctx.institutionId },
    orderBy: { createdAt: 'desc' },
    include: { fund: { select: { id: true, name: true, nameBn: true, type: true } } },
  });
  const raised = await raisedByCampaign(ctx.institutionId, campaigns.map((c) => c.id));
  return campaigns.map((c) => toCampaignView(c, raised.get(c.id)));
}

export async function createCampaign(ctx: DonationCtx, data: CreateCampaignDtoType) {
  await fundOrThrow(ctx.institutionId, data.fundId);
  const c = await prisma.donationCampaign.create({
    data: {
      institutionId: ctx.institutionId,
      fundId: data.fundId,
      title: data.title,
      titleBn: data.titleBn,
      description: data.description,
      goalAmount: data.goalAmount == null ? null : dec(data.goalAmount),
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      coverImageUrl: data.coverImageUrl ?? null,
      isPublic: data.isPublic,
    },
  });
  return toCampaignView(c, undefined);
}

export async function updateCampaign(ctx: DonationCtx, id: string, data: UpdateCampaignDtoType) {
  await campaignOrThrow(ctx.institutionId, id);
  if (data.fundId) await fundOrThrow(ctx.institutionId, data.fundId);
  const c = await prisma.donationCampaign.update({
    where: { id },
    data: {
      ...(data.fundId !== undefined ? { fundId: data.fundId } : {}),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.titleBn !== undefined ? { titleBn: data.titleBn } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.goalAmount !== undefined ? { goalAmount: data.goalAmount == null ? null : dec(data.goalAmount) } : {}),
      ...(data.startDate !== undefined ? { startDate: data.startDate ?? null } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate ?? null } : {}),
      ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl ?? null } : {}),
      ...(data.isPublic !== undefined ? { isPublic: data.isPublic } : {}),
    },
  });
  const raised = await raisedByCampaign(ctx.institutionId, [id]);
  return toCampaignView(c, raised.get(id));
}

export async function deleteCampaign(ctx: DonationCtx, id: string) {
  await campaignOrThrow(ctx.institutionId, id);
  // T5: to the trash; its donations keep pointing at it (money records stay).
  const trash = await moveToTrash(ctx, 'DONATION_CAMPAIGN', id);
  return { id, trash };
}

// ── Donations ────────────────────────────────────────────────────────────────

type DonationWithRels = Prisma.DonationGetPayload<{
  include: { fund: { select: { name: true; nameBn: true; type: true } } };
}> & { campaign?: { title: string } | null };

function toAdminDonation(d: DonationWithRels) {
  // Gateway correlation ids are internal — never sent to the browser.
  const { gatewayTranId: _t, gatewayPaymentId: _p, returnUrl: _r, ...rest } = d;
  return { ...rest, amount: Number(d.amount) };
}

function donationWhere(institutionId: string, q: Partial<DonationQueryDtoType>): Prisma.DonationWhereInput {
  return {
    institutionId,
    ...(q.fundId ? { fundId: q.fundId } : {}),
    ...(q.campaignId ? { campaignId: q.campaignId } : {}),
    ...(q.donorId ? { donorId: q.donorId } : {}),
    ...(q.status ? { status: q.status as DonationStatus } : {}),
    ...(q.method ? { method: q.method as DonationMethod } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.from || q.to
      ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
      : {}),
    ...(q.q
      ? {
          OR: [
            { donorName: { contains: q.q, mode: 'insensitive' } },
            { donorPhone: { contains: q.q } },
            { receiptNo: { contains: q.q, mode: 'insensitive' } },
            { reference: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function listDonations(ctx: DonationCtx, q: DonationQueryDtoType) {
  const where = donationWhere(ctx.institutionId, q);
  const [items, total, sum] = await Promise.all([
    prisma.donation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { fund: { select: { name: true, nameBn: true, type: true } }, campaign: { select: { title: true } } },
    }),
    prisma.donation.count({ where }),
    prisma.donation.aggregate({ where: { ...where, status: 'PAID' }, _sum: { amount: true } }),
  ]);
  return { items: items.map(toAdminDonation), total, paidTotal: Number(sum._sum.amount ?? 0) };
}

export async function getDonation(ctx: DonationCtx, id: string) {
  const d = await prisma.donation.findFirst({
    where: { id, institutionId: ctx.institutionId },
    include: { fund: { select: { name: true, nameBn: true, type: true } }, campaign: { select: { title: true } }, donor: true },
  });
  if (!d) throw new NotFoundError('Donation not found');
  return toAdminDonation(d);
}

/** Office entry (cash, bank, a bKash transfer seen in the statement…). Always PAID with a receipt number. */
export async function recordDonation(ctx: DonationCtx, data: RecordDonationDtoType) {
  const pledge = data.recurringId ? await pledgeOrThrow(ctx.institutionId, data.recurringId) : null;
  if (pledge && pledge.status === 'CANCELLED') throw new BadRequestError('That monthly pledge is cancelled');
  const donorId = data.donorId ?? pledge?.donorId ?? null;
  if (pledge && donorId !== pledge.donorId) throw new ValidationError('The donor does not match the monthly pledge');

  const campaign = data.campaignId ? await campaignOrThrow(ctx.institutionId, data.campaignId) : null;
  const fundId = campaign?.fundId ?? data.fundId;
  if (campaign && data.fundId && data.fundId !== campaign.fundId) throw new ValidationError('That campaign belongs to a different fund');
  const fund = await fundOrThrow(ctx.institutionId, fundId);
  if (!fund.active) throw new BadRequestError('This fund is inactive');
  const donor = donorId ? await donorOrThrow(ctx.institutionId, donorId) : null;
  if (!donor && !data.donorName) throw new ValidationError('Choose a donor or enter the donor’s name');

  const paidAt = data.paidAt ?? new Date();
  const reference = await uniqueReference();

  const created = await withReceiptRetry(() =>
    prisma.$transaction(async (tx) => {
      const receiptNo = await nextReceiptNo(tx, ctx.institutionId, paidAt);
      const row = await tx.donation.create({
        data: {
          institutionId: ctx.institutionId,
          fundId,
          campaignId: campaign?.id ?? null,
          donorId: donor?.id ?? null,
          recurringId: pledge?.id ?? null,
          reference,
          donorName: donor?.name ?? data.donorName ?? null,
          donorPhone: donor?.phone ?? null,
          donorEmail: donor?.email ?? null,
          anonymous: data.anonymous || Boolean(donor?.anonymous),
          amount: dec(data.amount),
          method: data.method as DonationMethod,
          status: 'PAID',
          receiptNo,
          paidAt,
          note: data.note,
          source: 'ADMIN',
          recordedById: ctx.userId,
        },
      });
      if (pledge) {
        await tx.recurringDonation.update({
          where: { id: pledge.id },
          data: { nextDueDate: nextDueAfterPayment(pledge), lastPaidAt: paidAt },
        });
      }
      return row;
    }),
  );

  if (data.sendReceipt && created.donorEmail) sendReceiptEmail(created.id).catch(() => undefined);
  return getDonation(ctx, created.id);
}

/**
 * Marks a PAID donation REFUNDED (money handed back). Online gifts must also
 * be refunded in the gateway's merchant panel — this records it here.
 */
export async function refundDonation(ctx: DonationCtx, id: string, reason: string) {
  const d = await prisma.donation.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!d) throw new NotFoundError('Donation not found');
  const res = await prisma.donation.updateMany({
    where: { id, institutionId: ctx.institutionId, status: 'PAID' },
    data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: reason, refundedById: ctx.userId },
  });
  if (res.count !== 1) throw new BadRequestError('Only a paid donation can be refunded');
  return getDonation(ctx, id);
}

// ── Receipts ─────────────────────────────────────────────────────────────────

export async function buildReceipt(institutionId: string, where: Prisma.DonationWhereInput) {
  const d = await prisma.donation.findFirst({
    where: { ...where, institutionId },
    include: { fund: { select: { name: true, nameBn: true, type: true } }, campaign: { select: { title: true, titleBn: true } } },
  });
  if (!d) throw new NotFoundError('Donation not found');
  if (!d.receiptNo || (d.status !== 'PAID' && d.status !== 'REFUNDED')) throw new BadRequestError('This donation has no receipt yet (it is not paid)');
  const inst = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { name: true, logoUrl: true, address: true, phone: true, email: true, contactPhone: true, contactEmail: true },
  });
  const amount = Number(d.amount);
  return {
    institution: {
      name: inst?.name ?? '',
      logoUrl: inst?.logoUrl ?? null,
      address: inst?.address ?? null,
      phone: inst?.contactPhone ?? inst?.phone ?? null,
      email: inst?.contactEmail ?? inst?.email ?? null,
    },
    receiptNo: d.receiptNo,
    reference: d.reference,
    status: d.status,
    paidAt: d.paidAt,
    donorName: d.anonymous ? null : d.donorName,
    anonymous: d.anonymous,
    donorPhone: d.donorPhone,
    fund: d.fund,
    campaign: d.campaign,
    amount,
    currency: d.currency,
    method: d.method,
    methodLabel: METHOD_LABEL[d.method],
    amountInWords: { en: amountInWordsEn(amount), bn: amountInWordsBn(amount) },
    note: d.note,
    refundedAt: d.refundedAt,
  };
}

export async function getReceipt(ctx: DonationCtx, id: string) {
  return buildReceipt(ctx.institutionId, { id });
}

/** Emails the receipt when the donation has a donor email. Never throws to the caller's flow. */
export async function sendReceiptEmail(donationId: string, opts: { resend?: boolean } = {}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const d = await prisma.donation.findUnique({ where: { id: donationId }, include: { fund: true } });
    if (!d || !d.receiptNo || d.status !== 'PAID') return { sent: false, reason: 'not paid' };
    if (!d.donorEmail) return { sent: false, reason: 'no email' };
    const branding = await findInstitutionBranding(d.institutionId);
    const amount = Number(d.amount);
    const mail = donationReceiptEmail({
      donorName: d.donorName || 'Donor',
      institutionName: branding.name,
      receiptNo: d.receiptNo,
      fundName: d.fund.name,
      fundNameBn: d.fund.nameBn,
      amount: formatBdt(amount),
      amountInWordsEn: amountInWordsEn(amount),
      amountInWordsBn: amountInWordsBn(amount),
      paidAt: (d.paidAt ?? d.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' }),
      method: METHOD_LABEL[d.method],
      receiptUrl: null,
      institution: { name: branding.name, logoUrl: branding.logoUrl, color: branding.color },
    });
    const result = await sendEmail({
      to: d.donorEmail,
      toName: d.donorName ?? undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      template: 'donation.receipt',
      priority: EmailPriority.P1_TRANSACTIONAL,
      institutionId: d.institutionId,
      fromName: branding.name,
      replyTo: branding.contactEmail ?? undefined,
      idempotencyKey: opts.resend ? `donation-receipt:${d.id}:${Date.now()}` : `donation-receipt:${d.id}`,
    });
    return { sent: result.ok, reason: result.ok ? undefined : result.status };
  } catch (error) {
    logger.warn('Donation receipt email failed', { donationId, error: (error as Error).message });
    return { sent: false, reason: 'error' };
  }
}

export async function emailReceipt(ctx: DonationCtx, id: string) {
  const d = await prisma.donation.findFirst({ where: { id, institutionId: ctx.institutionId }, select: { id: true } });
  if (!d) throw new NotFoundError('Donation not found');
  return sendReceiptEmail(id, { resend: true });
}

// ── Recurring pledges ────────────────────────────────────────────────────────

export async function listRecurring(ctx: DonationCtx, q: RecurringQueryDtoType, now: Date = new Date()) {
  const where: Prisma.RecurringDonationWhereInput = {
    institutionId: ctx.institutionId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.dueThisMonth ? { status: 'ACTIVE', nextDueDate: { lt: startOfNextUtcMonth(now) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.recurringDonation.findMany({
      where,
      orderBy: { nextDueDate: 'asc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        donor: { select: { id: true, name: true, phone: true, email: true, userId: true } },
        fund: { select: { id: true, name: true, nameBn: true, type: true } },
      },
    }),
    prisma.recurringDonation.count({ where }),
  ]);
  return {
    items: items.map((p) => ({ ...p, amount: Number(p.amount), dueState: pledgeDueState(p, now), remindedThisMonth: remindedThisMonth(p.lastReminderAt, now) })),
    total,
  };
}

export async function createRecurring(ctx: DonationCtx, data: CreateRecurringDtoType) {
  await donorOrThrow(ctx.institutionId, data.donorId);
  const fund = await fundOrThrow(ctx.institutionId, data.fundId);
  if (!fund.active) throw new BadRequestError('This fund is inactive');
  const start = data.startDate ?? new Date();
  const p = await prisma.recurringDonation.create({
    data: {
      institutionId: ctx.institutionId,
      donorId: data.donorId,
      fundId: data.fundId,
      amount: dec(data.amount),
      dayOfMonth: data.dayOfMonth,
      startDate: start,
      nextDueDate: firstDueDate(start, data.dayOfMonth),
      remindEmail: data.remindEmail,
      remindSms: data.remindSms,
      note: data.note,
      createdById: ctx.userId,
    },
  });
  return { ...p, amount: Number(p.amount), dueState: pledgeDueState(p) };
}

export async function updateRecurring(ctx: DonationCtx, id: string, data: UpdateRecurringDtoType) {
  const current = await pledgeOrThrow(ctx.institutionId, id);
  if (data.fundId) await fundOrThrow(ctx.institutionId, data.fundId);
  let nextDueDate: Date | undefined;
  if (data.dayOfMonth !== undefined && data.dayOfMonth !== current.dayOfMonth) {
    // Same period, new day: keep the month the pledge is currently due in.
    const d = current.nextDueDate;
    nextDueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), data.dayOfMonth));
  }
  const p = await prisma.recurringDonation.update({
    where: { id },
    data: {
      ...(data.fundId !== undefined ? { fundId: data.fundId } : {}),
      ...(data.amount !== undefined ? { amount: dec(data.amount) } : {}),
      ...(data.dayOfMonth !== undefined ? { dayOfMonth: data.dayOfMonth } : {}),
      ...(nextDueDate ? { nextDueDate } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.remindEmail !== undefined ? { remindEmail: data.remindEmail } : {}),
      ...(data.remindSms !== undefined ? { remindSms: data.remindSms } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
    },
  });
  return { ...p, amount: Number(p.amount), dueState: pledgeDueState(p) };
}

export async function deleteRecurring(ctx: DonationCtx, id: string) {
  await pledgeOrThrow(ctx.institutionId, id);
  await prisma.recurringDonation.delete({ where: { id } });
  return { id };
}

/**
 * Sends this month's reminder for every ACTIVE pledge that is due/overdue and
 * has not been reminded this month (or just `ids`, if given).
 *   - donor linked to a portal user → the notification pipeline
 *     (DONATION_REMINDER: in-app + email/SMS per the pledge's flags and the
 *     user's own notification preferences; deduped per pledge per month)
 *   - otherwise → email directly (sendEmail) and/or SMS (sendSms), within the
 *     plan's monthly SMS limit
 */
export async function sendDueReminders(ctx: DonationCtx, ids?: string[], now: Date = new Date()) {
  const pledges = await prisma.recurringDonation.findMany({
    where: {
      institutionId: ctx.institutionId,
      status: 'ACTIVE',
      nextDueDate: { lt: startOfNextUtcMonth(now) },
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    include: { donor: true, fund: { select: { name: true, nameBn: true } } },
  });
  const branding = await findInstitutionBranding(ctx.institutionId);
  // P5: the school's SMS credit wallet decides (sms_per_month is now the free
  // monthly allowance inside it); no credits → SKIPPED INSUFFICIENT_CREDITS.
  const smsAllowed = true;

  const result = { reminded: 0, skipped: 0, items: [] as { id: string; donor: string; channels: string[]; skipped?: string }[] };
  let smsSent = 0;
  for (const p of pledges) {
    if (!isDueThisMonth(p, now)) continue;
    if (remindedThisMonth(p.lastReminderAt, now)) {
      result.skipped++;
      result.items.push({ id: p.id, donor: p.donor.name, channels: [], skipped: 'already reminded this month' });
      continue;
    }
    const amount = Number(p.amount);
    const dueDate = p.nextDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const channels: string[] = [];

    if (p.donor.userId) {
      const pipelineChannels: ('IN_APP' | 'EMAIL' | 'SMS')[] = ['IN_APP'];
      if (p.remindEmail) pipelineChannels.push('EMAIL');
      if (p.remindSms) pipelineChannels.push('SMS');
      notifySafe({
        institutionId: ctx.institutionId,
        type: 'DONATION_REMINDER',
        recipientUserIds: [p.donor.userId],
        vars: { donorName: p.donor.name, fundName: p.fund.name, amount: amount.toFixed(2), dueDate, institutionName: branding.name },
        data: { link: '/donations/mine' },
        contextId: `${p.id}:${monthKey(now)}`,
        channels: pipelineChannels,
      });
      channels.push(...pipelineChannels.map((c) => c.toLowerCase()));
    } else {
      if (p.remindEmail && p.donor.email) {
        const mail = donationReminderEmail({
          donorName: p.donor.name,
          institutionName: branding.name,
          fundName: p.fund.name,
          amount: formatBdt(amount),
          dueDate,
          institution: { name: branding.name, logoUrl: branding.logoUrl, color: branding.color },
        });
        const sent = await sendEmail({
          to: p.donor.email,
          toName: p.donor.name,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          template: 'donation.reminder',
          priority: EmailPriority.P1_TRANSACTIONAL,
          institutionId: ctx.institutionId,
          fromName: branding.name,
          replyTo: branding.contactEmail ?? undefined,
          idempotencyKey: `donation-reminder:${p.id}:${monthKey(now)}`,
        });
        if (sent.ok || sent.status === 'SKIPPED') channels.push('email');
      }
      if (p.remindSms && p.donor.phone && smsAllowed) {
        const r = await sendSms(
          p.donor.phone,
          `Reminder: your monthly donation of Tk ${amount.toFixed(0)} (${p.fund.name}) is due ${dueDate}. JazakAllah khair. - ${branding.name}`,
          { institutionId: ctx.institutionId, purpose: 'DONATION_REMINDER', sourceRef: p.id },
        );
        // P0: only a provider-accepted SMS counts (and is billed); a disabled
        // gateway is reported the same way as email demo mode (SKIPPED).
        if (r.status === 'SENT') {
          channels.push('sms');
          smsSent++;
        } else if (r.status === 'SKIPPED' && r.reason !== 'INSUFFICIENT_CREDITS') {
          channels.push('sms');
        } else {
          logger.warn('Donation reminder SMS failed', { pledgeId: p.id, error: r.message });
        }
      }
    }

    if (channels.length) {
      await prisma.recurringDonation.update({ where: { id: p.id }, data: { lastReminderAt: now } });
      result.reminded++;
      result.items.push({ id: p.id, donor: p.donor.name, channels });
    } else {
      result.skipped++;
      result.items.push({ id: p.id, donor: p.donor.name, channels, skipped: 'no email/phone or reminders switched off' });
    }
  }

  if (smsSent > 0) {
    await prisma.usageRecord
      .create({ data: { institutionId: ctx.institutionId, metric: UsageMetric.SMS, quantity: smsSent, meta: { source: 'donation-reminder' } } })
      .catch((error) => logger.warn('Donation reminder SMS usage not recorded', { error: (error as Error).message }));
  }
  logger.info('Donation reminders sent', { institutionId: ctx.institutionId, reminded: result.reminded, skipped: result.skipped });
  return result;
}

// ── Disbursements ────────────────────────────────────────────────────────────

export async function listDisbursements(ctx: DonationCtx, q: DisbursementQueryDtoType) {
  const where: Prisma.DonationDisbursementWhereInput = {
    institutionId: ctx.institutionId,
    ...(q.fundId ? { fundId: q.fundId } : {}),
    ...(q.from || q.to ? { date: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.donationDisbursement.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { fund: { select: { name: true, nameBn: true, type: true } } },
    }),
    prisma.donationDisbursement.count({ where }),
  ]);
  return { items: items.map((d) => ({ ...d, amount: Number(d.amount) })), total };
}

/** Pay money out of a fund. Never more than the fund's current balance. */
export async function createDisbursement(ctx: DonationCtx, data: CreateDisbursementDtoType) {
  await fundOrThrow(ctx.institutionId, data.fundId);
  // Serialise payouts per fund so two at once can't both pass the balance check.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`donation-fund:${data.fundId}`}))`;
    const [paid, out] = await Promise.all([
      tx.donation.aggregate({ where: { institutionId: ctx.institutionId, fundId: data.fundId, status: 'PAID' }, _sum: { amount: true } }),
      tx.donationDisbursement.aggregate({ where: { institutionId: ctx.institutionId, fundId: data.fundId }, _sum: { amount: true } }),
    ]);
    const balance = fromPaisa(toPaisa(Number(paid._sum.amount ?? 0)) - toPaisa(Number(out._sum.amount ?? 0)));
    if (!canDisburse(balance, data.amount)) {
      throw new BadRequestError(`This fund's balance is ${formatBdt(balance)} — you can't pay out more than that.`);
    }
    const row = await tx.donationDisbursement.create({
      data: {
        institutionId: ctx.institutionId,
        fundId: data.fundId,
        amount: dec(data.amount),
        paidTo: data.paidTo,
        purpose: data.purpose,
        date: data.date ?? new Date(),
        note: data.note,
        recordedById: ctx.userId,
      },
    });
    return { ...row, amount: Number(row.amount) };
  });
}

export async function deleteDisbursement(ctx: DonationCtx, id: string) {
  const row = await prisma.donationDisbursement.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!row) throw new NotFoundError('Payout not found');
  await prisma.donationDisbursement.delete({ where: { id } });
  return { id };
}

// ── Reports ──────────────────────────────────────────────────────────────────

export async function report(ctx: DonationCtx, q: ReportQueryDtoType) {
  const inst = ctx.institutionId;
  const range: Prisma.DonationWhereInput = q.from || q.to ? { paidAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {};
  const paidWhere: Prisma.DonationWhereInput = { institutionId: inst, status: 'PAID', ...range };
  const outRange: Prisma.DonationDisbursementWhereInput = q.from || q.to ? { date: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {};

  const [totals, byFund, byMethod, outByFund, balances] = await Promise.all([
    prisma.donation.aggregate({ where: paidWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.donation.groupBy({ by: ['fundId'], where: paidWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.donation.groupBy({ by: ['method'], where: paidWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.donationDisbursement.groupBy({ by: ['fundId'], where: { institutionId: inst, ...outRange }, _sum: { amount: true } }),
    fundBalances(inst),
  ]);

  const fromSql = q.from ? Prisma.sql`AND "paidAt" >= ${q.from}` : Prisma.empty;
  const toSql = q.to ? Prisma.sql`AND "paidAt" <= ${q.to}` : Prisma.empty;
  const byMonth = await prisma.$queryRaw<{ month: string; total: Prisma.Decimal; count: bigint }[]>`
    SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS month, SUM("amount") AS total, COUNT(*) AS count
    FROM "Donation"
    WHERE "institutionId" = ${inst} AND "status" = 'PAID' AND "paidAt" IS NOT NULL ${fromSql} ${toSql}
    GROUP BY 1 ORDER BY 1`;

  const fundById = new Map(balances.funds.map((f) => [f.id, f]));
  const outMap = new Map(outByFund.map((r) => [r.fundId, Number(r._sum.amount ?? 0)]));
  const zakatAllTime = sumBalancesByType(balances.balances, 'ZAKAT');
  const zakatCollected = byFund.filter((r) => fundById.get(r.fundId)?.type === 'ZAKAT').reduce((s, r) => s + toPaisa(Number(r._sum.amount ?? 0)), 0);
  const zakatDistributed = outByFund.filter((r) => fundById.get(r.fundId)?.type === 'ZAKAT').reduce((s, r) => s + toPaisa(Number(r._sum.amount ?? 0)), 0);

  return {
    range: { from: q.from ?? null, to: q.to ?? null },
    total: Number(totals._sum.amount ?? 0),
    count: totals._count._all,
    byFund: byFund.map((r) => ({
      fundId: r.fundId,
      name: fundById.get(r.fundId)?.name ?? '—',
      nameBn: fundById.get(r.fundId)?.nameBn ?? null,
      type: fundById.get(r.fundId)?.type ?? 'OTHER',
      total: Number(r._sum.amount ?? 0),
      count: r._count._all,
      disbursed: outMap.get(r.fundId) ?? 0,
    })),
    byMethod: byMethod.map((r) => ({ method: r.method, label: METHOD_LABEL[r.method], total: Number(r._sum.amount ?? 0), count: r._count._all })),
    byMonth: byMonth.map((r) => ({ month: r.month, total: Number(r.total), count: Number(r.count) })),
    zakat: {
      // In the selected range…
      collected: fromPaisa(zakatCollected),
      distributed: fromPaisa(zakatDistributed),
      // …and the all-time balance still to be distributed.
      balance: zakatAllTime.balance,
      allTimeCollected: zakatAllTime.collected,
      allTimeDistributed: zakatAllTime.disbursed,
    },
    fundBalances: balances.balances,
  };
}

/** Dashboard widget: this month's donations and the Zakat balance. */
export async function dashboardSummary(ctx: DonationCtx, now: Date = new Date()) {
  const inst = ctx.institutionId;
  const [month, balances, due, recent] = await Promise.all([
    prisma.donation.aggregate({
      where: { institutionId: inst, status: 'PAID', paidAt: { gte: startOfUtcMonth(now), lt: startOfNextUtcMonth(now) } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    fundBalances(inst),
    prisma.recurringDonation.count({ where: { institutionId: inst, status: 'ACTIVE', nextDueDate: { lt: startOfNextUtcMonth(now) } } }),
    prisma.donation.findMany({
      where: { institutionId: inst, status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      take: 5,
      select: { id: true, donorName: true, anonymous: true, amount: true, paidAt: true, fund: { select: { name: true, nameBn: true } } },
    }),
  ]);
  return {
    thisMonth: { total: Number(month._sum.amount ?? 0), count: month._count._all },
    zakat: sumBalancesByType(balances.balances, 'ZAKAT'),
    pledgesDueThisMonth: due,
    recent: recent.map((r) => ({ ...r, donorName: r.anonymous ? null : r.donorName, amount: Number(r.amount) })),
  };
}

const CSV_MAX_ROWS = 20_000;

export async function exportCsv(ctx: DonationCtx, q: Partial<DonationQueryDtoType>): Promise<string> {
  const rows = await prisma.donation.findMany({
    where: donationWhere(ctx.institutionId, q),
    orderBy: { createdAt: 'desc' },
    take: CSV_MAX_ROWS,
    include: { fund: { select: { name: true, type: true } }, campaign: { select: { title: true } } },
  });
  return toCsv(
    ['Receipt no', 'Reference', 'Date paid', 'Created', 'Donor', 'Phone', 'Email', 'Fund', 'Fund type', 'Campaign', 'Amount', 'Currency', 'Method', 'Status', 'Source', 'Note'],
    rows.map((d) => [
      d.receiptNo ?? '',
      d.reference,
      d.paidAt ?? '',
      d.createdAt,
      d.anonymous ? `${d.donorName ?? ''} (anonymous)` : d.donorName ?? '',
      d.donorPhone ?? '',
      d.donorEmail ?? '',
      d.fund.name,
      d.fund.type,
      d.campaign?.title ?? '',
      Number(d.amount),
      d.currency,
      METHOD_LABEL[d.method],
      d.status,
      d.source,
      d.note ?? '',
    ]),
  );
}

// ── Guardian portal: "My donations" ──────────────────────────────────────────

export async function myDonations(institutionId: string, userId: string) {
  const rows = await prisma.donation.findMany({
    where: { institutionId, donor: { userId }, status: { in: ['PAID', 'REFUNDED'] } },
    orderBy: { paidAt: 'desc' },
    take: 200,
    include: { fund: { select: { name: true, nameBn: true, type: true } }, campaign: { select: { title: true, titleBn: true } } },
  });
  const pledges = await prisma.recurringDonation.findMany({
    where: { institutionId, donor: { userId }, status: { not: 'CANCELLED' } },
    include: { fund: { select: { name: true, nameBn: true } } },
  });
  const total = rows.filter((r) => r.status === 'PAID').reduce((s, r) => s + toPaisa(Number(r.amount)), 0);
  return {
    total: fromPaisa(total),
    donations: rows.map((d) => ({
      id: d.id,
      receiptNo: d.receiptNo,
      reference: d.reference,
      amount: Number(d.amount),
      currency: d.currency,
      method: d.method,
      status: d.status,
      paidAt: d.paidAt,
      fund: d.fund,
      campaign: d.campaign,
    })),
    pledges: pledges.map((p) => ({ id: p.id, amount: Number(p.amount), dayOfMonth: p.dayOfMonth, nextDueDate: p.nextDueDate, status: p.status, fund: p.fund, dueState: pledgeDueState(p) })),
  };
}

export async function myReceipt(institutionId: string, userId: string, id: string) {
  return buildReceipt(institutionId, { id, donor: { userId } });
}
