/** Date/time helpers (24h clock, en-GB date format). */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "21:30" */
export function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "Fri 30 Oct" (pass a locale such as 'nl-BE' for another language) */
export function formatShortDate(d: Date, locale = 'en-GB'): string {
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Friday 30 October" */
export function formatLongDate(d: Date, locale = 'en-GB'): string {
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "November 2026" */
export function formatMonthYear(d: Date, locale = 'en-GB'): string {
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/** "Fri"; with a locale the name is translated ("vr", "ven."). */
export function weekdayShort(d: Date, locale?: string): string {
  if (locale) return d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '');
  return WEEKDAY_SHORT[d.getDay()];
}

/** Local date as "2026-11-19" (no time zone shift, unlike toISOString). */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "2026-11-19" -> that day at midnight, local time. */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week that contains `d` (midnight). */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

/** First day of the month of `d` (midnight). */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MINUTE_MS);
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Whole days from `a` to `b` (both taken at midnight). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

/** The given day at "HH:MM". */
export function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const x = new Date(day);
  x.setHours(h, m, 0, 0);
  return x;
}

export type PartOfDay = 'night' | 'morning' | 'afternoon' | 'evening';

/** For the greeting ("Good morning" …); the text itself comes from the translations. */
export function partOfDay(d: Date): PartOfDay {
  const h = d.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
