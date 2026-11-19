import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { DemandLevel } from '../../models/home.models';

/** "High demand" / "Busy" / "Moderate" pill. Styling: .badge in src/styles/utilities.css. */
@Component({
  selector: 'app-demand-badge',
  standalone: true,
  template: '{{ label() }}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"badge " + level()' },
})
export class DemandBadgeComponent {
  private readonly t = inject(I18nService).t;
  readonly level = input.required<DemandLevel>();
  readonly label = computed(() => this.t(`demand.${this.level()}`));
}
