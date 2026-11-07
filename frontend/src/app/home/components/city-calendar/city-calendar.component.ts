import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ClockService } from '../../../core/clock.service';
import { addDays, formatLongDate, formatTime, isSameDay, weekdayShort } from '../../../shared/utils/time';
import { demandLevel, eventSize, eventsOnDay } from '../../logic/demand-model';
import { CityEvent } from '../../models/home.models';
import { HomeStore } from '../../state/home.store';
import { DemandBadgeComponent } from '../demand-badge/demand-badge.component';

/** Week strip + the important events of the selected day. */
@Component({
  selector: 'app-city-calendar',
  standalone: true,
  imports: [DemandBadgeComponent],
  templateUrl: './city-calendar.component.html',
  styleUrl: './city-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityCalendarComponent {
  readonly store = inject(HomeStore);
  private readonly clock = inject(ClockService);

  readonly dateLabel = computed(() => formatLongDate(this.store.day()));

  readonly week = computed(() => {
    const start = this.store.stripStart();
    const selected = this.store.day();
    const today = this.clock.now();
    const events = this.store.events();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const count = eventsOnDay(events, date).length;
      return {
        date,
        weekday: weekdayShort(date),
        dayOfMonth: date.getDate(),
        dots: Array.from({ length: Math.min(count, 4) }, (_, k) => k),
        selected: isSameDay(date, selected),
        today: isSameDay(date, today),
        ariaLabel: `${formatLongDate(date)}, ${count} events`,
      };
    });
  });

  readonly items = computed(() =>
    this.store.dayEvents().map((event) => ({
      event,
      start: formatTime(event.start),
      end: formatTime(event.end),
      level: demandLevel(eventSize(event)),
      active: this.store.activeEventId() === event.id,
    })),
  );

  select(event: CityEvent): void {
    this.store.focusEvent(event, true);
  }
}
