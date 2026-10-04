// Pure-logic tests for the website collections layer: query parsing and
// whitelisting, compilation to Prisma fragments, small-number suppression,
// slugs, and registry invariants. No database.

import { BadRequestError } from '../src/utils/AppError';
import {
  compileAll,
  makePublicSlug,
  parseCollectionQuery,
  suppressClassCounts,
  suppressClassSummary,
  suppressSmall,
  joinItemPath,
} from '../src/modules/sites/sites.collections.logic';
import { COLLECTIONS, getCollection, templateCollections } from '../src/modules/sites/sites.collections';

const teachers = getCollection('teachers')!;
const events = getCollection('events')!;
const classes = getCollection('classes')!;

const parse = (def: typeof teachers, raw: Record<string, unknown>) => parseCollectionQuery(def, raw);
const rejects = (def: typeof teachers, raw: Record<string, unknown>, text?: RegExp) => {
  let err: unknown;
  try {
    parse(def, raw);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(BadRequestError);
  expect((err as BadRequestError).statusCode).toBe(400);
  if (text) expect((err as Error).message).toMatch(text);
};

describe('registry', () => {
  it('has the agreed collections and no student/guardian collection', () => {
    const keys = COLLECTIONS.map((c) => c.key).sort();
    expect(keys).toEqual(
      ['teachers', 'staff', 'committee', 'classes', 'subjects', 'notices', 'events', 'albums', 'admissions', 'downloads', 'courses', 'products', 'holidays', 'branches', 'exams'].sort(),
    );
    for (const k of ['students', 'student', 'guardians', 'guardian', 'users', 'submissions']) expect(getCollection(k)).toBeUndefined();
  });

  it('never declares a sensitive field', () => {
    const banned = /phone|email|dob|dateOfBirth|address|salary|password|guardian|studentId|rollNumber|nid|digitalUrl|videoUrl|medical/i;
    const allowed = new Set(['committee.phone', 'branches.phone', 'branches.email', 'branches.address']); // institution/committee contact, explicit rules
    for (const c of COLLECTIONS) {
      for (const f of c.fields) {
        if (banned.test(f.key)) expect(allowed.has(`${c.key}.${f.key}`)).toBe(true);
      }
    }
  });

  it('keeps field and relation keys distinct and filter ops sane', () => {
    for (const c of COLLECTIONS) {
      const keys = [...c.fields.map((f) => f.key), ...c.relations.map((r) => r.key), 'slug'];
      expect(new Set(keys).size).toBe(keys.length);
      for (const f of c.fields) {
        for (const op of f.filter ?? []) {
          if (['gt', 'gte', 'lt', 'lte'].includes(op)) expect(['number', 'date']).toContain(f.type);
          if (op === 'has') expect(f.type).toBe('list');
          if (op === 'contains') expect(f.type).toBe('text');
        }
        if (f.filter?.length || f.sortable || f.searchable) expect(Boolean(f.col || f.where || f.searchCols || f.sortCols)).toBe(true);
      }
      expect(c.fields.some((f) => f.key === c.titleField)).toBe(true);
    }
  });

  it('only collections with a routeBase can have template pages', () => {
    expect(templateCollections().map((c) => c.key).sort()).toEqual(['admissions', 'albums', 'classes', 'courses', 'events', 'notices', 'staff', 'subjects', 'teachers']);
  });
});

describe('parseCollectionQuery', () => {
  it('applies defaults', () => {
    const q = parse(teachers, {});
    expect(q).toMatchObject({ page: 1, pageSize: 20, q: null, include: [], filters: [], sort: [] });
  });

  it('parses filters, sort, search, paging and include', () => {
    const q = parse(teachers, {
      filter: { department: { eq: 'Science' }, name: { contains: 'rah' } },
      sort: '-name,department',
      q: ' physics ',
      page: '2',
      pageSize: '12',
      include: 'classes,subjects,classes',
    });
    expect(q.filters.map((f) => `${f.field.key}.${f.op}`)).toEqual(['department.eq', 'name.contains']);
    expect(q.sort.map((s) => `${s.field.key}:${s.dir}`)).toEqual(['name:desc', 'department:asc']);
    expect(q).toMatchObject({ q: 'physics', page: 2, pageSize: 12, include: ['classes', 'subjects'] });
  });

  it('coerces typed values', () => {
    const q = parse(classes, { filter: { level: { in: '6,7,8' } } });
    expect(q.filters[0].value).toEqual([6, 7, 8]);
    const e = parse(events, { filter: { startDate: { gte: '2026-10-01' } } });
    expect(e.filters[0].value).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('rejects unknown fields, including prototype keys and sensitive names', () => {
    rejects(teachers, { filter: { salary: { eq: '1' } } }, /Unknown field "salary"/);
    rejects(teachers, { filter: { phone: { eq: '1' } } }, /Unknown field/);
    rejects(teachers, { filter: JSON.parse('{"__proto__":{"eq":"x"}}') }, /Unknown field/);
    rejects(teachers, { filter: { constructor: { eq: 'x' } } }, /Unknown field/);
  });

  it('rejects unknown ops and ops a field does not allow', () => {
    rejects(teachers, { filter: { department: { regex: '.*' } } }, /Unknown filter op/);
    rejects(teachers, { filter: { department: { gt: 'A' } } }, /cannot be filtered/);
    rejects(teachers, { filter: { photoUrl: { eq: 'x' } } }, /cannot be filtered/);
    rejects(classes, { filter: { level: { contains: '1' } } }, /cannot be filtered/);
  });

  it('rejects bad values', () => {
    rejects(classes, { filter: { level: { eq: 'abc' } } }, /number/);
    rejects(events, { filter: { startDate: { gte: 'tomorrow' } } }, /date/);
    rejects(events, { filter: { category: { eq: 'NOT_A_CATEGORY' } } }, /one of/);
    rejects(teachers, { filter: { department: { eq: ['a', 'b'] } } }, /single value/);
    rejects(teachers, { filter: { department: 'Science' } }, /filter\[department\]\[op\]/);
    rejects(teachers, { filter: 'x' }, /filter\[field\]/);
  });

  it('enforces paging, search, sort and include limits', () => {
    rejects(teachers, { pageSize: '51' });
    rejects(teachers, { pageSize: '0' });
    rejects(teachers, { page: '0' });
    rejects(teachers, { page: 'x' });
    rejects(teachers, { q: 'a'.repeat(101) });
    rejects(teachers, { q: ['a', 'b'] });
    rejects(teachers, { sort: 'photoUrl' }, /not sortable/);
    rejects(teachers, { sort: 'salary' }, /Unknown sort field/);
    rejects(teachers, { sort: 'name,department,designation' }, /At most 2/);
    rejects(teachers, { include: 'students' }, /Unknown relation/);
    rejects(teachers, { include: 'classes.teachers' }, /Unknown relation/);
    const d = '2026-01-01';
    const f: Record<string, Record<string, string>> = {
      startDate: { eq: d, gt: d, gte: d, lt: d, lte: d },
      endDate: { eq: d, gt: d, gte: d, lt: d, lte: d },
      category: { eq: 'OTHER', in: 'OTHER' },
    };
    rejects(events, { filter: f }, /At most 10/);
  });

  it('caps `in` lists', () => {
    rejects(teachers, { filter: { department: { in: Array.from({ length: 21 }, (_, i) => `d${i}`).join(',') } } }, /1-20/);
  });
});

describe('compileAll', () => {
  it('builds fragments from server-defined columns only', () => {
    const q = parse(teachers, { filter: { department: { eq: 'Science' }, name: { contains: 'x' } }, sort: '-name', q: 'phys' });
    const c = compileAll(teachers, q);
    expect(c.where[0]).toEqual({ staffProfile: { department: { equals: 'Science', mode: 'insensitive' } } });
    expect(c.where[1]).toEqual({
      OR: [
        { firstName: { contains: 'x', mode: 'insensitive' } },
        { lastName: { contains: 'x', mode: 'insensitive' } },
      ],
    });
    expect(JSON.stringify(c.where[2])).toContain('subjectExpertise');
    expect(c.orderBy).toEqual([{ firstName: 'desc' }, { lastName: 'desc' }]);
  });

  it('does not let a value become a key or operator', () => {
    const q = parse(teachers, { filter: { department: { eq: '{"$ne":null}' } } });
    const c = compileAll(teachers, q);
    expect(c.where[0]).toEqual({ staffProfile: { department: { equals: '{"$ne":null}', mode: 'insensitive' } } });
  });

  it('has no search clause for an empty q', () => {
    expect(compileAll(teachers, parse(teachers, {})).where).toEqual([]);
  });
});

describe('small-number suppression (W7)', () => {
  it('hides 1-4, keeps 0 and 5+', () => {
    expect([0, 1, 4, 5, 6, 100].map(suppressSmall)).toEqual([0, null, null, 5, 6, 100]);
  });

  it('withholds the total when any gender cell is suppressed', () => {
    expect(suppressClassCounts({ male: 30, female: 25, other: 0, total: 55 })).toEqual({ studentCount: 55, maleCount: 30, femaleCount: 25, otherCount: 0 });
    expect(suppressClassCounts({ male: 30, female: 3, other: 0, total: 33 })).toEqual({ studentCount: null, maleCount: 30, femaleCount: null, otherCount: 0 });
  });

  it('suppresses result aggregates for small classes and small cells', () => {
    expect(suppressClassSummary({ className: 'C9', appeared: 4, passed: 4, passRate: 100, gpa5Count: 2 })).toEqual({
      className: 'C9', appeared: null, passed: null, passRate: null, gpa5Count: null, suppressed: true,
    });
    // 40 appeared, 38 passed -> failed (2) is small, so passed/passRate are withheld
    expect(suppressClassSummary({ className: 'C8', appeared: 40, passed: 38, passRate: 95, gpa5Count: 12 })).toEqual({
      className: 'C8', appeared: 40, passed: null, passRate: null, gpa5Count: 12, suppressed: false,
    });
    expect(suppressClassSummary({ className: 'C8', appeared: 40, passed: 30, passRate: 75, gpa5Count: 3 })).toEqual({
      className: 'C8', appeared: 40, passed: 30, passRate: 75, gpa5Count: null, suppressed: false,
    });
  });
});

describe('public slugs', () => {
  it('is kebab name plus a short random suffix, and differs between calls', () => {
    const a = makePublicSlug('Rahim Uddin');
    const b = makePublicSlug('Rahim Uddin');
    expect(a).toMatch(/^rahim-uddin-[a-z0-9]{6}$/);
    expect(a).not.toBe(b);
  });

  it('falls back for names with no latin letters', () => {
    expect(makePublicSlug('রহিম', 'staff')).toMatch(/^staff-[a-z0-9]{6}$/);
  });

  it('joins item paths safely', () => {
    expect(joinItemPath('/teachers/', 'a b')).toBe('/teachers/a%20b');
  });
});
