import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-map-legend',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './map-legend.component.html',
  styleUrl: './map-legend.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLegendComponent {}
