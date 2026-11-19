import { DemandLevel } from '../home/models/home.models';

/** An item the driver added to their own agenda. */
export interface AgendaItem {
  id: string;
  title: string;
  /** Local date, "2026-11-19". */
  date: string;
  /** "HH:MM"; empty = all day. */
  start?: string;
  end?: string;
  note?: string;
}

export type AgendaDraft = Omit<AgendaItem, 'id'>;

/** One line in the month calendar: a city event or one of the driver's own items. */
export interface CalendarEntry {
  key: string;
  kind: 'event' | 'agenda';
  title: string;
  /** "20:00" or "20:00–23:00"; empty = all day. */
  time: string;
  /** Minutes after midnight, for sorting (-1 = all day, first). */
  sortMinutes: number;
  /** Venue of an event or the note of an agenda item. */
  detail?: string;
  level?: DemandLevel;
  /** Set for agenda items, so they can be deleted. */
  agendaId?: string;
}
