import { Injectable, computed, effect, signal } from '@angular/core';
import { isSameDay } from '../../shared/utils/time';

/** An item the driver adds to the calendar (e.g. a booked airport pickup). */
export interface AgendaItem {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  note?: string;
}

export type NewAgendaItem = Omit<AgendaItem, 'id'>;

const STORAGE_KEY = 'taxintel.agenda';

/**
 * The driver's own agenda items. Stored per device in localStorage for now;
 * replace load/save with backend calls once there is an agenda API.
 */
@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly store = signal<AgendaItem[]>(load());

  /** All items, sorted by start time. */
  readonly items = computed(() => [...this.store()].sort((a, b) => a.start.getTime() - b.start.getTime()));

  constructor() {
    effect(() => save(this.store()));
  }

  itemsOn(day: Date): AgendaItem[] {
    return this.items().filter((item) => isSameDay(item.start, day));
  }

  add(item: NewAgendaItem): AgendaItem {
    const created: AgendaItem = { ...item, id: newId() };
    this.store.update((list) => [...list, created]);
    return created;
  }

  remove(id: string): void {
    this.store.update((list) => list.filter((item) => item.id !== id));
  }
}

interface StoredItem {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  note?: string;
}

function load(): AgendaItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as StoredItem[];
    return stored.map((s) => ({ ...s, start: new Date(s.start), end: s.end ? new Date(s.end) : undefined }));
  } catch {
    return [];
  }
}

function save(items: AgendaItem[]): void {
  const stored: StoredItem[] = items.map((i) => ({ ...i, start: i.start.toISOString(), end: i.end?.toISOString() }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // storage unavailable: items only last for this visit
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
