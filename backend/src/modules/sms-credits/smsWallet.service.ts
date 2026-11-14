import crypto from 'crypto';
import { EmailPriority, Prisma, UserRole, type SmsBillingKind, type SmsLedgerType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { BadRequestError } from '../../utils/AppError';
import { evaluateResourceLimit } from '../saas/entitlements.service';
import { sendEmail } from '../email/sender';
import { buildEmailLayout } from '../email/layout';
import { paragraph } from '../email/components';
import {
  canAlertToday,
  dhakaDayKey,
  dhakaMonthKey,
  freeUnitsToReturn,
  INSUFFICIENT_CREDITS,
  isLowBalance,
  planDeduction,
} from './smsCredits.logic';

// =============================================================================
// P5 SMS wallet — the only code that changes a school's SMS balance.
//
// Concurrency: every balance change runs in a transaction that first locks
// the wallet row (SELECT … FOR UPDATE), so parallel sends (a campaign sends 50
// at once) are serialised per school and the balance can never go negative.
// The table also has CHECK ("balance" >= 0) as a last line of defence.
//
// Free allowance: the plan feature `sms_per_month` (when the school's plan
// sets a numeric limit) is a free monthly allowance used BEFORE paid credits.
// No plan / unlimited plan = no free allowance (unlimited would mean free SMS
// for everyone). The allowance resets each month (Asia/Dhaka).
// =============================================================================

type Tx = Prisma.TransactionClient;

const TX_OPTS = { maxWait: 15_000, timeout: 20_000 };

interface LockedWallet {
  id: string;
  balance: number;
  freeMonth: string | null;
  freeUsed: number;
  lowBalanceThreshold: number;
}

/** SMS_CREDITS_ENFORCED=false turns deduction off (messages are still logged). Default ON. */
export function creditsEnforced(): boolean {
  return (process.env.SMS_CREDITS_ENFORCED ?? '').trim().toLowerCase() !== 'false';
}

function welcomeCredits(): number {
  const n = parseInt(process.env.SMS_WELCOME_CREDITS ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── Free allowance (plan feature sms_per_month), cached briefly ─────────────

const allowanceCache = new Map<string, { value: number; at: number }>();
const ALLOWANCE_TTL_MS = 5 * 60 * 1000;

export async function getFreeAllowance(institutionId: string): Promise<number> {
  const hit = allowanceCache.get(institutionId);
  if (hit && Date.now() - hit.at < ALLOWANCE_TTL_MS) return hit.value;
  let value = 0;
  try {
    const r = await evaluateResourceLimit(institutionId, 'sms_per_month', 0);
    value = r.limit !== null && r.limit > 0 ? r.limit : 0;
  } catch (error) {
    logger.warn('SMS free allowance lookup failed — using 0', { institutionId, error: (error as Error).message });
  }
  allowanceCache.set(institutionId, { value, at: Date.now() });
  return value;
}

export function clearAllowanceCache() {
  allowanceCache.clear();
}

// ── Wallet ──────────────────────────────────────────────────────────────────

/** Creates the wallet on first use (with SMS_WELCOME_CREDITS as a BONUS, if set). Race-safe. */
export async function ensureWallet(institutionId: string): Promise<void> {
  const exists = await prisma.smsWallet.findUnique({ where: { institutionId }, select: { id: true } });
  if (exists) return;
  const bonus = welcomeCredits();
  await prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "SmsWallet" ("id", "institutionId", "balance", "totalPurchased", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${institutionId}, ${bonus}, 0, now())
      ON CONFLICT ("institutionId") DO NOTHING
      RETURNING "id"`;
    if (inserted.length > 0 && bonus > 0) {
      await tx.smsCreditLedger.create({
        data: { institutionId, type: 'BONUS', units: bonus, balanceAfter: bonus, reason: 'Welcome SMS credits' },
      });
    }
  });
}

async function lockWallet(tx: Tx, institutionId: string): Promise<LockedWallet> {
  const rows = await tx.$queryRaw<LockedWallet[]>`
    SELECT "id", "balance", "freeMonth", "freeUsed", "lowBalanceThreshold"
    FROM "SmsWallet" WHERE "institutionId" = ${institutionId} FOR UPDATE`;
  if (!rows[0]) throw new Error(`SMS wallet missing for institution ${institutionId}`);
  return rows[0];
}

export async function getSender(institutionId: string): Promise<{ senderId: string | null; senderProvider: string | null }> {
  const w = await prisma.smsWallet.findUnique({ where: { institutionId }, select: { senderId: true, senderIdProvider: true } });
  return { senderId: w?.senderId ?? null, senderProvider: w?.senderIdProvider ?? null };
}

// ── Reserve (deduct before sending) ─────────────────────────────────────────

export interface MessageDraft {
  institutionId: string | null;
  to: string;
  body: string | null;
  segments: number;
  encoding: string;
  billing: SmsBillingKind;
  purpose?: string | null;
  sourceRef?: string | null;
}

export type ReserveResult =
  | { ok: true; messageId: string; costUnits: number; freeUnits: number; balanceAfter: number }
  | { ok: false; messageId: string | null; reason: string };

/**
 * Deducts `units` for one school SMS and creates its SmsMessage (QUEUED) in
 * ONE transaction. Insufficient → a SKIPPED message with INSUFFICIENT_CREDITS
 * and nothing deducted (the ADMIN alert is raised by the caller).
 */
export async function reserveForMessage(draft: MessageDraft & { institutionId: string }, units: number, now: Date = new Date()): Promise<ReserveResult> {
  await ensureWallet(draft.institutionId);
  const enforced = creditsEnforced();
  const allowance = enforced ? await getFreeAllowance(draft.institutionId) : 0;
  const month = dhakaMonthKey(now);

  const result = await prisma.$transaction(async (tx): Promise<ReserveResult> => {
    const wallet = await lockWallet(tx, draft.institutionId);
    if (!enforced) {
      const msg = await tx.smsMessage.create({ data: { ...draft, status: 'QUEUED', costUnits: 0, freeUnits: 0 }, select: { id: true } });
      return { ok: true, messageId: msg.id, costUnits: 0, freeUnits: 0, balanceAfter: wallet.balance };
    }
    const plan = planDeduction(wallet, units, allowance, month);
    if (!plan.ok) {
      const msg = await tx.smsMessage.create({
        data: {
          ...draft,
          status: 'SKIPPED',
          error: `${INSUFFICIENT_CREDITS}: needs ${units} SMS credit(s), balance ${wallet.balance}`,
        },
        select: { id: true },
      });
      return { ok: false, messageId: msg.id, reason: INSUFFICIENT_CREDITS };
    }
    await tx.smsWallet.update({
      where: { id: wallet.id },
      data: {
        balance: plan.newBalance,
        freeMonth: plan.month,
        freeUsed: plan.newFreeUsed,
        totalUsed: { increment: units },
      },
    });
    const msg = await tx.smsMessage.create({
      data: { ...draft, status: 'QUEUED', costUnits: plan.paidTake, freeUnits: plan.freeTake },
      select: { id: true },
    });
    await tx.smsCreditLedger.create({
      data: {
        institutionId: draft.institutionId,
        type: 'DEDUCT',
        units: -plan.paidTake,
        freeUnits: plan.freeTake,
        balanceAfter: plan.newBalance,
        smsMessageId: msg.id,
        reason: `${draft.purpose ?? 'SMS'} · ${units} segment(s)${plan.freeTake ? ` (${plan.freeTake} free)` : ''}`,
      },
    });
    return { ok: true, messageId: msg.id, costUnits: plan.paidTake, freeUnits: plan.freeTake, balanceAfter: plan.newBalance };
  }, TX_OPTS);

  if (result.ok) {
    if (enforced) void maybeLowBalanceAlert(draft.institutionId, now).catch(() => undefined);
  } else {
    void alertInsufficient(draft.institutionId, now).catch(() => undefined);
  }
  return result;
}

/**
 * Returns the credits of a message that did not go out (FAILED / SKIPPED).
 * Idempotent: only the first call for a message refunds (refundedAt claim).
 */
export async function refundMessage(messageId: string, reason: string, now: Date = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const msg = await tx.smsMessage.findUnique({
      where: { id: messageId },
      select: { id: true, institutionId: true, costUnits: true, freeUnits: true, refundedAt: true, createdAt: true, billing: true },
    });
    if (!msg || !msg.institutionId || msg.billing !== 'SCHOOL' || msg.refundedAt) return false;
    if (msg.costUnits <= 0 && msg.freeUnits <= 0) return false;
    const claim = await tx.smsMessage.updateMany({ where: { id: messageId, refundedAt: null }, data: { refundedAt: now } });
    if (claim.count !== 1) return false;

    const wallet = await lockWallet(tx, msg.institutionId);
    const freeBack = freeUnitsToReturn(msg.freeUnits, dhakaMonthKey(msg.createdAt), wallet.freeMonth);
    const balanceAfter = wallet.balance + msg.costUnits;
    await tx.smsWallet.update({
      where: { id: wallet.id },
      data: {
        balance: balanceAfter,
        freeUsed: Math.max(0, wallet.freeUsed - freeBack),
        totalUsed: { decrement: msg.costUnits + msg.freeUnits },
      },
    });
    await tx.smsCreditLedger.create({
      data: {
        institutionId: msg.institutionId,
        type: 'REFUND',
        units: msg.costUnits,
        freeUnits: freeBack,
        balanceAfter,
        smsMessageId: msg.id,
        reason: reason.slice(0, 500),
      },
    });
    return true;
  }, TX_OPTS);
}

/**
 * PURCHASE / BONUS / ADJUST on a locked wallet, inside the caller's
 * transaction. ADJUST may be negative but never below zero.
 */
export async function changeBalance(
  tx: Tx,
  params: { institutionId: string; type: Exclude<SmsLedgerType, 'DEDUCT' | 'REFUND'>; units: number; reason: string; purchaseId?: string | null; actorUserId?: string | null },
): Promise<number> {
  const wallet = await lockWallet(tx, params.institutionId);
  const units = Math.trunc(params.units);
  if (units === 0) throw new BadRequestError('Units must not be zero');
  if (params.type !== 'ADJUST' && units < 0) throw new BadRequestError('Units must be positive');
  const balanceAfter = wallet.balance + units;
  if (balanceAfter < 0) throw new BadRequestError(`Cannot remove ${-units} credits — the balance is only ${wallet.balance}`);
  await tx.smsWallet.update({
    where: { id: wallet.id },
    data: {
      balance: balanceAfter,
      ...(params.type === 'PURCHASE' ? { totalPurchased: { increment: units } } : {}),
      // A top-up re-arms the low-balance alert.
      ...(units > 0 ? { lowBalanceAlertedAt: null, insufficientAlertedAt: null } : {}),
    },
  });
  await tx.smsCreditLedger.create({
    data: {
      institutionId: params.institutionId,
      type: params.type,
      units,
      balanceAfter,
      reason: params.reason.slice(0, 1000),
      purchaseId: params.purchaseId ?? null,
      actorUserId: params.actorUserId ?? null,
    },
  });
  return balanceAfter;
}

/** Convenience wrapper with its own transaction (wallet created on demand). */
export async function adjustCredits(params: Parameters<typeof changeBalance>[1]): Promise<number> {
  await ensureWallet(params.institutionId);
  return prisma.$transaction((tx) => changeBalance(tx, params), TX_OPTS);
}

// ── Alerts (in-app + email to the school's ADMINs, max once a day) ──────────

async function schoolAdmins(institutionId: string) {
  return prisma.user.findMany({
    where: { institutionId, role: UserRole.ADMIN, isActive: true },
    select: { id: true, email: true, firstName: true },
  });
}

async function inAppToAdmins(institutionId: string, title: string, body: string) {
  const admins = await schoolAdmins(institutionId);
  if (admins.length === 0) return admins;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      institutionId,
      recipientUserId: a.id,
      type: 'SMS_CREDITS',
      title,
      body,
      data: { link: '/sms' },
    })),
  });
  return admins;
}

/** Insufficient credits: in-app alert to ADMINs, at most once per Dhaka day. */
export async function alertInsufficient(institutionId: string, now: Date = new Date()): Promise<boolean> {
  const w = await prisma.smsWallet.findUnique({ where: { institutionId }, select: { insufficientAlertedAt: true, balance: true } });
  if (!w || !canAlertToday(w.insufficientAlertedAt, now)) return false;
  const claim = await prisma.smsWallet.updateMany({
    where: { institutionId, insufficientAlertedAt: w.insufficientAlertedAt },
    data: { insufficientAlertedAt: now },
  });
  if (claim.count !== 1) return false;
  await inAppToAdmins(
    institutionId,
    'SMS not sent — no SMS credits left / এসএমএস পাঠানো হয়নি — ক্রেডিট শেষ',
    `Your school's SMS credit balance is ${w.balance}. Messages are being skipped until you buy an SMS pack (Settings → SMS). ` +
      `আপনার স্কুলের এসএমএস ক্রেডিট ${w.balance}। নতুন প্যাক না কেনা পর্যন্ত এসএমএস যাবে না।`,
  );
  logger.warn('SMS credits exhausted — admins alerted', { institutionId });
  return true;
}

/** Low balance (below the school's threshold): email + in-app, at most once per Dhaka day. */
export async function maybeLowBalanceAlert(institutionId: string, now: Date = new Date()): Promise<boolean> {
  const w = await prisma.smsWallet.findUnique({
    where: { institutionId },
    select: { balance: true, lowBalanceThreshold: true, lowBalanceAlertedAt: true },
  });
  if (!w || !isLowBalance(w.balance, w.lowBalanceThreshold) || !canAlertToday(w.lowBalanceAlertedAt, now)) return false;
  const claim = await prisma.smsWallet.updateMany({
    where: { institutionId, lowBalanceAlertedAt: w.lowBalanceAlertedAt },
    data: { lowBalanceAlertedAt: now },
  });
  if (claim.count !== 1) return false;

  const text = `Your SMS credit balance is low: ${w.balance} left (alert level ${w.lowBalanceThreshold}). Buy an SMS pack from Settings → SMS so guardian messages keep going out.`;
  const textBn = `আপনার এসএমএস ক্রেডিট কম: ${w.balance} বাকি (সতর্কতার সীমা ${w.lowBalanceThreshold})। অভিভাবকদের কাছে এসএমএস চালু রাখতে সেটিংস → এসএমএস থেকে প্যাক কিনুন।`;
  const admins = await inAppToAdmins(institutionId, 'SMS credits running low / এসএমএস ক্রেডিট কমে গেছে', `${text} ${textBn}`);
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true, logoUrl: true, themeColor: true } });
  const day = dhakaDayKey(now);
  for (const a of admins) {
    if (!a.email) continue;
    const html = buildEmailLayout({
      preheader: text,
      heading: 'SMS credits running low',
      bodyHtml: paragraph(text) + paragraph(textBn) + paragraph(`${env.FRONTEND_URL.replace(/\/+$/, '')}/sms`),
      institution: institution ? { name: institution.name, logoUrl: institution.logoUrl, color: institution.themeColor } : undefined,
    });
    await sendEmail({
      to: a.email,
      toName: a.firstName,
      subject: `SMS credits low: ${w.balance} left`,
      html,
      text: `${text}\n\n${textBn}`,
      template: 'sms.low-balance',
      priority: EmailPriority.P1_TRANSACTIONAL,
      institutionId,
      fromName: 'PeopleNIT',
      idempotencyKey: `sms-low-balance:${institutionId}:${day}:${a.email}`,
    }).catch((error) => logger.warn('Low SMS balance email failed', { institutionId, error: (error as Error).message }));
  }
  return true;
}
