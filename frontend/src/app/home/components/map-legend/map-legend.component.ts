import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-map-legend',
  standalone: true,
  templateUrl: './map-legend.component.html',
  styleUrl: './map-legend.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLegendComponent {
  readonly t = inject(I18nService).t;
}
