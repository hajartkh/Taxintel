/*
 * Turns the scraped events of the backend (EventDto) into the model of the home page (CityEvent).
 * Pure functions, no Angular.
 *
 * The sources (UiTinVlaanderen, Ticketmaster, allevents) give no visitor numbers and often no end time,
 * so both are ESTIMATED here:
 *   attendance  capacity of a known venue (80% full, 100% when sold out), otherwise a typical number per category
 *   end         the end time of the source, otherwise a typical duration per category
 * Replace these estimates when the AI model or a source delivers real numbers.
 */
import { EventDto } from '../../events/events.service';
import { HOUR_MS } from '../../shared/utils/time';
import { CityEvent, EventCategory, Venue } from '../models/home.models';

/** Small activities that bring no taxi demand (see backend/scrapers/README.md). */
const IGNORED_CATEGORIES = new Set(['kamp', 'cursus', 'rondleiding']);

/** Scraper category -> category of the UI (decides the icon on the map). */
const CATEGORY: Record<string, EventCategory> = {
  concert: 'concert',
  festival: 'concert',
  sport: 'sports',
  uitgaan: 'nightlife',
  beurs: 'fair',
};

/** Typical visitors and duration (hours) per scraper category, used when the source says nothing. */
const TYPICAL: Record<string, { attendance: number; hours: number }> = {
  concert: { attendance: 400, hours: 3 },
  festival: { attendance: 800, hours: 6 },
  sport: { attendance: 250, hours: 2 },
  beurs: { attendance: 500, hours: 7 },
  uitgaan: { attendance: 500, hours: 6 },
  theater: { attendance: 300, hours: 2.5 },
  film: { attendance: 120, hours: 2 },
  expo: { attendance: 150, hours: 3 },
  lezing: { attendance: 80, hours: 2 },
  familie: { attendance: 200, hours: 2 },
  spel: { attendance: 60, hours: 2 },
};
const TYPICAL_OTHER = { attendance: 100, hours: 2 };

/** Approximate capacity of the big Antwerp venues, matched on a part of the venue name.
 *  Keep in sync with VENUE_CAPACITY in backend/app/hotspots/sources.py. */
const VENUE_CAPACITY: Array<[match: string, capacity: number]> = [
  ['afas dome', 23000],
  ['sportpaleis', 23000],
  ['bosuil', 12000],
  ['olympisch stadion', 12000],
  ['lotto arena', 8000],
  ['antwerp expo', 10000],
  ['stadsschouwburg', 2000],
  ['elisabethzaal', 2000],
  ['de roma', 1800],
  ['trix', 1200],
  ['opera antwerpen', 1000],
  ['singel', 950],
  ['bourla', 900],
  ['arenberg', 800],
  ['ampere', 800],
  ['hetpaleis', 500],
  ['kavka', 400],
  ['amuz', 400],
];

/** An end time further away than this is a multi-day run, not a moment when people leave. */
const MAX_DURATION_HOURS = 16;

const normalise = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function estimateAttendance(dto: EventDto, venueName: string): number {
  const capacity = VENUE_CAPACITY.find(([match]) => venueName.includes(match))?.[1];
  if (capacity) return Math.round(capacity * (dto.flags?.includes('soldOut') ? 1 : 0.8));
  return (TYPICAL[dto.category ?? ''] ?? TYPICAL_OTHER).attendance;
}

function toVenue(dto: EventDto, venueName: string): Venue {
  const [lng, lat] = dto.venue.location.coordinates;
  // Same name + same spot (about 100 m) = one venue, so its events share one pin on the map.
  const id = `${venueName.replace(/ /g, '-')}@${lat.toFixed(3)},${lng.toFixed(3)}`;
  return { id, name: dto.venue.name, lat, lng };
}

/**
 * Maps one event, or returns null when it should not be shown:
 * small activities, hospitality packages of another show, long-running series, events without
 * a known start time or location, and events below `minAttendance` estimated visitors.
 */
export function toCityEvent(dto: EventDto, id: number, minAttendance: number): CityEvent | null {
  const category = dto.category ?? 'overig';
  const coords = dto.venue?.location?.coordinates;
  if (IGNORED_CATEGORIES.has(category)) return null;
  if (dto.flags?.includes('timeUnknown') || dto.flags?.includes('series')) return null;
  if (!coords || coords.length < 2 || !dto.venue.name) return null;
  if (/\blounge\b/i.test(dto.venue.name)) return null; // VIP package of a show that is also listed itself

  const start = new Date(dto.startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const venueName = normalise(dto.venue.name);
  const attendance = estimateAttendance(dto, venueName);
  if (attendance < minAttendance) return null;

  let end = dto.endsAt ? new Date(dto.endsAt) : null;
  const hours = end ? (end.getTime() - start.getTime()) / HOUR_MS : NaN;
  if (!end || !(hours > 0) || hours > MAX_DURATION_HOURS) {
    end = new Date(start.getTime() + (TYPICAL[category] ?? TYPICAL_OTHER).hours * HOUR_MS);
  }

  return {
    id,
    name: dto.title,
    venue: toVenue(dto, venueName),
    category: CATEGORY[category] ?? 'culture',
    attendance,
    start,
    end,
  };
}

/**
 * Several events at the same venue that start at the same moment are parts of one happening
 * (e.g. the 40 activities of a science day): keep only the biggest, so the demand is not counted 40 times.
 */
export function dropSimultaneous(events: CityEvent[]): CityEvent[] {
  const kept = new Map<string, CityEvent>();
  for (const ev of events) {
    const key = `${ev.venue.id}|${ev.start.getTime()}`;
    const other = kept.get(key);
    if (!other || ev.attendance > other.attendance) kept.set(key, ev);
  }
  return [...kept.values()];
}
