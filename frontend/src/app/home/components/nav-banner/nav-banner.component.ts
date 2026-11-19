import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TripService } from '../../services/trip.service';

/** Turn-by-turn hint while driving. */
@Component({
  selector: 'app-nav-banner',
  standalone: true,
  templateUrl: './nav-banner.component.html',
  styleUrl: './nav-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBannerComponent {
  readonly trip = inject(TripService);
  readonly i18n = inject(I18nService);
}
