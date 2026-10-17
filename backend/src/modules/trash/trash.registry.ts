import crypto from 'crypto';
import { Prisma, TrashEntityType } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/AppError';

// =============================================================================
// T5 trash registry — one handler per trash-able type.
//
//   load        the live row + a display label (throws NotFound)
//   guard       refuse to trash (paid invoice, last admin, …)
//   onTrash     side effects; returns restore metadata (original unique
//               values, linked rows trashed together, logins deactivated)
//   conflict    a clear message when restoring would clash with a newer row
//   onRestore   undo the side effects
//   purge       permanent delete, children first. Throws PurgeBlockedError
//               when money/history would be lost — the item then stays.
// All work happens inside the caller's transaction (tx).
// =============================================================================

export type Tx = Prisma.TransactionClient;
export type Meta = Record<string, unknown>;

export class PurgeBlockedError extends Error {}

export interface TrashActor {
  userId: string | null;
  role?: string;
}

export interface TrashHandler {
  delegate: string;
  label: string;
  load(tx: Tx, institutionId: string, id: string): Promise<{ label: string; row: Record<string, unknown> }>;
  guard?(tx: Tx, row: Record<string, unknown>, actor: TrashActor): Promise<void>;
  onTrash?(tx: Tx, row: Record<string, unknown>, entryKey: string): Promise<Meta>;
  conflict?(tx: Tx, row: Record<string, unknown>, meta: Meta): Promise<string | null>;
  onRestore?(tx: Tx, row: Record<string, unknown>, meta: Meta): Promise<void>;
  purge(tx: Tx, row: Record<string, unknown>, meta: Meta): Promise<void>;
}

const live = { deletedAt: null };
const notFound = (what: string) => new NotFoundError(`${what} not found`);
const s = (v: unknown) => (v == null ? '' : String(v));
/** Suffix that frees a unique slug/email while the row sits in the trash. */
export const trashSuffix = (key: string) => `trash-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 8)}`;

async function deactivateLogin(tx: Tx, userId: unknown): Promise<boolean> {
  if (!userId) return false;
  const u = await tx.user.findFirst({ where: { id: String(userId), ...live }, select: { id: true, isActive: true } });
  if (!u || !u.isActive) return false;
  await tx.user.update({ where: { id: u.id }, data: { isActive: false } });
  await tx.refreshToken.deleteMany({ where: { userId: u.id } });
  return true;
}

async function reactivateLogin(tx: Tx, userId: unknown, wasDeactivated: unknown) {
  if (!userId || !wasDeactivated) return;
  // Only if that login is not itself in the trash.
  await tx.user.updateMany({ where: { id: String(userId), deletedAt: null }, data: { isActive: true } });
}

/** Student purge: academic records go; fee records block (money history must stay). */
async function purgeStudent(tx: Tx, studentId: string) {
  const [invoices, txns, openLoans] = await Promise.all([
    tx.invoice.count({ where: { studentId, deletedAt: undefined } }),
    tx.feePaymentTransaction.count({ where: { studentId } }),
    tx.libraryIssue.count({ where: { studentId, returnDate: null } }),
  ]);
  if (invoices + txns > 0) throw new PurgeBlockedError('Has fee records — kept so the money history stays complete. Restore it or leave it in the trash.');
  if (openLoans > 0) throw new PurgeBlockedError('Still has library books issued — return them first.');
  await tx.guardianStudent.deleteMany({ where: { studentId } });
  await tx.studentDocument.deleteMany({ where: { studentId } });
  await tx.attendance.deleteMany({ where: { studentId } });
  await tx.subjectAttendance.deleteMany({ where: { studentId } });
  await tx.examResult.deleteMany({ where: { studentId } });
  await tx.transportAssignment.deleteMany({ where: { studentId } });
  await tx.promotionRecord.deleteMany({ where: { studentId } });
  await tx.studentConcession.deleteMany({ where: { studentId } });
  await tx.performanceReview.deleteMany({ where: { studentId } });
  await tx.libraryIssue.deleteMany({ where: { studentId } });
  await tx.idCard.deleteMany({ where: { studentId } });
  await tx.qrCheckIn.deleteMany({ where: { studentId } });
  await tx.admissionEnquiry.updateMany({ where: { convertedStudentId: studentId, deletedAt: undefined }, data: { convertedStudentId: null } });
  await tx.student.delete({ where: { id: studentId } });
}

