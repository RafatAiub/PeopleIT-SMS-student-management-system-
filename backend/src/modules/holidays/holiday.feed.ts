import { logger } from '../../utils/logger';

// Google's public "Holidays in Bangladesh" calendar. It follows the government
// holiday gazette (including the moon-sighting dates for Eid, Puja, ...) and
// needs no API key. It usually covers up to the current year; the next year
// appears once the government publishes it.
const FEED_URL =
  process.env.BD_HOLIDAY_FEED_URL ||
  'https://calendar.google.com/calendar/ical/en.bd%23holiday%40group.v.calendar.google.com/public/basic.ics';

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface FeedHoliday {
  date: string; // YYYY-MM-DD
  title: string;
}

let cache: { fetchedAt: number; holidays: FeedHoliday[] } | null = null;

function unescapeText(value: string) {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

function icsDate(value: string): string | null {
  const m = value.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Parses the iCalendar feed into one entry per public-holiday day.
// "Observance" events (Valentine's Day, Mothers' Day, ...) are skipped.
export function parseHolidayFeed(ics: string): FeedHoliday[] {
  // RFC 5545 line folding: a line starting with a space/tab continues the previous one.
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const result: FeedHoliday[] = [];
  let event: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      event = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      const start = event?.DTSTART && icsDate(event.DTSTART);
      const isPublic = (event?.DESCRIPTION ?? '').toLowerCase().startsWith('public holiday');
      if (event && start && event.SUMMARY && isPublic) {
        // DTEND is exclusive for all-day events; missing = a single day.
        const end = event.DTEND ? icsDate(event.DTEND) : null;
        let day = start;
        do {
          result.push({ date: day, title: unescapeText(event.SUMMARY) });
          day = addDays(day, 1);
        } while (end && day < end);
      }
      event = null;
      continue;
    }
    if (!event) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const name = line.slice(0, sep).split(';')[0].toUpperCase();
    event[name] = line.slice(sep + 1);
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

// Returns every public holiday in the feed, or null when the feed can't be
// reached (and nothing was cached) — callers fall back to fixed-date holidays.
// A failed refresh keeps serving the last good copy.
export async function fetchHolidayFeed(options: { maxAgeMs?: number } = {}): Promise<FeedHoliday[] | null> {
  const maxAge = options.maxAgeMs ?? CACHE_TTL_MS;
  if (cache && Date.now() - cache.fetchedAt < maxAge) return cache.holidays;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FEED_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const holidays = parseHolidayFeed(await res.text());
    if (holidays.length === 0) throw new Error('feed contained no public holidays');
    cache = { fetchedAt: Date.now(), holidays };
    logger.info('Bangladesh holiday feed fetched', { holidays: holidays.length });
    return holidays;
  } catch (error) {
    logger.warn('Bangladesh holiday feed unavailable', {
      error: error instanceof Error ? error.message : String(error),
      usingCachedCopy: !!cache,
    });
    return cache?.holidays ?? null;
  } finally {
    clearTimeout(timer);
  }
}
