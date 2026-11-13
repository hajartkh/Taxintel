import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TripService } from '../../services/trip.service';

/** Turn-by-turn hint while driving. */
@Component({
  selector: 'app-nav-banner',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './nav-banner.component.html',
  styleUrl: './nav-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBannerComponent {
  readonly trip = inject(TripService);
}
