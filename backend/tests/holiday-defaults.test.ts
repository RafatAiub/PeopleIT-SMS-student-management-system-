import { HolidayType } from '@prisma/client';
import { getWeeklyHolidays, buildGovernmentHolidays, DEFAULT_WEEKLY_OFF_DAYS } from '../src/modules/holidays/holiday.defaults';
import { parseHolidayFeed } from '../src/modules/holidays/holiday.feed';
import { planGovernmentSync, expandDateRange } from '../src/modules/holidays/holiday.service';
import { CreateHolidayDto } from '../src/modules/holidays/holiday.dto';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20270309',
  'DTEND;VALUE=DATE:20270310',
  'SUMMARY:Eid ul-Fitr Holiday',
  'DESCRIPTION:Public holiday',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20270310',
  'DTEND;VALUE=DATE:20270311',
  'SUMMARY:Eid ul-Fitr',
  'DESCRIPTION:Public holiday',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20270311',
  'DTEND;VALUE=DATE:20270312',
  'SUMMARY:Eid ul-Fitr Holiday',
  'DESCRIPTION:Public holiday',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20270214',
  'DTEND;VALUE=DATE:20270215',
  "SUMMARY:Valentine's Day",
  'DESCRIPTION:Observance\\nTo hide observances\\, go to Google Calendar Setting',
  '  s > Holidays in Bangladesh',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20271216',
  'DTEND;VALUE=DATE:20271217',
  'SUMMARY:Victory Day',
  'DESCRIPTION:Public holiday',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('holiday feed', () => {
  it('keeps only public holidays, one entry per day', () => {
    const feed = parseHolidayFeed(SAMPLE_ICS);
    expect(feed).toEqual([
      { date: '2027-03-09', title: 'Eid ul-Fitr Holiday' },
      { date: '2027-03-10', title: 'Eid ul-Fitr' },
      { date: '2027-03-11', title: 'Eid ul-Fitr Holiday' },
      { date: '2027-12-16', title: 'Victory Day' },
    ]);
  });

  it('builds government holidays from the feed with stable keys and kid-friendly text', () => {
    const { source, holidays } = buildGovernmentHolidays(2027, parseHolidayFeed(SAMPLE_ICS), '2027-01-01');
    expect(source).toBe('FEED');
    expect(holidays.map((h) => h.sourceKey)).toEqual([
      'gov:2027:eid-ul-fitr-holiday:1',
      'gov:2027:eid-ul-fitr:1',
      'gov:2027:eid-ul-fitr-holiday:2',
      'gov:2027:victory-day:1',
    ]);
    expect(holidays[1].description).toMatch(/Eid Mubarak/);
    // Future moon-based holidays are tentative, fixed national days are not.
    expect(holidays[1].isTentative).toBe(true);
    expect(holidays[3].isTentative).toBe(false);
  });

  it('falls back to fixed-date national days when the feed does not cover the year', () => {
    const { source, holidays } = buildGovernmentHolidays(2031, parseHolidayFeed(SAMPLE_ICS));
    expect(source).toBe('FALLBACK');
    expect(holidays.map((h) => h.date)).toContain('2031-12-16');
    expect(buildGovernmentHolidays(2031, null).source).toBe('FALLBACK');
  });
});

describe('government sync plan', () => {
  const { holidays } = buildGovernmentHolidays(2027, parseHolidayFeed(SAMPLE_ICS), '2027-01-01');
  const row = (key: string, date: string, extra: Partial<{ isCustomized: boolean; deletedAt: Date | null }> = {}) => {
    const h = holidays.find((x) => x.sourceKey === key)!;
    return {
      id: key,
      sourceKey: key,
      date: d(date),
      title: h?.title ?? 'Old',
      description: h?.description ?? null,
      isTentative: h?.isTentative ?? false,
      isCustomized: false,
      deletedAt: null,
      ...extra,
    };
  };

  it('moves a shifted Eid date, skips edited/deleted rows, and drops stale fallback rows', () => {
    const plan = planGovernmentSync(holidays, [
      row('gov:2027:eid-ul-fitr:1', '2027-03-09'), // moon sighting moved it a day
      row('gov:2027:eid-ul-fitr-holiday:1', '2027-03-01', { isCustomized: true }),
      row('gov:2027:eid-ul-fitr-holiday:2', '2027-03-11', { deletedAt: new Date() }),
      row('gov:2027:fixed:12-16', '2027-12-16'),
    ]);
    expect(plan.replace.map((r) => r.holiday.date)).toEqual(['2027-03-10']);
    expect(plan.insert.map((h) => h.sourceKey)).toEqual(['gov:2027:victory-day:1']);
    expect(plan.remove).toEqual(['gov:2027:fixed:12-16']);
  });
});

describe('weekly holidays', () => {
  it('generates every Friday and Saturday of the year by default', () => {
    const weekly = getWeeklyHolidays(2027, DEFAULT_WEEKLY_OFF_DAYS);
    // 2027 starts on a Friday and has 53 Fridays and 52 Saturdays
    expect(weekly).toHaveLength(105);
    expect(weekly[0]).toMatchObject({ date: '2027-01-01', sourceKey: 'weekly:2027-01-01', type: HolidayType.WEEKLY });
    expect(weekly.every((h) => [5, 6].includes(d(h.date).getUTCDay()))).toBe(true);
  });
});

describe('holiday date ranges', () => {
  it('expands an inclusive range across month boundaries', () => {
    expect(expandDateRange('2027-01-30', '2027-02-02')).toEqual(['2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02']);
    expect(expandDateRange('2027-05-05')).toEqual(['2027-05-05']);
  });

  it('rejects ranges that end before they start or cross into another year', () => {
    expect(CreateHolidayDto.safeParse({ date: '2027-05-05', endDate: '2027-05-01', title: 'Trip' }).success).toBe(false);
    expect(CreateHolidayDto.safeParse({ date: '2027-12-30', endDate: '2028-01-02', title: 'Winter' }).success).toBe(false);
    expect(CreateHolidayDto.parse({ date: '2027-12-20', endDate: '2027-12-31', title: 'Winter Vacation' }).type).toBe('SCHOOL');
  });
});
