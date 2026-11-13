import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatTime, relativeDayLabel } from '../../../shared/utils/time';
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
  readonly speedOptions = HOME_CONFIG.speedOptions;

  readonly basis = computed(() => {
    const t = this.store.forecastTime();
    return `Based on forecast for ${relativeDayLabel(t)} ${formatTime(t)}`;
  });

  readonly summary = computed(() => {
    const route = this.trip.route();
    if (!route) return null;
    const km = route.length / 1000;
    return {
      distance: `${km.toFixed(1)} km`,
      time: `${Math.max(1, Math.round((km / HOME_CONFIG.avgCitySpeedKmh) * 60))} min`,
      stops: route.stops.length,
    };
  });

  readonly stops = computed(() => (this.trip.route()?.stops ?? []).map((stop) => ({ stop, level: demandLevel(stop.intensity) })));

  setSpeed(event: Event): void {
    this.trip.speedKmh.set(Number((event.target as HTMLSelectElement).value));
  }

  setFollow(event: Event): void {
    this.trip.follow.set((event.target as HTMLInputElement).checked);
  }
}
