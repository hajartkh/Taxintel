import { Injectable, signal } from '@angular/core';
import { AgendaDraft, AgendaItem } from './calendar.models';

const STORAGE_KEY = 'taxintel.agenda';

function load(): AgendaItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgendaItem[]) : [];
  } catch {
    return []; // storage unavailable or corrupt
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The driver's own agenda items. Saved per device in localStorage for now;
 * swap load/save for calls to the backend once agenda items get an endpoint.
 */
@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly items = signal<AgendaItem[]>(load());
  readonly all = this.items.asReadonly();

  add(draft: AgendaDraft): AgendaItem {
    const item: AgendaItem = { ...draft, id: newId() };
    this.items.update((list) => [...list, item]);
    this.save();
    return item;
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((i) => i.id !== id));
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items()));
    } catch {
      // not saved, but the item stays visible until the page reloads
    }
  }
}
