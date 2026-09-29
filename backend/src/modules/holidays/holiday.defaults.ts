import { HolidayType } from '@prisma/client';
import type { FeedHoliday } from './holiday.feed';

// Builds the default holiday rows for a session year: weekly off days, and
// Bangladesh government holidays from the published holiday feed (or, until
// the feed covers that year, the fixed-date national days).
// Descriptions are written so students and guardians can read them.

export const DEFAULT_WEEKLY_OFF_DAYS = [5, 6]; // Friday, Saturday

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type GovernmentSource = 'FEED' | 'FALLBACK';

export interface DefaultHoliday {
  sourceKey: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  type: HolidayType;
  isTentative: boolean;
}

// Matched against the holiday title, first match wins. `lunar` = the date
// depends on the moon (or the lunar Bangla/Hindu calendar) and may still move
// until the day itself.
const HOLIDAY_DESCRIPTIONS: { match: RegExp; description: string; lunar?: boolean }[] = [
  { match: /fitr/i, lunar: true, description: 'Eid Mubarak! Celebrating the end of Ramadan with family, friends and sweets.' },
  { match: /adha|azha/i, lunar: true, description: 'Eid Mubarak! The festival of sacrifice, sharing and caring for others.' },
  { match: /barat/i, lunar: true, description: 'A holy night of prayer and forgiveness for Muslims.' },
  { match: /qadr/i, lunar: true, description: 'The Night of Power, the most blessed night of Ramadan.' },
  { match: /jumatul|bidah/i, lunar: true, description: 'The last Friday of the holy month of Ramadan.' },
  { match: /ashura/i, lunar: true, description: 'The 10th of Muharram, a day of remembrance for Muslims.' },
  { match: /muharram/i, lunar: true, description: 'The start of the Islamic month of Muharram.' },
  { match: /milad/i, lunar: true, description: 'Celebrating the birth of the Prophet Muhammad (PBUH).' },
  { match: /buddha|vesak/i, lunar: true, description: 'Celebrating the birth, enlightenment and passing of Gautama Buddha.' },
  { match: /janmashtami/i, lunar: true, description: 'Celebrating the birth of Lord Krishna.' },
  { match: /durga|dashami|nabami|navami|puja/i, lunar: true, description: 'Shubho Bijoya! Durga Puja, the biggest Hindu festival of the year.' },
  { match: /martyr|mother language|shaheed/i, description: 'We remember the brave language martyrs of 1952 who gave their lives for our mother tongue, Bangla.' },
  { match: /independence/i, description: 'Bangladesh declared its independence on this day in 1971. Happy birthday, Bangladesh!' },
  { match: /victory/i, description: 'Bangladesh won the Liberation War on this day in 1971. We honour our freedom fighters.' },
  { match: /chaitra sankranti/i, description: 'The last day of the Bangla year — time to get ready for Noboborsho!' },
  { match: /bengali new year|bangla new year|pahela|baishakh|boishakh/i, description: 'Shubho Noboborsho! The first day of the Bangla calendar, celebrated with colourful fairs and processions.' },
  { match: /may day/i, description: 'International Workers\' Day — a day to thank the people whose hard work builds our country.' },
  { match: /uprising|july/i, description: 'We remember the student-led mass uprising of July–August 2024.' },
  { match: /christmas/i, description: 'Merry Christmas to all our Christian friends and families!' },
  { match: /election/i, description: 'Election Day — many schools are used as voting centres.' },
];

const DEFAULT_DESCRIPTION = 'A public holiday in Bangladesh — no school today.';

function describe(title: string) {
  return HOLIDAY_DESCRIPTIONS.find((d) => d.match.test(title)) ?? { description: DEFAULT_DESCRIPTION, lunar: false };
}

// Used only while the feed doesn't cover a year yet (or can't be reached).
const FIXED_GOVERNMENT_HOLIDAYS: { monthDay: string; title: string }[] = [
  { monthDay: '02-21', title: 'Shaheed Day & International Mother Language Day' },
  { monthDay: '03-26', title: 'Independence Day' },
  { monthDay: '04-14', title: 'Pahela Baishakh (Bangla New Year)' },
  { monthDay: '05-01', title: 'May Day' },
  { monthDay: '08-05', title: 'July Mass Uprising Day' },
  { monthDay: '12-16', title: 'Victory Day' },
  { monthDay: '12-25', title: 'Christmas Day' },
];

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Keys are "gov:<year>:<slug>:<n>" (n = nth day with that title in the year),
// so when a moon-sighting holiday moves by a day the sync recognises it as
// the same holiday and updates its date instead of adding a duplicate.
export function buildGovernmentHolidays(
  year: number,
  feed: FeedHoliday[] | null,
  today: string = new Date().toISOString().slice(0, 10),
): { source: GovernmentSource; holidays: DefaultHoliday[] } {
  const fromFeed = (feed ?? []).filter((h) => h.date.startsWith(`${year}-`));

  if (fromFeed.length > 0) {
    const seen = new Map<string, number>();
    const holidays = fromFeed.map((h) => {
      const slug = slugify(h.title);
      const n = (seen.get(slug) ?? 0) + 1;
      seen.set(slug, n);
      const { description, lunar } = describe(h.title);
      return {
        sourceKey: `gov:${year}:${slug}:${n}`,
        date: h.date,
        title: h.title,
        description,
        type: HolidayType.GOVERNMENT,
        isTentative: !!lunar && h.date > today,
      };
    });
    return { source: 'FEED', holidays };
  }

  const holidays = FIXED_GOVERNMENT_HOLIDAYS.map((h) => ({
    sourceKey: `gov:${year}:fixed:${h.monthDay}`,
    date: `${year}-${h.monthDay}`,
    title: h.title,
    description: describe(h.title).description,
    type: HolidayType.GOVERNMENT,
    isTentative: false,
  }));
  return { source: 'FALLBACK', holidays };
}

export function getWeeklyHolidays(year: number, weeklyOffDays: number[]): DefaultHoliday[] {
  const offDays = new Set(weeklyOffDays);
  const result: DefaultHoliday[] = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    const weekday = d.getUTCDay();
    if (offDays.has(weekday)) {
      const date = d.toISOString().slice(0, 10);
      result.push({
        sourceKey: `weekly:${date}`,
        date,
        title: `Weekly Holiday (${WEEKDAY_NAMES[weekday]})`,
        description: 'Weekend — no classes today.',
        type: HolidayType.WEEKLY,
        isTentative: false,
      });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return result;
}
