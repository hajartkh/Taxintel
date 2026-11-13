/** Date/time helpers (local time). Language-dependent formatting is in core/i18n/i18n.service.ts. */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "21:30" (24h, the same in every language). Language-dependent formats live in I18nService. */
export function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

/** Monday of the week that contains `d` (midnight). */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

/** "2026-11-13", the format of <input type="date"> (local time, not UTC). */
export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parses "2026-11-13" as local midnight. */
export function fromDateInputValue(value: string): Date {
  const [y, m, day] = value.split('-').map(Number);
  return new Date(y, m - 1, day);
}
