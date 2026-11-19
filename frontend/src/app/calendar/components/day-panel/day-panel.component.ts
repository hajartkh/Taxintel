import { ChangeDetectionStrategy, Component, computed, inject, input, output, viewChild } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { DemandBadgeComponent } from '../../../home/components/demand-badge/demand-badge.component';
import { formatLongDate } from '../../../shared/utils/time';
import { CalendarEntry } from '../../calendar.models';
import { AgendaFormComponent } from '../agenda-form/agenda-form.component';

/** Side panel of the month calendar: everything on the selected day + the "new item" form. */
@Component({
  selector: 'app-day-panel',
  standalone: true,
  imports: [DemandBadgeComponent, AgendaFormComponent],
  templateUrl: './day-panel.component.html',
  styleUrl: './day-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayPanelComponent {
  private readonly i18n = inject(I18nService);
  private readonly form = viewChild.required(AgendaFormComponent);
  readonly t = this.i18n.t;

  readonly day = input.required<Date>();
  readonly entries = input.required<CalendarEntry[]>();
  /** Date ("2026-11-19") an item was added to. */
  readonly added = output<string>();
  /** Id of the agenda item to delete. */
  readonly remove = output<string>();

  readonly dateLabel = computed(() => formatLongDate(this.day(), this.i18n.locale()));
  readonly year = computed(() => this.day().getFullYear());

  focusForm(): void {
    this.form().focus();
  }
}