async function purgeGuardian(tx: Tx, guardianId: string) {
  await tx.guardianStudent.deleteMany({ where: { guardianId } });
  await tx.guardian.delete({ where: { id: guardianId } });
}

export const HANDLERS: Record<TrashEntityType, TrashHandler> = {
  STUDENT: {
    delegate: 'student',
    label: 'Student',
    async load(tx, institutionId, id) {
      const row = await tx.student.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Student');
      return { row, label: `${row.firstName} ${row.lastName} (${row.studentId})` };
    },
    async onTrash(tx, row) {
      return { userDeactivated: await deactivateLogin(tx, row.userId) };
    },
    async conflict(tx, row) {
      const same = await tx.student.findFirst({
        where: { institutionId: s(row.institutionId), studentId: s(row.studentId), id: { not: s(row.id) } },
        select: { firstName: true, lastName: true },
      });
      if (same) return `Student ID ${s(row.studentId)} now belongs to ${same.firstName} ${same.lastName}. Change that student's ID first.`;
      if (row.rollNumber && row.sectionId) {
        const roll = await tx.student.findFirst({
          where: { institutionId: s(row.institutionId), sectionId: s(row.sectionId), rollNumber: s(row.rollNumber), id: { not: s(row.id) } },
          select: { firstName: true, lastName: true },
        });
        if (roll) return `Roll ${s(row.rollNumber)} in this section is now ${roll.firstName} ${roll.lastName}. Change one of the rolls first.`;
      }
      return null;
    },
    async onRestore(tx, row, meta) {
      await reactivateLogin(tx, row.userId, meta.userDeactivated);
    },
    purge: (tx, row) => purgeStudent(tx, s(row.id)),
  },

  GUARDIAN: {
    delegate: 'guardian',
    label: 'Guardian',
    async load(tx, institutionId, id) {
      const row = await tx.guardian.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Guardian');
      return { row, label: `${row.firstName} ${row.lastName}${row.phone ? ` (${row.phone})` : ''}` };
    },
    async onTrash(tx, row) {
      return { userDeactivated: await deactivateLogin(tx, row.userId) };
    },
    async onRestore(tx, row, meta) {
      await reactivateLogin(tx, row.userId, meta.userDeactivated);
    },
    purge: (tx, row) => purgeGuardian(tx, s(row.id)),
  },

  USER: {
    delegate: 'user',
    label: 'User',
    async load(tx, institutionId, id) {
      const row = await tx.user.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('User');
      return { row, label: `${row.firstName} ${row.lastName} (${row.email}) · ${row.role}` };
    },
    async guard(tx, row, actor) {
      if (row.id === actor.userId) throw new ForbiddenError('You cannot delete your own account');
      if (row.role === 'SUPER_ADMIN') throw new ForbiddenError('Platform accounts cannot be deleted here');
      if (row.role === 'ADMIN') {
        const admins = await tx.user.count({ where: { institutionId: s(row.institutionId), role: 'ADMIN', isActive: true, id: { not: s(row.id) } } });
        if (admins === 0) throw new ConflictError('This is the last active admin — add another admin first');
      }
    },
    async onTrash(tx, row, entryKey) {
      const suffix = trashSuffix(entryKey);
      const meta: Meta = { email: row.email, phone: row.phone ?? null, publicSlug: row.publicSlug ?? null, wasActive: row.isActive, linked: [] as Array<{ type: string; id: string }> };
      // Free the unique email/phone/slug so a new account can use them meanwhile.
      await tx.user.update({
        where: { id: s(row.id) },
        data: { isActive: false, email: `${suffix}.${s(row.email)}`, phone: null, publicSlug: null },
      });
      await tx.refreshToken.deleteMany({ where: { userId: s(row.id) } });
      // A student's or guardian's profile goes to the trash with the login (as delete used to remove it).
      const linked = meta.linked as Array<{ type: string; id: string }>;
      const now = new Date();
      if (row.role === 'STUDENT') {
        const st = await tx.student.findFirst({ where: { userId: s(row.id) }, select: { id: true } });
        if (st) {
          await tx.student.update({ where: { id: st.id }, data: { deletedAt: now, deletedByUserId: null } });
          linked.push({ type: 'STUDENT', id: st.id });
        }
      }
      if (row.role === 'GUARDIAN') {
        const g = await tx.guardian.findFirst({ where: { userId: s(row.id) }, select: { id: true } });
        if (g) {
          await tx.guardian.update({ where: { id: g.id }, data: { deletedAt: now, deletedByUserId: null } });
          linked.push({ type: 'GUARDIAN', id: g.id });
        }
      }
      return meta;
    },
    async conflict(tx, row, meta) {
      const or: Prisma.UserWhereInput[] = [{ email: s(meta.email) }];
      if (meta.phone) or.push({ phone: s(meta.phone) });
      if (meta.publicSlug) or.push({ publicSlug: s(meta.publicSlug) });
      const clash = await tx.user.findFirst({ where: { id: { not: s(row.id) }, OR: or, ...{ deletedAt: undefined } }, select: { email: true, phone: true, publicSlug: true } });
      if (!clash) return null;
      if (clash.email === meta.email) return `The email ${s(meta.email)} is now used by another account. Change that account's email first.`;
      if (meta.phone && clash.phone === meta.phone) return `The phone ${s(meta.phone)} is now used by another account. Change that account's phone first.`;
      return `The public profile link "${s(meta.publicSlug)}" is now used by another account.`;
    },
    async onRestore(tx, row, meta) {
      await tx.user.update({
        where: { id: s(row.id) },
        data: { email: s(meta.email), phone: (meta.phone as string | null) ?? null, publicSlug: (meta.publicSlug as string | null) ?? null, isActive: meta.wasActive !== false },
      });
      for (const l of (meta.linked as Array<{ type: string; id: string }>) ?? []) {
        if (l.type === 'STUDENT') await tx.student.updateMany({ where: { id: l.id, deletedAt: { not: null } }, data: { deletedAt: null, deletedByUserId: null } });
        if (l.type === 'GUARDIAN') await tx.guardian.updateMany({ where: { id: l.id, deletedAt: { not: null } }, data: { deletedAt: null, deletedByUserId: null } });
      }
    },
    async purge(tx, row, meta) {
      const id = s(row.id);
      for (const l of (meta.linked as Array<{ type: string; id: string }>) ?? []) {
        if (l.type === 'STUDENT') await purgeStudent(tx, l.id);
        if (l.type === 'GUARDIAN') await purgeGuardian(tx, l.id);
      }
      const [payroll, teacher, staff] = await Promise.all([
        tx.payrollRecord.count({ where: { staff: { userId: id } } }),
        tx.teacher.findFirst({ where: { userId: id, user: { deletedAt: undefined } }, select: { id: true } }),
        tx.staffProfile.findFirst({ where: { userId: id, user: { deletedAt: undefined } }, select: { id: true } }),
      ]);
      if (payroll > 0) throw new PurgeBlockedError('Has payroll records — kept so salary history stays complete.');
      if (teacher) {
        await tx.section.updateMany({ where: { classTeacherId: teacher.id }, data: { classTeacherId: null } });
        await tx.timetableSlot.updateMany({ where: { teacherId: teacher.id }, data: { teacherId: null } });
        await tx.teacher.delete({ where: { id: teacher.id } });
      }
      if (staff) await tx.staffProfile.delete({ where: { id: staff.id } });
      await tx.refreshToken.deleteMany({ where: { userId: id } });
      await tx.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
      // Same as the old hard delete: the account's own audit rows reference it (required FK).
      await tx.auditLog.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    },
  },

  INVOICE: {
    delegate: 'invoice',
    label: 'Invoice',
    async load(tx, institutionId, id) {
      const row = await tx.invoice.findFirst({ where: { id, institutionId }, include: { student: { select: { firstName: true, lastName: true } } } });
      if (!row) throw notFound('Invoice');
      return { row, label: `${row.invoiceNo} · ${row.student.firstName} ${row.student.lastName} · Tk ${row.totalAmount.toString()}` };
    },
    async guard(tx, row) {
      const id = s(row.id);
      const paid = new Prisma.Decimal(s(row.paidAmount) || '0');
      if (!['UNPAID', 'OVERDUE', 'CANCELLED'].includes(s(row.status)) || paid.gt(0)) {
        throw new ConflictError('Only unpaid or cancelled invoices can be deleted. Paid and part-paid invoices are money records and stay.');
      }
      const [payments, allocations, txns] = await Promise.all([
        tx.payment.count({ where: { invoiceId: id } }),
        tx.familyPaymentAllocation.count({ where: { invoiceId: id, paymentId: { not: null } } }),
        tx.feePaymentTransaction.count({ where: { invoiceId: id, status: { in: ['INITIATED', 'PENDING', 'SUCCESS'] } } }),
      ]);
      if (payments + allocations > 0) throw new ConflictError('This invoice has payments recorded, so it cannot be deleted.');
      if (txns > 0) throw new ConflictError('An online payment for this invoice is in progress or done, so it cannot be deleted.');
    },
    async purge(tx, row) {
      const id = s(row.id);
      if ((await tx.payment.count({ where: { invoiceId: id } })) > 0) throw new PurgeBlockedError('Has payments — kept.');
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.familyPaymentAllocation.deleteMany({ where: { invoiceId: id, paymentId: null } });
      await tx.feePaymentTransaction.deleteMany({ where: { invoiceId: id, status: { in: ['FAILED', 'CANCELLED'] } } });
      await tx.invoice.delete({ where: { id } });
    },
  },

  NOTICE: {
    delegate: 'notice',
    label: 'Notice',
    async load(tx, institutionId, id) {
      const row = await tx.notice.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Notice');
      return { row, label: row.title };
    },
    purge: async (tx, row) => {
      await tx.notice.delete({ where: { id: s(row.id) } });
    },
  },

  EVENT: {
    delegate: 'event',
    label: 'Event',
    async load(tx, institutionId, id) {
      const row = await tx.event.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Event');
      return { row, label: row.title };
    },
    purge: async (tx, row) => {
      await tx.event.delete({ where: { id: s(row.id) } });
    },
  },

  ENQUIRY: {
    delegate: 'admissionEnquiry',
    label: 'Enquiry',
    async load(tx, institutionId, id) {
      const row = await tx.admissionEnquiry.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Enquiry');
      return { row, label: `${row.studentName} (${row.phone})` };
    },
    purge: async (tx, row) => {
      await tx.admissionEnquiry.delete({ where: { id: s(row.id) } });
    },
  },

  SITE_PAGE: {
    delegate: 'sitePage',
    label: 'Website page',
    async load(tx, institutionId, id) {
      const row = await tx.sitePage.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Page');
      return { row, label: `${row.title} (/${row.slug})` };
    },
    async guard(_tx, row) {
      if (row.isSystem) throw new ForbiddenError('The home page cannot be deleted');
    },
    async onTrash(tx, row, entryKey) {
      const suffix = trashSuffix(entryKey);
      await tx.sitePage.update({
        where: { id: s(row.id) },
        data: { slug: `${s(row.slug)}--${suffix}`, collectionKey: row.collectionKey ? `${s(row.collectionKey)}--${suffix}` : null },
      });
      return { slug: row.slug, collectionKey: row.collectionKey ?? null };
    },
    async conflict(tx, row, meta) {
      const or: Prisma.SitePageWhereInput[] = [{ slug: s(meta.slug) }];
      if (meta.collectionKey) or.push({ collectionKey: s(meta.collectionKey) });
      const clash = await tx.sitePage.findFirst({ where: { siteId: s(row.siteId), id: { not: s(row.id) }, OR: or }, select: { title: true, slug: true } });
      return clash ? `Another page ("${clash.title}") now uses /${s(meta.slug)}. Rename or delete it first.` : null;
    },
    async onRestore(tx, row, meta) {
      await tx.sitePage.update({ where: { id: s(row.id) }, data: { slug: s(meta.slug), collectionKey: (meta.collectionKey as string | null) ?? null } });
    },
    purge: async (tx, row) => {
      await tx.sitePage.delete({ where: { id: s(row.id) } });
    },
  },

  SITE_POST: {
    delegate: 'sitePost',
    label: 'Website post',
    async load(tx, institutionId, id) {
      const row = await tx.sitePost.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Post');
      return { row, label: `${row.title} (/${row.slug})` };
    },
    async onTrash(tx, row, entryKey) {
      await tx.sitePost.update({ where: { id: s(row.id) }, data: { slug: `${s(row.slug)}--${trashSuffix(entryKey)}` } });
      return { slug: row.slug };
    },
    async conflict(tx, row, meta) {
      const clash = await tx.sitePost.findFirst({ where: { siteId: s(row.siteId), id: { not: s(row.id) }, slug: s(meta.slug) }, select: { title: true } });
      return clash ? `Another post ("${clash.title}") now uses the link /${s(meta.slug)}. Rename or delete it first.` : null;
    },
    async onRestore(tx, row, meta) {
      await tx.sitePost.update({ where: { id: s(row.id) }, data: { slug: s(meta.slug) } });
    },
    purge: async (tx, row) => {
      await tx.sitePost.delete({ where: { id: s(row.id) } });
    },
  },

  DONATION_FUND: {
    delegate: 'donationFund',
    label: 'Donation fund',
    async load(tx, institutionId, id) {
      const row = await tx.donationFund.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Fund');
      return { row, label: row.name };
    },
    purge: async (tx, row) => {
      await tx.donationFund.delete({ where: { id: s(row.id) } });
    },
  },

  DONATION_CAMPAIGN: {
    delegate: 'donationCampaign',
    label: 'Donation campaign',
    async load(tx, institutionId, id) {
      const row = await tx.donationCampaign.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Campaign');
      return { row, label: row.title };
    },
    async conflict(tx, row) {
      const fund = await tx.donationFund.findFirst({ where: { id: s(row.fundId), deletedAt: undefined }, select: { name: true, deletedAt: true } });
      return fund?.deletedAt ? `Its fund "${fund.name}" is in the trash — restore the fund first.` : null;
    },
    purge: async (tx, row) => {
      await tx.donationCampaign.delete({ where: { id: s(row.id) } });
    },
  },

  FAMILY: {
    delegate: 'family',
    label: 'Family',
    async load(tx, institutionId, id) {
      const row = await tx.family.findFirst({ where: { id, institutionId } });
      if (!row) throw notFound('Family');
      return { row, label: row.name };
    },
    purge: async (tx, row) => {
      // Members and notes cascade; family payments keep their history (familyId → null).
      await tx.family.delete({ where: { id: s(row.id) } });
    },
  },
};

export const TRASH_TYPES = Object.keys(HANDLERS) as TrashEntityType[];
