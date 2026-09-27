// DB-free unit tests for the admissions CRM helpers, custom field value
// validation and notice class/section targeting. prisma is mocked so no
// module here ever opens a database connection.

jest.mock('../src/config/prisma', () => ({ prisma: {} }));

import {
  appendNote,
  computeFunnel,
  phonesMatch,
  publicApplicationState,
  splitName,
} from '../src/modules/enquiries/enquiries.logic';
import { keyFromLabel, validateCustomFieldValues } from '../src/modules/custom-fields/customFields.validation';
import { targetingClauses } from '../src/modules/notices/notices.service';

describe('phonesMatch', () => {
  it('matches across +880 / 0 prefixes and formatting', () => {
    expect(phonesMatch('01712-345678', '+8801712345678')).toBe(true);
    expect(phonesMatch('01712345678', '01712345679')).toBe(false);
    expect(phonesMatch('123', '123')).toBe(false);
    expect(phonesMatch(null, '01712345678')).toBe(false);
  });
});

describe('publicApplicationState', () => {
  it('reveals only a coarse state', () => {
    expect(publicApplicationState('PENDING').state).toBe('UNDER_REVIEW');
    expect(publicApplicationState('ACTIVE').state).toBe('APPROVED');
    expect(publicApplicationState('TRANSFERRED').state).toBe('CLOSED');
  });
});

describe('computeFunnel', () => {
  it('computes totals and rates', () => {
    const f = computeFunnel({
      byStatus: { NEW: 4, CONTACTED: 3, APPLIED: 1, ENROLLED: 2 },
      convertedToApplication: 3,
      convertedApproved: 2,
      enrolled: 2,
      applicationsPending: 5,
      applicationsTotal: 7,
    });
    expect(f.enquiries).toBe(10);
    expect(f.open).toBe(8);
    expect(f.byStatus.LOST).toBe(0);
    expect(f.conversionRate).toBe(20);
    expect(f.applicationRate).toBe(30);
  });

  it('never divides by zero', () => {
    const f = computeFunnel({
      byStatus: {},
      convertedToApplication: 0,
      convertedApproved: 0,
      enrolled: 0,
      applicationsPending: 0,
      applicationsTotal: 0,
    });
    expect(f.conversionRate).toBe(0);
  });
});

describe('appendNote / splitName', () => {
  it('appends timestamped lines', () => {
    const at = new Date('2026-01-02T03:04:00Z');
    expect(appendNote(null, 'hello', at)).toBe('[2026-01-02 03:04] hello');
    expect(appendNote('a', 'b', at)).toBe('a\n[2026-01-02 03:04] b');
  });

  it('splits names', () => {
    expect(splitName('Rahim Uddin Ahmed')).toEqual({ firstName: 'Rahim', lastName: 'Uddin Ahmed' });
    expect(splitName('Rahim')).toEqual({ firstName: 'Rahim', lastName: '' });
  });
});

describe('validateCustomFieldValues', () => {
  const defs = [
    { key: 'birth_cert', label: 'Birth certificate no', type: 'text', required: true },
    { key: 'siblings', label: 'Siblings', type: 'number', required: false },
    { key: 'vaccinated_on', label: 'Vaccinated on', type: 'date', required: false },
    { key: 'house', label: 'House', type: 'select', options: ['Red', 'Blue'], required: false },
  ];

  it('coerces and normalises valid values, dropping unknown keys', () => {
    const { values, issues } = validateCustomFieldValues(
      defs,
      { birth_cert: ' 123 ', siblings: '2', vaccinated_on: '2024-05-01T10:00:00Z', house: 'Red', stray: 'x' },
      { enforceRequired: true },
    );
    expect(issues).toEqual([]);
    expect(values).toEqual({ birth_cert: '123', siblings: 2, vaccinated_on: '2024-05-01', house: 'Red' });
  });

  it('reports type errors and missing required fields', () => {
    const { issues } = validateCustomFieldValues(defs, { siblings: 'two', house: 'Green', vaccinated_on: 'soon' }, {
      enforceRequired: true,
    });
    expect(issues.map((i) => i.field).sort()).toEqual([
      'customFields.birth_cert',
      'customFields.house',
      'customFields.siblings',
      'customFields.vaccinated_on',
    ]);
  });

  it('merges existing values underneath a partial update', () => {
    const { values, issues } = validateCustomFieldValues(defs, { siblings: 3 }, {
      existing: { birth_cert: 'A1', house: 'Blue' },
      enforceRequired: true,
    });
    expect(issues).toEqual([]);
    expect(values).toEqual({ birth_cert: 'A1', siblings: 3, house: 'Blue' });
  });

  it('derives keys from labels', () => {
    expect(keyFromLabel('Birth Certificate No.')).toBe('birth_certificate_no');
    expect(keyFromLabel('2nd language')).toBe('field_2nd_language');
  });
});

describe('notice targetingClauses', () => {
  it('always includes untargeted notices', () => {
    expect(targetingClauses([])).toEqual([{ classId: null }]);
  });

  it('adds class-wide and exact section clauses per placement without duplicates', () => {
    const clauses = targetingClauses([
      { classId: 'c1', sectionId: 's1' },
      { classId: 'c1', sectionId: 's2' },
      { classId: null, sectionId: null },
    ]);
    expect(clauses).toEqual([
      { classId: null },
      { classId: 'c1', sectionId: null },
      { classId: 'c1', sectionId: 's1' },
      { classId: 'c1', sectionId: 's2' },
    ]);
  });
});
