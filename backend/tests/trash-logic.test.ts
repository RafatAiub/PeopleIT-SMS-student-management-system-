import { scopeArgs } from '../src/config/softDelete';
import { daysLeft, purgeAfterFrom, RETENTION_DAYS } from '../src/modules/trash/trash.service';
import { trashSuffix } from '../src/modules/trash/trash.registry';

// =============================================================================
// T5 soft-delete query rewriting (pure; no DB).
// =============================================================================

describe('soft-delete query rewriting', () => {
  it('adds deletedAt: null to reads of trash-able models, not to single-row writes', () => {
    expect(scopeArgs('Student', 'findMany', { where: { institutionId: 'i' } })).toEqual({ where: { institutionId: 'i', deletedAt: null } });
    expect(scopeArgs('Notice', 'count', undefined)).toEqual({ where: { deletedAt: null } });
    expect(scopeArgs('User', 'findUnique', { where: { email: 'a@b' } })?.where).toEqual({ email: 'a@b', deletedAt: null });
    expect(scopeArgs('Invoice', 'updateMany', { where: { id: 'x' }, data: {} })?.where).toEqual({ id: 'x', deletedAt: null });
    expect(scopeArgs('Student', 'update', { where: { id: 'x' }, data: {} })).toEqual({ where: { id: 'x' }, data: {} });
    expect(scopeArgs('Student', 'deleteMany', { where: { id: 'x' } })).toEqual({ where: { id: 'x' } });
  });

  it('an explicit deletedAt key opts out (restore, purge, conflict checks)', () => {
    expect(scopeArgs('Student', 'findFirst', { where: { id: 'x', deletedAt: { not: null } } })?.where).toEqual({ id: 'x', deletedAt: { not: null } });
    const withTrashed = scopeArgs('Student', 'findMany', { where: { id: 'x', deletedAt: undefined } })?.where as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(withTrashed, 'deletedAt') && withTrashed.deletedAt === undefined).toBe(true);
  });

  it('hides child rows of a trashed parent (attendance, guardian links, staff profiles)', () => {
    expect(scopeArgs('Attendance', 'groupBy', { by: ['status'], where: { institutionId: 'i' } })?.where).toEqual({ institutionId: 'i', student: { deletedAt: null } });
    expect(scopeArgs('GuardianStudent', 'findMany', { where: { guardianId: 'g' } })?.where).toEqual({ guardianId: 'g', student: { deletedAt: null }, guardian: { deletedAt: null } });
    expect(scopeArgs('StaffProfile', 'findMany', {})?.where).toEqual({ user: { deletedAt: null } });
    // An explicit relation filter is scoped, not replaced.
    expect(scopeArgs('Attendance', 'findMany', { where: { student: { sectionId: 's' } } })?.where).toEqual({ student: { sectionId: 's', deletedAt: null } });
  });

  it('scopes relation filters in where (some / none / is / nested AND-OR)', () => {
    const w = scopeArgs('Family', 'findMany', {
      where: { OR: [{ guardians: { some: { guardian: { firstName: 'A' } } } }, { students: { none: {} } }] },
    })?.where;
    expect(w).toEqual({
      deletedAt: null,
      OR: [
        { guardians: { some: { guardian: { firstName: 'A', deletedAt: null } } } },
        { students: { none: { student: { deletedAt: null } } } },
      ],
    });
    expect(scopeArgs('Section', 'findMany', { where: { students: { some: { status: 'ACTIVE' } } } })?.where).toEqual({ students: { some: { status: 'ACTIVE', deletedAt: null } } });
    expect(scopeArgs('Student', 'findMany', { where: { user: { is: { isActive: true } } } })?.where).toEqual({ deletedAt: null, user: { is: { isActive: true, deletedAt: null } } });
  });

  it('scopes list includes/selects and filtered _count; leaves to-one includes', () => {
    const a = scopeArgs('Section', 'findMany', { include: { students: true, class: true, _count: { select: { students: true } } } });
    expect(a?.include).toEqual({
      students: { where: { deletedAt: null } },
      class: true,
      _count: { select: { students: { where: { deletedAt: null } } } },
    });
    const g = scopeArgs('Guardian', 'findFirst', { where: { id: 'g' }, select: { students: { select: { student: { select: { id: true } } } } } });
    expect(g?.select).toEqual({ students: { where: { student: { deletedAt: null }, guardian: { deletedAt: null } }, select: { student: { select: { id: true } } } } });
  });

  it('money and history models are never filtered through relations', () => {
    expect(scopeArgs('Payment', 'findMany', { where: { invoice: { studentId: 's' } } })?.where).toEqual({ invoice: { studentId: 's' } });
    // Invoices: only trashed invoices themselves are hidden; a trashed student's invoices stay.
    expect(scopeArgs('Invoice', 'findMany', { where: { student: { classId: 'c' } } })?.where).toEqual({ student: { classId: 'c' }, deletedAt: null });
    expect(scopeArgs('AuditLog', 'findMany', { where: { user: { role: 'ADMIN' } } })?.where).toEqual({ user: { role: 'ADMIN' } });
  });
});

describe('retention maths', () => {
  it('purges 30 days after deletion and counts whole days left', () => {
    const d = new Date('2026-10-01T10:00:00Z');
    expect(RETENTION_DAYS).toBe(30);
    expect(purgeAfterFrom(d).toISOString()).toBe('2026-10-31T10:00:00.000Z');
    expect(daysLeft(purgeAfterFrom(d), d)).toBe(30);
    expect(daysLeft(purgeAfterFrom(d), new Date('2026-10-31T09:00:00Z'))).toBe(1);
    expect(daysLeft(purgeAfterFrom(d), new Date('2026-11-05T00:00:00Z'))).toBe(0);
  });
  it('trash suffix is stable and short', () => {
    expect(trashSuffix('k')).toMatch(/^trash-[0-9a-f]{8}$/);
    expect(trashSuffix('k')).toBe(trashSuffix('k'));
  });
});
