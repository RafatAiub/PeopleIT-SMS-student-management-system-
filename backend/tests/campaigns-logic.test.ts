// DB-free unit tests for bulk-messaging campaign logic: SMS segment counting,
// personalisation, per-channel addressing/dedupe and teacher audience rules.
// prisma is mocked so importing the audience module never opens a connection.

jest.mock('../src/config/prisma', () => ({ prisma: {} }));

import { countSmsSegments, isGsmText, personalize } from '../src/modules/campaigns/smsSegments';
import {
  addressFor,
  addressRecipients,
  assertTeacherAudience,
  isAudienceEmpty,
  normalizeAudience,
  CampaignRecipient,
  TeacherScope,
} from '../src/modules/campaigns/campaigns.audience';

describe('countSmsSegments', () => {
  it('returns zero segments for an empty message', () => {
    expect(countSmsSegments('').segments).toBe(0);
  });

  it('fits 160 GSM characters in one segment and splits at 153 after that', () => {
    expect(countSmsSegments('a'.repeat(160))).toMatchObject({ encoding: 'GSM', segments: 1, remaining: 0 });
    expect(countSmsSegments('a'.repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
    expect(countSmsSegments('a'.repeat(306)).segments).toBe(2);
    expect(countSmsSegments('a'.repeat(307)).segments).toBe(3);
  });

  it('counts GSM extension characters as two', () => {
    const info = countSmsSegments('{}');
    expect(info.encoding).toBe('GSM');
    expect(info.length).toBe(4);
  });

  it('switches Bangla text to UNICODE with 70 / 67 character segments', () => {
    const bangla = 'আগামীকাল স্কুল বন্ধ থাকবে';
    expect(isGsmText(bangla)).toBe(false);
    expect(countSmsSegments(bangla)).toMatchObject({ encoding: 'UNICODE', segments: 1, perSegment: 70 });
    expect(countSmsSegments('ক'.repeat(70)).segments).toBe(1);
    expect(countSmsSegments('ক'.repeat(71))).toMatchObject({ segments: 2, perSegment: 67 });
  });

  it('forces UNICODE when a single non-GSM character appears', () => {
    expect(countSmsSegments(`${'a'.repeat(100)}“`).encoding).toBe('UNICODE');
  });
});

describe('personalize', () => {
  it('replaces only the documented placeholders', () => {
    expect(personalize('Dear {{name}}, {{ institution }} says hi {{other}}', { name: 'Rahim', institution: 'ABC School' }))
      .toBe('Dear Rahim, ABC School says hi {{other}}');
  });
});

const person = (over: Partial<CampaignRecipient>): CampaignRecipient => ({
  userId: null,
  name: 'X',
  role: 'GUARDIAN',
  phone: null,
  email: null,
  ...over,
});

describe('addressFor / addressRecipients', () => {
  it('normalises BD mobiles so different spellings collapse into one recipient', () => {
    const { addressed } = addressRecipients('SMS', [
      person({ guardianId: 'g1', phone: '01712345678' }),
      person({ guardianId: 'g2', phone: '+880 1712-345678' }),
    ]);
    expect(addressed).toHaveLength(1);
    expect(addressed[0].address).toBe('8801712345678');
  });

  it('counts people without an address for the channel as unreachable', () => {
    const { addressed, unreachable } = addressRecipients('IN_APP', [
      person({ guardianId: 'g1', userId: null }),
      person({ studentId: 's1', userId: 'u1', role: 'STUDENT' }),
    ]);
    expect(addressed.map((a) => a.address)).toEqual(['u1']);
    expect(unreachable).toBe(1);
  });

  it('lower-cases and validates emails', () => {
    expect(addressFor('EMAIL', person({ email: 'Foo@Example.COM ' }))).toBe('foo@example.com');
    expect(addressFor('EMAIL', person({ email: 'not-an-email' }))).toBeNull();
  });
});

describe('audience helpers', () => {
  it('normalises junk into empty lists', () => {
    const a = normalizeAudience({ roles: ['STUDENT', 5], classIds: 'x' });
    expect(a).toEqual({ roles: ['STUDENT'], classIds: [], sectionIds: [], userIds: [], groupIds: [] });
    expect(isAudienceEmpty(normalizeAudience(null))).toBe(true);
  });
});

describe('assertTeacherAudience', () => {
  const scope: TeacherScope = {
    sectionIds: new Set(['sec1']),
    studentIds: new Set(['s1']),
    guardianIds: new Set(['g1']),
    userIds: new Set(['u1']),
  };
  const base = normalizeAudience({});

  it('allows own sections with student/guardian roles', () => {
    expect(() => assertTeacherAudience({ ...base, roles: ['GUARDIAN'], sectionIds: ['sec1'] }, scope)).not.toThrow();
  });

  it('rejects staff roles, whole classes, foreign sections and foreign users', () => {
    expect(() => assertTeacherAudience({ ...base, roles: ['ADMIN'], sectionIds: ['sec1'] }, scope)).toThrow();
    expect(() => assertTeacherAudience({ ...base, classIds: ['c1'] }, scope)).toThrow();
    expect(() => assertTeacherAudience({ ...base, sectionIds: ['sec2'] }, scope)).toThrow();
    expect(() => assertTeacherAudience({ ...base, userIds: ['u9'] }, scope)).toThrow();
  });

  it('rejects teachers who are not class teacher of any section', () => {
    const empty: TeacherScope = { sectionIds: new Set(), studentIds: new Set(), guardianIds: new Set(), userIds: new Set() };
    expect(() => assertTeacherAudience({ ...base, sectionIds: ['sec1'] }, empty)).toThrow();
  });
});
