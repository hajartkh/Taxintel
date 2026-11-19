import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { formatTime } from '../../../shared/utils/time';
import { HOME_CONFIG } from '../../home.config';
import { demandLevel } from '../../logic/demand-model';
import { TripService } from '../../services/trip.service';
import { HomeStore } from '../../state/home.store';
import { DemandBadgeComponent } from '../demand-badge/demand-badge.component';

/** Summary and stops of the recommended route. */
@Component({
  selector: 'app-smart-route',
  standalone: true,
  imports: [DemandBadgeComponent],
  templateUrl: './smart-route.component.html',
  styleUrl: './smart-route.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartRouteComponent {
  readonly trip = inject(TripService);
  private readonly store = inject(HomeStore);
  readonly i18n = inject(I18nService);
  readonly t = this.i18n.t;
  readonly speedOptions = HOME_CONFIG.speedOptions;

  readonly basis = computed(() => {
    const t = this.store.forecastTime();
    return this.t('route.basis', { day: this.i18n.relativeDay(t, new Date(), false), time: formatTime(t) });
  });

  readonly summary = computed(() => {
    const route = this.trip.route();
    if (!route) return null;
    const km = route.length / 1000;
    return {
      distance: `${this.i18n.number(km, 1)} km`,
      time: `${Math.max(1, Math.round((km / HOME_CONFIG.avgCitySpeedKmh) * 60))} min`,
      stops: route.stops.length,
    };
  });

  /** Status line under the route (translated, so it follows a language change). */
  readonly info = computed(() => {
    const info = this.trip.info();
    return info ? this.i18n.msg(info) : '';
  });

  readonly stops = computed(() => (this.trip.route()?.stops ?? []).map((stop) => ({ stop, level: demandLevel(stop.intensity) })));

  setSpeed(event: Event): void {
    this.trip.speedKmh.set(Number((event.target as HTMLSelectElement).value));
  }

  setFollow(event: Event): void {
    this.trip.follow.set((event.target as HTMLInputElement).checked);
  }
}
