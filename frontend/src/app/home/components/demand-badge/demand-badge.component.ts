import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DEMAND_LABEL } from '../../logic/demand-model';
import { DemandLevel } from '../../models/home.models';

/** "High demand" / "Busy" / "Moderate" pill. Styling: .badge in src/styles/utilities.css. */
@Component({
  selector: 'app-demand-badge',
  standalone: true,
  imports: [TranslatePipe],
  template: '{{ labelKey() | t }}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"badge " + level()' },
})
export class DemandBadgeComponent {
  readonly level = input.required<DemandLevel>();
  readonly labelKey = computed(() => DEMAND_LABEL[this.level()]);
}
