import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClockService } from '../../../core/clock.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { addDays, formatLongDate, formatTime, isSameDay, weekdayShort } from '../../../shared/utils/time';
import { demandLevel, eventSize, eventsOnDay } from '../../logic/demand-model';
import { CityEvent } from '../../models/home.models';
import { HomeStore } from '../../state/home.store';
import { DemandBadgeComponent } from '../demand-badge/demand-badge.component';

/**
 * Week strip + the important events of the selected day.
 * The strip starts today; the arrows page through the next weeks (Monday to Sunday).
 * The title opens the month calendar (/calendar).
 */
@Component({
  selector: 'app-city-calendar',
  standalone: true,
  imports: [DemandBadgeComponent, RouterLink],
  templateUrl: './city-calendar.component.html',
  styleUrl: './city-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityCalendarComponent {
  readonly store = inject(HomeStore);
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(I18nService);
  readonly t = this.i18n.t;

  readonly dateLabel = computed(() => formatLongDate(this.store.day(), this.i18n.locale()));

  readonly week = computed(() => {
    const start = this.store.stripStart();
    const selected = this.store.day();
    const today = this.clock.now();
    const events = this.store.events();
    const locale = this.i18n.locale();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const count = eventsOnDay(events, date).length;
      return {
        date,
        weekday: weekdayShort(date, locale),
        dayOfMonth: date.getDate(),
        dots: Array.from({ length: Math.min(count, 4) }, (_, k) => k),
        selected: isSameDay(date, selected),
        today: isSameDay(date, today),
        ariaLabel: `${formatLongDate(date, locale)}, ${this.t('cal.eventCount', { count })}`,
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
