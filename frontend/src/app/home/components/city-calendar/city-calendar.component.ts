import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgendaItem, AgendaService } from '../../../core/agenda/agenda.service';
import { CityEvent } from '../../../core/city-data/city.models';
import { ClockService } from '../../../core/clock.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { addDays, formatTime, isSameDay, toDateInputValue } from '../../../shared/utils/time';
import { demandLevel, eventSize, eventsOnDay } from '../../logic/demand-model';
import { DemandLevel } from '../../models/home.models';
import { HomeStore } from '../../state/home.store';
import { DemandBadgeComponent } from '../demand-badge/demand-badge.component';

type DayItem =
  | { kind: 'event'; id: string; start: Date; startLabel: string; endLabel: string; event: CityEvent; level: DemandLevel; active: boolean }
  | { kind: 'own'; id: string; start: Date; startLabel: string; endLabel: string | null; item: AgendaItem };

/** Week strip + the events and own agenda items of the selected day. */
@Component({
  selector: 'app-city-calendar',
  standalone: true,
  imports: [DemandBadgeComponent, RouterLink, TranslatePipe],
  templateUrl: './city-calendar.component.html',
  styleUrl: './city-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityCalendarComponent {
  readonly store = inject(HomeStore);
  private readonly agenda = inject(AgendaService);
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(I18nService);

  readonly dateLabel = computed(() => this.i18n.longDate(this.store.day()));
  /** Opens the month calendar on the selected day. */
  readonly monthLink = computed(() => ({ date: toDateInputValue(this.store.day()) }));

  readonly week = computed(() => {
    const start = this.store.stripStart();
    const selected = this.store.day();
    const today = this.clock.now();
    const events = this.store.events();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const count = eventsOnDay(events, date).length + this.agenda.itemsOn(date).length;
      return {
        date,
        weekday: this.i18n.weekdayShort(date),
        dayOfMonth: date.getDate(),
        dots: Array.from({ length: Math.min(count, 4) }, (_, k) => k),
        selected: isSameDay(date, selected),
        today: isSameDay(date, today),
        ariaLabel: this.i18n.t('cal.dayAria', { date: this.i18n.longDate(date), count }),
      };
    });
  });

  /** City events and own items of the selected day, in start order. */
  readonly items = computed<DayItem[]>(() => {
    const events: DayItem[] = this.store.dayEvents().map((event) => ({
      kind: 'event',
      id: `event-${event.id}`,
      start: event.start,
      startLabel: formatTime(event.start),
      endLabel: formatTime(event.end),
      event,
      level: demandLevel(eventSize(event)),
      active: this.store.activeEventId() === event.id,
    }));
    const own: DayItem[] = this.agenda.itemsOn(this.store.day()).map((item) => ({
      kind: 'own',
      id: `own-${item.id}`,
      start: item.start,
      startLabel: formatTime(item.start),
      endLabel: item.end ? formatTime(item.end) : null,
      item,
    }));
    return [...events, ...own].sort((a, b) => a.start.getTime() - b.start.getTime());
  });

  select(event: CityEvent): void {
    this.store.focusEvent(event, true);
  }
}
