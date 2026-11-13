import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TripService } from '../../services/trip.service';

/** PAUSE / RESUME ROUTE and STOP on the map while a trip is running. */
@Component({
  selector: 'app-drive-controls',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './drive-controls.component.html',
  styleUrl: './drive-controls.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriveControlsComponent {
  readonly trip = inject(TripService);
}
