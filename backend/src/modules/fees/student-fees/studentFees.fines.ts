import { prisma } from '../../../config/prisma';
import { logger } from '../../../utils/logger';
import { FeeRepository } from '../fee.repository';
import { dhakaDayNumber, fineAmount, fineKeysDue, fromPaisa, pickFineRule, statusFor, toPaisa, type FineRuleLite } from './studentFees.logic';
import { ensureFineCategory } from './studentFees.settings';
import { dec, isUniqueViolation, num } from './studentFees.shared';

// =============================================================================
// Late fines, applied by the daily overdue job (and the "Mark overdue"
// button). For each due invoice past its due date + grace days, one fine per
// key ("ONCE" or "M1", "M2", …) is added as a separate invoice line.
// InvoiceFine(invoiceId, fineKey) is unique, so any number of runs (or two
// instances at once) charge each fine exactly once. maxAmount caps the total
// fines charged on one invoice. A "STOP" row (fine waived with "stop future
// fines") switches fines off for that invoice.
// =============================================================================

const BATCH = 300;

function ruleLite(r: { id: string; feeCategoryId: string | null; type: string; value: unknown; graceDays: number; recurrence: string; maxAmount: unknown; isActive: boolean }): FineRuleLite {
  return {
    id: r.id,
    feeCategoryId: r.feeCategoryId,
    type: r.type,
    value: num(r.value as number),
    graceDays: r.graceDays,
    recurrence: r.recurrence,
    maxAmount: r.maxAmount === null ? null : num(r.maxAmount as number),
    isActive: r.isActive,
  };
}

/** Applies due fines for one school. Returns how many fines were added. */
export async function applyLateFinesForTenant(institutionId: string, now: Date = new Date()): Promise<{ added: number; amount: number }> {
  const rules = (await prisma.lateFineRule.findMany({ where: { institutionId, isActive: true } })).map(ruleLite);
  if (rules.length === 0) return { added: 0, amount: 0 };
  const minGrace = Math.min(...rules.map((r) => r.graceDays));
  // An invoice can only be fined once it is more than minGrace days past due.
  const cutoffDay = dhakaDayNumber(now) - minGrace; // due day must be < this
  const cutoff = new Date(cutoffDay * 86_400_000 - 360 * 60_000);
  const fineCategoryId = await ensureFineCategory(institutionId);

  let added = 0;
  let amountPaisa = 0;
  let cursor: string | undefined;
  for (let pass = 0; pass < 1000; pass++) {
    const invoices = await prisma.invoice.findMany({
      where: { institutionId, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, dueAmount: { gt: 0 }, dueDate: { lt: cutoff }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, dueDate: true, items: { select: { feeCategoryId: true, netAmount: true } }, fines: { select: { fineKey: true, amount: true, waivedAmount: true } } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (invoices.length === 0) break;
    cursor = invoices[invoices.length - 1].id;

    for (const inv of invoices) {
      if (inv.fines.some((f) => f.fineKey === 'STOP')) continue;
      const byCat = new Map<string, number>();
      for (const it of inv.items) {
        if (it.feeCategoryId === fineCategoryId) continue;
        byCat.set(it.feeCategoryId, (byCat.get(it.feeCategoryId) ?? 0) + toPaisa(num(it.netAmount)));
      }
      const rule = pickFineRule(rules, [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k));
      if (!rule) continue;
      const have = new Set(inv.fines.map((f) => f.fineKey));
      const missing = fineKeysDue(inv.dueDate, rule, now).filter((k) => !have.has(k));
      for (const key of missing) {
        try {
          const res = await addFine(institutionId, inv.id, key, rule, fineCategoryId, now);
          if (res > 0) {
            added++;
            amountPaisa += toPaisa(res);
          }
          if (res === 0) break; // cap reached or nothing due
        } catch (error) {
          if (isUniqueViolation(error)) continue; // another run charged it
          logger.error('Late fine failed for invoice', { institutionId, invoiceId: inv.id, key, error: error instanceof Error ? error.message : String(error) });
          break;
        }
      }
    }
    if (invoices.length < BATCH) break;
  }
  return { added, amount: fromPaisa(amountPaisa) };
}

/** Charges one fine (row-locked). Returns the amount added (0 = nothing to add). */
async function addFine(institutionId: string, invoiceId: string, key: string, rule: FineRuleLite, fineCategoryId: string, now: Date): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const locked = await FeeRepository.lockInvoiceForUpdate(tx, institutionId, invoiceId);
    if (!locked || !['UNPAID', 'PARTIAL', 'OVERDUE'].includes(locked.status)) return 0;
    const fines = await tx.invoiceFine.findMany({ where: { invoiceId } });
    if (fines.some((f) => f.fineKey === key || f.fineKey === 'STOP')) return 0;
    const charged = fines.reduce((a, f) => a + toPaisa(num(f.amount)), 0);
    const openFines = fines.reduce((a, f) => a + toPaisa(num(f.amount)) - toPaisa(num(f.waivedAmount)), 0);
    const due = toPaisa(num(locked.totalAmount as number)) - toPaisa(num(locked.paidAmount as number));
    if (due <= 0) return 0;
    const baseDue = Math.max(0, due - openFines); // % is of the fee due, not of earlier fines
    const amount = fineAmount(rule, fromPaisa(baseDue), fromPaisa(charged));
    if (toPaisa(amount) <= 0) return 0;

    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { dueDate: true } });
    const label = key === 'ONCE' ? 'Late fine' : `Late fine (month ${key.slice(1)})`;
    const item = await tx.invoiceItem.create({
      data: { invoiceId, feeCategoryId: fineCategoryId, description: label, amount: dec(amount), discount: dec(0), netAmount: dec(amount) },
    });
    await tx.invoiceFine.create({ data: { institutionId, invoiceId, fineKey: key, ruleId: rule.id, invoiceItemId: item.id, amount: dec(amount) } });
    const total = fromPaisa(toPaisa(num(locked.totalAmount as number)) + toPaisa(amount));
    const next = statusFor({ status: locked.status, totalAmount: total, paidAmount: num(locked.paidAmount as number), dueDate: inv.dueDate }, now);
    await tx.invoice.update({ where: { id: invoiceId }, data: { totalAmount: dec(total), dueAmount: dec(next.dueAmount), status: next.status } });
    return amount;
  });
}

/** All schools with an active fine rule (daily job). */
export async function applyLateFines(now: Date = new Date()) {
  const tenants = await prisma.lateFineRule.findMany({ where: { isActive: true }, select: { institutionId: true }, distinct: ['institutionId'] });
  let added = 0;
  for (const t of tenants) {
    try {
      added += (await applyLateFinesForTenant(t.institutionId, now)).added;
    } catch (error) {
      logger.error('Late fines failed for school', { institutionId: t.institutionId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (added > 0) logger.info('Late fines added', { added, schools: tenants.length });
  return { added, schools: tenants.length };
}
