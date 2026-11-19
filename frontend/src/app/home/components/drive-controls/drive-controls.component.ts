import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TripService } from '../../services/trip.service';

/** PAUSE / RESUME ROUTE and STOP on the map while a trip is running. */
@Component({
  selector: 'app-drive-controls',
  standalone: true,
  templateUrl: './drive-controls.component.html',
  styleUrl: './drive-controls.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriveControlsComponent {
  readonly trip = inject(TripService);
  readonly t = inject(I18nService).t;
}
