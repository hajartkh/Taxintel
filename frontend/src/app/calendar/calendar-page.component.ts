import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AgendaItem, AgendaService, NewAgendaItem } from '../core/agenda/agenda.service';
import { CityDataService } from '../core/city-data/city-data.service';
import { CityEvent } from '../core/city-data/city.models';
import { ClockService } from '../core/clock.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { DemandBadgeComponent } from '../home/components/demand-badge/demand-badge.component';
import { demandLevel, eventSize, eventsOnDay } from '../home/logic/demand-model';
import { addDays, addMonths, formatTime, fromDateInputValue, isSameDay, startOfDay, startOfMonth, startOfWeek } from '../shared/utils/time';
import { AgendaFormComponent } from './agenda-form/agenda-form.component';
import { MonthCell, MonthChip, MonthGridComponent } from './month-grid/month-grid.component';

const MAX_CHIPS = 3;

/** Month calendar with the city events and the driver's own agenda items. */
@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe, AgendaFormComponent, DemandBadgeComponent, MonthGridComponent],
  templateUrl: './calendar-page.component.html',
  styleUrl: './calendar-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent {
  private readonly agenda = inject(AgendaService);
  private readonly clock = inject(ClockService);
  readonly i18n = inject(I18nService);
  private readonly events = toSignal(inject(CityDataService).getEvents(), { initialValue: [] as CityEvent[] });

  /** `?date=2026-11-13` opens the calendar on that day. Bound by the router. */
  readonly date = input<string>();

  readonly month = signal(startOfMonth(new Date()));
  readonly selected = signal(startOfDay(new Date()));
  readonly formOpen = signal(false);

  readonly monthLabel = computed(() => this.i18n.monthYear(this.month()));
  readonly selectedLabel = computed(() => this.i18n.longDate(this.selected()));

  /** Mon … Sun, in the app language. */
  readonly weekdays = computed(() => {
    const monday = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => this.i18n.weekdayShort(addDays(monday, i)));
  });

  /** 6 weeks × 7 days, starting on the Monday on or before the 1st. */
  readonly cells = computed<MonthCell[]>(() => {
    const month = this.month();
    const first = startOfWeek(month);
    const today = this.clock.now();
    const selected = this.selected();
    const events = this.events();
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(first, i);
      // Own items first: on a busy day they must not disappear behind "+N more".
      const chips: MonthChip[] = [
        ...this.agenda.itemsOn(date).map((item) => ({ id: item.id, label: `${formatTime(item.start)} ${item.title}`, kind: 'own' as const })),
        ...eventsOnDay(events, date).map((e) => ({
          id: `e${e.id}`,
          label: `${formatTime(e.start)} ${e.name}`,
          kind: demandLevel(eventSize(e)) === 'high' ? ('high' as const) : ('event' as const),
        })),
      ];
      return {
        date,
        day: date.getDate(),
        inMonth: date.getMonth() === month.getMonth(),
        today: isSameDay(date, today),
        selected: isSameDay(date, selected),
        chips: chips.slice(0, MAX_CHIPS),
        more: Math.max(0, chips.length - MAX_CHIPS),
        ariaLabel: this.i18n.t('cal.dayAria', { date: this.i18n.longDate(date), count: chips.length }),
      };
    });
  });

  readonly dayEvents = computed(() =>
    eventsOnDay(this.events(), this.selected()).map((event) => ({
      event,
      start: formatTime(event.start),
      end: formatTime(event.end),
      level: demandLevel(eventSize(event)),
    })),
  );

  readonly dayItems = computed(() => {
    return this.agenda.itemsOn(this.selected()).map((item) => ({
      item,
      start: formatTime(item.start),
      end: item.end ? formatTime(item.end) : null,
    }));
  });

  constructor() {
    effect(() => {
      const value = this.date();
      if (!value) return;
      const day = fromDateInputValue(value);
      if (Number.isNaN(day.getTime())) return;
      untracked(() => this.select(day));
    }, { allowSignalWrites: true });
  }

  select(day: Date): void {
    this.selected.set(startOfDay(day));
    this.month.set(startOfMonth(day));
  }

  shiftMonth(months: number): void {
    this.month.set(addMonths(this.month(), months));
  }

  goToday(): void {
    this.select(new Date());
  }

  openForm(): void {
    this.formOpen.set(true);
  }

  save(item: NewAgendaItem): void {
    this.agenda.add(item);
    this.formOpen.set(false);
    this.select(item.start);
  }

  remove(item: AgendaItem): void {
    this.agenda.remove(item.id);
  }
}
