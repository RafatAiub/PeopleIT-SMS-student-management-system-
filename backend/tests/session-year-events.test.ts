import { sessionStatus } from '../src/modules/session-years/session-year.service';
import { CreateSessionYearDto } from '../src/modules/session-years/session-year.dto';
import { audienceForRole, rolesForAudience, describeWhen } from '../src/modules/events/event.service';
import { CreateEventDto } from '../src/modules/events/event.dto';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('session years', () => {
  it('derives current / upcoming / completed from the date range', () => {
    expect(sessionStatus(d('2026-01-01'), d('2026-12-31'), '2026-09-25')).toBe('CURRENT');
    expect(sessionStatus(d('2027-01-01'), d('2027-12-31'), '2026-09-25')).toBe('UPCOMING');
    expect(sessionStatus(d('2025-01-01'), d('2025-12-31'), '2026-09-25')).toBe('COMPLETED');
    expect(sessionStatus(d('2026-01-01'), d('2026-12-31'), '2026-12-31')).toBe('CURRENT');
  });

  it('rejects an end date on or before the start date', () => {
    expect(CreateSessionYearDto.safeParse({ label: '2026-27', startDate: '2026-05-01', endDate: '2026-05-01' }).success).toBe(false);
    expect(CreateSessionYearDto.parse({ label: '2026-27', startDate: '2026-05-01', endDate: '2027-04-30' }).isDefault).toBe(false);
  });
});

describe('event audience', () => {
  it('maps roles to the audience they can see, admins see everything', () => {
    expect(audienceForRole('ADMIN')).toBeUndefined();
    expect(audienceForRole('SUPER_ADMIN')).toBeUndefined();
    expect(audienceForRole('STUDENT')).toBe('STUDENTS');
    expect(audienceForRole('GUARDIAN')).toBe('GUARDIANS');
    expect(audienceForRole('LIBRARIAN')).toBe('STAFF');
  });

  it('resolves notification recipients by audience', () => {
    expect(rolesForAudience(['STUDENTS', 'GUARDIANS']).sort()).toEqual(['GUARDIAN', 'STUDENT']);
    expect(rolesForAudience(['STAFF'])).toEqual(['ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'MANAGEMENT']);
  });
});

describe('event validation', () => {
  const base = { title: 'Annual Sports Day', academicYearId: 'y1', startDate: '2026-12-10', audience: ['STUDENTS'] };

  it('requires an end date after the start for multi-day events', () => {
    expect(CreateEventDto.safeParse({ ...base, type: 'MULTIPLE' }).success).toBe(false);
    expect(CreateEventDto.safeParse({ ...base, type: 'MULTIPLE', endDate: '2026-12-10' }).success).toBe(false);
    expect(CreateEventDto.safeParse({ ...base, type: 'MULTIPLE', endDate: '2026-12-12' }).success).toBe(true);
  });

  it('checks timing and audience', () => {
    expect(CreateEventDto.safeParse({ ...base, startTime: '10:00', endTime: '09:00' }).success).toBe(false);
    expect(CreateEventDto.safeParse({ ...base, endTime: '09:00' }).success).toBe(false);
    expect(CreateEventDto.safeParse({ ...base, audience: [] }).success).toBe(false);
    expect(CreateEventDto.safeParse({ ...base, imageUrl: 'https://example.com/x.png' }).success).toBe(false);
    const parsed = CreateEventDto.parse({ ...base, startTime: '09:00', endTime: '13:00' });
    expect(parsed).toMatchObject({ type: 'SINGLE', category: 'OTHER', notify: true });
  });

  it('describes when an event happens for notifications', () => {
    expect(describeWhen({ startDate: d('2026-12-10'), endDate: d('2026-12-10'), startTime: '09:00', endTime: '13:00' })).toBe(
      '10 Dec 2026, 09:00–13:00',
    );
    expect(describeWhen({ startDate: d('2026-12-10'), endDate: d('2026-12-12'), startTime: null, endTime: null })).toBe(
      '10 Dec 2026 – 12 Dec 2026',
    );
  });
});
