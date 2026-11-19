import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ClockService } from '../core/clock.service';
import { I18nService } from '../core/i18n/i18n.service';
import { CityDataService } from '../home/data/city-data.service';
import { demandLevel, eventSize } from '../home/logic/demand-model';
import { CityEvent } from '../home/models/home.models';
import {
  addMonths,
  formatMonthYear,
  formatTime,
  fromIsoDate,
  isSameDay,
  startOfDay,
  startOfMonth,
  toIsoDate,
} from '../shared/utils/time';
import { AgendaService } from './agenda.service';
import { AgendaItem, CalendarEntry } from './calendar.models';
import { DayPanelComponent } from './components/day-panel/day-panel.component';
import { MonthGridComponent } from './components/month-grid/month-grid.component';

const minutesOf = (hhmm?: string): number => {
  if (!hhmm) return -1;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function fromEvent(e: CityEvent): CalendarEntry {
  return {
    key: `event-${e.id}`,
    kind: 'event',
    title: e.name,
    time: `${formatTime(e.start)}–${formatTime(e.end)}`,
    sortMinutes: e.start.getHours() * 60 + e.start.getMinutes(),
    detail: e.venue.name,
    level: demandLevel(eventSize(e)),
  };
}

function fromAgenda(item: AgendaItem): CalendarEntry {
  return {
    key: `agenda-${item.id}`,
    kind: 'agenda',
    title: item.title,
    time: item.start ? (item.end ? `${item.start}–${item.end}` : item.start) : '',
    sortMinutes: minutesOf(item.start),
    detail: item.note,
    agendaId: item.id,
  };
}

/** Month calendar: city events + the driver's own agenda items, with a form to add items. */
@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [RouterLink, MonthGridComponent, DayPanelComponent],
  templateUrl: './calendar-page.component.html',
  styleUrl: './calendar-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent {
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(I18nService);
  private readonly agenda = inject(AgendaService);
  private readonly panel = viewChild.required(DayPanelComponent);
  readonly t = this.i18n.t;

  private readonly events = toSignal(inject(CityDataService).getEvents(), { initialValue: [] as CityEvent[] });

  readonly today = computed(() => startOfDay(this.clock.now()));
  /** First day of the month on screen. */
  readonly month = signal(startOfMonth(new Date()));
  readonly selected = signal(startOfDay(new Date()));

  readonly monthLabel = computed(() => formatMonthYear(this.month(), this.i18n.locale()));
  readonly showingToday = computed(() => isSameDay(this.month(), startOfMonth(this.today())));

  /** All entries per day ("2026-11-19" -> entries), sorted by time (all-day items first). */
  readonly entriesByDay = computed(() => {
    const map = new Map<string, CalendarEntry[]>();
    const push = (iso: string, entry: CalendarEntry) => map.set(iso, [...(map.get(iso) ?? []), entry]);
    for (const e of this.events()) push(toIsoDate(e.start), fromEvent(e));
    for (const item of this.agenda.all()) push(item.date, fromAgenda(item));
    for (const list of map.values()) list.sort((a, b) => a.sortMinutes - b.sortMinutes);
    return map;
  });

  readonly selectedEntries = computed(() => this.entriesByDay().get(toIsoDate(this.selected())) ?? []);

  select(day: Date): void {
    this.selected.set(startOfDay(day));
    if (!isSameDay(startOfMonth(day), this.month())) this.month.set(startOfMonth(day));
  }

  /** Previous / next month; selects today when it is in that month, else the 1st. */
  shiftMonth(months: number): void {
    const month = addMonths(this.month(), months);
    this.month.set(month);
    const today = this.today();
    this.selected.set(isSameDay(startOfMonth(today), month) ? today : month);
  }

  goToday(): void {
    this.select(this.today());
  }

  /** "Add item" button: jump to the form for the selected day. */
  addItem(): void {
    this.panel().focusForm();
  }

  /** After adding an item, show the day it was added to. */
  onAdded(isoDate: string): void {
    this.select(fromIsoDate(isoDate));
  }

  removeItem(id: string): void {
    this.agenda.remove(id);
  }
}
