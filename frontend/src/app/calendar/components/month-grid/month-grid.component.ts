import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { addDays, formatLongDate, isSameDay, startOfWeek, toIsoDate, weekdayShort } from '../../../shared/utils/time';
import { CalendarEntry } from '../../calendar.models';

/** Entries shown per day cell; the rest is summarised as "+2 more". */
const MAX_CHIPS = 3;

/** Classic month view, Monday to Sunday, with the entries of each day as chips. */
@Component({
  selector: 'app-month-grid',
  standalone: true,
  templateUrl: './month-grid.component.html',
  styleUrl: './month-grid.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthGridComponent {
  private readonly i18n = inject(I18nService);
  readonly t = this.i18n.t;

  /** First day of the month to show. */
  readonly month = input.required<Date>();
  readonly selected = input.required<Date>();
  readonly today = input.required<Date>();
  readonly entries = input.required<Map<string, CalendarEntry[]>>();
  readonly pick = output<Date>();

  private readonly firstCell = computed(() => startOfWeek(this.month()));

  /** 4 to 6 rows, as many as the month needs. */
  readonly weeks = computed(() => {
    const m = this.month();
    const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const offset = (m.getDay() + 6) % 7;
    return Math.ceil((offset + daysInMonth) / 7);
  });

  readonly weekdays = computed(() => {
    const locale = this.i18n.locale();
    return Array.from({ length: 7 }, (_, i) => weekdayShort(addDays(this.firstCell(), i), locale));
  });

  readonly cells = computed(() => {
    const month = this.month().getMonth();
    const locale = this.i18n.locale();
    const entries = this.entries();
    return Array.from({ length: this.weeks() * 7 }, (_, i) => {
      const date = addDays(this.firstCell(), i);
      const iso = toIsoDate(date);
      const list = entries.get(iso) ?? [];
      return {
        date,
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        today: isSameDay(date, this.today()),
        selected: isSameDay(date, this.selected()),
        shown: list.slice(0, MAX_CHIPS).map((e) => ({ ...e, startTime: e.time.split('–')[0] })),
        more: Math.max(0, list.length - MAX_CHIPS),
        kinds: [...new Set(list.map((e) => e.kind))],
        ariaLabel: `${formatLongDate(date, locale)}: ${list.length}`,
      };
    });
  });
}
