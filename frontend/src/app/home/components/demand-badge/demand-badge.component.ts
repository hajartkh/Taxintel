import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DEMAND_LABEL } from '../../logic/demand-model';
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
  readonly level = input.required<DemandLevel>();
  readonly label = computed(() => DEMAND_LABEL[this.level()]);
}
